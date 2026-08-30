import { supabaseServer } from "./supabaseServer";
import { sanitizePortalUrl } from "./requestUrl";

const ADMIN_PORTAL_BASE_URL = sanitizePortalUrl(process.env.ADMIN_PORTAL_URL) ?? "https://admin.brixeler.com";

export function buildAdminInviteRedirectUrl() {
  return new URL("/admin/accept", ADMIN_PORTAL_BASE_URL).toString();
}

export async function sendAdminPortalInvite(params: { email: string; displayName?: string | null }) {
  const { data, error } = await supabaseServer.auth.admin.inviteUserByEmail(params.email, {
    redirectTo: buildAdminInviteRedirectUrl(),
    data: {
      full_name: params.displayName ?? null,
      portal: "admin",
    },
  });

  return { authUserId: data.user?.id ?? null, error };
}
