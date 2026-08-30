import { NextResponse } from "next/server";
import { getAdminContextFromRequest } from "@/lib/adminAuth";
import { hasAdminRole } from "@/lib/adminRoles";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  const admin = await getAdminContextFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminRole(admin.roles, ["user_auth_admin"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { agentId?: string; reason?: string; snapshotId?: string } | null;
  const agentId = body?.agentId?.trim();
  const reason = body?.reason?.trim();
  const snapshotId = body?.snapshotId?.trim() || null;
  if (!agentId || !reason || reason.length < 3 || reason.length > 1000 || !snapshotId) {
    return NextResponse.json({ error: "A reason and a downloaded retained-data snapshot are required" }, { status: 400 });
  }
  const { data, error } = await supabaseServer.rpc("request_agent_purge", {
    p_agent_id: agentId,
    p_requested_by: admin.adminId,
    p_reason: reason,
    p_snapshot_id: snapshotId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ success: true, requestId: data, status: "pending" }, { status: 201 });
}
