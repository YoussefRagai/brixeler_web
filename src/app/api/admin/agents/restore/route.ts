import { NextResponse } from "next/server";
import { getAdminContextFromRequest } from "@/lib/adminAuth";
import { hasAdminRole } from "@/lib/adminRoles";
import { restoreAgentAccess } from "@/lib/agentAccess";

export async function POST(request: Request) {
  const admin = await getAdminContextFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminRole(admin.roles, ["user_auth_admin"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { agentId?: unknown; reason?: unknown } | null;
  const agentId = typeof body?.agentId === "string" ? body.agentId.trim() : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!agentId || !reason || reason.length < 3 || reason.length > 1000) {
    return NextResponse.json({ error: "A reason between 3 and 1000 characters is required" }, { status: 400 });
  }

  return restoreAgentAccess(admin.adminId, agentId, reason, "archived");
}
