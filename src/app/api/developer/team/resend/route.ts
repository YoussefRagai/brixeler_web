import { NextResponse } from "next/server";
import { DeveloperCapabilityError, requireDeveloperCapability } from "@/lib/developerAuth";
import { boundedRequestId, isUuid, parseDeveloperRole } from "@/lib/developerTeam";
import { sendDeveloperPortalInvite } from "@/lib/developerAccountInvites";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  let session;
  try {
    session = await requireDeveloperCapability("manage_team");
  } catch (error) {
    if (error instanceof DeveloperCapabilityError) {
      return NextResponse.json({ error: "Developer team management is restricted to company super admins." }, { status: 403 });
    }
    throw error;
  }

  let body: { accountId?: unknown; requestId?: unknown };
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
  if (!isUuid(accountId)) return NextResponse.json({ error: "Invalid member id." }, { status: 400 });
  const requestId = boundedRequestId(body.requestId, () => crypto.randomUUID());
  if (!requestId) return NextResponse.json({ error: "Invalid resend request." }, { status: 400 });

  const { data: member, error: memberError } = await supabaseServer
    .from("developer_accounts")
    .select("id, developer_id, auth_user_id, email, full_name, role, status, invite_request_id")
    .eq("id", accountId)
    .eq("developer_id", session.developerId)
    .maybeSingle();
  if (memberError) {
    console.error("Failed to load developer team member for resend", memberError);
    return NextResponse.json({ error: "Unable to load the developer member." }, { status: 500 });
  }
  if (!member?.id || !member.email) return NextResponse.json({ error: "Developer member not found." }, { status: 404 });
  if (member.status === "active") return NextResponse.json({ error: "This developer member is already active." }, { status: 409 });
  if (member.status === "revoked") return NextResponse.json({ error: "Revoked developer access cannot be reactivated." }, { status: 409 });
  if (member.status !== "pending") return NextResponse.json({ error: "Only pending invitations can be resent." }, { status: 409 });
  const role = parseDeveloperRole(member.role);
  if (!role) return NextResponse.json({ error: "This member has an unsupported role and needs administrator review." }, { status: 409 });
  if (member.invite_request_id === requestId) {
    return NextResponse.json({ success: true, idempotent: true, memberId: member.id, role });
  }

  let inviteResult;
  try {
    inviteResult = await sendDeveloperPortalInvite({
      email: member.email,
      developerId: session.developerId,
      developerName: session.developerName ?? "Developer",
      inviteRequestId: requestId,
      developerRole: role,
    });
  } catch (error) {
    console.error("Failed to resend developer team invite", error);
    return NextResponse.json({ error: "The invitation email could not be sent." }, { status: 502 });
  }
  if (inviteResult.error || !inviteResult.authUserId) {
    console.error("Failed to resend developer team invite", inviteResult.error);
    return NextResponse.json({ error: "The invitation email could not be sent." }, { status: 502 });
  }

  const { data: resendRecord, error: resendError } = await supabaseServer.rpc("resend_developer_team_invite", {
    p_actor_account_id: session.accountId,
    p_target_account_id: member.id,
    p_invite_request_id: requestId,
  });
  if (resendError || !resendRecord?.account_id) {
    console.error("Failed to record developer team invite resend", resendError);
    return NextResponse.json({ error: "The invite email was sent, but the resend could not be recorded." }, { status: 500 });
  }
  return NextResponse.json({
    success: true,
    idempotent: Boolean(resendRecord.idempotent),
    memberId: String(resendRecord.account_id),
    role: resendRecord.role ?? role,
  });
}
