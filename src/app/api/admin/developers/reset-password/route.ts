import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAdminSessionFromCookie } from "@/lib/adminSession";
import { hasAdminRole, type AdminRole } from "@/lib/adminRoles";
import { logAdminActivity } from "@/lib/adminQueries";
import { fetchAdminAccountByUser } from "@/lib/adminQueries";

export async function POST(request: Request) {
  const session = getAdminSessionFromCookie(request.headers.get("cookie"));
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const roles = (session.roles ?? []) as AdminRole[];
  if (!hasAdminRole(roles, ["developers_admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { email?: string; newPassword?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.email || !body.newPassword) {
    return NextResponse.json({ error: "Missing email or password" }, { status: 400 });
  }

  const account = await fetchAdminAccountByUser(session.authUserId);
  const allowedDeveloperIds = account?.developer_ids ?? null;

  const { data: userData, error: userError } = await supabaseServer.auth.admin.getUserByEmail(body.email);
  if (userError || !userData?.user?.id) {
    return NextResponse.json({ error: "Unable to locate user" }, { status: 404 });
  }

  if (allowedDeveloperIds?.length) {
    const { data: devAccount } = await supabaseServer
      .from("developer_accounts")
      .select("developer_id")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    if (!devAccount?.developer_id || !allowedDeveloperIds.includes(devAccount.developer_id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { error } = await supabaseServer.auth.admin.updateUserById(userData.user.id, { password: body.newPassword });
  if (error) return NextResponse.json({ error: error.message ?? "Update failed" }, { status: 500 });

  await logAdminActivity({
    adminId: session.adminId,
    action: "developer_account.update_password",
    resourceType: "developer_accounts",
    resourceId: userData.user.id,
  });

  return NextResponse.json({ success: true });
}
