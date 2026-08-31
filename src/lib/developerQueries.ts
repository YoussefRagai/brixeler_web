import { supabaseServer } from "./supabaseServer";

type ProjectMediaPayload = Record<string, unknown> | null | undefined;

export type DeveloperProjectPhase = {
  id: string;
  project_id: string;
  name: string;
  phase_order: number;
  description?: string | null;
  hero_media?: Record<string, unknown> | null;
  launch_status?: string | null;
  launch_date?: string | null;
  is_default?: boolean;
  lifecycle_state?: string | null;
  approval_status?: string | null;
  published_at?: string | null;
  publication_status?: DeveloperPublicationStatus | null;
  publication_feedback?: Record<string, unknown> | null;
  ready_at?: string | null;
  submitted_at?: string | null;
  submitted_by_account_id?: string | null;
  approved_at?: string | null;
  approved_by_admin_id?: string | null;
  changes_requested_at?: string | null;
  archived_at?: string | null;
  archived_by_account_id?: string | null;
};

export type ProjectUnitType = {
  id: string;
  project_id: string;
  phase_id: string;
  category?: string | null;
  label: string;
  min_price: number;
  max_price?: number | null;
  unit_area_min?: number | null;
  unit_area_max?: number | null;
  land_area_min?: number | null;
  land_area_max?: number | null;
  finishing_status?: string | null;
  description?: string | null;
  hero_image_url?: string | null;
  archived_at?: string | null;
  archived_by_account_id?: string | null;
  project_unit_variants?: ProjectUnitVariant[] | null;
};

export type ProjectUnitVariant = {
  id: string;
  project_unit_type_id: string;
  category?: string | null;
  label?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  has_garden?: boolean | null;
  has_roof?: boolean | null;
  finishing_status?: string | null;
  delivery_date?: string | null;
  min_price: number;
  max_price?: number | null;
  unit_area_min?: number | null;
  unit_area_max?: number | null;
  land_area_min?: number | null;
  land_area_max?: number | null;
  layout_options?: string[] | null;
  down_payment_percent?: number | null;
  installment_years?: number | null;
  stock_count?: number | null;
  description?: string | null;
  amenities?: string[] | null;
  archived_at?: string | null;
  archived_by_account_id?: string | null;
};

export type StructuredPaymentPlan = {
  title?: string | null;
  down_payment_percent?: number | null;
  installment_years?: number | null;
  discount_percent?: number | null;
  payment_frequency?: string | null;
};

export type LimitedTimeOffer = StructuredPaymentPlan & {
  offer_title?: string | null;
};

function assertDeveloperId(developerId?: string) {
  if (!developerId) {
    throw new Error("Developer session missing. Please log back in.");
  }
  return developerId;
}

function escapeIlikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export type DeveloperListing = {
  id: string;
  name: string;
  price: number;
  unit_area?: number | null;
  status: string;
  visibility: string;
  updated_at: string | null;
  inquiries: number;
  expires_at: string | null;
  published_at: string | null;
  renewal_status?: string | null;
  sale_type?: string | null;
  project_id?: string | null;
  phase_id?: string | null;
  developer_id?: string | null;
  listed_by_agent_id?: string | null;
  availability_state?: DeveloperInventoryAvailability | null;
  is_demo: boolean;
  quality_issues?: string[];
  quality_score?: number | null;
  publication_checklist?: Record<string, unknown> | null;
  archived_at?: string | null;
  archived_by_developer_account_id?: string | null;
};

export async function fetchDeveloperListings(developerId: string, options?: { limit?: number }): Promise<DeveloperListing[]> {
  try {
    const id = assertDeveloperId(developerId);
    let query = supabaseServer
      .from("properties")
      .select(
        "id, property_name, price, unit_area, approval_status, is_active, is_demo, updated_at, inquiries_count, expires_at, published_at, renewal_status, sale_type, project_id, phase_id, developer_id, listed_by_agent_id, availability_state, quality_issues, quality_score, publication_checklist, archived_at, archived_by_developer_account_id",
      )
      .eq("developer_id", id)
      .order("updated_at", { ascending: false });
    if (options?.limit) query = query.limit(Math.min(Math.max(options.limit, 1), 500));
    const { data, error } = await query;
    if (error || !data) {
      console.warn("Unable to fetch developer listings", error);
      return [];
    }
    return data.map((row) => ({
      id: row.id,
      name: row.property_name,
      price: Number(row.price ?? 0),
      unit_area: row.unit_area == null ? null : Number(row.unit_area),
      status: row.approval_status ?? "pending",
      visibility: row.is_active === false ? "hidden" : "public",
      is_demo: Boolean(row.is_demo),
      updated_at: row.updated_at,
      inquiries: Number(row.inquiries_count ?? 0),
      expires_at: row.expires_at ?? null,
      published_at: row.published_at ?? null,
      renewal_status: row.renewal_status ?? null,
      sale_type: row.sale_type ?? null,
      project_id: row.project_id ?? null,
      phase_id: row.phase_id ?? null,
      developer_id: row.developer_id ?? null,
      listed_by_agent_id: row.listed_by_agent_id ?? null,
      availability_state: (row.availability_state as DeveloperInventoryAvailability | null | undefined) ?? "available",
      quality_issues: Array.isArray(row.quality_issues) ? row.quality_issues : [],
      quality_score: row.quality_score == null ? null : Number(row.quality_score),
      publication_checklist: row.publication_checklist ?? null,
      archived_at: row.archived_at ?? null,
      archived_by_developer_account_id: row.archived_by_developer_account_id ?? null,
    }));
  } catch (error) {
    console.warn("fetchDeveloperListings fallback", error);
    return [];
  }
}

export async function fetchDeveloperResales(developerId: string): Promise<DeveloperListing[]> {
  try {
    const id = assertDeveloperId(developerId);
    const { data, error } = await supabaseServer
      .from("properties")
      .select(
        "id, property_name, price, unit_area, approval_status, is_active, is_demo, updated_at, inquiries_count, expires_at, published_at, renewal_status, sale_type, project_id, phase_id, developer_id, listed_by_agent_id, quality_issues, quality_score, publication_checklist, archived_at, archived_by_developer_account_id, developer_projects!inner(id, developer_id)",
      )
      .eq("developer_projects.developer_id", id)
      .eq("sale_type", "resale")
      .order("updated_at", { ascending: false });
    if (error || !data) {
      console.warn("Unable to fetch developer resales", error);
      return [];
    }
    return data.map((row) => ({
      id: row.id,
      name: row.property_name,
      price: Number(row.price ?? 0),
      unit_area: row.unit_area == null ? null : Number(row.unit_area),
      status: row.approval_status ?? "pending",
      visibility: row.is_active === false ? "hidden" : "public",
      is_demo: Boolean(row.is_demo),
      updated_at: row.updated_at,
      inquiries: Number(row.inquiries_count ?? 0),
      expires_at: row.expires_at ?? null,
      published_at: row.published_at ?? null,
      renewal_status: row.renewal_status ?? null,
      sale_type: row.sale_type ?? null,
      project_id: row.project_id ?? null,
      phase_id: row.phase_id ?? null,
      developer_id: row.developer_id ?? null,
      listed_by_agent_id: row.listed_by_agent_id ?? null,
      quality_issues: Array.isArray(row.quality_issues) ? row.quality_issues : [],
      quality_score: row.quality_score == null ? null : Number(row.quality_score),
      publication_checklist: row.publication_checklist ?? null,
      archived_at: row.archived_at ?? null,
      archived_by_developer_account_id: row.archived_by_developer_account_id ?? null,
    }));
  } catch (error) {
    console.warn("fetchDeveloperResales fallback", error);
    return [];
  }
}

export async function fetchDeveloperListing(listingId: string, developerId: string) {
  try {
    const id = assertDeveloperId(developerId);
    const { data, error } = await supabaseServer
      .from("properties")
      .select(
        "id, property_name, price, description, amenities, photos, specific_location, expires_at, renewal_status, property_type, sale_type, bedrooms, bathrooms, unit_area, down_payment_percentage, installment_years, monthly_installment, delivery_date, finishing_status, floor_plan_url, video_tour_url, project_id, phase_id, approval_status, is_active, is_demo, published_at, quality_issues, quality_score, publication_checklist, archived_at, archived_by_developer_account_id"
      )
      .eq("developer_id", id)
      .is("listed_by_agent_id", null)
      .eq("id", listingId)
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.warn('fetchDeveloperListing failed', error);
    return null;
  }
}

export type DeveloperListingPayload = {
  name: string;
  area?: string;
  projectId?: string | null;
  phaseId?: string | null;
  price: number;
  description?: string;
  photoUrls: string[];
  propertyType: string;
  saleType: string;
  bedrooms: number;
  bathrooms: number;
  unitArea: number;
  downPayment: number;
  installmentYears: number;
  monthlyInstallment?: number;
  deliveryDate?: string | null;
  finishingStatus: string;
  amenities: string[];
  brochureUrl?: string | null;
  videoUrl?: string | null;
};

