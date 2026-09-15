import { fetchAdminAccountByUser } from "./adminQueries";
import { IMPERSONATION_MAX_AGE, type DeveloperSession } from "./developerSession";
import { supabaseServer } from "./supabaseServer";

export async function isActiveImpersonationIssuer(adminId: string, authUserId: string) {
  const admin = await fetchAdminAccountByUser(authUserId);
  return Boolean(admin && admin.id === adminId && admin.status === "active" && admin.roles.includes("super_admin"));
}

export async function isDeveloperImpersonationAuthorized(session: DeveloperSession) {
  const claim = session.impersonation;
  if (!claim) return true;
  const { data: grant, error } = await supabaseServer.from("developer_impersonation_grants")
    .select("admin_id, admin_auth_user_id, developer_id, impersonated_user_id, impersonated_account_id, consumed_at")
    .eq("token_hash", claim.grantHash).maybeSingle();
  if (error || !grant || grant.admin_id !== claim.adminId || grant.admin_auth_user_id !== claim.adminAuthUserId
    || grant.developer_id !== session.developerId || grant.impersonated_user_id !== session.userId
    || grant.impersonated_account_id !== session.accountId || !grant.consumed_at) return false;
  const consumedAt = Date.parse(grant.consumed_at);
  if (!Number.isFinite(consumedAt) || consumedAt > Date.now() || Date.now() - consumedAt >= IMPERSONATION_MAX_AGE * 1000) return false;
  return isActiveImpersonationIssuer(claim.adminId, claim.adminAuthUserId);
}
