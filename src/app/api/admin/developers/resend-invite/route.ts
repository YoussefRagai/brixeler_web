import { NextResponse } from "next/server";
import { getAdminContextFromRequest } from "@/lib/adminAuth";
import { hasAdminRole } from "@/lib/adminRoles";
import { logAdminActivity } from "@/lib/adminQueries";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendDeveloperPortalInvite } from "@/lib/developerAccountInvites";

export async function POST(request: Request) {
  const admin = await getAdminContextFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminRole(admin.roles, ["developers_admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { accountId?: string; requestId?: string } = {};
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

  const { data: member, error: memberError } = await supabaseServer
    .from("developer_accounts")
    .select("id, developer_id, auth_user_id, email, status, invite_request_id, developers(name)")
    .eq("id", accountId)
    .maybeSingle();

  if (memberError) {
    console.error("Failed to load developer member for resend", memberError);
    return NextResponse.json({ error: "Unable to load developer member" }, { status: 500 });
  }
  if (!member?.id || !member.email) {
    return NextResponse.json({ error: "Developer member not found" }, { status: 404 });
  }

  if (allowedDeveloperIds?.length && !allowedDeveloperIds.includes(member.developer_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (member.status === "active") {
    return NextResponse.json({ error: "This developer member is already active" }, { status: 409 });
  }
  if (member.status === "revoked") {
    return NextResponse.json({ error: "Revoked access cannot be reactivated; invite a new member email" }, { status: 409 });
  }
  if (member.status !== "pending") {
    return NextResponse.json({ error: "Only pending invitations can be resent" }, { status: 409 });
  }

  const requestId = typeof body.requestId === "string" ? body.requestId.trim() || crypto.randomUUID() : crypto.randomUUID();
  if (requestId.length > 200) {
    return NextResponse.json({ error: "Invalid resend request" }, { status: 400 });
  }

  if (member.invite_request_id === requestId) {
    return NextResponse.json({ success: true, idempotent: true, message: "This resend request was already recorded." });
  }

  const developerRelation = Array.isArray(member.developers) ? member.developers[0] : member.developers;
  const developerName = developerRelation?.name ?? "Developer";

  let inviteResult: Awaited<ReturnType<typeof sendDeveloperPortalInvite>>;
  try {
    inviteResult = await sendDeveloperPortalInvite({
      email: member.email,
      developerId: member.developer_id,
      developerName,
      inviteRequestId: requestId,
    });
  } catch (error) {
    console.error("Failed to resend developer invite", error);
    return NextResponse.json({ error: "The invitation email could not be sent" }, { status: 502 });
  }

  if (inviteResult.error || !inviteResult.authUserId) {
    console.error("Failed to resend developer invite", inviteResult.error);
    return NextResponse.json({ error: "The invitation email could not be sent" }, { status: 502 });
  }

  const { data: inviteRecord, error: updateError } = await supabaseServer.rpc("create_developer_account_invite", {
    p_developer_id: member.developer_id,
    p_developer_name: developerName,
    p_contact_email: null,
    p_contact_phone: null,
    p_create_developer: false,
    p_auth_user_id: inviteResult.authUserId,
    p_member_email: member.email,
    p_invited_by_admin_id: admin.adminId,
    p_invite_request_id: requestId,
    p_is_demo: false,
    p_demo_batch: null,
  });
  if (updateError || !inviteRecord?.account_id) {
    console.error("Invite sent but developer resend could not be recorded", updateError);
    return NextResponse.json(
      { error: "Invite email sent, but the resend could not be recorded. Do not resend again until this request is retried." },
      { status: 500 },
    );
  }

  if (!inviteRecord.idempotent) {
    await logAdminActivity({
      adminId: admin.adminId,
      action: "developer_account.resend_invite",
      resourceType: "developer_accounts",
      resourceId: member.id,
      metadata: { developer_id: member.developer_id, email: member.email },
    });
  }

  return NextResponse.json({
    success: true,
    idempotent: Boolean(inviteRecord.idempotent),
    message: inviteRecord.idempotent ? "This resend request was already recorded." : "Invite resent.",
  });
}
