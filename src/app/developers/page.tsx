import { revalidatePath } from "next/cache";
import Link from "next/link";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { AdminDeveloperInviteForm } from "@/components/AdminDeveloperInviteForm";
import type { DeveloperInviteActionState } from "@/components/AdminDeveloperInviteForm";
import { AdminDevelopersTable } from "@/components/AdminDevelopersTable";
import { AdminLayout } from "@/components/AdminLayout";
import { requireAdminRole } from "@/lib/adminAuth";
import { buildAdminUi } from "@/lib/adminUi";
import { fetchAdminActivity, logAdminActivity } from "@/lib/adminQueries";
import {
  compensateDeveloperInviteAuthUser,
  findAuthUserByEmail,
  sendDeveloperPortalInvite,
} from "@/lib/developerAccountInvites";
import { supabaseServer } from "@/lib/supabaseServer";

type Developer = {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  logo_url: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  is_demo?: boolean | null;
  demo_batch?: string | null;
  lifecycle_state?: string | null;
  published_at?: string | null;
};

type Property = {
  id: string;
  property_name: string | null;
  developer_id: string | null;
  project_id: string | null;
  listed_by_agent_id: string | null;
  price: number | null;
  inquiries_count: number | null;
  approval_status: string | null;
  rejection_reason: string | null;
  is_active: boolean | null;
  published_at: string | null;
  expires_at: string | null;
  updated_at: string | null;
  created_at: string | null;
  is_demo?: boolean | null;
  demo_batch?: string | null;
  publication_checklist?: Record<string, unknown> | null;
  quality_issues?: string[] | null;
  quality_score?: number | null;
};

type DeveloperProject = {
  id: string;
  developer_id: string | null;
  name: string;
  created_at: string | null;
  updated_at: string | null;
  launch_status: string | null;
  approval_status: string | null;
  rejection_reason: string | null;
  lifecycle_state: string | null;
  published_at: string | null;
  is_demo?: boolean | null;
  demo_batch?: string | null;
  publication_checklist?: Record<string, unknown> | null;
  quality_issues?: string[] | null;
  quality_score?: number | null;
};

type DeveloperMember = {
  id: string;
  developer_id: string;
  auth_user_id: string;
  email: string | null;
  full_name: string | null;
  status: string | null;
  invited_at: string | null;
  invitation_sent_at: string | null;
  activated_at: string | null;
  revoked_at: string | null;
  last_login: string | null;
  invite_request_id?: string | null;
  is_demo?: boolean | null;
  demo_batch?: string | null;
};

type DeveloperActivity = {
  id: string;
  developer_id: string | null;
  developer_account_id?: string | null;
  action: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  resource_id: string | null;
  actor_type?: string | null;
  actor_id?: string | null;
  idempotency_key?: string | null;
};

type DeveloperProfileRevision = {
  id: string;
  developer_id: string;
  version: number;
  name: string;
  description: string | null;
  logo_url: string | null;
  status: string;
  submitted_by_account_id: string | null;
  reviewed_by_admin_id: string | null;
  review_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  published_at?: string | null;
  developerName?: string | null;
};

type DemoBatch = {
  batch_key: string;
  label: string;
};

type DeveloperDataAvailability = {
  publicationContract: boolean;
  inventoryQuality: boolean;
  demoData: boolean;
  invitationReliability: boolean;
  lifecycleEvents: boolean;
  profileReviews: boolean;
};

type DeveloperData = {
  developers: Developer[];
  properties: Property[];
  projects: DeveloperProject[];
  accounts: DeveloperMember[];
  activity: DeveloperActivity[];
  demoBatches: DemoBatch[];
  profileRevisions: DeveloperProfileRevision[];
  developerTotal: number;
  developerPage: number;
  developerPageSize: number;
  developerHasNext: boolean;
  search: string;
  availability: DeveloperDataAvailability;
  developerError: string | null;
};

const DEVELOPER_PAGE_SIZE = 25;
const STALE_INVITE_DAYS = 7;

function safePage(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 10_000) : 1;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

type RowsResponse<T> = { data: T[] | null; error: { message?: string } | null };

async function loadRows<T>(query: PromiseLike<RowsResponse<T>>, label: string): Promise<T[]> {
  try {
    const result = await query;
    if (result.error) {
      console.warn(`Failed to load ${label}`, result.error);
      return [];
    }
    return result.data ?? [];
  } catch (error) {
    console.warn(`Failed to load ${label}`, error);
    return [];
  }
}

async function loadOptionalRows<T>(
  query: PromiseLike<RowsResponse<T>>,
  label: string,
): Promise<{ rows: T[]; available: boolean }> {
  try {
    const result = await query;
    if (result.error) {
      console.warn(`Optional ${label} is unavailable; using compatibility defaults`, result.error);
      return { rows: [], available: false };
    }
    return { rows: result.data ?? [], available: true };
  } catch (error) {
    console.warn(`Optional ${label} is unavailable; using compatibility defaults`, error);
    return { rows: [], available: false };
  }
}

