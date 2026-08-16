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

  let body: { agentId?: string; reason?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const agentId = body.agentId;
  const reason = body.reason?.trim();
  if (!agentId || !reason) {
    return NextResponse.json({ error: "Missing agentId or reason" }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from("users_profile")
    .update({ verification_status: "pending", verification_rejection_reason: reason })
    .eq("id", agentId);

  if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  await logAdminActivity({
    adminId: admin.adminId,
    action: "user.verify_request_change",
    resourceType: "users_profile",
    resourceId: agentId,
    metadata: { reason },
  });

  return NextResponse.json({ success: true });
}