function validateDeveloperListingPayload(payload: DeveloperListingPayload, photos: string[]) {
  if (!payload.name.trim() || payload.name.trim().length < 3) {
    return "Add a listing title with at least 3 characters.";
  }
  if (!payload.propertyType.trim() || !payload.saleType.trim()) {
    return "Choose a property type and sale type.";
  }
  if (!Number.isFinite(payload.price) || payload.price < 100000) {
    return "Price must be at least EGP 100,000.";
  }
  if (!Number.isFinite(payload.unitArea) || payload.unitArea < 10) {
    return "Unit area must be at least 10 m².";
  }
  if (!Number.isFinite(payload.bedrooms) || payload.bedrooms < 0 || !Number.isFinite(payload.bathrooms) || payload.bathrooms < 0) {
    return "Bedrooms and bathrooms must be zero or more.";
  }
  if (!Number.isFinite(payload.downPayment) || payload.downPayment < 0 || payload.downPayment > 100) {
    return "Down payment must be between 0% and 100%.";
  }
  if (!Number.isFinite(payload.installmentYears) || payload.installmentYears <= 0) {
    return "Installment years must be greater than zero.";
  }
  if (!payload.finishingStatus.trim()) {
    return "Choose a finishing status.";
  }
  if (!payload.description?.trim()) {
    return "Add a description before submitting this listing.";
  }
  if (photos.length < 3) {
    return "Add at least three real property photos before submitting.";
  }
  const normalizedPhotos = photos.map((url) => url.toLowerCase());
  if (new Set(normalizedPhotos).size !== normalizedPhotos.length) {
    return "Use three different property photos.";
  }
  if (photos.some((url) => {
    try {
      const parsed = new URL(url);
      return !["http:", "https:"].includes(parsed.protocol);
    } catch {
      return true;
    }
  })) {
    return "Every property photo must use a valid http(s) URL.";
  }
  if (payload.monthlyInstallment != null && (!Number.isFinite(payload.monthlyInstallment) || payload.monthlyInstallment < 0)) {
    return "Monthly installment must be zero or more.";
  }
  return null;
}

async function findDuplicateDeveloperListing(
  developerId: string,
  listingId: string | undefined,
  payload: DeveloperListingPayload,
  phaseId?: string | null,
) {
  let query = supabaseServer
    .from("properties")
    .select("id, property_name, project_id, phase_id, price, unit_area")
    .eq("developer_id", developerId)
    .is("listed_by_agent_id", null)
    .eq("price", payload.price)
    .eq("unit_area", payload.unitArea);
  if (payload.projectId) query = query.eq("project_id", payload.projectId);
  else query = query.is("project_id", null);
  if (payload.projectId && phaseId) query = query.eq("phase_id", phaseId);
  else if (payload.projectId) query = query.is("phase_id", null);
  const { data, error } = await query.limit(20);
  if (error) return { error };
  const duplicate = (data ?? []).find((row) =>
    row.id !== listingId &&
    String(row.property_name ?? "").trim().toLocaleLowerCase() === payload.name.trim().toLocaleLowerCase(),
  );
  return { error: null, duplicate: duplicate ?? null };
}

async function developerOwnsProject(developerId: string, projectId: string) {
  const { data, error } = await supabaseServer
    .from("developer_projects")
    .select("id")
    .eq("id", projectId)
    .eq("developer_id", developerId)
    .maybeSingle();
  return !error && Boolean(data);
}

async function resolveDeveloperProjectPhase(
  developerId: string,
  projectId: string,
  phaseId?: string | null,
) {
  const { data: project, error: projectError } = await supabaseServer
    .from("developer_projects")
    .select("id")
    .eq("id", projectId)
    .eq("developer_id", developerId)
    .maybeSingle();
  if (projectError || !project) return { data: null, error: projectError ?? new Error("Choose a project owned by this developer account.") };

  let query = supabaseServer
    .from("developer_project_phases")
    .select("id, project_id, name, phase_order, archived_at, lifecycle_state, approval_status")
    .eq("project_id", projectId)
    .is("archived_at", null)
    .order("phase_order", { ascending: true });
  if (phaseId) query = query.eq("id", phaseId);
  else query = query.eq("is_default", true);
  const { data, error } = await query.maybeSingle();
  if (error || !data) return { data: null, error: error ?? new Error("Choose an active release phase before saving inventory.") };
  return { data, error: null };
}

export async function validateDeveloperProjectPhase(
  developerId: string,
  projectId: string,
  phaseId?: string | null,
) {
  const id = assertDeveloperId(developerId);
  const result = await resolveDeveloperProjectPhase(id, projectId, phaseId);
  return { error: result.error };
}

export async function createDeveloperListing(
  developerId: string,
  payload: DeveloperListingPayload,
) {
  const id = assertDeveloperId(developerId);
  if (payload.projectId && !(await developerOwnsProject(id, payload.projectId))) {
    return { error: new Error("Choose a project owned by this developer account.") };
  }
  const phaseResult = payload.projectId
    ? await resolveDeveloperProjectPhase(id, payload.projectId, payload.phaseId)
    : { data: null, error: null };
  if (phaseResult.error) return { error: phaseResult.error };
  const photos = payload.photoUrls.map((url) => url.trim()).filter(Boolean);
  const validationError = validateDeveloperListingPayload(payload, photos);
  if (validationError) {
    return { error: new Error(validationError) };
  }
  const duplicateResult = await findDuplicateDeveloperListing(id, undefined, payload, phaseResult.data?.id);
  if (duplicateResult.error) {
    return { error: duplicateResult.error };
  }
  if (duplicateResult.duplicate) {
    return { error: new Error("A matching developer listing already exists. Check the project, price, and title before submitting.") };
  }
  const monthlyInstallment =
    payload.monthlyInstallment && payload.monthlyInstallment > 0
      ? payload.monthlyInstallment
      : Math.round(payload.price / Math.max(payload.installmentYears, 1) / 12);
  const { error } = await supabaseServer.from("properties").insert({
    developer_id: id,
    project_id: payload.projectId ?? null,
    phase_id: phaseResult.data?.id ?? null,
    property_name: payload.name,
    specific_location: payload.area ?? null,
    price: payload.price,
    description: payload.description ?? "Submitted via developer console",
    photos,
    cover_photo_url: photos[0],
    approval_status: "pending",
    property_type: payload.propertyType,
    sale_type: payload.saleType,
    bedrooms: payload.bedrooms,
    bathrooms: payload.bathrooms,
    unit_area: payload.unitArea,
    down_payment_percentage: payload.downPayment,
    installment_years: payload.installmentYears,
    monthly_installment: monthlyInstallment,
    delivery_date: payload.deliveryDate ?? null,
    finishing_status: payload.finishingStatus,
    amenities: payload.amenities.length ? payload.amenities : ["Developer submission"],
    floor_plan_url: payload.brochureUrl ?? null,
    video_tour_url: payload.videoUrl ?? null,
    is_demo: false,
  });
  return { error };
}

export async function updateDeveloperListing(
  developerId: string,
  listingId: string,
  payload: DeveloperListingPayload & { visibility: string },
) {
  const id = assertDeveloperId(developerId);
  if (payload.projectId && !(await developerOwnsProject(id, payload.projectId))) {
    return { error: new Error("Choose a project owned by this developer account.") };
  }
  const phaseResult = payload.projectId
    ? await resolveDeveloperProjectPhase(id, payload.projectId, payload.phaseId)
    : { data: null, error: null };
  if (phaseResult.error) return { error: phaseResult.error };
  const photos = payload.photoUrls.map((url) => url.trim()).filter(Boolean);
  const validationError = validateDeveloperListingPayload(payload, photos);
  if (validationError) {
    return { error: new Error(validationError) };
  }
  const duplicateResult = await findDuplicateDeveloperListing(id, listingId, payload, phaseResult.data?.id);
  if (duplicateResult.error) {
    return { error: duplicateResult.error };
  }
  if (duplicateResult.duplicate) {
    return { error: new Error("A matching developer listing already exists. Check the project, price, and title before saving.") };
  }
  const monthlyInstallment =
    payload.monthlyInstallment && payload.monthlyInstallment > 0
      ? payload.monthlyInstallment
      : Math.round(payload.price / Math.max(payload.installmentYears, 1) / 12);
  const { data, error } = await supabaseServer
    .from("properties")
    .update({
      price: payload.price,
      description: payload.description ?? null,
      project_id: payload.projectId ?? null,
      phase_id: phaseResult.data?.id ?? null,
      property_type: payload.propertyType,
      sale_type: payload.saleType,
      bedrooms: payload.bedrooms,
      bathrooms: payload.bathrooms,
      unit_area: payload.unitArea,
      down_payment_percentage: payload.downPayment,
      installment_years: payload.installmentYears,
      monthly_installment: monthlyInstallment,
      delivery_date: payload.deliveryDate ?? null,
      finishing_status: payload.finishingStatus,
      amenities: payload.amenities.length ? payload.amenities : ["Developer submission"],
      floor_plan_url: payload.brochureUrl ?? null,
      video_tour_url: payload.videoUrl ?? null,
      photos,
      cover_photo_url: photos[0],
      is_active: false,
      approval_status: "pending",
      rejection_reason: null,
      reviewed_by: null,
      reviewed_at: null,
      published_at: null,
    })
    .eq("developer_id", id)
    .is("listed_by_agent_id", null)
    .eq("id", listingId)
    .select("id")
    .maybeSingle();
  return { error: error ?? (!data ? new Error("Listing not found or access denied.") : null) };
}

export async function toggleListingVisibility(developerId: string, listingId: string, visibility: string) {
  const id = assertDeveloperId(developerId);
  const { data: listing, error: lookupError } = await supabaseServer
    .from("properties")
    .select("id, developer_id, listed_by_agent_id, approval_status, published_at")
    .eq("id", listingId)
    .maybeSingle();
  if (lookupError || !listing) return { error: lookupError ?? new Error("Listing not found.") };
  if (listing.developer_id !== id || listing.listed_by_agent_id) {
    return { error: new Error("Only developer-created inventory can be changed here.") };
  }
  if (visibility !== "hidden" && (listing.approval_status !== "approved" || !listing.published_at)) {
    return { error: new Error("Only an approved and published listing can be made visible to agents. Save changes to send it for review.") };
  }
  const { error } = await supabaseServer
    .from("properties")
    .update({ is_active: visibility !== "hidden", updated_at: new Date().toISOString() })
    .eq("id", listingId);
  return { error };
}

