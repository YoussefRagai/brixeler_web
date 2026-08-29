import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import { uploadFileToBucket, isFile, STORAGE_BUCKETS } from "@/lib/storageServer";
import { supabaseServer } from "@/lib/supabaseServer";
import { logAdminActivity } from "@/lib/adminQueries";
import { growthErrorMessage, isGrowthUuid, parseLifecycleFields } from "@/lib/growthContracts";

const BENEFIT_TYPES = ["none", "commission_boost", "priority_support", "custom"] as const;
const STACKING_MODES = ["exclusive", "additive", "highest_only", "none"] as const;
const REVIEW_WINDOWS = ["all_time", "last_30d", "last_90d", "quarter", "year", "never", "monthly", "quarterly", "yearly", "custom"] as const;
const PROMOTION_METRICS = ["deals_count", "revenue", "referrals"] as const;

function formText(formData: FormData, key: string, max: number) {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export async function POST(request: Request) {
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin?.adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const formData = await request.formData();
  const name = formText(formData, "name", 100);
  const nameAr = formText(formData, "name_ar", 100);
  const levelRaw = formText(formData, "level", 20);
  const level = levelRaw ? Number(levelRaw) : Number.NaN;
  const description = formText(formData, "description", 2000);
  const benefitType = formText(formData, "benefitType", 40) ?? "none";
  const benefitValueRaw = formText(formData, "benefitValue", 30);
  const benefitValue = benefitValueRaw ? Number(benefitValueRaw) : null;
  const benefitDescription = formText(formData, "benefitDescription", 1000);
  const demotionPolicy = formText(formData, "demotion_policy", 20) ?? "hold";
  const reviewWindow = formText(formData, "review_window", 20) ?? "quarterly";
  const promotionMetric = formText(formData, "promotion_metric", 40) ?? "deals_count";
  const promotionThresholdRaw = formText(formData, "promotion_threshold", 30);
  const promotionThreshold = promotionThresholdRaw ? Number(promotionThresholdRaw) : Number.NaN;
  const stackingInput = formText(formData, "benefit_stacking", 30) ?? "highest_only";
  const stackingMode = stackingInput === "stack" ? "additive" : stackingInput === "review" ? "exclusive" : stackingInput;
  const resetPeriod = reviewWindow === "all_time" || reviewWindow === "never" ? "never" : reviewWindow === "last_30d" || reviewWindow === "monthly" ? "monthly" : reviewWindow === "year" || reviewWindow === "yearly" ? "yearly" : reviewWindow === "quarter" || reviewWindow === "quarterly" || reviewWindow === "last_90d" ? "quarterly" : "custom";
  const audienceId = formText(formData, "audience_id", 80);
  const lifecycle = parseLifecycleFields({
    lifecycle_state: formText(formData, "lifecycle_state", 30) ?? formText(formData, "lifecycle_status", 30) ?? "active",
    start_at: formText(formData, "start_at", 80),
    end_at: formText(formData, "end_at", 80),
  }, "active");
  // Approval is derived server-side. Commission tiers and all other live
  // tiers require an independent approval before they become visible.
  const approvalStatus = lifecycle.ok && ["active", "scheduled"].includes(lifecycle.value.lifecycle_state) ? "pending" : "not_required";

  if (!name || !Number.isInteger(level) || level < 1) return NextResponse.json({ error: "Missing name or level" }, { status: 400 });
  if (!isFile(formData.get("icon"))) return NextResponse.json({ error: "Icon is required" }, { status: 400 });
  if (!lifecycle.ok) return NextResponse.json({ error: lifecycle.error }, { status: 400 });
  if (!(BENEFIT_TYPES as readonly string[]).includes(benefitType)) return NextResponse.json({ error: "Invalid benefit type" }, { status: 400 });
  if (benefitValue !== null && (!Number.isFinite(benefitValue) || benefitValue < 0)) return NextResponse.json({ error: "benefitValue must be a non-negative number" }, { status: 400 });
  if (audienceId && !isGrowthUuid(audienceId)) return NextResponse.json({ error: "audience_id must be a UUID" }, { status: 400 });
  if (!(REVIEW_WINDOWS as readonly string[]).includes(reviewWindow)) return NextResponse.json({ error: "Invalid review_window" }, { status: 400 });
  if (!(PROMOTION_METRICS as readonly string[]).includes(promotionMetric)) return NextResponse.json({ error: "Invalid promotion_metric" }, { status: 400 });
  if (!Number.isFinite(promotionThreshold) || promotionThreshold < 1) return NextResponse.json({ error: "promotion_threshold must be a positive number" }, { status: 400 });
  if (!(STACKING_MODES as readonly string[]).includes(stackingMode)) return NextResponse.json({ error: "Invalid benefit_stacking" }, { status: 400 });
  if (!["hold", "demote", "reset"].includes(demotionPolicy)) return NextResponse.json({ error: "Invalid demotion_policy" }, { status: 400 });

  const iconUrl = await uploadFileToBucket({ bucket: STORAGE_BUCKETS.tierIcons, pathPrefix: "tiers", file: formData.get("icon") as File });
  const metadata = {
    demotion_policy: demotionPolicy,
    review_window: reviewWindow,
    benefit_stacking: stackingInput,
    requires_second_approval: approvalStatus === "pending",
  };
  const { data, error } = await supabaseServer
    .from("tiers")
    .insert({
      name,
      name_ar: nameAr,
      level,
      icon_url: iconUrl,
      description,
      benefit_type: benefitType,
      benefit_value: benefitValue,
      benefit_description: benefitDescription,
      is_active: approvalStatus === "not_required" && (lifecycle.value.lifecycle_state === "active" || lifecycle.value.lifecycle_state === "scheduled"),
      audience_id: audienceId || null,
      lifecycle_state: lifecycle.value.lifecycle_state,
      start_at: lifecycle.value.start_at,
      end_at: lifecycle.value.end_at,
      promotion_criteria: { metric: promotionMetric, operator: ">=", value_single: promotionThreshold, metric_window: reviewWindow },
      demotion_criteria: { policy: demotionPolicy },
      reset_period: resetPeriod,
      stacking_mode: stackingMode,
      stacking_priority: 0,
      carry_over: stackingMode === "additive",
      metadata,
      created_by_admin: admin.adminId,
      updated_by_admin: admin.adminId,
      published_at: lifecycle.value.lifecycle_state === "active" ? new Date().toISOString() : null,
      approval_status: approvalStatus,
    })
    .select("id, name, level, lifecycle_state, approval_status, version")
    .single();
  if (error) return NextResponse.json({ error: growthErrorMessage(error, "Unable to create tier") }, { status: 400 });

  await logAdminActivity({ adminId: admin.adminId, action: "rewards.tier.create", resourceType: "tiers", resourceId: data?.id ?? null, metadata: { name, level, lifecycle_state: lifecycle.value.lifecycle_state, approval_status: approvalStatus } });
  return NextResponse.redirect(new URL("/rewards", request.url));
}
