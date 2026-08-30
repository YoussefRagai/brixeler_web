import { NextRequest, NextResponse } from "next/server";
import { getAdminContextFromRequest } from "@/lib/adminAuth";
import { hasAdminRole } from "@/lib/adminRoles";
import { logAdminActivity } from "@/lib/adminQueries";
import { supabaseServer } from "@/lib/supabaseServer";

function canUseSnapshot(admin: Awaited<ReturnType<typeof getAdminContextFromRequest>>, generatedBy: string) {
  return Boolean(admin && (admin.adminId === generatedBy || hasAdminRole(admin.roles, ["super_admin"])));
}

async function createSnapshot(adminId: string, agentId: string) {
  const { data, error } = await supabaseServer.rpc("create_agent_retention_snapshot", {
    p_agent_id: agentId,
    p_generated_by: adminId,
  });
  if (error) return { data: null, error };
  const result = data as { snapshot_id?: string } | null;
  return { data: result, error: null };
}

async function downloadSnapshot(request: NextRequest, admin: NonNullable<Awaited<ReturnType<typeof getAdminContextFromRequest>>>, snapshotId: string) {
  const { data: row, error } = await supabaseServer
    .from("agent_account_retention_snapshots")
    .select("id, agent_id, generated_by, generated_at, snapshot")
    .eq("id", snapshotId)
    .maybeSingle();
  if (error || !row) return NextResponse.json({ error: "Retained-data snapshot not found" }, { status: 404 });
  if (!canUseSnapshot(admin, row.generated_by)) return NextResponse.json({ error: "You cannot download this retained-data snapshot" }, { status: 403 });
  const { error: downloadError } = await supabaseServer
    .from("agent_account_retention_snapshots")
    .update({ downloaded_by: admin.adminId, downloaded_at: new Date().toISOString() })
    .eq("id", row.id);
  if (downloadError) return NextResponse.json({ error: "Snapshot download could not be recorded; try again" }, { status: 503 });

  await logAdminActivity({
    adminId: admin.adminId,
    action: "agent.retention_snapshot.downloaded",
    resourceType: "agent_account_retention_snapshot",
    resourceId: row.id,
    metadata: { agent_id: row.agent_id, generated_at: row.generated_at },
  });

  const snapshot = row.snapshot && typeof row.snapshot === "object" ? row.snapshot : {};
  const document = JSON.stringify({
    ...snapshot,
    snapshot_id: row.id,
    agent_id: row.agent_id,
    generated_by: row.generated_by,
    generated_at: row.generated_at,
  }, null, 2);
  const safeAgentId = row.agent_id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "agent";
  return new NextResponse(document, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="brixeler-agent-${safeAgentId}-retention-snapshot.json"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const admin = await getAdminContextFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminRole(admin.roles, ["user_auth_admin"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { agentId?: string } | null;
  const agentId = body?.agentId?.trim();
  if (!agentId) return NextResponse.json({ error: "Agent id is required" }, { status: 400 });

  const { data, error } = await createSnapshot(admin.adminId, agentId);
  if (error || !data?.snapshot_id) return NextResponse.json({ error: error?.message ?? "Unable to create retained-data snapshot" }, { status: 409 });
  await logAdminActivity({
    adminId: admin.adminId,
    action: "agent.retention_snapshot.created",
    resourceType: "agent_account_retention_snapshot",
    resourceId: data.snapshot_id,
    metadata: { agent_id: agentId, downloadable_before_purge: true },
  });
  return NextResponse.json({
    success: true,
    snapshotId: data.snapshot_id,
    downloadUrl: `/api/admin/agents/retained-snapshot?snapshotId=${encodeURIComponent(data.snapshot_id)}`,
  }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const admin = await getAdminContextFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminRole(admin.roles, ["user_auth_admin"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let snapshotId = request.nextUrl.searchParams.get("snapshotId")?.trim() || null;
  if (!snapshotId) {
    const agentId = request.nextUrl.searchParams.get("agentId")?.trim();
    if (!agentId) return NextResponse.json({ error: "Snapshot id or agent id is required" }, { status: 400 });
    const { data, error } = await createSnapshot(admin.adminId, agentId);
    if (error || !data?.snapshot_id) return NextResponse.json({ error: error?.message ?? "Unable to create retained-data snapshot" }, { status: 409 });
    snapshotId = data.snapshot_id;
    await logAdminActivity({
      adminId: admin.adminId,
      action: "agent.retention_snapshot.created",
      resourceType: "agent_account_retention_snapshot",
      resourceId: snapshotId,
      metadata: { agent_id: agentId, downloadable_before_purge: true },
    });
  }
  return downloadSnapshot(request, admin, snapshotId);
}
