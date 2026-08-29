import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { logAdminActivity } from "@/lib/adminQueries";
import { growthErrorMessage, isGrowthUuid, parseGrowthRule, readGrowthJson } from "@/lib/growthContracts";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin?.adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readGrowthJson(request);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  const payload = body.value;
  const parsed = parseGrowthRule(payload);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const targetType = parsed.value.target_type;
  const targetId = parsed.value.target_id;
  if (targetType === undefined || !targetId) {
    return NextResponse.json({ error: "target_type and target_id are required" }, { status: 400 });
  }
  if (!isGrowthUuid(targetId)) return NextResponse.json({ error: "target_id must be a UUID" }, { status: 400 });

  const lifecycleState = parsed.value.lifecycle_state;
  // A creator may request a draft, but may not submit an approved rule. Any
  // rule intended to run is pending until an independent approval action.
  const approvalValue = lifecycleState === "active" || lifecycleState === "scheduled" ? "pending" : "not_required";
  const metadata: Record<string, unknown> = isObject(payload.metadata) ? { ...payload.metadata } : {};
  if (isObject(payload.tier_policy)) metadata.tier_policy = payload.tier_policy;
  if (isObject(payload.badge_policy)) metadata.badge_policy = payload.badge_policy;
  metadata.requires_second_approval = approvalValue === "pending";

  const targetTable = targetType === "tier" ? "tiers" : "badges";
  const { data: target, error: targetError } = await supabaseServer
    .from(targetTable)
    .select("id")
    .eq("id", targetId)
    .maybeSingle();
  if (targetError) return NextResponse.json({ error: growthErrorMessage(targetError, "Unable to validate reward target") }, { status: 500 });
  if (!target) return NextResponse.json({ error: "Reward target not found" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("admin_rules")
    .insert({
      target_type: targetType,
      target_id: targetId,
      metric: parsed.value.metric,
      time_window: parsed.value.time_window,
      operator: parsed.value.operator,
      value_min: parsed.value.value_min ?? null,
      value_max: parsed.value.value_max ?? null,
      value_single: parsed.value.value_single ?? null,
      filters: parsed.value.filters,
      is_active: approvalValue === "not_required" && (lifecycleState === "active" || lifecycleState === "scheduled"),
      created_by_admin: admin.adminId,
      updated_by_admin: admin.adminId,
      audience_id: parsed.value.audience_id ?? null,
      lifecycle_state: lifecycleState,
      start_at: parsed.value.start_at,
      end_at: parsed.value.end_at,
      reason: typeof payload.reason === "string" ? payload.reason.trim().slice(0, 500) || null : null,
      metadata,
      approval_status: approvalValue,
    })
    .select("id, target_type, target_id, lifecycle_state, approval_status, version")
    .single();

  if (error) return NextResponse.json({ error: growthErrorMessage(error, "Unable to create reward rule") }, { status: 400 });

  await logAdminActivity({
    adminId: admin.adminId,
    action: "rewards.rule.create",
    resourceType: "admin_rules",
    resourceId: data?.id ?? null,
    metadata: { target_type: targetType, metric: parsed.value.metric, lifecycle_state: lifecycleState, approval_status: approvalValue },
  });

  return NextResponse.json({ id: data?.id, rule: data, approval_status: approvalValue, lifecycle_state: lifecycleState });
}
