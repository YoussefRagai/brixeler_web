import { NextResponse } from "next/server";
import { getAdminContextFromRequest } from "@/lib/adminAuth";
import { hasAdminRole } from "@/lib/adminRoles";
import { logAdminActivity } from "@/lib/adminQueries";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  const admin = await getAdminContextFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminRole(admin.roles, ["user_auth_admin"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { agentId?: string; reason?: string } | null;
  const agentId = body?.agentId?.trim();
  const reason = body?.reason?.trim();
  if (!agentId || !reason || reason.length < 3 || reason.length > 1000) {
    return NextResponse.json({ error: "A reason between 3 and 1000 characters is required" }, { status: 400 });
  }

  // Lift the Auth ban first. The database still denies access while the
  // profile is archived; if the transactional restore fails, reapply the ban.
  const { error: authError } = await supabaseServer.auth.admin.updateUserById(agentId, { ban_duration: "none" });
  if (authError) return NextResponse.json({ error: "Unable to restore authentication access" }, { status: 503 });
  const { data, error } = await supabaseServer.rpc("restore_archived_agent_account", {
    p_agent_id: agentId,
    p_admin_id: admin.adminId,
    p_reason: reason,
  });
  if (error) {
    await supabaseServer.auth.admin.updateUserById(agentId, { ban_duration: "876000h" });
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  await logAdminActivity({ adminId: admin.adminId, action: "agent.restore", resourceType: "users_profile", resourceId: agentId, metadata: { reason, recoverable: true } });
  return NextResponse.json({ success: true, status: "active", lifecycle: data });
}
