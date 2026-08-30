import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDeveloperSession, type DeveloperSession } from "./developerSession";
import { getDeveloperImpersonation, type DeveloperImpersonationMarker } from "./developerImpersonation";
import { findDeveloperAccountByUser } from "./developerQueries";
import { supabaseServer } from "./supabaseServer";
import {
  DEVELOPER_CAPABILITIES,
  DEVELOPER_ROLES,
  hasDeveloperCapability,
  normalizeDeveloperRole,
  type DeveloperCapability,
  type DeveloperRole,
} from "./developerRbac";

export {
  DEVELOPER_CAPABILITIES,
  DEVELOPER_ROLES,
  hasDeveloperCapability,
  normalizeDeveloperRole,
};
export type { DeveloperCapability, DeveloperRole };

export type AuthenticatedDeveloperSession = DeveloperSession & {
  accountId: string;
  role: DeveloperRole;
};

export class DeveloperCapabilityError extends Error {
  readonly status = 403;
  readonly capability: DeveloperCapability;

  constructor(capability: DeveloperCapability) {
    super(`Developer capability required: ${capability}`);
    this.name = "DeveloperCapabilityError";
    this.capability = capability;
  }
}

export type DeveloperProfileFields = {
  name?: string | null;
  description?: string | null;
  logo_url?: string | null;
  lifecycle_state?: string | null;
};

export type SubmittedDeveloperProfileRevision = DeveloperProfileFields & {
  status?: string | null;
  submitted_at?: string | null;
};

export function isCompleteDeveloperProfile(profile: DeveloperProfileFields | null | undefined) {
  return Boolean(profile?.name?.trim() && profile?.description?.trim() && profile?.logo_url?.trim());
}

export function isCompletePublicDeveloperProfile(profile: DeveloperProfileFields | null | undefined) {
  return Boolean(isCompleteDeveloperProfile(profile) && profile?.lifecycle_state !== "draft");
}

export function isCompleteSubmittedDeveloperProfileRevision(
  revision: SubmittedDeveloperProfileRevision | null | undefined,
) {
  const status = revision?.status?.toLowerCase();
  return Boolean(
    revision &&
      (status === "pending" || status === "approved") &&
      revision.submitted_at &&
      isCompleteDeveloperProfile(revision),
  );
}

export async function hasCompletedDeveloperProfile(developerId: string) {
  const [profileResult, revisionResult] = await Promise.all([
    supabaseServer
      .from("developers")
      .select("name, description, logo_url, lifecycle_state")
      .eq("id", developerId)
      .maybeSingle(),
    supabaseServer
      .from("developer_profile_revisions")
      .select("name, description, logo_url, status, submitted_at")
      .eq("developer_id", developerId)
      .in("status", ["pending", "approved"])
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (isCompletePublicDeveloperProfile(profileResult.data)) return true;
  if (revisionResult.error) {
    console.warn("Unable to load developer profile completion state", revisionResult.error);
    return false;
  }
  return isCompleteSubmittedDeveloperProfileRevision(revisionResult.data);
}

export async function currentDeveloperSession(): Promise<DeveloperSession | null> {
  const store = await cookies();
  return getDeveloperSession(store);
}

export async function currentDeveloperImpersonation(): Promise<DeveloperImpersonationMarker | null> {
  const store = await cookies();
  return getDeveloperImpersonation(store);
}

export async function requireDeveloperSession(
  options: { allowIncompleteProfile?: boolean } = {},
): Promise<AuthenticatedDeveloperSession> {
  const session = await currentDeveloperSession();
  if (!session) {
    redirect("/developer/login");
  }
  const account = await findDeveloperAccountByUser(session.userId);
  if (!account || account.developerId !== session.developerId) {
    redirect("/developer/login?error=Access+revoked+or+expired");
  }

  // Do not trust role or membership id values in the signed cookie. This
  // lookup also binds the account to both the authenticated user and the
  // tenant from the session, preventing a stale or replayed cookie from
  // switching companies.
  const { data: membership, error: membershipError } = await supabaseServer
    .from("developer_accounts")
    .select("id, developer_id, auth_user_id, role, status")
    .eq("id", account.accountId)
    .eq("developer_id", session.developerId)
    .eq("auth_user_id", session.userId)
    .eq("status", "active")
    .maybeSingle();
  if (membershipError || !membership?.id) {
    if (membershipError) console.warn("Developer membership rehydration failed", membershipError);
    redirect("/developer/login?error=Access+revoked+or+expired");
  }
  const role = normalizeDeveloperRole(membership.role);
  if (!role) {
    console.error("Developer membership has an unsupported role", {
      accountId: membership.id,
      developerId: membership.developer_id,
    });
    redirect("/developer/login?error=Developer+access+needs+administrator+review");
  }
  if (!options.allowIncompleteProfile && !(await hasCompletedDeveloperProfile(account.developerId))) {
    redirect("/developer/profile?onboarding=1");
  }
  return {
    ...session,
    accountId: membership.id,
    role,
    developerId: membership.developer_id,
  };
}

/**
 * Server-side authorization boundary for developer actions. Route handlers
 * should catch DeveloperCapabilityError and return a 403; server pages may
 * redirect to the developer overview. The database RPCs repeat the same
 * membership/role check so service-role calls cannot rely on UI gating.
 */
export async function requireDeveloperCapability(
  capability: DeveloperCapability,
  options: { allowIncompleteProfile?: boolean } = {},
): Promise<AuthenticatedDeveloperSession> {
  const session = await requireDeveloperSession(options);
  if (!hasDeveloperCapability(session.role, capability)) {
    throw new DeveloperCapabilityError(capability);
  }
  return session;
}
