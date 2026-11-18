import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAdminContextFromRequest } from "@/lib/adminAuth";
import { hasAdminRole } from "@/lib/adminRoles";
import { logAdminActivity } from "@/lib/adminQueries";
import { restoreAgentAccess } from "@/lib/agentAccess";

export async function POST(request: Request) {
  const admin = await getAdminContextFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminRole(admin.roles, ["user_auth_admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { agentId?: unknown; suspended?: unknown; reason?: unknown } | null;

  const agentId = typeof body?.agentId === "string" ? body.agentId.trim() : "";
  if (!agentId) return NextResponse.json({ error: "Missing agentId" }, { status: 400 });
  if (body?.suspended !== undefined && typeof body.suspended !== "boolean") {
    return NextResponse.json({ error: "Invalid suspension status" }, { status: 400 });
  }
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!reason || reason.length < 3 || reason.length > 1000) return NextResponse.json({ error: "A reason between 3 and 1000 characters is required" }, { status: 400 });

  if (body?.suspended === false) return restoreAgentAccess(admin.adminId, agentId, reason, "suspended");

  const { data, error } = await supabaseServer.rpc("set_agent_account_access", {
    p_agent_id: agentId,
    p_admin_id: admin.adminId,
    p_suspended: true,
    p_reason: reason,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  // Keep the database policy and Auth ban aligned.  A failed Auth operation
  // is surfaced as partial so an operator can retry without losing the audit.
  const { error: authError } = await supabaseServer.auth.admin.updateUserById(agentId, { ban_duration: "876000h" });
  if (authError) {
    return NextResponse.json({ error: "Account suspended, but authentication still needs retrying.", partial: true }, { status: 503 });
  }

  await logAdminActivity({
    adminId: admin.adminId,
    action: "agent.suspend",
    resourceType: "users_profile",
    resourceId: agentId,
    metadata: { reason, recoverable: true },
  });

  return NextResponse.json({ success: true, status: "suspended", lifecycle: data });
}