export async function archiveDeveloperListing(developerId: string, listingId: string, accountId?: string | null) {
  const id = assertDeveloperId(developerId);
  const { data, error } = await supabaseServer
    .from("properties")
    .update({ is_active: false, archived_at: new Date().toISOString(), archived_by_developer_account_id: accountId ?? null, updated_at: new Date().toISOString() })
    .eq("developer_id", id)
    .is("listed_by_agent_id", null)
    .eq("id", listingId)
    .select("id")
    .maybeSingle();
  return { error: error ?? (!data ? new Error("Listing not found or access denied.") : null) };
}

export async function restoreDeveloperListing(developerId: string, listingId: string) {
  const id = assertDeveloperId(developerId);
  const { data, error } = await supabaseServer
    .from("properties")
    .update({ archived_at: null, archived_by_developer_account_id: null, is_active: false, updated_at: new Date().toISOString() })
    .eq("developer_id", id)
    .is("listed_by_agent_id", null)
    .eq("id", listingId)
    .not("archived_at", "is", null)
    .select("id")
    .maybeSingle();
  return { error: error ?? (!data ? new Error("Archived listing not found or access denied.") : null) };
}

/**
 * Kept as a compatibility alias for older server actions. Developer inventory
 * is now archived (hidden and recoverable) rather than hard-deleted.
 */
export async function deleteListing(developerId: string, listingId: string) {
  return archiveDeveloperListing(developerId, listingId);
}

export async function requestListingRenewal(
  listingId: string,
  actorUserId: string | null,
  developerId?: string,
) {
  if (developerId) {
    const id = assertDeveloperId(developerId);
    const { data: listing, error: lookupError } = await supabaseServer
      .from("properties")
      .select("id")
      .eq("id", listingId)
      .eq("developer_id", id)
      .is("listed_by_agent_id", null)
      .maybeSingle();
    if (lookupError || !listing) {
      throw new Error("Only developer-created inventory can be renewed here.");
    }
  }
  const { error } = await supabaseServer.rpc("request_property_renewal", {
    p_property_id: listingId,
    p_actor_role: "developer",
    p_actor_id: actorUserId,
  });
  if (error) {
    console.error("Failed to request renewal", error);
    throw new Error(error.message);
  }
}

export type PropertyRenewalRequest = {
  id: string;
  status: string;
  requested_by_role: string;
  requested_at: string;
  requested_by_id?: string | null;
  notes?: string | null;
  source?: string | null;
  current_expires_at?: string | null;
  proposed_expires_at?: string | null;
  rejection_reason?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  property: {
    id: string;
    property_name: string;
    expires_at: string | null;
    unit_area?: number | null;
    price?: number | null;
    description?: string | null;
    photos?: string[] | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    property_type?: string | null;
    amenities?: string[] | null;
    renewal_status?: string | null;
    approval_status?: string | null;
    developer_id?: string | null;
    listed_by_agent_id?: string | null;
    project_id?: string | null;
    developers?: { name?: string | null } | { name?: string | null }[] | null;
    developer_projects?: { name?: string | null } | { name?: string | null }[] | null;
  } | null;
};

type RenewalPropertyRow = {
  id: string;
  property_name: string;
  unit_area: number | null;
  price: number | null;
  description: string | null;
  photos: string[] | null;
  bedrooms: number | null;
  bathrooms: number | null;
  property_type: string | null;
  amenities: string[] | null;
  expires_at: string | null;
  listed_by_agent_id: string | null;
  project_id: string | null;
  developer_id: string | null;
  renewal_status: string | null;
  approval_status: string | null;
  developers: { name?: string | null } | { name?: string | null }[] | null;
  developer_projects: { name?: string | null } | { name?: string | null }[] | null;
};

type RenewalRequestRow = {
  id: string;
  status: string | null;
  requested_by_role: string | null;
  requested_at: string | null;
  requested_by_id: string | null;
  notes: string | null;
  source: string | null;
  current_expires_at: string | null;
  proposed_expires_at: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  property: RenewalPropertyRow | RenewalPropertyRow[] | null;
};

