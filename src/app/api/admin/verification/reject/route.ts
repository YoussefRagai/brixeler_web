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

  const body = (await request.json().catch(() => null)) as { agentId?: string; reason?: string; reviewVersion?: number } | null;

  const agentId = body?.agentId?.trim();
  const reason = body?.reason?.trim();
  if (!agentId || !reason) {
    return NextResponse.json({ error: "Missing agentId or reason" }, { status: 400 });
  }

  const expectedVersion = typeof body?.reviewVersion === "number" && Number.isInteger(body.reviewVersion)
    ? body.reviewVersion
    : null;
  const { data, error } = await supabaseServer.rpc("review_agent_verification", {
    p_agent_id: agentId,
    p_reviewer_id: admin.adminId,
    p_decision: "request_changes",
    p_reason: reason,
    p_expected_review_version: expectedVersion,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  await logAdminActivity({
    adminId: admin.adminId,
    action: "user.verify_request_change",
    resourceType: "users_profile",
    resourceId: agentId,
    metadata: { reason, review_version: data?.review_version ?? null },
  });

  return NextResponse.json({ success: true, review: data });
}
