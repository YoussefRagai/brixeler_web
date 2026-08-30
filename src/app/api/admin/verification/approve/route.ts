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

  const body = (await request.json().catch(() => null)) as { agentId?: string; reviewVersion?: number } | null;

  const agentId = body?.agentId?.trim();
  if (!agentId) return NextResponse.json({ error: "Missing agentId" }, { status: 400 });

  const expectedVersion = typeof body?.reviewVersion === "number" && Number.isInteger(body.reviewVersion)
    ? body.reviewVersion
    : null;
  const { data, error } = await supabaseServer.rpc("review_agent_verification", {
    p_agent_id: agentId,
    p_reviewer_id: admin.adminId,
    p_decision: "approved",
    p_reason: null,
    p_expected_review_version: expectedVersion,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  await logAdminActivity({
    adminId: admin.adminId,
    action: "user.verify",
    resourceType: "users_profile",
    resourceId: agentId,
    metadata: { review_version: data?.review_version ?? null, document_count: data?.document_count ?? null },
  });

  return NextResponse.json({ success: true, review: data });
}
