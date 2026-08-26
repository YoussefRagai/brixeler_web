import { NextResponse } from "next/server";
import { getAdminContextFromRequest } from "@/lib/adminAuth";
import { hasAdminRole } from "@/lib/adminRoles";
import { logAdminActivity } from "@/lib/adminQueries";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  const admin = await getAdminContextFromRequest(request);
  if (!admin || !hasAdminRole(admin.roles, ["user_auth_admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { agentId?: string; note?: string } | null;
  const agentId = body?.agentId;
  const note = body?.note?.trim();
  if (!agentId || !note) return NextResponse.json({ error: "Agent and note are required" }, { status: 400 });
  const { data, error } = await supabaseServer
    .from("admin_agent_notes")
    .insert({ agent_id: agentId, note, created_by: admin.adminId, is_demo: false })
    .select("id, note, created_at, created_by, is_demo")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await logAdminActivity({ adminId: admin.adminId, action: "agent_note_added", resourceType: "agent", resourceId: agentId });
  return NextResponse.json({ note: data });
}
