import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAdminContextFromRequest } from "@/lib/adminAuth";
import { hasAdminRole } from "@/lib/adminRoles";
import { logAdminActivity } from "@/lib/adminQueries";

export async function POST(request: Request) {
  const admin = await getAdminContextFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminRole(admin.roles, ["developers_admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { accountId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.accountId) {
    return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
  }

  const allowedDeveloperIds = admin.developerIds;

  const { data: devAccount } = await supabaseServer
    .from("developer_accounts")
    .select("id, developer_id, auth_user_id, email")
    .eq("id", body.accountId)
    .maybeSingle();

  if (!devAccount?.id) {
    return NextResponse.json({ error: "Developer member not found" }, { status: 404 });
  }

  if (allowedDeveloperIds?.length && !allowedDeveloperIds.includes(devAccount.developer_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await supabaseServer
    .from("developer_accounts")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
    })
    .eq("id", devAccount.id);

  await logAdminActivity({
    adminId: admin.adminId,
    action: "developer_account.revoke",
    resourceType: "developer_accounts",
    resourceId: devAccount.id,
    metadata: { developer_id: devAccount.developer_id, email: devAccount.email },
  });

  return NextResponse.json({ success: true });
}
