import { NextResponse } from "next/server";
import { DeveloperCapabilityError, requireDeveloperCapability } from "@/lib/developerAuth";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const sourceField = typeof body.sourceField === "string" ? body.sourceField.trim() : "";
  const targetField = typeof body.targetField === "string" ? body.targetField.trim() : "";
  const transform = typeof body.transform === "string" ? body.transform.trim().slice(0, 500) || null : null;
  if (!UUID_PATTERN.test(scheduleId) || !sourceField || sourceField.length > 120 || !targetField || targetField.length > 120) {
    return NextResponse.json({ error: "Schedule, source field, and target field are required." }, { status: 400 });
  }
  const { data: schedule, error: scheduleError } = await supabaseServer.from("developer_import_schedules").select("id").eq("id", scheduleId).eq("developer_id", session.developerId).maybeSingle();
  if (scheduleError) return NextResponse.json({ error: "Unable to validate this schedule." }, { status: 503 });
  if (!schedule) return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
  const { data, error } = await supabaseServer.from("developer_integration_field_mappings").insert({
    developer_id: session.developerId,
    schedule_id: scheduleId,
    source_field: sourceField,
    target_field: targetField,
    transform,
    is_required: body.isRequired === true,
  }).select("id, schedule_id, source_field, target_field, transform, is_required").maybeSingle();
  if (error || !data) return NextResponse.json({ error: error?.message || "Unable to save this field mapping." }, { status: 409 });
  return NextResponse.json({ mapping: data }, { status: 201 });
}
