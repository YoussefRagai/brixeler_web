import { NextResponse } from "next/server";
import { supabaseServer } from "./supabaseServer";

export async function restoreAgentAccess(
  adminId: string,
  agentId: string,
  reason: string,
  from: "archived" | "suspended",
) {
  const restore = (commit: boolean, expectedUpdatedAt: string | null) => supabaseServer.rpc("restore_agent_access", {
    p_agent_id: agentId,
    p_admin_id: adminId,
    p_reason: reason,
    p_restore_from: from,
    p_commit: commit,
    p_expected_updated_at: expectedUpdatedAt,
  });
  const { data: authorized, error: authorizationError } = await restore(false, null);
  if (authorizationError) return NextResponse.json({ error: authorizationError.message }, { status: 409 });
  if (authorized?.already_restored) return NextResponse.json({ success: true, status: "active", lifecycle: authorized });
  if (authorized?.agent_id !== agentId.toLowerCase()) {
    return NextResponse.json({ error: "Unable to verify the agent account." }, { status: 503 });
  }

  const { error: authError } = await supabaseServer.auth.admin.updateUserById(agentId, { ban_duration: "none" });
  if (authError) return NextResponse.json({ error: "Unable to restore authentication access. Try again." }, { status: 503 });
  const { data, error } = await restore(true, authorized.updated_at);
  if (error) {
    return NextResponse.json({ error: error.message, partial: true }, { status: 409 });
  }
  return NextResponse.json({ success: true, status: "active", lifecycle: data });
}
