import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAdminContextFromRequest } from "@/lib/adminAuth";
import { hasAdminRole } from "@/lib/adminRoles";
import { logAdminActivity } from "@/lib/adminQueries";

/** Compatibility endpoint. Account deletion is no longer supported; old
 * clients receive the recoverable archive operation instead. */
export async function POST(request: Request) {
  const admin = await getAdminContextFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminRole(admin.roles, ["user_auth_admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { agentId?: string; reason?: string } | null;
  const agentId = body?.agentId?.trim();
  const reason = body?.reason?.trim();
  if (!agentId || !reason || reason.length < 3 || reason.length > 1000) {
    return NextResponse.json({ error: "A reason between 3 and 1000 characters is required" }, { status: 400 });
  }

  const { data, error } = await supabaseServer.rpc("archive_agent_account", {
    p_agent_id: agentId,
    p_admin_id: admin.adminId,
    p_reason: reason,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { error: authError } = await supabaseServer.auth.admin.updateUserById(agentId, { ban_duration: "876000h" });
  if (authError) {
    return NextResponse.json({ error: "Account archived, but authentication access still needs to be blocked.", partial: true }, { status: 503 });
  }

  await logAdminActivity({
    adminId: admin.adminId,
    action: "agent.archive",
    resourceType: "users_profile",
    resourceId: agentId,
    metadata: { reason, recoverable: true },
  });

  return NextResponse.json({ success: true, state: "archived", lifecycle: data });
}
