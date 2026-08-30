import { NextResponse } from "next/server";
import { DeveloperCapabilityError, requireDeveloperCapability } from "@/lib/developerAuth";
import {
  boundedRequestId,
  normalizeDeveloperEmail,
} from "@/lib/developerTeam";
import { DEVELOPER_ROLES, isDeveloperRole } from "@/lib/developerRbac";
import {
  compensateDeveloperInviteAuthUser,
  findAuthUserByEmail,
  sendDeveloperPortalInvite,
} from "@/lib/developerAccountInvites";
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

  let body: { email?: unknown; fullName?: unknown; role?: unknown; requestId?: unknown };
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = normalizeDeveloperEmail(body.email);
  if (!email) return NextResponse.json({ error: "Enter a valid member email address." }, { status: 400 });
  const role = typeof body.role === "string" && isDeveloperRole(body.role) ? body.role : null;
  if (!role || !DEVELOPER_ROLES.includes(role)) {
    return NextResponse.json({ error: "Choose one of the supported developer member roles." }, { status: 400 });
  }
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() || null : null;
  if (fullName && fullName.length > 200) {
    return NextResponse.json({ error: "Member name must be 200 characters or fewer." }, { status: 400 });
  }
  const requestId = boundedRequestId(body.requestId, () => crypto.randomUUID());
  if (!requestId) return NextResponse.json({ error: "Invalid invite request." }, { status: 400 });

  // Preflight the Auth identity so a member of another company never receives
  // a tenant-switching reset/invite email. The RPC repeats this check under a
  // row lock to cover races between this read and the write.
  let existingAuthUser;
  try {
    existingAuthUser = await findAuthUserByEmail(email);
  } catch (error) {
    console.error("Unable to verify developer team invite recipient", error);
    return NextResponse.json({ error: "Unable to verify the invitation recipient." }, { status: 502 });
  }
  if (existingAuthUser?.id) {
    const { data: membership, error: membershipError } = await supabaseServer
      .from("developer_accounts")
      .select("id, developer_id, status")
      .eq("auth_user_id", existingAuthUser.id)
      .maybeSingle();
    if (membershipError) {
      console.error("Unable to check existing developer membership", membershipError);
      return NextResponse.json({ error: "Unable to verify existing developer access." }, { status: 500 });
    }
    if (membership?.developer_id && membership.developer_id !== session.developerId) {
      return NextResponse.json({ error: "This email already belongs to another developer company." }, { status: 409 });
    }
    if (membership?.status === "active") {
      return NextResponse.json({ error: "This member already has active developer access." }, { status: 409 });
    }
    if (membership?.status === "revoked") {
      return NextResponse.json({ error: "Revoked developer access cannot be reactivated." }, { status: 409 });
    }
  }

  const inviteResult = await sendDeveloperPortalInvite({
    email,
    developerId: session.developerId,
    developerName: session.developerName ?? "Developer",
    inviteRequestId: requestId,
    developerRole: role,
  });
  if (inviteResult.error || !inviteResult.authUserId) {
    if (inviteResult.createdAuthUser) {
      await compensateDeveloperInviteAuthUser({
        authUserId: inviteResult.authUserId,
        developerId: session.developerId,
        inviteRequestId: requestId,
      });
    }
    console.error("Failed to send developer team invite", inviteResult.error);
    return NextResponse.json({ error: "The invitation email could not be sent." }, { status: 502 });
  }

  const { data: inviteRecord, error: inviteError } = await supabaseServer.rpc("invite_developer_team_member", {
    p_actor_account_id: session.accountId,
    p_auth_user_id: inviteResult.authUserId,
    p_member_email: email,
    p_role: role,
    p_invite_request_id: requestId,
    p_full_name: fullName,
  });
  if (inviteError || !inviteRecord?.account_id) {
    if (inviteResult.createdAuthUser) {
      await compensateDeveloperInviteAuthUser({
        authUserId: inviteResult.authUserId,
        developerId: session.developerId,
        inviteRequestId: requestId,
      });
    }
    console.error("Failed to record developer team invite", inviteError);
    const conflict = /already|revoked|super admin|eligible/i.test(inviteError?.message ?? "");
    return NextResponse.json({ error: conflict ? "The member cannot be invited with that role or status." : "The invitation could not be recorded." }, { status: conflict ? 409 : 500 });
  }

  return NextResponse.json({
    success: true,
    idempotent: Boolean(inviteRecord.idempotent),
    memberId: String(inviteRecord.account_id),
    role: inviteRecord.role ?? role,
  });
}
