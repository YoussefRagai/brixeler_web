import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import { growthErrorMessage, readGrowthJson } from "@/lib/growthContracts";
import { supabaseServer } from "@/lib/supabaseServer";

const SCOPES = new Set(["all", "gifts", "rewards", "audiences"]);

export async function GET() {
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin?.adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabaseServer
    .from("growth_evaluation_runs")
    .select("*")
    .order("requested_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: growthErrorMessage(error, "Unable to load Growth evaluations") }, { status: 500 });
  return NextResponse.json({ runs: data ?? [] });
}

export async function POST(request: Request) {
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin?.adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await readGrowthJson(request);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  const scope = typeof body.value.scope === "string" ? body.value.scope : "all";
  if (!SCOPES.has(scope)) return NextResponse.json({ error: "Invalid Growth evaluation scope" }, { status: 400 });
  if (body.value.dry_run !== undefined && typeof body.value.dry_run !== "boolean") {
    return NextResponse.json({ error: "dry_run must be boolean" }, { status: 400 });
  }
  const dryRun = body.value.dry_run ?? true;
  const { data, error } = await supabaseServer.rpc("run_growth_evaluation", {
    p_scope: scope,
    p_dry_run: dryRun,
    p_requested_by_admin: admin.adminId,
  });
  if (error) return NextResponse.json({ error: growthErrorMessage(error, "Unable to run Growth evaluation") }, { status: 500 });
  return NextResponse.json(data ?? { status: "succeeded", dry_run: dryRun });
}
