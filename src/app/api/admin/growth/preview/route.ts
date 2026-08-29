import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import { growthErrorMessage, parseGrowthPreview, readGrowthJson } from "@/lib/growthContracts";
import { supabaseServer } from "@/lib/supabaseServer";

function value(body: Record<string, unknown>, key: string, fallback: unknown = null) {
  return body[key] === undefined ? fallback : body[key];
}

export async function POST(request: Request) {
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin?.adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await readGrowthJson(request);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  const parsed = parseGrowthPreview(body.value);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const payload = parsed.value;
  const { data, error } = await supabaseServer.rpc("preview_growth_rule", {
    p_target_type: value(payload, "target_type"),
    p_target_id: value(payload, "target_id"),
    p_audience_id: value(payload, "audience_id"),
    p_definition: value(payload, "definition"),
    p_metric: value(payload, "metric"),
    p_time_window: value(payload, "time_window", value(payload, "timeWindow")),
    p_operator: value(payload, "operator"),
    p_value_single: value(payload, "value_single", value(payload, "value")),
    p_value_min: value(payload, "value_min", value(payload, "min")),
    p_value_max: value(payload, "value_max", value(payload, "max")),
    p_filters: value(payload, "filters", {}),
    p_limit: payload.limit,
  });
  if (error) return NextResponse.json({ error: growthErrorMessage(error, "Unable to preview Growth rule") }, { status: 500 });
  return NextResponse.json(data ?? { count: 0, recipients: [], sample: [], warnings: [] });
}