export type PropertyRenewalRequestPage = {
  requests: PropertyRenewalRequest[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  error: string | null;
};

function renewalSearch(value: string) {
  return value.replace(/[%,()]/g, "").slice(0, 80);
}

function normalizeRenewalProperty(value: RenewalPropertyRow | RenewalPropertyRow[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function fetchPropertyRenewalRequestPage(
  status: string = "pending",
  options: { page?: number; pageSize?: number; search?: string } = {},
): Promise<PropertyRenewalRequestPage> {
  const pageSize = Math.min(100, Math.max(10, Math.floor(options.pageSize ?? 25)));
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const offset = (page - 1) * pageSize;

  let propertyIds: string[] | null = null;
  const search = renewalSearch(options.search?.trim() ?? "");
  if (search) {
    const { data: matchingProperties, error: propertyError } = await supabaseServer
      .from("properties")
      .select("id")
      .or(`property_name.ilike.%${search}%,specific_location.ilike.%${search}%`);
    if (propertyError) {
      console.warn("Failed to search properties for renewal requests", propertyError);
      return { requests: [], total: 0, page, pageSize, hasNext: false, error: propertyError.message };
    }
    propertyIds = (matchingProperties ?? []).map((property) => property.id);
    if (!propertyIds.length) return { requests: [], total: 0, page, pageSize, hasNext: false, error: null };
  }

  let query = supabaseServer
    .from("property_renewal_requests")
    .select(
      `
      id,
      status,
      requested_by_role,
      requested_at,
      requested_by_id,
      notes,
      source,
      current_expires_at,
      proposed_expires_at,
      rejection_reason,
      reviewed_by,
      reviewed_at,
      property:properties (
        id,
        property_name,
        expires_at,
        unit_area,
        price,
        description,
        photos,
        bedrooms,
        bathrooms,
        property_type,
        amenities,
        renewal_status,
        approval_status,
        developer_id,
        listed_by_agent_id,
        project_id,
        developers (name),
        developer_projects (name)
      )
    `,
      { count: "exact" },
  )
    .eq("status", status)
    .order("requested_at", { ascending: true })
    .range(offset, offset + pageSize - 1);
  if (propertyIds) query = query.in("property_id", propertyIds);

  const { data, error, count } = await query;

  if (error || !data) {
    console.warn("Failed to load property renewal requests", error);
    return {
      requests: [],
      total: count ?? 0,
      page,
      pageSize,
      hasNext: page * pageSize < (count ?? 0),
      error: error?.message ?? "Unable to load renewal requests",
    };
  }

  const requests = (data as RenewalRequestRow[]).map((row) => ({
    id: row.id,
    status: row.status ?? status,
    requested_by_role: row.requested_by_role ?? "unknown",
    requested_at: row.requested_at ?? "",
    requested_by_id: row.requested_by_id,
    notes: row.notes,
    source: row.source ?? row.requested_by_role,
    current_expires_at: row.current_expires_at,
    proposed_expires_at: row.proposed_expires_at,
    rejection_reason: row.rejection_reason,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    property: normalizeRenewalProperty(row.property),
  }));
  const total = count ?? 0;
  return { requests, total, page, pageSize, hasNext: offset + requests.length < total, error: null };
}

export async function fetchPropertyRenewalRequests(status: string = "pending"): Promise<PropertyRenewalRequest[]> {
  const result = await fetchPropertyRenewalRequestPage(status);
  return result.requests;
}

export async function reviewRenewalRequest(
  requestId: string,
  approve: boolean,
  adminId?: string | null,
  notes?: string | null,
): Promise<PropertyRenewalRequest | null> {
  const { data, error } = await supabaseServer.rpc("review_property_renewal_request", {
    p_request_id: requestId,
    p_admin_id: adminId ?? null,
    p_approve: approve,
    p_notes: notes ?? null,
  });
  if (error) {
    console.error("Failed to review renewal request", error);
    throw new Error(error.message);
  }
  return (data ?? null) as unknown as PropertyRenewalRequest | null;
}

export async function fetchDeveloperProjects(developerId: string, options?: { limit?: number }) {
  try {
    const id = assertDeveloperId(developerId);
    let query = supabaseServer
      .from("developer_projects")
      .select("id, name, description, project_logo_url, amenities, hero_media, voice_notes, video_links, location, acres, footprint, maintenance, payment_plans, payment_plan_templates, limited_time_offers, launch_status, launch_date, eoi_value_apt, eoi_value_villa, ch_fees, project_types, inventory_url, is_demo, approval_status, rejection_reason, lifecycle_state, published_at, publication_status, publication_feedback, ready_at, submitted_at, submitted_by_account_id, approved_at, approved_by_admin_id, changes_requested_at, publication_checklist, quality_issues, quality_score, developer_project_phases(id, project_id, name, phase_order, description, hero_media, launch_status, launch_date, is_default, lifecycle_state, approval_status, published_at, publication_status, publication_feedback, ready_at, submitted_at, submitted_by_account_id, approved_at, approved_by_admin_id, changes_requested_at, archived_at, archived_by_account_id), project_unit_types(id, project_id, phase_id, category, label, min_price, max_price, unit_area_min, unit_area_max, land_area_min, land_area_max, finishing_status, hero_image_url, description, archived_at, archived_by_account_id, project_unit_variants(id, project_unit_type_id, category, label, bedrooms, bathrooms, has_garden, has_roof, garden_area_sqm, roof_area_sqm, finishing_status, delivery_date, min_price, max_price, unit_area_min, unit_area_max, land_area_min, land_area_max, layout_options, down_payment_percent, installment_years, stock_count, description, amenities, archived_at, archived_by_account_id))")
      .eq("developer_id", id)
      .order("updated_at", { ascending: false });
    if (options?.limit) query = query.limit(Math.min(Math.max(options.limit, 1), 500));
    const { data, error } = await query;
    if (error || !data) return [];
    return data;
  } catch (error) {
    console.warn('fetchDeveloperProjects failed', error);
    return [];
  }
}

export type DeveloperPublicationStatus =
  | "draft"
  | "ready"
  | "submitted"
  | "changes_requested"
  | "approved"
  | "published";

export type DeveloperInventoryAvailability =
  | "available"
  | "held"
  | "reserved"
  | "contracted"
  | "sold"
  | "released";

export type DeveloperInventoryRow = {
  id: string;
  property_name: string;
  inventory_code?: string | null;
  building?: string | null;
  floor_number?: number | null;
  unit_number?: string | null;
  project_id: string | null;
  phase_id: string | null;
  developer_id: string | null;
  property_type: string;
  description?: string | null;
  photos?: string[] | null;
  price: number;
  price_effective_from?: string | null;
  unit_area: number;
  availability_state: DeveloperInventoryAvailability;
  availability_updated_at?: string | null;
  available_from?: string | null;
  available_until?: string | null;
  inventory_notes?: string | null;
  approval_status?: string | null;
  publication_status?: DeveloperPublicationStatus | null;
  is_active?: boolean | null;
  updated_at?: string | null;
  created_at?: string | null;
  published_at?: string | null;
  archived_at?: string | null;
  active_hold?: DeveloperInventoryHold | null;
};

export type DeveloperInventoryHold = {
  id: string;
  developer_id: string;
  property_id: string;
  status: "active" | "expired" | "released" | "converted";
  holder_type: "internal" | "agent" | "customer" | "contract";
  holder_reference?: string | null;
  expires_at: string;
  created_by_account_id: string;
  released_by_account_id?: string | null;
  released_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type DeveloperPropertyPriceHistory = {
  id: string;
  property_id: string;
  developer_id: string;
  previous_price?: number | null;
  price: number;
  effective_from: string;
  effective_to?: string | null;
  change_reason?: string | null;
  changed_by_account_id?: string | null;
  created_at: string;
};

export type DeveloperInventoryVersion = {
  id: string;
  developer_id: string;
  entity_type: "project" | "phase" | "unit_type" | "unit_variant" | "property";
  entity_id: string;
  version: number;
  snapshot: Record<string, unknown>;
  change_summary?: string | null;
  changed_fields: string[];
  created_by_account_id?: string | null;
  created_by_admin_id?: string | null;
  restored_from_version?: number | null;
  created_at: string;
};

export type DeveloperInventoryActivity = {
  id: string;
  developer_id: string;
  project_id?: string | null;
  phase_id?: string | null;
  entity_type: "project" | "phase" | "unit_type" | "unit_variant" | "property" | "hold" | "template" | "feedback" | "import";
  entity_id?: string | null;
  action: string;
  actor_account_id?: string | null;
  actor_admin_id?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type DeveloperPublicationFeedback = {
  id: string;
  developer_id: string;
  entity_type: "project" | "phase" | "unit_type" | "unit_variant" | "property";
  entity_id: string;
  field_name?: string | null;
  message: string;
  status: "open" | "resolved";
  source: "admin" | "developer" | "system";
  author_admin_id?: string | null;
  author_account_id?: string | null;
  created_at: string;
  resolved_at?: string | null;
  resolved_by_account_id?: string | null;
};

export type DeveloperProjectTemplate = {
  id: string;
  developer_id: string;
  template_type: "project" | "phase" | "unit" | "payment";
  name: string;
  description?: string | null;
  payload: Record<string, unknown>;
  source_project_id?: string | null;
  source_phase_id?: string | null;
  source_unit_type_id?: string | null;
  version: number;
  created_by_account_id: string;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type DeveloperInventorySavedFilter = {
  id: string;
  developer_id: string;
  account_id: string;
  name: string;
  filter: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
};

export type DeveloperProjectImpactSummary = {
  found: boolean;
  project_id?: string;
  phase_count?: number;
  unit_type_count?: number;
  variant_count?: number;
  property_count?: number;
  published_property_count?: number;
  active_hold_count?: number;
  open_feedback_count?: number;
};

const asError = (error: { message?: string } | null | undefined, fallback: string) =>
  error ? new Error(error.message ?? fallback) : null;

export async function fetchDeveloperInventoryRows(
  developerId: string,
  projectId: string,
  phaseId?: string | null,
): Promise<DeveloperInventoryRow[]> {
  const id = assertDeveloperId(developerId);
  try {
    await supabaseServer.rpc("expire_developer_inventory_holds");
    let query = supabaseServer
      .from("properties")
      .select("id, property_name, inventory_code, building, floor_number, unit_number, project_id, phase_id, developer_id, property_type, description, photos, price, price_effective_from, unit_area, availability_state, availability_updated_at, available_from, available_until, inventory_notes, approval_status, publication_status, is_active, updated_at, created_at, published_at, archived_at")
      .eq("developer_id", id)
      .eq("project_id", projectId)
      .is("listed_by_agent_id", null)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(1000);
    if (phaseId) query = query.eq("phase_id", phaseId);
    const [{ data, error }, { data: holds, error: holdError }] = await Promise.all([
      query,
      supabaseServer
        .from("developer_inventory_holds")
        .select("id, developer_id, property_id, status, holder_type, holder_reference, expires_at, created_by_account_id, released_by_account_id, released_at, created_at, updated_at")
        .eq("developer_id", id)
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())
        .limit(1000),
    ]);
    if (error) throw error;
    if (holdError) console.warn("Unable to load inventory holds", holdError);
    const holdByProperty = new Map<string, DeveloperInventoryHold>();
    for (const hold of (holds ?? []) as DeveloperInventoryHold[]) holdByProperty.set(hold.property_id, hold);
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      property_name: String(row.property_name ?? ""),
      inventory_code: (row.inventory_code as string | null | undefined) ?? null,
      building: (row.building as string | null | undefined) ?? null,
      floor_number: row.floor_number == null ? null : Number(row.floor_number),
      unit_number: (row.unit_number as string | null | undefined) ?? null,
      project_id: (row.project_id as string | null | undefined) ?? null,
      phase_id: (row.phase_id as string | null | undefined) ?? null,
      developer_id: (row.developer_id as string | null | undefined) ?? null,
      property_type: String(row.property_type ?? ""),
      description: (row.description as string | null | undefined) ?? null,
      photos: Array.isArray(row.photos)
        ? row.photos.filter((value): value is string => typeof value === "string")
        : null,
      price: Number(row.price ?? 0),
      price_effective_from: (row.price_effective_from as string | null | undefined) ?? null,
      unit_area: Number(row.unit_area ?? 0),
      availability_state: (row.availability_state as DeveloperInventoryAvailability) ?? "available",
      availability_updated_at: (row.availability_updated_at as string | null | undefined) ?? null,
      available_from: (row.available_from as string | null | undefined) ?? null,
      available_until: (row.available_until as string | null | undefined) ?? null,
      inventory_notes: (row.inventory_notes as string | null | undefined) ?? null,
      approval_status: (row.approval_status as string | null | undefined) ?? null,
      publication_status: (row.publication_status as DeveloperPublicationStatus | null | undefined) ?? null,
      is_active: row.is_active == null ? null : Boolean(row.is_active),
      updated_at: (row.updated_at as string | null | undefined) ?? null,
      created_at: (row.created_at as string | null | undefined) ?? null,
      published_at: (row.published_at as string | null | undefined) ?? null,
      archived_at: (row.archived_at as string | null | undefined) ?? null,
      active_hold: holdByProperty.get(String(row.id)) ?? null,
    }));
  } catch (error) {
    console.warn("Unable to fetch developer inventory rows", error);
    return [];
  }
}

export async function fetchDeveloperProjectImpactSummary(
  developerId: string,
  projectId: string,
): Promise<DeveloperProjectImpactSummary | null> {
  const id = assertDeveloperId(developerId);
  if (!(await developerOwnsProject(id, projectId))) return null;
  const { data, error } = await supabaseServer.rpc("developer_project_impact_summary", { p_project_id: projectId });
  if (error) {
    console.warn("Unable to load project impact summary", error);
    return null;
  }
  return (data ?? null) as DeveloperProjectImpactSummary | null;
}

export async function fetchDeveloperPropertyPriceHistory(
  developerId: string,
  projectId: string,
  phaseId?: string | null,
): Promise<DeveloperPropertyPriceHistory[]> {
  const id = assertDeveloperId(developerId);
  const propertyQuery = supabaseServer
    .from("properties")
    .select("id")
    .eq("developer_id", id)
    .eq("project_id", projectId)
    .is("listed_by_agent_id", null);
  if (phaseId) propertyQuery.eq("phase_id", phaseId);
  const { data: properties, error: propertyError } = await propertyQuery;
  if (propertyError || !properties?.length) return [];
  const { data, error } = await supabaseServer
    .from("developer_property_price_history")
    .select("id, property_id, developer_id, previous_price, price, effective_from, effective_to, change_reason, changed_by_account_id, created_at")
    .eq("developer_id", id)
    .in("property_id", properties.map((property) => property.id))
    .order("effective_from", { ascending: false })
    .limit(500);
  if (error) {
    console.warn("Unable to load property price history", error);
    return [];
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    property_id: String(row.property_id),
    developer_id: String(row.developer_id),
    previous_price: row.previous_price == null ? null : Number(row.previous_price),
    price: Number(row.price ?? 0),
    effective_from: String(row.effective_from),
    effective_to: (row.effective_to as string | null | undefined) ?? null,
    change_reason: (row.change_reason as string | null | undefined) ?? null,
    changed_by_account_id: (row.changed_by_account_id as string | null | undefined) ?? null,
    created_at: String(row.created_at),
  }));
}

