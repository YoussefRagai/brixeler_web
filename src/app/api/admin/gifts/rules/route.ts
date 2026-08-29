import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { logAdminActivity } from "@/lib/adminQueries";
import { growthErrorMessage, isGrowthUuid, parseGrowthRule, readGrowthJson } from "@/lib/growthContracts";

export async function POST(request: Request) {
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin?.adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readGrowthJson(request);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  const payload = body.value;
  const giftId = payload.gift_id;
  if (!isGrowthUuid(giftId)) return NextResponse.json({ error: "gift_id must be a UUID" }, { status: 400 });
  const parsed = parseGrowthRule(payload);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  // Approval is derived from lifecycle and never trusted from the creator's
  // request body. Draft/paused/archived rules can be edited before review;
  // live-intended rules must pass the approval gate.
  const approvalStatus = parsed.value.lifecycle_state === "active" || parsed.value.lifecycle_state === "scheduled" ? "pending" : "not_required";
  const { data: gift, error: giftError } = await supabaseServer.from("gifts").select("id").eq("id", giftId).maybeSingle();
  if (giftError) return NextResponse.json({ error: growthErrorMessage(giftError, "Unable to validate gift") }, { status: 500 });
  if (!gift) return NextResponse.json({ error: "Gift not found" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("gift_rules")
    .insert({
      gift_id: giftId,
      metric: parsed.value.metric,
      time_window: parsed.value.time_window,
      operator: parsed.value.operator,
      value_single: parsed.value.value_single ?? null,
      value_min: parsed.value.value_min ?? null,
      value_max: parsed.value.value_max ?? null,
      filters: parsed.value.filters,
      is_active: approvalStatus === "not_required" && (parsed.value.lifecycle_state === "active" || parsed.value.lifecycle_state === "scheduled"),
      audience_id: parsed.value.audience_id,
      lifecycle_state: parsed.value.lifecycle_state,
      start_at: parsed.value.start_at,
      end_at: parsed.value.end_at,
      reason: typeof payload.reason === "string" ? payload.reason.trim().slice(0, 500) || null : null,
      metadata: { requires_second_approval: approvalStatus === "pending" },
      created_by_admin: admin.adminId,
      updated_by_admin: admin.adminId,
      approval_status: approvalStatus,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: growthErrorMessage(error, "Unable to create gift rule") }, { status: 400 });
  }

  await logAdminActivity({
    adminId: admin.adminId,
    action: "gifts.rule.create",
    resourceType: "gift_rules",
    resourceId: data?.id ?? null,
    metadata: { gift_id: giftId, metric: parsed.value.metric },
  });

  return NextResponse.json({ ok: true });
}
