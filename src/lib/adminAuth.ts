import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AdminRole } from "./adminRoles";
import { hasAdminRole } from "./adminRoles";
import { getAdminSession, type AdminSession } from "./adminSession";
import { fetchAdminAccountByUser } from "./adminQueries";

export type AdminContext = {
  session: AdminSession;
  roles: AdminRole[];
  adminId: string;
  authUserId: string;
  developerIds: string[] | null;
};

export async function currentAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  return getAdminSession(store);
}

export async function getAdminContext(): Promise<AdminContext | null> {
  const session = await currentAdminSession();
  if (!session) return null;
  const account = await fetchAdminAccountByUser(session.authUserId);
  if (!account) return null;
  return {
    session,
    roles: (account.roles ?? []) as AdminRole[],
    adminId: account.id,
    authUserId: account.auth_user_id,
    developerIds: account.developer_ids ?? null,
  };
}

export async function requireAdminContext(): Promise<AdminContext> {
  const context = await getAdminContext();
  if (!context) {
    redirect("/admin/login");
  }
  return context;
}

export async function requireAdminRole(required: AdminRole[]) {
  const context = await requireAdminContext();
  if (!hasAdminRole(context.roles, required)) {
    return null;
  }
  return context;
}