function isExpired(value: string | null | undefined) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp < Date.now();
}

async function getDeveloperData(developerIds: string[] | null | undefined, requestedPage = 1, search = ""): Promise<DeveloperData> {
  const page = Math.max(1, requestedPage);
  // Commas and parentheses delimit PostgREST OR operands; normalize them so
  // a search term cannot alter the filter expression.
  const normalizedSearch = search.trim().replace(/[(),]/g, " ").replace(/\s+/g, " ").slice(0, 100);
  const emptyAvailability: DeveloperDataAvailability = {
    publicationContract: false,
    inventoryQuality: false,
    demoData: false,
    invitationReliability: false,
    lifecycleEvents: false,
    profileReviews: false,
  };
  const empty = (developerError: string | null = null): DeveloperData => ({
    developers: [],
    properties: [],
    projects: [],
    accounts: [],
    activity: [],
    demoBatches: [],
    profileRevisions: [],
    developerTotal: 0,
    developerPage: page,
    developerPageSize: DEVELOPER_PAGE_SIZE,
    developerHasNext: false,
    search: normalizedSearch,
    availability: emptyAvailability,
    developerError,
  });

  // An empty assignment is an explicit no-access scope for delegated admins.
  if (Array.isArray(developerIds) && developerIds.length === 0) return empty();

  let developersQuery = supabaseServer
    .from("developers")
    // Keep the base query compatible with the pre-publication schema. New
    // lifecycle/demo columns are read in independent best-effort queries below.
    .select("id, name, contact_email, contact_phone, logo_url, is_active, created_at, updated_at", { count: "exact" });
  if (Array.isArray(developerIds)) developersQuery = developersQuery.in("id", developerIds);
  if (normalizedSearch) {
    const pattern = `%${escapeLike(normalizedSearch)}%`;
    developersQuery = developersQuery.or(`name.ilike.${pattern},contact_email.ilike.${pattern},contact_phone.ilike.${pattern}`);
  }
  const developerOffset = (page - 1) * DEVELOPER_PAGE_SIZE;
  const { data: developerRows, count: developerCount, error: developerQueryError } = await developersQuery
    .order("name")
    .range(developerOffset, developerOffset + DEVELOPER_PAGE_SIZE - 1);
  if (developerQueryError) return empty(developerQueryError.message);

  const baseDevelopers = (developerRows ?? []) as Developer[];
  const currentDeveloperIds = baseDevelopers.map((developer) => developer.id);
  if (!currentDeveloperIds.length) {
    const result = empty();
    result.developerTotal = developerCount ?? 0;
    result.developerPage = page;
    result.developerHasNext = false;
    return result;
  }

  const projectRowsPromise = loadRows(
    supabaseServer
      .from("developer_projects")
      .select("id, developer_id, name, created_at, updated_at, launch_status")
      .in("developer_id", currentDeveloperIds)
      .order("updated_at", { ascending: false }),
    "developer projects",
  );
  const propertyRowsPromise = loadRows(
    supabaseServer
      .from("properties")
      .select(
        "id, property_name, developer_id, project_id, listed_by_agent_id, price, inquiries_count, approval_status, rejection_reason, is_active, published_at, expires_at, updated_at, created_at",
      )
      .in("developer_id", currentDeveloperIds)
      .order("updated_at", { ascending: false }),
    "developer listings",
  );
  const accountRowsPromise = loadRows(
    supabaseServer
      .from("developer_accounts")
      .select("id, developer_id, auth_user_id, email, full_name, status, invited_at, invitation_sent_at, activated_at, revoked_at, last_login")
      .in("developer_id", currentDeveloperIds)
      .order("invitation_sent_at", { ascending: false }),
    "developer members",
  );
  const activityPromise = fetchAdminActivity(250);
  const developerOpsPromise = loadOptionalRows(
    supabaseServer
      .from("developers")
      .select("id, is_demo, demo_batch, lifecycle_state, published_at")
      .in("id", currentDeveloperIds),
    "developer lifecycle fields",
  );
  const projectModerationPromise = loadOptionalRows(
    supabaseServer
      .from("developer_projects")
      .select("id, approval_status, rejection_reason")
      .in("developer_id", currentDeveloperIds),
    "project moderation fields",
  );
  const projectPublicationPromise = loadOptionalRows(
    supabaseServer
      .from("developer_projects")
      .select("id, lifecycle_state, published_at")
      .in("developer_id", currentDeveloperIds),
    "project publication fields",
  );
  const projectDemoPromise = loadOptionalRows(
    supabaseServer
      .from("developer_projects")
      .select("id, is_demo, demo_batch")
      .in("developer_id", currentDeveloperIds),
    "project demo fields",
  );
  const projectQualityPromise = loadOptionalRows(
    supabaseServer
      .from("developer_projects")
      .select("id, publication_checklist, quality_issues, quality_score")
      .in("developer_id", currentDeveloperIds),
    "project quality fields",
  );
  const propertyDemoPromise = loadOptionalRows(
    supabaseServer
      .from("properties")
      .select("id, is_demo, demo_batch")
      .in("developer_id", currentDeveloperIds),
    "listing demo fields",
  );
  const propertyQualityPromise = loadOptionalRows(
    supabaseServer
      .from("properties")
      .select("id, publication_checklist, quality_issues, quality_score")
      .in("developer_id", currentDeveloperIds),
    "listing quality fields",
  );
  const accountOpsPromise = loadOptionalRows(
    supabaseServer
      .from("developer_accounts")
      .select("id, invite_request_id, is_demo, demo_batch")
      .in("developer_id", currentDeveloperIds),
    "developer invitation fields",
  );
  const lifecycleEventsPromise = loadOptionalRows(
    supabaseServer
      .from("developer_account_events")
      .select("id, developer_id, developer_account_id, event_type, actor_type, actor_id, idempotency_key, created_at, metadata")
      .in("developer_id", currentDeveloperIds)
      .order("created_at", { ascending: false })
      .limit(250),
    "developer access events",
  );
  const demoBatchesPromise = loadOptionalRows(
    supabaseServer
      .from("demo_data_batches")
      .select("batch_key, label")
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    "active demo batches",
  );
  let profileRevisionsQuery = supabaseServer
    .from("developer_profile_revisions")
    .select("id, developer_id, version, name, description, logo_url, status, submitted_by_account_id, reviewed_by_admin_id, review_reason, created_at, updated_at, submitted_at, reviewed_at, published_at")
    .eq("status", "pending")
    .order("submitted_at", { ascending: false });
  if (Array.isArray(developerIds)) profileRevisionsQuery = profileRevisionsQuery.in("developer_id", developerIds);
  const profileRevisionsPromise = loadOptionalRows(profileRevisionsQuery, "pending developer profile revisions");

  const [
    projectRows,
    propertyRows,
    accountRows,
    activityRaw,
    developerOps,
    projectModeration,
    projectPublication,
    projectDemo,
    projectQuality,
    propertyDemo,
    propertyQuality,
    accountOps,
    lifecycleEvents,
    demoBatches,
    profileRevisions,
  ] = await Promise.all([
    projectRowsPromise,
    propertyRowsPromise,
    accountRowsPromise,
    activityPromise,
    developerOpsPromise,
    projectModerationPromise,
    projectPublicationPromise,
    projectDemoPromise,
    projectQualityPromise,
    propertyDemoPromise,
    propertyQualityPromise,
    accountOpsPromise,
    lifecycleEventsPromise,
    demoBatchesPromise,
    profileRevisionsPromise,
  ]);

  const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((row) => [row.id, row]));
  const developerOpsById = byId(developerOps.rows as Array<{ id: string; is_demo?: boolean | null; demo_batch?: string | null; lifecycle_state?: string | null; published_at?: string | null }>);
  const projectModerationById = byId(projectModeration.rows as Array<{ id: string; approval_status?: string | null; rejection_reason?: string | null }>);
  const projectPublicationById = byId(projectPublication.rows as Array<{ id: string; lifecycle_state?: string | null; published_at?: string | null }>);
  const projectDemoById = byId(projectDemo.rows as Array<{ id: string; is_demo?: boolean | null; demo_batch?: string | null }>);
  const projectQualityById = byId(projectQuality.rows as Array<{ id: string; publication_checklist?: Record<string, unknown> | null; quality_issues?: string[] | null; quality_score?: number | null }>);
  const propertyDemoById = byId(propertyDemo.rows as Array<{ id: string; is_demo?: boolean | null; demo_batch?: string | null }>);
  const propertyQualityById = byId(propertyQuality.rows as Array<{ id: string; publication_checklist?: Record<string, unknown> | null; quality_issues?: string[] | null; quality_score?: number | null }>);
  const accountOpsById = byId(accountOps.rows as Array<{ id: string; invite_request_id?: string | null; is_demo?: boolean | null; demo_batch?: string | null }>);

  const developers = baseDevelopers.map((developer) => ({
    ...developer,
    ...developerOpsById.get(developer.id),
    is_demo: developerOpsById.get(developer.id)?.is_demo ?? false,
    demo_batch: developerOpsById.get(developer.id)?.demo_batch ?? null,
  }));
  const projects = (projectRows as Array<{ id: string; developer_id: string | null; name: string; created_at: string | null; updated_at: string | null; launch_status: string | null }>).map((project) => ({
    ...project,
    ...projectModerationById.get(project.id),
    ...projectPublicationById.get(project.id),
    ...projectDemoById.get(project.id),
    ...projectQualityById.get(project.id),
    approval_status: projectModerationById.get(project.id)?.approval_status ?? null,
    rejection_reason: projectModerationById.get(project.id)?.rejection_reason ?? null,
    lifecycle_state: projectPublicationById.get(project.id)?.lifecycle_state ?? null,
    published_at: projectPublicationById.get(project.id)?.published_at ?? null,
    is_demo: projectDemoById.get(project.id)?.is_demo ?? false,
    demo_batch: projectDemoById.get(project.id)?.demo_batch ?? null,
  })) as DeveloperProject[];
  const properties = (propertyRows as Array<{ id: string; property_name: string | null; developer_id: string | null; project_id: string | null; listed_by_agent_id: string | null; price: number | null; inquiries_count: number | null; approval_status: string | null; rejection_reason: string | null; is_active: boolean | null; published_at: string | null; expires_at: string | null; updated_at: string | null; created_at: string | null }>).map((property) => ({
    ...property,
    ...propertyDemoById.get(property.id),
    ...propertyQualityById.get(property.id),
    is_demo: propertyDemoById.get(property.id)?.is_demo ?? false,
    demo_batch: propertyDemoById.get(property.id)?.demo_batch ?? null,
  })) as Property[];
  const rawAccounts = accountRows as DeveloperMember[];
  const accounts = await Promise.all(
    rawAccounts.map(async (account) => {
      let email = account.email ?? null;
      if (!email && account.auth_user_id) {
        try {
          const { data: userData } = await supabaseServer.auth.admin.getUserById(account.auth_user_id);
          email = userData?.user?.email ?? null;
        } catch {
          // A deleted or partially provisioned Auth user should not break the console.
        }
      }
      return {
        ...account,
        ...accountOpsById.get(account.id),
        email,
        is_demo: accountOpsById.get(account.id)?.is_demo ?? false,
        demo_batch: accountOpsById.get(account.id)?.demo_batch ?? null,
      };
    }),
  );

  const lifecycleActivity = (lifecycleEvents.rows as Array<{ id: string; developer_id: string; developer_account_id: string; event_type: string; actor_type: string | null; actor_id: string | null; idempotency_key: string | null; created_at: string; metadata: Record<string, unknown> | null }>).map((entry) => ({
    id: entry.id,
    developer_id: entry.developer_id,
    developer_account_id: entry.developer_account_id,
    action: entry.event_type,
    created_at: entry.created_at,
    metadata: entry.metadata ?? null,
    resource_id: entry.developer_account_id,
    actor_type: entry.actor_type,
    actor_id: entry.actor_id,
    idempotency_key: entry.idempotency_key,
  })) as DeveloperActivity[];
  const legacyActivity = activityRaw
    .filter((entry) => entry.action.startsWith("developer_account."))
    .filter((entry) => currentDeveloperIds.includes(String(entry.metadata?.developer_id ?? "")))
    .map((entry) => ({
      id: entry.id,
      developer_id: String(entry.metadata?.developer_id ?? "") || null,
      action: entry.action,
      created_at: entry.created_at,
      metadata: entry.metadata ?? null,
      resource_id: entry.resource_id ?? null,
    }));
  const lifecycleKeys = new Set(lifecycleActivity.map((entry) => `${entry.action}:${entry.resource_id ?? ""}:${entry.metadata?.invite_request_id ?? ""}`));
  const activity = [...lifecycleActivity, ...legacyActivity.filter((entry) => !lifecycleKeys.has(`${entry.action}:${entry.resource_id ?? ""}:${entry.metadata?.invite_request_id ?? ""}`))].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const profileDeveloperIds = Array.from(new Set((profileRevisions.rows as DeveloperProfileRevision[]).map((revision) => revision.developer_id))).filter(
    (developerId) => !developers.some((developer) => developer.id === developerId),
  );
  const profileDeveloperRows = profileDeveloperIds.length
    ? await loadRows(
        supabaseServer.from("developers").select("id, name").in("id", profileDeveloperIds),
        "profile review developer names",
      )
    : [];
  const profileDeveloperNames = new Map((profileDeveloperRows as Array<{ id: string; name: string | null }>).map((developer) => [developer.id, developer.name]));

  return {
    developers,
    properties,
    projects,
    accounts,
    activity,
    demoBatches: demoBatches.rows as DemoBatch[],
    profileRevisions: (profileRevisions.rows as DeveloperProfileRevision[]).map((revision) => ({
      ...revision,
      developerName: developers.find((developer) => developer.id === revision.developer_id)?.name ?? profileDeveloperNames.get(revision.developer_id) ?? null,
    })),
    developerTotal: developerCount ?? developers.length,
    developerPage: page,
    developerPageSize: DEVELOPER_PAGE_SIZE,
    developerHasNext: developerOffset + developers.length < (developerCount ?? developers.length),
    search: normalizedSearch,
    availability: {
      publicationContract: developerOps.available && projectPublication.available,
      inventoryQuality: projectQuality.available || propertyQuality.available,
      demoData: developerOps.available || projectDemo.available || propertyDemo.available || demoBatches.available,
      invitationReliability: accountOps.available,
      lifecycleEvents: lifecycleEvents.available,
      profileReviews: profileRevisions.available,
    },
    developerError: null,
  };
}