export async function fetchDeveloperInventoryActivity(
  developerId: string,
  projectId: string,
  options?: { limit?: number; phaseId?: string | null },
): Promise<DeveloperInventoryActivity[]> {
  const id = assertDeveloperId(developerId);
  let query = supabaseServer
    .from("developer_inventory_activity")
    .select("id, developer_id, project_id, phase_id, entity_type, entity_id, action, actor_account_id, actor_admin_id, metadata, created_at")
    .eq("developer_id", id)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(options?.limit ?? 50, 1), 200));
  if (options?.phaseId) query = query.eq("phase_id", options.phaseId);
  const { data, error } = await query;
  if (error) {
    console.warn("Unable to load inventory activity", error);
    return [];
  }
  return (data ?? []) as DeveloperInventoryActivity[];
}

export async function fetchDeveloperInventoryVersions(
  developerId: string,
  options?: { entityType?: DeveloperInventoryVersion["entity_type"]; entityId?: string; limit?: number },
): Promise<DeveloperInventoryVersion[]> {
  const id = assertDeveloperId(developerId);
  let query = supabaseServer
    .from("developer_inventory_versions")
    .select("id, developer_id, entity_type, entity_id, version, snapshot, change_summary, changed_fields, created_by_account_id, created_by_admin_id, restored_from_version, created_at")
    .eq("developer_id", id)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(options?.limit ?? 100, 1), 500));
  if (options?.entityType) query = query.eq("entity_type", options.entityType);
  if (options?.entityId) query = query.eq("entity_id", options.entityId);
  const { data, error } = await query;
  if (error) {
    console.warn("Unable to load inventory versions", error);
    return [];
  }
  return (data ?? []) as DeveloperInventoryVersion[];
}

export async function fetchDeveloperPublicationFeedback(
  developerId: string,
  projectId?: string | null,
): Promise<DeveloperPublicationFeedback[]> {
  const id = assertDeveloperId(developerId);
  const { data, error } = await supabaseServer
    .from("developer_publication_feedback")
    .select("id, developer_id, entity_type, entity_id, field_name, message, status, source, author_admin_id, author_account_id, created_at, resolved_at, resolved_by_account_id")
    .eq("developer_id", id)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    console.warn("Unable to load publication feedback", error);
    return [];
  }
  const feedback = (data ?? []) as DeveloperPublicationFeedback[];
  if (!projectId) return feedback;
  const project = await supabaseServer.from("developer_projects").select("id").eq("id", projectId).eq("developer_id", id).maybeSingle();
  if (project.error || !project.data) return [];
  const [phases, unitTypes, properties] = await Promise.all([
    supabaseServer.from("developer_project_phases").select("id").eq("project_id", projectId),
    supabaseServer.from("project_unit_types").select("id").eq("project_id", projectId),
    supabaseServer.from("properties").select("id").eq("project_id", projectId).eq("developer_id", id),
  ]);
  const ids = new Set([projectId, ...(phases.data ?? []).map((row) => row.id), ...(unitTypes.data ?? []).map((row) => row.id), ...(properties.data ?? []).map((row) => row.id)]);
  return feedback.filter((item) => ids.has(item.entity_id));
}

export async function fetchDeveloperProjectTemplates(developerId: string): Promise<DeveloperProjectTemplate[]> {
  const id = assertDeveloperId(developerId);
  const { data, error } = await supabaseServer
    .from("developer_project_templates")
    .select("id, developer_id, template_type, name, description, payload, source_project_id, source_phase_id, source_unit_type_id, version, created_by_account_id, archived_at, created_at, updated_at")
    .eq("developer_id", id)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) {
    console.warn("Unable to load project templates", error);
    return [];
  }
  return (data ?? []) as DeveloperProjectTemplate[];
}

export async function fetchDeveloperInventorySavedFilters(
  developerId: string,
  accountId: string,
): Promise<DeveloperInventorySavedFilter[]> {
  const id = assertDeveloperId(developerId);
  const { data, error } = await supabaseServer
    .from("developer_inventory_saved_filters")
    .select("id, developer_id, account_id, name, filter, created_at, updated_at, archived_at")
    .eq("developer_id", id)
    .eq("account_id", accountId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (error) {
    console.warn("Unable to load saved inventory filters", error);
    return [];
  }
  return (data ?? []) as DeveloperInventorySavedFilter[];
}

export async function markDeveloperProjectReady(developerId: string, projectId: string, accountId: string) {
  const id = assertDeveloperId(developerId);
  const { data, error } = await supabaseServer.rpc("mark_developer_project_ready", {
    p_developer_id: id,
    p_project_id: projectId,
    p_account_id: accountId,
  });
  return { data, error: asError(error, "Unable to mark project ready.") };
}

export async function submitDeveloperProjectForReview(developerId: string, projectId: string, accountId: string) {
  const id = assertDeveloperId(developerId);
  const { data, error } = await supabaseServer.rpc("submit_developer_project_for_review", {
    p_developer_id: id,
    p_project_id: projectId,
    p_account_id: accountId,
  });
  return { data, error: asError(error, "Unable to submit project for review.") };
}

export async function bulkUpdateDeveloperInventory(
  developerId: string,
  projectId: string,
  phaseId: string,
  accountId: string,
  rows: Array<Record<string, unknown>>,
  dryRun = false,
) {
  const id = assertDeveloperId(developerId);
  const { data, error } = await supabaseServer.rpc("bulk_update_developer_inventory", {
    p_developer_id: id,
    p_project_id: projectId,
    p_phase_id: phaseId,
    p_account_id: accountId,
    p_rows: rows,
    p_dry_run: dryRun,
  });
  return { data: (data ?? null) as Record<string, unknown> | null, error: asError(error, "Unable to update inventory.") };
}

export async function importDeveloperInventoryRows(
  developerId: string,
  projectId: string,
  phaseId: string,
  accountId: string,
  rows: Array<Record<string, unknown>>,
  dryRun = true,
) {
  const id = assertDeveloperId(developerId);
  const { data, error } = await supabaseServer.rpc("import_developer_inventory_rows", {
    p_developer_id: id,
    p_project_id: projectId,
    p_phase_id: phaseId,
    p_account_id: accountId,
    p_rows: rows,
    p_dry_run: dryRun,
  });
  return { data: (data ?? null) as Record<string, unknown> | null, error: asError(error, "Unable to import inventory.") };
}

export async function createDeveloperInventoryHold(
  developerId: string,
  propertyId: string,
  accountId: string,
  expiresAt: string,
  holderType = "internal",
  holderReference?: string | null,
) {
  const id = assertDeveloperId(developerId);
  const { data, error } = await supabaseServer.rpc("create_developer_inventory_hold", {
    p_developer_id: id,
    p_property_id: propertyId,
    p_account_id: accountId,
    p_expires_at: expiresAt,
    p_holder_type: holderType,
    p_holder_reference: holderReference ?? null,
  });
  return { data: (data ?? null) as DeveloperInventoryHold | null, error: asError(error, "Unable to hold inventory.") };
}

export async function releaseDeveloperInventoryHold(
  developerId: string,
  holdId: string,
  accountId: string,
  nextState: "released" | "converted" = "released",
) {
  const id = assertDeveloperId(developerId);
  const { data, error } = await supabaseServer.rpc("release_developer_inventory_hold", {
    p_developer_id: id,
    p_hold_id: holdId,
    p_account_id: accountId,
    p_next_state: nextState,
  });
  return { data: (data ?? null) as DeveloperInventoryHold | null, error: asError(error, "Unable to release inventory hold.") };
}

export async function restoreDeveloperInventoryVersion(developerId: string, versionId: string, accountId: string) {
  const id = assertDeveloperId(developerId);
  const { data, error } = await supabaseServer.rpc("restore_developer_inventory_version", {
    p_developer_id: id,
    p_version_id: versionId,
    p_account_id: accountId,
  });
  return { data: (data ?? null) as Record<string, unknown> | null, error: asError(error, "Unable to restore this inventory version.") };
}

export async function saveDeveloperProjectTemplate(
  developerId: string,
  accountId: string,
  input: {
    templateType: DeveloperProjectTemplate["template_type"];
    name: string;
    description?: string | null;
    payload: Record<string, unknown>;
    sourceProjectId?: string | null;
    sourcePhaseId?: string | null;
    sourceUnitTypeId?: string | null;
  },
) {
  const id = assertDeveloperId(developerId);
  const { data, error } = await supabaseServer.rpc("save_developer_project_template", {
    p_developer_id: id,
    p_account_id: accountId,
    p_template_type: input.templateType,
    p_name: input.name,
    p_payload: input.payload,
    p_source_project_id: input.sourceProjectId ?? null,
    p_source_phase_id: input.sourcePhaseId ?? null,
    p_source_unit_type_id: input.sourceUnitTypeId ?? null,
  });
  return { data: (data ?? null) as DeveloperProjectTemplate | null, error: asError(error, "Unable to save template.") };
}

export async function cloneDeveloperProjectFromTemplate(
  developerId: string,
  accountId: string,
  templateId: string,
  name?: string | null,
) {
  const id = assertDeveloperId(developerId);
  const { data, error } = await supabaseServer.rpc("clone_developer_project_from_template", {
    p_developer_id: id,
    p_account_id: accountId,
    p_template_id: templateId,
    p_name: name ?? null,
  });
  return { data: (data ?? null) as string | null, error: asError(error, "Unable to clone project template.") };
}

export async function saveDeveloperInventoryFilter(
  developerId: string,
  accountId: string,
  name: string,
  filter: Record<string, unknown>,
) {
  const id = assertDeveloperId(developerId);
  const { data, error } = await supabaseServer.rpc("save_developer_inventory_filter", {
    p_developer_id: id,
    p_account_id: accountId,
    p_name: name,
    p_filter: filter,
  });
  return { data: (data ?? null) as DeveloperInventorySavedFilter | null, error: asError(error, "Unable to save filter.") };
}

export async function resolveDeveloperPublicationFeedback(developerId: string, feedbackId: string, accountId: string) {
  const id = assertDeveloperId(developerId);
  const { data, error } = await supabaseServer.rpc("resolve_developer_publication_feedback", {
    p_developer_id: id,
    p_feedback_id: feedbackId,
    p_account_id: accountId,
  });
  return { data: (data ?? null) as DeveloperPublicationFeedback | null, error: asError(error, "Unable to resolve feedback.") };
}

export async function upsertDeveloperProject(
  developerId: string,
  payload: {
    id?: string;
    name: string;
    description?: string;
    location?: string;
    acres?: number | null;
    footprint?: number | null;
    maintenance?: number | null;
    payment_plans?: string;
    payment_plan_templates?: StructuredPaymentPlan[];
    limited_time_offers?: LimitedTimeOffer[];
    launch_status?: string;
    launch_date?: string | null;
    eoi_value_apt?: number | null;
    eoi_value_villa?: number | null;
    ch_fees?: number | null;
    project_types?: string[];
    inventory_url?: string | null;
    project_logo_url?: string | null;
    hero_media?: ProjectMediaPayload;
    voice_notes?: string[];
    video_links?: string[];
    amenities?: string[];
  },
) {
  const id = assertDeveloperId(developerId);
  const { id: projectId, ...projectPayload } = payload;
  if (!payload.name.trim() || payload.name.trim().length < 3) {
    return { error: new Error("Add a project name with at least 3 characters."), data: null };
  }
  if (payload.footprint != null && (!Number.isFinite(payload.footprint) || payload.footprint < 0 || payload.footprint > 100)) {
    return { error: new Error("Footprint must be between 0% and 100."), data: null };
  }
  for (const [label, value] of [["acres", payload.acres], ["maintenance", payload.maintenance], ["CH fees", payload.ch_fees], ["EOI value", payload.eoi_value_apt], ["EOI value", payload.eoi_value_villa]] as const) {
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      return { error: new Error(`${label} must be zero or more.`), data: null };
    }
  }
  if (projectId) {
    const { data: existing, error: lookupError } = await supabaseServer
      .from("developer_projects")
      .select("id, developer_id")
      .eq("id", projectId)
      .maybeSingle();
    if (lookupError) return { error: lookupError, data: null };
    if (!existing || existing.developer_id !== id) {
      return { error: new Error("Unauthorized project access"), data: null };
    }
    const { data: duplicateProjects, error: duplicateError } = await supabaseServer
      .from("developer_projects")
      .select("id, name")
      .eq("developer_id", id)
      .neq("id", projectId)
      .ilike("name", escapeIlikePattern(payload.name.trim()));
    if (duplicateError) return { error: duplicateError, data: null };
    if (duplicateProjects?.length) return { error: new Error("A project with this name already exists in your workspace."), data: null };
    const { data, error } = await supabaseServer
      .from("developer_projects")
      .update({
        ...projectPayload,
        approval_status: "pending",
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
      })
      .eq("id", projectId)
      .eq("developer_id", id)
      .select("id")
      .single();
    return { error, data };
  }
  const { data: duplicateProjects, error: duplicateError } = await supabaseServer
    .from("developer_projects")
    .select("id, name")
    .eq("developer_id", id)
    .ilike("name", escapeIlikePattern(payload.name.trim()));
  if (duplicateError) return { error: duplicateError, data: null };
  if (duplicateProjects?.length) return { error: new Error("A project with this name already exists in your workspace."), data: null };
  const { data, error } = await supabaseServer
    .from("developer_projects")
    .insert({ ...projectPayload, developer_id: id, approval_status: "pending" })
    .select("id")
    .single();
  return { error, data };
}

