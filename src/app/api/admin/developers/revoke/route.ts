import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAdminSessionFromCookie } from "@/lib/adminSession";
import { hasAdminRole, type AdminRole } from "@/lib/adminRoles";
import { logAdminActivity, fetchAdminAccountByUser } from "@/lib/adminQueries";

export async function POST(request: Request) {
  const session = getAdminSessionFromCookie(request.headers.get("cookie"));
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const roles = (session.roles ?? []) as AdminRole[];
  if (!hasAdminRole(roles, ["developers_admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { developerId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.developerId) {
    return NextResponse.json({ error: "Missing developerId" }, { status: 400 });
  }

  const account = await fetchAdminAccountByUser(session.authUserId);
  const allowedDeveloperIds = account?.developer_ids ?? null;
  if (allowedDeveloperIds?.length && !allowedDeveloperIds.includes(body.developerId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: devAccount } = await supabaseServer
    .from("developer_accounts")
    .select("id, auth_user_id")
    .eq("developer_id", body.developerId)
    .maybeSingle();

  if (devAccount?.id) {
    await supabaseServer.from("developer_accounts").delete().eq("id", devAccount.id);
  }
  if (devAccount?.auth_user_id) {
    await supabaseServer.auth.admin.deleteUser(devAccount.auth_user_id);
  }

  await logAdminActivity({
    adminId: session.adminId,
    action: "developer_account.delete",
    resourceType: "developer_accounts",
    resourceId: devAccount?.auth_user_id ?? null,
    metadata: { developer_id: body.developerId },
  });

  return NextResponse.json({ success: true });
}
