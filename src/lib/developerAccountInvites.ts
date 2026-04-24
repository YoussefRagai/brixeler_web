import { supabaseServer } from "@/lib/supabaseServer";

const DEVELOPER_PORTAL_BASE_URL =
  process.env.DEVELOPER_PORTAL_URL?.replace(/\/$/, "") ?? "https://developer.brixeler.com";

export type InviteDeveloperPortalMemberParams = {
  email: string;
  developerId: string;
  developerName: string;
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
      return null;
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

export async function sendDeveloperPortalInvite(params: InviteDeveloperPortalMemberParams) {
  const email = params.email.trim().toLowerCase();
  const redirectTo = buildDeveloperInviteRedirectUrl({
    developerId: params.developerId,
    developerName: params.developerName,
    email,
  });

  const existingUser = await findAuthUserByEmail(email);
  if (existingUser?.id) {
    const { error } = await supabaseServer.auth.resetPasswordForEmail(email, { redirectTo });
    return { authUserId: existingUser.id, error };
  }

  const { data, error } = await supabaseServer.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      developer_id: params.developerId,
      developer_name: params.developerName,
      portal: "developer",
    },
  });

  return { authUserId: data.user?.id ?? null, error };
}
