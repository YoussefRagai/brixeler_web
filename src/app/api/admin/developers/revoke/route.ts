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

  let body: { accountId?: string; requestId?: string; reason?: string } = {};
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
  if (!accountId) {
    return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
  }

  const allowedDeveloperIds = admin.developerIds;

  const { data: devAccount, error: accountError } = await supabaseServer
    .from("developer_accounts")
    .select("id, developer_id, auth_user_id, email, status")
    .eq("id", accountId)
    .maybeSingle();

  if (accountError) {
    console.error("Failed to load developer member for revoke", accountError);
    return NextResponse.json({ error: "Unable to load developer member" }, { status: 500 });
  }
  if (!devAccount?.id) {
    return NextResponse.json({ error: "Developer member not found" }, { status: 404 });
  }

  if (allowedDeveloperIds?.length && !allowedDeveloperIds.includes(devAccount.developer_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const requestId = typeof body.requestId === "string" ? body.requestId.trim() || crypto.randomUUID() : crypto.randomUUID();
  if (requestId.length > 200) {
    return NextResponse.json({ error: "Invalid revoke request" }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 3 || reason.length > 500) {
    return NextResponse.json({ error: "A revoke reason between 3 and 500 characters is required" }, { status: 400 });
  }

  const { data: revokeRecord, error: revokeError } = await supabaseServer.rpc("revoke_developer_account", {
    p_account_id: devAccount.id,
    p_admin_id: admin.adminId,
    p_revoke_request_id: requestId,
    p_revoked_at: new Date().toISOString(),
    p_reason: reason,
  });
  if (revokeError || !revokeRecord?.account_id) {
    console.error("Failed to revoke developer access", revokeError);
    return NextResponse.json({ error: "Unable to revoke developer access" }, { status: 500 });
  }

  if (!revokeRecord.idempotent) {
    await logAdminActivity({
      adminId: admin.adminId,
      action: "developer_account.revoke",
      resourceType: "developer_accounts",
      resourceId: devAccount.id,
      metadata: { developer_id: devAccount.developer_id, email: devAccount.email },
    });
  }

  return NextResponse.json({
    success: true,
    idempotent: Boolean(revokeRecord.idempotent),
    message: revokeRecord.idempotent ? "This revoke request was already recorded." : "Developer access revoked.",
  });
}