export async function archiveDeveloperProject(developerId: string, projectId: string) {
  const id = assertDeveloperId(developerId);
  const { data, error } = await supabaseServer
    .from("developer_projects")
    .update({ lifecycle_state: "archived", published_at: null, updated_at: new Date().toISOString() })
    .eq("developer_id", id)
    .eq("id", projectId)
    .select("id")
    .maybeSingle();
  return { error: error ?? (!data ? new Error("Project not found or access denied.") : null) };
}

export async function restoreDeveloperProject(developerId: string, projectId: string) {
  const id = assertDeveloperId(developerId);
  const { data, error } = await supabaseServer
    .from("developer_projects")
    .update({ lifecycle_state: "draft", published_at: null, approval_status: "pending", rejection_reason: null, reviewed_by: null, reviewed_at: null, updated_at: new Date().toISOString() })
    .eq("developer_id", id)
    .eq("id", projectId)
    .eq("lifecycle_state", "archived")
    .select("id")
    .maybeSingle();
  return { error: error ?? (!data ? new Error("Archived project not found or access denied.") : null) };
}

export async function fetchDeveloperProjectPhases(developerId: string, projectId: string): Promise<DeveloperProjectPhase[]> {
  const id = assertDeveloperId(developerId);
  const ownsProject = await developerOwnsProject(id, projectId);
  if (!ownsProject) return [];
  const { data, error } = await supabaseServer
    .from("developer_project_phases")
    .select("id, project_id, name, phase_order, description, hero_media, launch_status, launch_date, is_default, lifecycle_state, approval_status, published_at, archived_at, archived_by_account_id, updated_at")
    .eq("project_id", projectId)
    .order("phase_order", { ascending: true });
  if (error) {
    console.warn("Unable to fetch developer project phases", error);
    return [];
  }
  return data as DeveloperProjectPhase[];
}

type DeveloperProjectPhasePayload = {
  name: string;
  description?: string | null;
  phaseOrder?: number | null;
  launchStatus?: string | null;
  launchDate?: string | null;
  heroMedia?: Record<string, unknown> | null;
};

function phaseRpcError(error: { message?: string } | null | undefined) {
  return error ? new Error(error.message ?? "Unable to save this release phase.") : null;
}

export async function createDeveloperProjectPhase(
  developerId: string,
  projectId: string,
  accountId: string,
  payload: DeveloperProjectPhasePayload,
) {
  const id = assertDeveloperId(developerId);
  if (!accountId) return { data: null, error: new Error("Developer membership is missing. Please sign in again.") };
  const { data, error } = await supabaseServer.rpc("create_developer_project_phase", {
    p_developer_id: id,
    p_project_id: projectId,
    p_account_id: accountId,
    p_name: payload.name,
    p_description: payload.description ?? null,
    p_phase_order: payload.phaseOrder ?? null,
    p_launch_status: payload.launchStatus ?? "upcoming",
    p_launch_date: payload.launchDate ?? null,
    p_hero_media: payload.heroMedia ?? {},
  });
  return { data: (data ?? null) as DeveloperProjectPhase | null, error: phaseRpcError(error) };
}

export async function updateDeveloperProjectPhase(
  developerId: string,
  phaseId: string,
  accountId: string,
  payload: DeveloperProjectPhasePayload,
) {
  const id = assertDeveloperId(developerId);
  if (!accountId) return { data: null, error: new Error("Developer membership is missing. Please sign in again.") };
  const { data, error } = await supabaseServer.rpc("update_developer_project_phase", {
    p_developer_id: id,
    p_phase_id: phaseId,
    p_account_id: accountId,
    p_name: payload.name,
    p_description: payload.description ?? null,
    p_phase_order: payload.phaseOrder ?? null,
    p_launch_status: payload.launchStatus ?? "upcoming",
    p_launch_date: payload.launchDate ?? null,
    p_hero_media: payload.heroMedia ?? {},
  });
  return { data: (data ?? null) as DeveloperProjectPhase | null, error: phaseRpcError(error) };
}

export async function archiveDeveloperProjectPhase(developerId: string, phaseId: string, accountId: string) {
  const id = assertDeveloperId(developerId);
  if (!accountId) return { data: null, error: new Error("Developer membership is missing. Please sign in again.") };
  const { data, error } = await supabaseServer.rpc("archive_developer_project_phase", {
    p_developer_id: id,
    p_phase_id: phaseId,
    p_account_id: accountId,
  });
  return { data: (data ?? null) as DeveloperProjectPhase | null, error: phaseRpcError(error) };
}

export async function restoreDeveloperProjectPhase(developerId: string, phaseId: string, accountId: string) {
  const id = assertDeveloperId(developerId);
  if (!accountId) return { data: null, error: new Error("Developer membership is missing. Please sign in again.") };
  const { data, error } = await supabaseServer.rpc("restore_developer_project_phase", {
    p_developer_id: id,
    p_phase_id: phaseId,
    p_account_id: accountId,
  });
  return { data: (data ?? null) as DeveloperProjectPhase | null, error: phaseRpcError(error) };
}

export type DeveloperProjectInventoryImport = {
  baseType: string;
  category?: string | null;
  finishingStatus?: string | null;
  description?: string | null;
  variants: Array<{
    bedrooms?: number;
    bathrooms?: number;
    hasGarden?: boolean;
    hasRoof?: boolean;
    areaMin?: number;
    areaMax?: number;
    price: number;
    downPayment?: number;
    installmentYears?: number;
    stockCount?: number;
    description?: string;
    amenities?: string[];
  }>;
};

