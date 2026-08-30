import { NextResponse } from "next/server";
import { DeveloperCapabilityError, requireDeveloperCapability } from "@/lib/developerAuth";
import { fetchDeveloperIntegrations } from "@/lib/developerSalesOps";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const SOURCE_KINDS = ["manual_file", "api_contract", "sftp_contract"] as const;
const CADENCES = ["manual", "hourly", "daily", "weekly"] as const;
const IDEMPOTENCY = ["source_key", "checksum", "external_id"] as const;
const CONFLICTS = ["flag_for_review", "skip_existing", "update_existing"] as const;

function allowed<T extends readonly string[]>(values: T, value: unknown, fallback: T[number]) {
  return typeof value === "string" && values.includes(value) ? value : fallback;
}

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
  return NextResponse.json({ schedules: integrations.schedules, mappings: integrations.mappings }, { headers: { "Cache-Control": "private, no-store" } });
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
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const sourceLabel = typeof body.sourceLabel === "string" ? body.sourceLabel.trim() : "";
  if (!name || name.length > 120 || !sourceLabel || sourceLabel.length > 200) {
    return NextResponse.json({ error: "Add a schedule name and source label." }, { status: 400 });
  }
  const sourceKind = allowed(SOURCE_KINDS, body.sourceKind, "manual_file");
  const cadence = allowed(CADENCES, body.cadence, "manual");
  const idempotencyStrategy = allowed(IDEMPOTENCY, body.idempotencyStrategy, "source_key");
  const conflictStrategy = allowed(CONFLICTS, body.conflictStrategy, "flag_for_review");
  const timezone = typeof body.timezone === "string" && body.timezone.trim().length <= 100 ? body.timezone.trim() : "UTC";
  const { data, error } = await supabaseServer.rpc("create_developer_import_schedule", {
    p_developer_id: session.developerId,
    p_actor_account_id: session.accountId,
    p_name: name,
    p_source_kind: sourceKind,
    p_source_label: sourceLabel,
    p_cadence: cadence,
    p_timezone: timezone,
    p_dry_run_default: body.dryRunDefault !== false,
    p_idempotency_strategy: idempotencyStrategy,
    p_conflict_strategy: conflictStrategy,
  });
  if (error || !data) {
    console.warn("Developer import schedule creation failed", error);
    return NextResponse.json({ error: error?.message || "Unable to create this schedule." }, { status: 409 });
  }
  const mappingInput = Array.isArray(body.mappings) ? body.mappings : [];
  const mappings = mappingInput
    .filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value)))
    .map((mapping) => ({
      developer_id: session.developerId,
      schedule_id: data,
      source_field: typeof mapping.sourceField === "string" ? mapping.sourceField.trim().slice(0, 120) : "",
      target_field: typeof mapping.targetField === "string" ? mapping.targetField.trim().slice(0, 120) : "",
      transform: typeof mapping.transform === "string" ? mapping.transform.trim().slice(0, 500) || null : null,
      is_required: mapping.isRequired === true,
    }))
    .filter((mapping) => mapping.source_field && mapping.target_field);
  if (mappings.length) {
    const { error: mappingError } = await supabaseServer.from("developer_integration_field_mappings").insert(mappings);
    if (mappingError) {
      console.warn("Developer import mapping creation failed", mappingError);
      const { error: rollbackError } = await supabaseServer
        .from("developer_import_schedules")
        .delete()
        .eq("id", data)
        .eq("developer_id", session.developerId);
      if (rollbackError) {
        console.error("Developer import schedule rollback failed after mapping creation error", rollbackError);
        return NextResponse.json({ error: "Field mappings failed and the schedule could not be rolled back. Contact support before retrying." }, { status: 500 });
      }
      return NextResponse.json({ error: "Schedule and field mappings could not be saved." }, { status: 409 });
    }
  }
  return NextResponse.json({ ok: true, scheduleId: data }, { status: 201 });
}