function inviteActionError(message: string): DeveloperInviteActionState {
  return { status: "error", message };
}

function inviteActionSuccess(message: string): DeveloperInviteActionState {
  return { status: "success", message };
}

function isValidEmail(value: string) {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function inviteDeveloperMember(
  _previousState: DeveloperInviteActionState,
  formData: FormData,
): Promise<DeveloperInviteActionState> {
  "use server";
  const admin = await requireAdminRole(["developers_admin"]);
  if (!admin?.adminId) return inviteActionError("You do not have permission to invite developer members.");

  try {
    const isSuperAdmin = admin.roles.includes("super_admin");
    const allowedDeveloperIds = isSuperAdmin ? [] : admin.developerIds ?? [];
    const existingDeveloperId = formData.get("existingDeveloperId")?.toString().trim() ?? "";
    const developerNameInput = formData.get("developerName")?.toString().trim() ?? "";
    const contactEmailInput = formData.get("contactEmail")?.toString().trim().toLowerCase() ?? "";
    const contactPhoneInput = formData.get("contactPhone")?.toString().trim() ?? "";
    const memberEmail = formData.get("memberEmail")?.toString().trim().toLowerCase() ?? "";
    const inviteRequestId = formData.get("inviteRequestId")?.toString().trim() || crypto.randomUUID();
    const isDemo = formData.get("isDemo") === "on";
    const demoBatch = formData.get("demoBatch")?.toString().trim() || null;

    if (!isValidEmail(memberEmail)) return inviteActionError("Enter a valid member email address.");
    if (inviteRequestId.length > 200) return inviteActionError("The invite request could not be identified. Refresh and try again.");

    const isCreatingDeveloper = !existingDeveloperId;
    if (isCreatingDeveloper && allowedDeveloperIds.length) {
      return inviteActionError("Only a super admin can create a new developer. Select an assigned developer instead.");
    }

    let developerId = existingDeveloperId;
    let developerName = developerNameInput;
    let contactEmail: string | null = null;
    let contactPhone: string | null = null;

    if (isDemo && !isCreatingDeveloper) {
      return inviteActionError("Demo marking is available only when creating a new developer.");
    }
    if (isDemo && !demoBatch) {
      return inviteActionError("Choose an active demo batch before creating a demo developer.");
    }

    if (isCreatingDeveloper) {
      if (!developerName) return inviteActionError("Developer name is required when creating a new developer.");
      if (developerName.length > 200) return inviteActionError("Developer name must be 200 characters or fewer.");
      if (contactEmailInput && !isValidEmail(contactEmailInput)) return inviteActionError("Enter a valid developer contact email.");
      if (contactPhoneInput.length > 20) return inviteActionError("Developer contact phone must be 20 characters or fewer.");

      const { data: duplicateDeveloper, error: duplicateError } = await supabaseServer
        .from("developers")
        .select("id")
        .eq("name", developerName)
        .maybeSingle();
      if (duplicateError) {
        console.error("Failed to validate developer name", duplicateError);
        return inviteActionError("Unable to validate the developer name. Try again.");
      }
      if (duplicateDeveloper?.id) {
        return inviteActionError("A developer with this name already exists. Select it instead of creating a duplicate.");
      }

      developerId = crypto.randomUUID();
      contactEmail = contactEmailInput || null;
      contactPhone = contactPhoneInput || null;
    } else {
      if (allowedDeveloperIds.length && !allowedDeveloperIds.includes(existingDeveloperId)) {
        return inviteActionError("You are not assigned to that developer.");
      }
      const { data: developer, error: developerError } = await supabaseServer
        .from("developers")
        .select("id, name")
        .eq("id", existingDeveloperId)
        .maybeSingle();
      if (developerError || !developer?.id || !developer.name) {
        console.error("Failed to load selected developer", developerError);
        return inviteActionError("The selected developer could not be found. Refresh and try again.");
      }
      developerId = developer.id;
      developerName = developer.name;
      // Contact fields are intentionally ignored for an existing developer.
    }

    const existingAuthUser = await findAuthUserByEmail(memberEmail);
    let existingMembership: { id: string; developer_id: string; status: string | null; invite_request_id: string | null } | null = null;
    if (existingAuthUser?.id) {
      const { data: membership, error: membershipError } = await supabaseServer
        .from("developer_accounts")
        .select("id, developer_id, status, invite_request_id")
        .eq("auth_user_id", existingAuthUser.id)
        .maybeSingle();
      if (membershipError) {
        console.error("Failed to check existing developer membership", membershipError);
        return inviteActionError("Unable to check existing developer access. Try again.");
      }
      existingMembership = membership;
      if (membership?.developer_id !== developerId && membership?.id) {
        return inviteActionError("This email already belongs to another developer.");
      }
      if (membership?.status === "active") {
        return inviteActionError("This member already has active developer access.");
      }
      if (membership?.status === "revoked") {
        return inviteActionError("Revoked access cannot be reactivated. Invite a new member email instead.");
      }
      if (membership?.status === "pending" && membership.invite_request_id === inviteRequestId) {
        revalidatePath("/developers");
        return inviteActionSuccess("This invite request was already recorded. The member can use the latest invite email.");
      }
    }

    const inviteResult = await sendDeveloperPortalInvite({
      email: memberEmail,
      developerId,
      developerName,
      inviteRequestId,
    });
    if (inviteResult.error || !inviteResult.authUserId) {
      if (inviteResult.createdAuthUser && inviteResult.authUserId) {
        await compensateDeveloperInviteAuthUser({
          authUserId: inviteResult.authUserId,
          developerId,
          inviteRequestId,
        });
      }
      console.error("Failed to invite developer member", inviteResult.error);
      return inviteActionError("The invitation email could not be sent. No developer access was recorded.");
    }

    const { data: inviteRecord, error: inviteRecordError } = await supabaseServer.rpc("create_developer_account_invite", {
      p_developer_id: developerId,
      p_developer_name: developerName,
      p_contact_email: contactEmail,
      p_contact_phone: contactPhone,
      p_create_developer: isCreatingDeveloper,
      p_auth_user_id: inviteResult.authUserId,
      p_member_email: memberEmail,
      p_invited_by_admin_id: admin.adminId,
      p_invite_request_id: inviteRequestId,
      p_is_demo: isDemo,
      p_demo_batch: demoBatch,
    });
    if (inviteRecordError || !inviteRecord?.account_id) {
      if (inviteResult.createdAuthUser) {
        await compensateDeveloperInviteAuthUser({
          authUserId: inviteResult.authUserId,
          developerId,
          inviteRequestId,
        });
      }
      console.error("Failed to record developer invitation", inviteRecordError);
      return inviteActionError("The invitation email was sent, but access could not be recorded. Try this action again with the same form.");
    }

    await logAdminActivity({
      adminId: admin.adminId,
      action: String(inviteRecord.action ?? (existingMembership?.id ? "developer_account.resend_invite" : "developer_account.invite")),
      resourceType: "developer_accounts",
      resourceId: String(inviteRecord.account_id),
      metadata: { developer_id: developerId, developer_name: developerName, email: memberEmail },
    });

    revalidatePath("/developers");
    return inviteActionSuccess(`Invite sent to ${memberEmail} for ${developerName}.`);
  } catch (error) {
    console.error("Developer invitation action failed", error);
    return inviteActionError("We could not complete the invitation. No silent changes were made; try again.");
  }
}

function projectIsMobileVisible(
  project: DeveloperProject,
  publicationContractAvailable: boolean,
  developerIsActive = true,
  developerLifecycleState?: string | null,
  developerIsDemo = false,
) {
  if (project.is_demo || developerIsDemo || !developerIsActive) return false;
  if (publicationContractAvailable) {
    if (developerLifecycleState !== "published") return false;
    return project.approval_status === "approved" && project.lifecycle_state === "published" && Boolean(project.published_at);
  }
  return project.approval_status === "approved";
}

function listingIsMobileVisible(
  property: Property,
  projects: DeveloperProject[],
  publicationContractAvailable: boolean,
  developerIsActive = true,
  developerLifecycleState?: string | null,
  developerIsDemo = false,
) {
  if (property.is_demo || developerIsDemo || property.approval_status !== "approved" || property.is_active !== true || isExpired(property.expires_at) || !developerIsActive) return false;
  if (publicationContractAvailable && (developerLifecycleState !== "published" || !property.published_at)) return false;
  if (!property.project_id) return true;
  const project = projects.find((candidate) => candidate.id === property.project_id);
  return project ? projectIsMobileVisible(project, publicationContractAvailable, developerIsActive, developerLifecycleState, developerIsDemo) : false;
}

function isStaleInvite(member: DeveloperMember) {
  if (member.status !== "pending") return false;
  const sentAt = member.invitation_sent_at ?? member.invited_at;
  if (!sentAt) return false;
  return Date.now() - new Date(sentAt).getTime() > STALE_INVITE_DAYS * 24 * 60 * 60 * 1000;
}

export default async function DevelopersPage({
  searchParams,
}: {
  searchParams?: Promise<{ developerSearch?: string; developerPage?: string; developerFilter?: string }>;
}) {
  const adminContext = await buildAdminUi(["developers_admin"]);
  const allowedDeveloperIds = adminContext.roles.includes("super_admin") ? null : adminContext.context?.developerIds ?? null;
  const params = (await searchParams) ?? {};
  const developerSearch = params.developerSearch?.trim().slice(0, 100) ?? "";
  const developerPage = safePage(params.developerPage);
  const developerFilters = ["all", "attention", "access", "publication", "healthy"] as const;
  const developerFilter = developerFilters.includes(params.developerFilter as (typeof developerFilters)[number])
    ? params.developerFilter!
    : "all";
  const data = adminContext.hasAccess
    ? await getDeveloperData(allowedDeveloperIds, developerPage, developerSearch)
    : {
        developers: [],
        properties: [],
        projects: [],
        accounts: [],
        activity: [],
        demoBatches: [],
        profileRevisions: [],
        developerTotal: 0,
        developerPage,
        developerPageSize: DEVELOPER_PAGE_SIZE,
        developerHasNext: false,
        search: developerSearch,
        availability: {
          publicationContract: false,
          inventoryQuality: false,
          demoData: false,
          invitationReliability: false,
          lifecycleEvents: false,
          profileReviews: false,
        },
        developerError: null,
      } satisfies DeveloperData;

  const membersByDeveloperId = data.accounts.reduce<Record<string, DeveloperMember[]>>((acc, member) => {
    acc[member.developer_id] = [...(acc[member.developer_id] ?? []), member];
    return acc;
  }, {});
  const projectsByDeveloperId = data.projects.reduce<Record<string, DeveloperProject[]>>((acc, project) => {
    if (project.developer_id) acc[project.developer_id] = [...(acc[project.developer_id] ?? []), project];
    return acc;
  }, {});
  const propertiesByDeveloperId = data.properties.reduce<Record<string, Property[]>>((acc, property) => {
    if (property.developer_id) acc[property.developer_id] = [...(acc[property.developer_id] ?? []), property];
    return acc;
  }, {});

  const tableRows = data.developers.map((developer) => {
    const members = membersByDeveloperId[developer.id] ?? [];
    const developerProjects = projectsByDeveloperId[developer.id] ?? [];
    const developerListings = propertiesByDeveloperId[developer.id] ?? [];
    const lastLogin = members
      .map((member) => member.last_login)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
    const pendingProjectsCount = developerProjects.filter((project) => project.approval_status === "pending").length;
    const rejectedProjectsCount = developerProjects.filter((project) => project.approval_status === "rejected").length;
    const mobileVisibleProjectsCount = developerProjects.filter((project) => projectIsMobileVisible(project, data.availability.publicationContract, developer.is_active !== false, developer.lifecycle_state, Boolean(developer.is_demo))).length;
    const pendingListingsCount = developerListings.filter((listing) => listing.approval_status === "pending").length;
    const rejectedListingsCount = developerListings.filter((listing) => listing.approval_status === "rejected").length;
    const expiredListingsCount = developerListings.filter((listing) => isExpired(listing.expires_at)).length;
    const mobileVisibleListingsCount = developerListings.filter((listing) => listingIsMobileVisible(listing, developerProjects, data.availability.publicationContract, developer.is_active !== false, developer.lifecycle_state, Boolean(developer.is_demo))).length;
    const pendingMembersCount = members.filter((member) => member.status === "pending").length;
    const revokedMembersCount = members.filter((member) => member.status === "revoked").length;
    const stalePendingInvitesCount = members.filter(isStaleInvite).length;
    const profilePendingCount = data.profileRevisions.filter((revision) => revision.developer_id === developer.id && revision.status === "pending").length;
    const inactiveException = developer.is_active === false ? 1 : 0;
    const unpublishedDeveloperException = data.availability.publicationContract && developer.is_active !== false && developer.lifecycle_state !== "published" ? 1 : 0;
    const attentionCount = inactiveException + unpublishedDeveloperException + pendingProjectsCount + rejectedProjectsCount + pendingListingsCount + rejectedListingsCount + expiredListingsCount + stalePendingInvitesCount + profilePendingCount;

    return {
      id: developer.id,
      name: developer.name,
      contact_email: developer.contact_email,
      contact_phone: developer.contact_phone,
      logo_url: developer.logo_url,
      projectsCount: developerProjects.length,
      publishedProjectsCount: developerProjects.filter((project) => project.approval_status === "approved").length,
      pendingProjectsCount,
      rejectedProjectsCount,
      mobileVisibleProjectsCount,
      listingsCount: developerListings.length,
      pendingListingsCount,
      rejectedListingsCount,
      expiredListingsCount,
      mobileVisibleListingsCount,
      membersCount: members.length,
      activeMembersCount: members.filter((member) => member.status === "active").length,
      pendingMembersCount,
      revokedMembersCount,
      stalePendingInvitesCount,
      profilePendingCount,
      attentionCount,
      lastLogin,
      isActive: developer.is_active !== false,
      lifecycleState: developer.lifecycle_state ?? null,
      publishedAt: developer.published_at ?? null,
      is_demo: Boolean(developer.is_demo),
      demo_batch: developer.demo_batch ?? null,
    };
  });

  const buildPageHref = (page: number) => {
    const next = new URLSearchParams();
    if (developerSearch) next.set("developerSearch", developerSearch);
    if (developerFilter !== "all") next.set("developerFilter", developerFilter);
    next.set("developerPage", String(page));
    return `/developers?${next.toString()}`;
  };

  return (
    <AdminLayout
      title="Developer operations"
      description="Run partner access, portfolio publication, and mobile visibility from one exception-driven console."
      actions={
        <a
          href="#developer-invite"
          className="inline-flex min-h-11 items-center rounded-full border border-black/10 bg-white px-5 py-2 text-sm font-semibold text-neutral-700 hover:bg-black/5"
        >
          Invite member
        </a>
      }
      navItems={adminContext.navItems}
      meta={adminContext.meta}
    >
      {!adminContext.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <div className="space-y-6">
          <section className="rounded-3xl border border-black/5 bg-white p-4 shadow-xl shadow-black/5 sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">Portfolio health</p>
                <h2 className="mt-1 text-xl font-semibold text-[#050505]">Developers and exceptions</h2>
                <p className="mt-1 max-w-2xl text-sm text-neutral-600">
                  Search is server-filtered. Use the exception views to prioritise access, moderation, stale inventory, and profile changes.
                </p>
              </div>
              <form action="/developers" method="get" role="search" className="grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto_auto] lg:max-w-3xl">
                <label className="sr-only" htmlFor="developer-search">Search developers</label>
                <input
                  id="developer-search"
                  name="developerSearch"
                  defaultValue={developerSearch}
                  autoComplete="off"
                  placeholder="Search name, email, or phone…"
                  className="min-h-11 min-w-0 rounded-xl border border-black/15 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-500"
                />
                <label className="sr-only" htmlFor="developer-filter">Developer view</label>
                <select id="developer-filter" name="developerFilter" defaultValue={developerFilter} className="min-h-11 rounded-xl border border-black/15 bg-white px-3 py-2 text-sm text-neutral-900">
                  <option value="all">All developers</option>
                  <option value="attention">Needs attention</option>
                  <option value="access">Access exceptions</option>
                  <option value="publication">Publication exceptions</option>
                  <option value="healthy">Healthy only</option>
                </select>
                <input type="hidden" name="developerPage" value="1" />
                <button type="submit" className="min-h-11 rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800">Apply</button>
                <Link href="/developers" className="inline-flex min-h-11 items-center justify-center rounded-full border border-black/15 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-black/5">Clear</Link>
              </form>
            </div>
            {data.developerError ? <p role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">Unable to load developer directory: {data.developerError}</p> : null}
            {!data.availability.publicationContract && data.developers.length ? <p role="status" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Publication columns are not available yet. Mobile totals use legacy approval and active-state signals until the publication migration is deployed.</p> : null}
            {!data.availability.profileReviews && data.developers.length ? <p role="status" className="mt-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">Profile review lane is waiting for the profile revision contract; existing profile data is unchanged.</p> : null}
          </section>

          <AdminDevelopersTable
            developers={tableRows}
            projects={data.projects}
            properties={data.properties}
            members={data.accounts}
            activity={data.activity}
            profileRevisions={data.profileRevisions}
            canImpersonate={adminContext.roles.includes("super_admin")}
            filter={developerFilter}
            search={developerSearch}
            pagination={{ page: data.developerPage, pageSize: data.developerPageSize, total: data.developerTotal, hasNext: data.developerHasNext }}
            availability={data.availability}
            pageHref={buildPageHref}
          />

          <section id="developer-invite" className="scroll-mt-6 rounded-3xl border border-black/5 bg-white p-4 shadow-xl shadow-black/5 sm:p-6">
            <header className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">Invite developer member</p>
              <h2 className="mt-1 text-lg font-semibold text-[#050505]">Add controlled portal access</h2>
              <p className="mt-1 text-sm text-neutral-600">
                Send a secure invite email. Existing developer identity fields remain unchanged; the member completes signup by setting a password and activating access.
              </p>
            </header>
            <AdminDeveloperInviteForm
              developers={data.developers.map((developer) => ({
                id: developer.id,
                name: developer.name,
                contact_email: developer.contact_email,
                contact_phone: developer.contact_phone,
              }))}
              demoBatches={data.demoBatches}
              action={inviteDeveloperMember}
            />
          </section>
        </div>
      )}
    </AdminLayout>
  );
}
