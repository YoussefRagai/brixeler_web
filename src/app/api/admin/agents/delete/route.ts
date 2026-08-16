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

  let body: { agentId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const agentId = body.agentId;
  if (!agentId) return NextResponse.json({ error: "Missing agentId" }, { status: 400 });

  const { error } = await supabaseServer.auth.admin.deleteUser(agentId);
  if (error) return NextResponse.json({ error: "Delete failed" }, { status: 500 });

  await logAdminActivity({
    adminId: admin.adminId,
    action: "agent.delete",
    resourceType: "users_profile",
    resourceId: agentId,
  });

  return NextResponse.json({ success: true });
}
