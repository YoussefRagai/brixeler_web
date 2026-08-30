import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAdminContextFromRequest } from "@/lib/adminAuth";
import { hasAdminRole } from "@/lib/adminRoles";
import { logAdminActivity } from "@/lib/adminQueries";

export async function POST(request: Request) {
  const admin = await getAdminContextFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminRole(admin.roles, ["user_auth_admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { agentId?: string; suspended?: boolean; reason?: string } | null;

  const agentId = body?.agentId?.trim();
  if (!agentId) return NextResponse.json({ error: "Missing agentId" }, { status: 400 });
  const shouldSuspend = body?.suspended !== false;
  const reason = body?.reason?.trim();
  if (!reason || reason.length < 3 || reason.length > 1000) return NextResponse.json({ error: "A reason between 3 and 1000 characters is required" }, { status: 400 });

  if (!shouldSuspend) {
    const { error: authRestoreError } = await supabaseServer.auth.admin.updateUserById(agentId, { ban_duration: "none" });
    if (authRestoreError) return NextResponse.json({ error: "Unable to restore authentication access" }, { status: 503 });
  }
  const { data, error } = await supabaseServer.rpc("set_agent_account_access", {
    p_agent_id: agentId,
    p_admin_id: admin.adminId,
    p_suspended: shouldSuspend,
    p_reason: reason,
  });
  if (error) {
    if (!shouldSuspend) await supabaseServer.auth.admin.updateUserById(agentId, { ban_duration: "876000h" });
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  // Keep the database policy and Auth ban aligned.  A failed Auth operation
  // is surfaced as partial so an operator can retry without losing the audit.
  const { error: authError } = shouldSuspend
    ? await supabaseServer.auth.admin.updateUserById(agentId, { ban_duration: "876000h" })
    : { error: null };
  if (authError) {
    if (shouldSuspend) {
      await supabaseServer.from("device_push_tokens").update({ enabled: false, updated_at: new Date().toISOString() }).eq("agent_id", agentId);
    }
    return NextResponse.json({ error: "Account state changed in the database, but authentication still needs retrying.", partial: true }, { status: 503 });
  }

  await logAdminActivity({
    adminId: admin.adminId,
    action: shouldSuspend ? "agent.suspend" : "agent.reactivate",
    resourceType: "users_profile",
    resourceId: agentId,
    metadata: { reason, recoverable: true },
  });

  return NextResponse.json({ success: true, status: shouldSuspend ? "suspended" : "active", lifecycle: data });
}