export async function importDeveloperProjectInventory(
  developerId: string,
  projectId: string,
  phaseId: string,
  accountId: string,
  payload: DeveloperProjectInventoryImport,
) {
  const id = assertDeveloperId(developerId);
  if (!phaseId || !accountId) return { data: null, error: new Error("Developer membership and release phase are required.") };
  const { data, error } = await supabaseServer.rpc("import_developer_project_inventory", {
    p_developer_id: id,
    p_project_id: projectId,
    p_phase_id: phaseId,
    p_account_id: accountId,
    p_payload: payload,
  });
  return { data: (data ?? null) as string | null, error: phaseRpcError(error) };
}

/**
 * Compatibility alias for older callers. Project removal now archives the
 * project so its inventory, leads, and moderation history remain recoverable.
 */
export async function deleteDeveloperProject(developerId: string, projectId: string) {
  return archiveDeveloperProject(developerId, projectId);
}

export async function upsertProjectUnitType(
  developerId: string,
  projectId: string,
  payload: {
    id?: string;
    phaseId?: string | null;
    category?: string;
    label: string;
    minPrice: number;
    maxPrice?: number;
    unitAreaMin?: number;
    unitAreaMax?: number;
    landAreaMin?: number;
    landAreaMax?: number;
    finishingStatus?: string;
    description?: string;
    heroImageUrl?: string;
  },
) {
  const developer = assertDeveloperId(developerId);
  if (!payload.label.trim()) throw new Error("Choose a unit type before saving.");
  if (!Number.isFinite(payload.minPrice) || payload.minPrice <= 0) throw new Error("Enter a valid minimum unit price.");
  if (payload.maxPrice != null && (!Number.isFinite(payload.maxPrice) || payload.maxPrice < payload.minPrice)) throw new Error("Maximum unit price must be greater than or equal to the minimum.");
  if (payload.unitAreaMin != null && (!Number.isFinite(payload.unitAreaMin) || payload.unitAreaMin < 0)) throw new Error("Minimum BUA must be zero or more.");
  if (payload.unitAreaMax != null && (!Number.isFinite(payload.unitAreaMax) || payload.unitAreaMax < (payload.unitAreaMin ?? 0))) throw new Error("Maximum BUA must be greater than or equal to the minimum.");
  if (payload.landAreaMin != null && (!Number.isFinite(payload.landAreaMin) || payload.landAreaMin < 0)) throw new Error("Minimum land area must be zero or more.");
  if (payload.landAreaMax != null && (!Number.isFinite(payload.landAreaMax) || payload.landAreaMax < (payload.landAreaMin ?? 0))) throw new Error("Maximum land area must be greater than or equal to the minimum.");
  const project = await supabaseServer
    .from("developer_projects")
    .select("id, developer_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project.data || project.data.developer_id !== developer) {
    throw new Error("Unauthorized project access");
  }
  const phaseResult = await resolveDeveloperProjectPhase(developer, projectId, payload.phaseId);
  if (phaseResult.error || !phaseResult.data) {
    throw phaseResult.error ?? new Error("Choose an active release phase before saving inventory.");
  }

  const unitPayload = {
      project_id: projectId,
      phase_id: phaseResult.data.id,
      category: payload.category ?? null,
      label: payload.label,
      min_price: payload.minPrice,
      max_price: payload.maxPrice ?? null,
      unit_area_min: payload.unitAreaMin ?? null,
      unit_area_max: payload.unitAreaMax ?? null,
      land_area_min: payload.landAreaMin ?? null,
      land_area_max: payload.landAreaMax ?? null,
      down_payment_percent: null,
      installment_years: null,
      stock_count: null,
      finishing_status: payload.finishingStatus ?? null,
      hero_image_url: payload.heroImageUrl ?? null,
      description: payload.description ?? null,
  };
  if (payload.id) {
    const { data: existing, error: lookupError } = await supabaseServer
      .from("project_unit_types")
      .select("id, project_id, archived_at")
      .eq("id", payload.id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing || existing.project_id !== projectId) {
      throw new Error("Unauthorized unit type access");
    }
    if (existing.archived_at) {
      throw new Error("Restore this unit type before editing it.");
    }
    const { data, error } = await supabaseServer
      .from("project_unit_types")
      .update(unitPayload)
      .eq("id", payload.id)
      .eq("project_id", projectId)
      .select("id")
      .single();
    return { error, data };
  }
  const { data, error } = await supabaseServer
    .from("project_unit_types")
    .insert(unitPayload)
    .select("id")
    .single();

  return { error, data };
}

export async function upsertProjectUnitVariant(
  developerId: string,
  unitTypeId: string,
  payload: {
    id?: string;
    category?: string;
    label?: string;
    bedrooms?: number;
    bathrooms?: number;
    hasGarden?: boolean;
    gardenAreaSqm?: number;
    hasRoof?: boolean;
    roofAreaSqm?: number;
    finishingStatus?: string;
    deliveryDate?: string;
    minPrice: number;
    maxPrice?: number;
    unitAreaMin?: number;
    unitAreaMax?: number;
    landAreaMin?: number;
    landAreaMax?: number;
    layoutOptions?: string[];
    downPaymentPercent?: number;
    installmentYears?: number;
    stockCount?: number;
    description?: string;
    amenities?: string[];
  },
) {
  const developer = assertDeveloperId(developerId);
  if (!Number.isFinite(payload.minPrice) || payload.minPrice <= 0) throw new Error("Enter a valid minimum variant price.");
  if (payload.maxPrice != null && (!Number.isFinite(payload.maxPrice) || payload.maxPrice < payload.minPrice)) throw new Error("Maximum variant price must be greater than or equal to the minimum.");
  if (payload.bedrooms != null && (!Number.isFinite(payload.bedrooms) || payload.bedrooms < 0)) throw new Error("Bedrooms must be zero or more.");
  if (payload.bathrooms != null && (!Number.isFinite(payload.bathrooms) || payload.bathrooms < 0)) throw new Error("Bathrooms must be zero or more.");
  if (payload.unitAreaMin != null && (!Number.isFinite(payload.unitAreaMin) || payload.unitAreaMin < 0)) throw new Error("Minimum BUA must be zero or more.");
  if (payload.unitAreaMax != null && (!Number.isFinite(payload.unitAreaMax) || payload.unitAreaMax < (payload.unitAreaMin ?? 0))) throw new Error("Maximum BUA must be greater than or equal to the minimum.");
  if (payload.landAreaMin != null && (!Number.isFinite(payload.landAreaMin) || payload.landAreaMin < 0)) throw new Error("Minimum land area must be zero or more.");
  if (payload.landAreaMax != null && (!Number.isFinite(payload.landAreaMax) || payload.landAreaMax < (payload.landAreaMin ?? 0))) throw new Error("Maximum land area must be greater than or equal to the minimum.");
  type UnitTypeOwnerRow = {
    id: string;
    project_id: string;
    archived_at: string | null;
    developer_projects: { developer_id: string }[] | { developer_id: string } | null;
  };
  const { data: unitType, error: unitTypeError } = await supabaseServer
    .from("project_unit_types")
    .select("id, project_id, archived_at, developer_projects!inner(developer_id)")
    .eq("id", unitTypeId)
    .maybeSingle<UnitTypeOwnerRow>();
  if (unitTypeError) throw unitTypeError;
  const ownerId = Array.isArray(unitType?.developer_projects)
    ? unitType?.developer_projects?.[0]?.developer_id
    : unitType?.developer_projects?.developer_id;
  if (!unitType || ownerId !== developer) {
    throw new Error("Unauthorized unit type access");
  }
  if (unitType.archived_at) {
    throw new Error("Restore this unit type before editing its variants.");
  }

  const variantPayload = {
      project_unit_type_id: unitTypeId,
      category: payload.category ?? null,
      label: payload.label ?? null,
      bedrooms: payload.bedrooms ?? null,
      bathrooms: payload.bathrooms ?? null,
      has_garden: payload.hasGarden ?? null,
      garden_area_sqm: payload.hasGarden ? payload.gardenAreaSqm ?? null : null,
      has_roof: payload.hasRoof ?? null,
      roof_area_sqm: payload.hasRoof ? payload.roofAreaSqm ?? null : null,
      finishing_status: payload.finishingStatus ?? null,
      delivery_date: payload.deliveryDate ?? null,
      min_price: payload.minPrice,
      max_price: payload.maxPrice ?? null,
      unit_area_min: payload.unitAreaMin ?? null,
      unit_area_max: payload.unitAreaMax ?? null,
      land_area_min: payload.landAreaMin ?? null,
      land_area_max: payload.landAreaMax ?? null,
      layout_options: payload.layoutOptions?.length ? payload.layoutOptions : null,
      down_payment_percent: payload.downPaymentPercent ?? null,
      installment_years: payload.installmentYears ?? null,
      stock_count: payload.stockCount ?? null,
      description: payload.description ?? null,
      amenities: payload.amenities ?? null,
  };
  if (payload.id) {
    const { data: existing, error: lookupError } = await supabaseServer
      .from("project_unit_variants")
      .select("id, project_unit_type_id, archived_at")
      .eq("id", payload.id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing || existing.project_unit_type_id !== unitTypeId) {
      throw new Error("Unauthorized unit variant access");
    }
    if (existing.archived_at) {
      throw new Error("Restore this variant before editing it.");
    }
    const { error } = await supabaseServer
      .from("project_unit_variants")
      .update(variantPayload)
      .eq("id", payload.id)
      .eq("project_unit_type_id", unitTypeId);
    return { error };
  }
  const { error } = await supabaseServer
    .from("project_unit_variants")
    .insert(variantPayload);

  return { error };
}

