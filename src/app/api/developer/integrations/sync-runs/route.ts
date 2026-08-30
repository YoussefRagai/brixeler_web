import { NextResponse } from "next/server";
import { DeveloperCapabilityError, requireDeveloperCapability } from "@/lib/developerAuth";
import { fetchDeveloperIntegrations } from "@/lib/developerSalesOps";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  let session;
  try {
    session = await requireDeveloperCapability("manage_integrations");
  } catch (error) {
    if (error instanceof DeveloperCapabilityError) {
      return NextResponse.json({ error: "Integration management is restricted to company super admins." }, { status: 403 });
    }
    throw error;
  }
  const integrations = await fetchDeveloperIntegrations(session.developerId);
  return NextResponse.json({ syncRuns: integrations.syncRuns, pendingWebhookDeliveries: integrations.pendingWebhookDeliveries }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  let session;
  try {
    session = await requireDeveloperCapability("manage_integrations");
  } catch (error) {
    if (error instanceof DeveloperCapabilityError) {
      return NextResponse.json({ error: "Integration management is restricted to company super admins." }, { status: 403 });
    }
    throw error;
  }
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const scheduleId = typeof body.scheduleId === "string" ? body.scheduleId.trim() : "";
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim().slice(0, 200) : "";
  const sourceChecksum = typeof body.sourceChecksum === "string" ? body.sourceChecksum.trim().slice(0, 200) || null : null;
  if (!scheduleId || !idempotencyKey) return NextResponse.json({ error: "Schedule and idempotency key are required." }, { status: 400 });
  if (body.mode !== "dry_run") return NextResponse.json({ error: "Only configuration-only dry runs are available until a provider is connected." }, { status: 409 });
  const { data, error } = await supabaseServer.rpc("create_developer_sync_run", {
    p_developer_id: session.developerId,
    p_actor_account_id: session.accountId,
    p_schedule_id: scheduleId,
    p_mode: "dry_run",
    p_idempotency_key: idempotencyKey,
    p_source_checksum: sourceChecksum,
  });
  if (error || !data) {
    console.warn("Developer sync run creation failed", error);
    return NextResponse.json({ error: error?.message || "Unable to create the dry-run record." }, { status: 409 });
  }
  return NextResponse.json({ run: data }, { status: 201 });
}
