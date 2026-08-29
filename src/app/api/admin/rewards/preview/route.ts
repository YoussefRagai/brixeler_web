import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import { growthErrorMessage, parseGrowthPreview, readGrowthJson } from "@/lib/growthContracts";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin?.adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await readGrowthJson(request);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  const parsed = parseGrowthPreview(body.value);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const payload = parsed.value;
  if (payload.target_type !== undefined && payload.target_type !== "tier" && payload.target_type !== "badge") {
    return NextResponse.json({ error: "target_type must be tier or badge" }, { status: 400 });
  }
  const { data, error } = await supabaseServer.rpc("preview_growth_rule", {
    p_target_type: payload.target_type ?? null,
    p_target_id: payload.target_id ?? null,
    p_audience_id: payload.audience_id ?? null,
    p_definition: payload.definition ?? null,
    p_metric: payload.metric ?? null,
    p_time_window: payload.time_window ?? payload.timeWindow ?? null,
    p_operator: payload.operator ?? null,
    p_value_single: payload.value_single ?? payload.value ?? null,
    p_value_min: payload.value_min ?? payload.min ?? null,
    p_value_max: payload.value_max ?? payload.max ?? null,
    p_filters: payload.filters ?? {},
    p_limit: payload.limit,
  });
  if (error) return NextResponse.json({ error: growthErrorMessage(error, "Unable to preview Growth rule") }, { status: 500 });
  return NextResponse.json(data ?? { count: 0, recipients: [], sample: [], warnings: [] });
}
