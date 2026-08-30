import { supabaseServer } from "@/lib/supabaseServer";
import type { DeveloperRole } from "@/lib/developerRbac";

const DEVELOPER_PORTAL_BASE_URL =
  process.env.DEVELOPER_PORTAL_URL?.replace(/\/$/, "") ?? "https://admin.brixeler.com/developer";

export type InviteDeveloperPortalMemberParams = {
  email: string;
  developerId: string;
  developerName: string;
  inviteRequestId?: string;
  /** Optional role marker for developer-led team invitations. */
  developerRole?: DeveloperRole;
};

export type DeveloperPortalInviteResult = {
  authUserId: string | null;
  error: { message?: string } | null;
  createdAuthUser: boolean;
};

type AuthUser = {
  id: string;
  email?: string | null;
};

export async function findAuthUserByEmail(email: string): Promise<AuthUser | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;

  let page = 1;
  while (page <= 10) {
    const { data, error } = await supabaseServer.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error("Failed to list auth users", error);
      throw new Error("Unable to verify the invitation recipient.");
    }

    const users = data?.users ?? [];
    const match = users.find((user) => user.email?.toLowerCase() === target);
    if (match) {
      return { id: match.id, email: match.email ?? null };
    }

    if (users.length < 1000) break;
    page += 1;
  }

  return null;
}

export function buildDeveloperInviteRedirectUrl(params: {
  developerId: string;
  developerName: string;
  email: string;
}) {
  const url = new URL("/developer/accept", DEVELOPER_PORTAL_BASE_URL);
  url.searchParams.set("developerId", params.developerId);
  url.searchParams.set("developerName", params.developerName);
  url.searchParams.set("email", params.email);
  return url.toString();
}

export async function sendDeveloperPortalInvite(
  params: InviteDeveloperPortalMemberParams,
): Promise<DeveloperPortalInviteResult> {
  const email = params.email.trim().toLowerCase();
  const redirectTo = buildDeveloperInviteRedirectUrl({
    developerId: params.developerId,
    developerName: params.developerName,
    email,
  });

  const existingUser = await findAuthUserByEmail(email);
  if (existingUser?.id) {
    const { error } = await supabaseServer.auth.resetPasswordForEmail(email, { redirectTo });
    return { authUserId: existingUser.id, error, createdAuthUser: false };
  }

  const { data, error } = await supabaseServer.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      developer_id: params.developerId,
      developer_name: params.developerName,
      portal: "developer",
      ...(params.inviteRequestId ? { developer_invite_operation_id: params.inviteRequestId } : {}),
      ...(params.developerRole ? { developer_role: params.developerRole } : {}),
    },
  });

  return {
    authUserId: data.user?.id ?? null,
    error,
    createdAuthUser: Boolean(data.user?.id),
  };
}

/**
 * Remove only an Auth user that this invite operation created and that never
 * received a database membership. The metadata marker and membership check
 * make compensation safe when a request is retried or races another admin.
 */
export async function compensateDeveloperInviteAuthUser(params: {
  authUserId: string | null;
  developerId: string;
  inviteRequestId: string;
}) {
  if (!params.authUserId || !params.developerId || !params.inviteRequestId) {
    return { deleted: false, reason: "missing_compensation_context" as const };
  }

  const { data: userData, error: userError } = await supabaseServer.auth.admin.getUserById(params.authUserId);
  if (userError || !userData.user) {
    console.warn("Unable to inspect invite Auth user for compensation", userError);
    return { deleted: false, reason: "auth_user_not_found" as const };
  }

  const metadata = (userData.user.user_metadata ?? {}) as Record<string, unknown>;
  if (
    metadata.developer_invite_operation_id !== params.inviteRequestId ||
    metadata.developer_id !== params.developerId
  ) {
    return { deleted: false, reason: "invite_marker_mismatch" as const };
  }

  const { data: membership, error: membershipError } = await supabaseServer
    .from("developer_accounts")
    .select("id")
    .eq("auth_user_id", params.authUserId)
    .maybeSingle();
  if (membershipError) {
    console.warn("Unable to verify invite membership for compensation", membershipError);
    return { deleted: false, reason: "membership_check_failed" as const };
  }
  if (membership?.id) {
    return { deleted: false, reason: "membership_exists" as const };
  }

  const { error: deleteError } = await supabaseServer.auth.admin.deleteUser(params.authUserId);
  if (deleteError) {
    console.warn("Unable to compensate invite Auth user", deleteError);
    return { deleted: false, reason: "auth_delete_failed" as const };
  }
  return { deleted: true as const };
}
