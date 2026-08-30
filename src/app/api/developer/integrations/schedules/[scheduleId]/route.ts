import { NextResponse } from "next/server";
import { DeveloperCapabilityError, requireDeveloperCapability } from "@/lib/developerAuth";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, context: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await context.params;
  if (!UUID_PATTERN.test(scheduleId)) return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
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
  if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "Enabled must be a boolean." }, { status: 400 });
  const { data, error } = await supabaseServer
    .from("developer_import_schedules")
    .update({ enabled: body.enabled, updated_at: new Date().toISOString() })
    .eq("id", scheduleId)
    .eq("developer_id", session.developerId)
    .select("id, enabled")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message || "Unable to update this schedule." }, { status: 409 });
  if (!data) return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
  return NextResponse.json({ ok: true, schedule: data });
}
