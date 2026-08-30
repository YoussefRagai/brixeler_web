import { NextResponse } from "next/server";
import { DeveloperCapabilityError, requireDeveloperCapability } from "@/lib/developerAuth";
import { boundedRequestId, isUuid } from "@/lib/developerTeam";
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

  let body: { accountId?: unknown; requestId?: unknown; reason?: unknown };
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
  if (!requestId) return NextResponse.json({ error: "Invalid revoke request." }, { status: 400 });
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 3 || reason.length > 500) return NextResponse.json({ error: "A revoke reason between 3 and 500 characters is required." }, { status: 400 });

  const { data: target, error: targetError } = await supabaseServer
    .from("developer_accounts")
    .select("id")
    .eq("id", accountId)
    .eq("developer_id", session.developerId)
    .maybeSingle();
  if (targetError) {
    console.error("Failed to load developer team member for revoke", targetError);
    return NextResponse.json({ error: "Unable to load the developer member." }, { status: 500 });
  }
  if (!target?.id) return NextResponse.json({ error: "Developer member not found." }, { status: 404 });

  const { data: revokeRecord, error: revokeError } = await supabaseServer.rpc("revoke_developer_team_member", {
    p_actor_account_id: session.accountId,
    p_target_account_id: target.id,
    p_revoke_request_id: requestId,
    p_reason: reason,
  });
  if (revokeError || !revokeRecord?.account_id) {
    console.error("Failed to revoke developer team member", revokeError);
    const conflict = /final|revoke|lock|super admin/i.test(revokeError?.message ?? "");
    return NextResponse.json({ error: conflict ? "That member cannot be revoked." : "Unable to revoke developer access." }, { status: conflict ? 409 : 500 });
  }
  return NextResponse.json({
    success: true,
    idempotent: Boolean(revokeRecord.idempotent),
    memberId: String(revokeRecord.account_id),
  });
}
