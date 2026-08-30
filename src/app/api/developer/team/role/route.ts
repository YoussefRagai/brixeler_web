import { NextResponse } from "next/server";
import { DeveloperCapabilityError, requireDeveloperCapability } from "@/lib/developerAuth";
import { boundedRequestId, isUuid } from "@/lib/developerTeam";
import { DEVELOPER_ROLES, isDeveloperRole } from "@/lib/developerRbac";
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

  let body: { accountId?: unknown; role?: unknown; requestId?: unknown };
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
  const role = typeof body.role === "string" && isDeveloperRole(body.role) ? body.role : null;
  if (!role || !DEVELOPER_ROLES.includes(role)) return NextResponse.json({ error: "Choose one of the supported developer member roles." }, { status: 400 });
  const requestId = boundedRequestId(body.requestId, () => crypto.randomUUID());
  if (!requestId) return NextResponse.json({ error: "Invalid role update request." }, { status: 400 });

  const { data: target, error: targetError } = await supabaseServer
    .from("developer_accounts")
    .select("id")
    .eq("id", accountId)
    .eq("developer_id", session.developerId)
    .maybeSingle();
  if (targetError) {
    console.error("Failed to load developer team member for role update", targetError);
    return NextResponse.json({ error: "Unable to load the developer member." }, { status: 500 });
  }
  if (!target?.id) return NextResponse.json({ error: "Developer member not found." }, { status: 404 });

  const { data: roleRecord, error: roleError } = await supabaseServer.rpc("update_developer_team_member_role", {
    p_actor_account_id: session.accountId,
    p_target_account_id: target.id,
    p_role: role,
    p_request_id: requestId,
  });
  if (roleError || !roleRecord?.account_id) {
    console.error("Failed to update developer team member role", roleError);
    const conflict = /already|demote|lock|revoked|super admin/i.test(roleError?.message ?? "");
    return NextResponse.json({ error: conflict ? "That role change is not allowed." : "Unable to update the member role." }, { status: conflict ? 409 : 500 });
  }
  return NextResponse.json({
    success: true,
    idempotent: Boolean(roleRecord.idempotent),
    memberId: String(roleRecord.account_id),
    role: roleRecord.role ?? role,
  });
}
