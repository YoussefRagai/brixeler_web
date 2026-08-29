import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import { growthErrorMessage, isGrowthUuid, parseAudienceDefinition, readGrowthJson } from "@/lib/growthContracts";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin?.adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await readGrowthJson(request);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  const audienceId = body.value.audience_id;
  const definition = body.value.definition;
  if (audienceId !== undefined && audienceId !== null && !isGrowthUuid(audienceId)) {
    return NextResponse.json({ error: "audience_id must be a UUID" }, { status: 400 });
  }
  if (audienceId === undefined && definition === undefined) {
    return NextResponse.json({ error: "audience_id or definition is required" }, { status: 400 });
  }
  if (definition !== undefined) {
    const parsed = parseAudienceDefinition(definition);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const limit = typeof body.value.limit === "number" ? Math.max(1, Math.min(100, Math.trunc(body.value.limit))) : 25;
  const { data, error } = await supabaseServer.rpc("preview_growth_audience", {
    p_audience_id: audienceId ?? null,
    p_definition: definition ?? null,
    p_limit: limit,
  });
  if (error) return NextResponse.json({ error: growthErrorMessage(error, "Unable to preview audience") }, { status: 500 });
  return NextResponse.json(data ?? { count: 0, recipients: [], sample: [], warnings: [] });
}