export type DeveloperContactRequest = {
  id: string;
  developer_id: string;
  project_id: string;
  property_id: string | null;
  requester_user_id: string;
  request_type: "call" | "meeting";
  status: "open" | "contacted" | "closed";
  request_body: string;
  requester_display_name: string;
  requester_email: string | null;
  requester_phone: string | null;
  requester_total_deals: number;
  developer_name_snapshot: string;
  project_name_snapshot: string;
  property_name_snapshot: string | null;
  created_at: string;
  updated_at: string;
};

export async function fetchDeveloperContactRequests(developerId: string, options?: { limit?: number }): Promise<DeveloperContactRequest[]> {
  try {
    const id = assertDeveloperId(developerId);
    let query = supabaseServer
      .from("developer_contact_requests")
      .select(
        "id, developer_id, project_id, property_id, requester_user_id, request_type, status, request_body, requester_display_name, requester_email, requester_phone, requester_total_deals, developer_name_snapshot, project_name_snapshot, property_name_snapshot, created_at, updated_at",
      )
      .eq("developer_id", id)
      .order("created_at", { ascending: false });
    if (options?.limit) query = query.limit(Math.min(Math.max(options.limit, 1), 500));
    const { data, error } = await query;
    if (error || !data) {
      console.warn("Failed to load developer contact requests", error);
      return [];
    }
    return data as DeveloperContactRequest[];
  } catch (error) {
    console.warn("fetchDeveloperContactRequests failed", error);
    return [];
  }
}

export async function updateDeveloperContactRequestStatus(
  developerId: string,
  requestId: string,
  status: DeveloperContactRequest["status"],
) {
  const id = assertDeveloperId(developerId);
  const { error } = await supabaseServer.rpc("update_developer_contact_request_with_notification", {
    p_developer_id: id,
    p_request_id: requestId,
    p_status: status,
  });
  return { error };
}

export async function deleteProjectUnitVariant(developerId: string, variantId: string) {
  return archiveProjectUnitVariant(developerId, variantId);
}

export async function archiveProjectUnitVariant(
  developerId: string,
  variantId: string,
  accountId?: string | null,
) {
  const developer = assertDeveloperId(developerId);
  const { data: variant, error: variantError } = await supabaseServer
    .from("project_unit_variants")
    .select("id, project_unit_type_id")
    .eq("id", variantId)
    .maybeSingle();
  if (variantError) return { error: variantError };
  if (!variant) return { error: new Error("Variant not found or access denied.") };
  type UnitTypeOwnerRow = {
    id: string;
    developer_projects: { developer_id: string }[] | { developer_id: string } | null;
  };
  const { data: unitType } = await supabaseServer
    .from("project_unit_types")
    .select("id, developer_projects!inner(developer_id)")
    .eq("id", variant.project_unit_type_id)
    .maybeSingle<UnitTypeOwnerRow>();
  const ownerId = Array.isArray(unitType?.developer_projects)
    ? unitType?.developer_projects?.[0]?.developer_id
    : unitType?.developer_projects?.developer_id;
  if (!unitType || ownerId !== developer) {
    throw new Error("Unauthorized unit type access");
  }
  const { data, error } = await supabaseServer
    .from("project_unit_variants")
    .update({ archived_at: new Date().toISOString(), archived_by_account_id: accountId ?? null, updated_at: new Date().toISOString() })
    .eq("id", variantId)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  return { error: error ?? (!data ? new Error("Variant not found or already archived.") : null) };
}

export async function restoreProjectUnitVariant(developerId: string, variantId: string) {
  const developer = assertDeveloperId(developerId);
  type UnitTypeOwnerRow = {
    id: string;
    developer_projects: { developer_id: string }[] | { developer_id: string } | null;
  };
  const { data: variant, error: variantError } = await supabaseServer
    .from("project_unit_variants")
    .select("id, project_unit_type_id, archived_at")
    .eq("id", variantId)
    .maybeSingle();
  if (variantError) return { error: variantError };
  if (!variant) return { error: new Error("Variant not found.") };
  const { data: unitType, error: unitTypeError } = await supabaseServer
    .from("project_unit_types")
    .select("id, developer_projects!inner(developer_id)")
    .eq("id", variant.project_unit_type_id)
    .maybeSingle<UnitTypeOwnerRow>();
  if (unitTypeError) return { error: unitTypeError };
  const ownerId = Array.isArray(unitType?.developer_projects)
    ? unitType?.developer_projects?.[0]?.developer_id
    : unitType?.developer_projects?.developer_id;
  if (!unitType || ownerId !== developer) return { error: new Error("Unauthorized unit variant access") };
  const { data, error } = await supabaseServer
    .from("project_unit_variants")
    .update({ archived_at: null, archived_by_account_id: null, updated_at: new Date().toISOString() })
    .eq("id", variantId)
    .not("archived_at", "is", null)
    .select("id")
    .maybeSingle();
  return { error: error ?? (!data ? new Error("Variant is already active or was not found.") : null) };
}

export async function deleteProjectUnitType(developerId: string, unitTypeId: string) {
  return archiveProjectUnitType(developerId, unitTypeId);
}

export async function archiveProjectUnitType(
  developerId: string,
  unitTypeId: string,
  accountId?: string | null,
) {
  const developer = assertDeveloperId(developerId);
  const { data: existing, error: fetchError } = await supabaseServer
    .from("project_unit_types")
    .select("id, project_id")
    .eq("id", unitTypeId)
    .maybeSingle();
  if (fetchError) {
    return { error: fetchError };
  }
  if (!existing) return { error: new Error("Unit type not found or access denied.") };
  const { data: project, error: projectError } = await supabaseServer
    .from("developer_projects")
    .select("developer_id")
    .eq("id", existing.project_id)
    .single();
  if (projectError || !project || project.developer_id !== developer) {
    throw new Error("Unauthorized project access");
  }
  const { data, error } = await supabaseServer
    .from("project_unit_types")
    .update({ archived_at: new Date().toISOString(), archived_by_account_id: accountId ?? null, updated_at: new Date().toISOString() })
    .eq("id", unitTypeId)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  return { error: error ?? (!data ? new Error("Unit type not found or already archived.") : null) };
}

export async function restoreProjectUnitType(developerId: string, unitTypeId: string) {
  const developer = assertDeveloperId(developerId);
  const { data: existing, error: fetchError } = await supabaseServer
    .from("project_unit_types")
    .select("id, project_id, archived_at")
    .eq("id", unitTypeId)
    .maybeSingle();
  if (fetchError) return { error: fetchError };
  if (!existing) return { error: new Error("Unit type not found.") };
  const { data: project, error: projectError } = await supabaseServer
    .from("developer_projects")
    .select("developer_id")
    .eq("id", existing.project_id)
    .single();
  if (projectError || !project || project.developer_id !== developer) {
    return { error: new Error("Unauthorized project access") };
  }
  const { data, error } = await supabaseServer
    .from("project_unit_types")
    .update({ archived_at: null, archived_by_account_id: null, updated_at: new Date().toISOString() })
    .eq("id", unitTypeId)
    .not("archived_at", "is", null)
    .select("id")
    .maybeSingle();
  return { error: error ?? (!data ? new Error("Unit type is already active or was not found.") : null) };
}

export async function fetchDeveloperProfile(developerId: string) {
  try {
    const id = assertDeveloperId(developerId);
    const { data, error } = await supabaseServer
      .from("developers")
      .select("id, name, logo_url, description, is_active, is_demo, lifecycle_state, published_at")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.warn('fetchDeveloperProfile failed', error);
    return null;
  }
}

export async function updateDeveloperProfile(
  developerId: string,
  payload: { name: string; logo_url?: string; description?: string },
) {
  const id = assertDeveloperId(developerId);
  const { error } = await supabaseServer
    .from("developers")
    .update(payload)
    .eq("id", id);
  return { error };
}

export async function fetchDeveloperStats(developerId: string) {
  try {
    const id = assertDeveloperId(developerId);
    const { data, error } = await supabaseServer.rpc("developer_dashboard_metrics", { dev_id: id });
    if (error || !data || !data.length) {
      return emptyDeveloperStats();
    }
    const row = data[0] as Record<string, number | string | null>;
    return {
      listings: Number(row.listings ?? 0),
      hidden: Number(row.hidden ?? 0),
      pending: Number(row.pending ?? 0),
      inquiries: Number(row.inquiries ?? 0),
      eois: Number(row.eois ?? 0),
      cils: Number(row.cils ?? 0),
      reservations: Number(row.reservations ?? 0),
      salesClaims: Number(row.sales_claims ?? 0),
      stageShifts: Number(row.stage_shifts ?? 0),
      dealsThisMonth: Number(row.deals_this_month ?? 0),
    };
  } catch (error) {
    console.warn('fetchDeveloperStats failed', error);
    return emptyDeveloperStats();
  }
}

function emptyDeveloperStats() {
  return {
    listings: 0,
    hidden: 0,
    pending: 0,
    inquiries: 0,
    eois: 0,
    cils: 0,
    reservations: 0,
    salesClaims: 0,
    stageShifts: 0,
    dealsThisMonth: 0,
  };
}

export async function findDeveloperAccountByUser(authUserId: string, options?: { includeInactive?: boolean }) {
  if (!authUserId) return null;
  const query = supabaseServer
    .from("developer_accounts")
    .select("id, developer_id, status, developers(name)")
    .eq("auth_user_id", authUserId);
  if (!options?.includeInactive) {
    query.eq("status", "active");
  }
  const { data, error } = await query.order("invitation_sent_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) {
    console.warn("Developer account lookup failed", error);
    return null;
  }
  const developerRelation = Array.isArray(data.developers) ? data.developers[0] : data.developers;
  return {
    accountId: data.id as string,
    developerId: data.developer_id as string,
    developerName: developerRelation?.name ?? null,
    status: (data.status as string | null) ?? null,
  };
}
