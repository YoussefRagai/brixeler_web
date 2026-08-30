import { NextResponse } from "next/server";
import { getAdminContextFromRequest } from "@/lib/adminAuth";
import { hasAdminRole } from "@/lib/adminRoles";
import { logAdminActivity } from "@/lib/adminQueries";
import { supabaseServer } from "@/lib/supabaseServer";

// A purge is deliberately protected by a short-lived signed session in
// addition to the independent super-admin check in the database function.
const FRESH_SESSION_MAX_AGE_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  const admin = await getAdminContextFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminRole(admin.roles, ["super_admin"])) return NextResponse.json({ error: "Independent super admin approval required" }, { status: 403 });
  const sessionAge = Date.now() - admin.session.issuedAt;
  if (sessionAge < 0 || sessionAge > FRESH_SESSION_MAX_AGE_MS) {
    return NextResponse.json({ error: "A fresh admin session is required before approving a purge" }, { status: 428 });
  }
  const body = (await request.json().catch(() => null)) as { requestId?: string; reason?: string } | null;
  const requestId = body?.requestId?.trim();
  const reason = body?.reason?.trim();
  if (!requestId || !reason || reason.length < 3 || reason.length > 1000) {
    return NextResponse.json({ error: "A reason between 3 and 1000 characters is required" }, { status: 400 });
  }
  const { data, error } = await supabaseServer.rpc("approve_agent_purge", {
    p_request_id: requestId,
    p_approved_by: admin.adminId,
    p_approval_reason: reason,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  const agentId = typeof data?.agent_id === "string" ? data.agent_id : null;
  if (agentId) {
    const { error: authError } = await supabaseServer.auth.admin.updateUserById(agentId, { ban_duration: "876000h" });
    if (authError) return NextResponse.json({ error: "Profile data was purged, but the Auth ban needs retrying.", partial: true }, { status: 503 });
    await logAdminActivity({ adminId: admin.adminId, action: "agent.purge", resourceType: "users_profile", resourceId: agentId, metadata: { request_id: requestId, independent_approval: true, fresh_session: true, reason } });
  }
  return NextResponse.json({ success: true, status: "purged", lifecycle: data });
}
