import { supabaseServer } from "./supabaseServer";
import { sanitizePortalUrl } from "./requestUrl";
import { normalizeAdminRoles, type AdminRole } from "./adminRoles";
import { describePortalInviteDeliveryError, getPortalInviteSubmissionMessage } from "./portalInviteDelivery";

const ADMIN_PORTAL_BASE_URL = sanitizePortalUrl(process.env.ADMIN_PORTAL_URL) ?? "https://admin.brixeler.com";

type AdminPortalInviteResult =
  | { authUserId: null; error: string }
  | { authUserId: string; created: boolean; message: string };

export function buildAdminInviteRedirectUrl() {
  return new URL("/admin/accept", ADMIN_PORTAL_BASE_URL).toString();
}

export async function createAdminPortalInvite(params: {
  email: string;
  displayName: string | null;
  roles: AdminRole[];
  developerIds: string[];
  assignedBy: string;
}): Promise<AdminPortalInviteResult> {
  const { data, error } = await supabaseServer.auth.admin.inviteUserByEmail(params.email, {
    redirectTo: buildAdminInviteRedirectUrl(),
    data: {
      full_name: params.displayName ?? null,
      portal: "admin",
    },
  });

  const authUserId = data.user?.id;
  if (error || !authUserId) {
    console.error("Failed to submit staff admin invitation", error?.code, error?.status);
    return { authUserId: null, error: describePortalInviteDeliveryError(error).message };
  }

  // Supabase resends an invite to an existing unconfirmed Auth user using
  // the same id. Preserve the matching admin assignment on repeated calls.
  const { data: inserted, error: insertError } = await supabaseServer
    .from("admins")
    .upsert({
      id: authUserId,
      role: params.roles.includes("super_admin") ? "super_admin" : "admin",
      roles: params.roles,
      permissions: {
        display_name: params.displayName,
        email: params.email,
        developer_ids: params.developerIds,
      },
      assigned_by: params.assignedBy,
      is_active: true,
    }, { onConflict: "id", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();

  if (insertError) {
    console.error("Failed to record staff admin invitation", insertError.code);
    return { authUserId: null, error: "The email was submitted. The admin assignment could not be confirmed. Retry with the same email." };
  }

  if (!inserted) {
    const { data: existing, error: existingError } = await supabaseServer
      .from("admins")
      .select("role, roles, permissions, is_active")
      .eq("id", authUserId)
      .maybeSingle();
    if (existingError || !existing) {
      console.error("Failed to verify existing staff admin assignment", existingError?.code);
      return { authUserId: null, error: "The email was submitted. The admin assignment could not be confirmed." };
    }

    const existingRoles = normalizeAdminRoles(existing.roles?.length ? existing.roles : [existing.role]);
    const existingDeveloperIds = Array.isArray(existing.permissions?.developer_ids)
      ? existing.permissions.developer_ids
      : [];
    if (
      existing.is_active === false ||
      existingRoles.length !== params.roles.length ||
      !params.roles.every((role) => existingRoles.includes(role)) ||
      existingDeveloperIds.length !== params.developerIds.length ||
      !params.developerIds.every((id) => existingDeveloperIds.includes(id))
    ) {
      return { authUserId: null, error: "The email was submitted for an existing admin. Review their roles, company assignments, and access status." };
    }
  }

  return {
    authUserId,
    created: Boolean(inserted),
    message: getPortalInviteSubmissionMessage("invite"),
  };
}
