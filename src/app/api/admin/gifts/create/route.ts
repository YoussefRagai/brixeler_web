import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import { uploadFileToBucket, isFile, STORAGE_BUCKETS } from "@/lib/storageServer";
import { supabaseServer } from "@/lib/supabaseServer";
import { logAdminActivity } from "@/lib/adminQueries";
import { isGrowthUuid, parseLifecycleFields } from "@/lib/growthContracts";

function toStringArray(value: FormDataEntryValue | null): string[] {
  if (!value) return [];
  if (typeof value === "string") return [value];
  return [];
}

export async function POST(request: Request) {
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin?.adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const title = formData.get("title")?.toString().trim();
  const titleAr = formData.get("title_ar")?.toString().trim() || null;
  const description = formData.get("description")?.toString().trim() || null;
  const iconFile = formData.get("icon");
  const tierIds = formData.getAll("tier_ids").flatMap(toStringArray);
  const exclusivityMode = formData.get("exclusivity_mode")?.toString() || "none";
  const maxConcurrentRaw = formData.get("max_concurrent_claims")?.toString();
  const maxConcurrent = maxConcurrentRaw ? Number(maxConcurrentRaw) : null;
  const lifecycle = parseLifecycleFields({
    lifecycle_state: formData.get("lifecycle_state")?.toString() || "active",
    start_at: formData.get("start_at")?.toString() || null,
    end_at: formData.get("end_at")?.toString() || null,
  }, "active");
  const audienceId = formData.get("audience_id")?.toString().trim() || null;
  // Approval is a server-owned gate. A creator cannot self-approve a live
  // gift by submitting approval_status in the form.
  const approvalStatus = lifecycle.ok && ["active", "scheduled"].includes(lifecycle.value.lifecycle_state)
    ? "pending"
    : "not_required";
  const giftType = formData.get("gift_type")?.toString().trim() || "physical";
  const fulfillmentMethod = formData.get("fulfillment_method")?.toString().trim() || "manual";
  const valueAmountRaw = formData.get("value_amount")?.toString().trim() || "";
  const valueAmount = valueAmountRaw ? Number(valueAmountRaw) : null;
  const quantityRaw = formData.get("quantity")?.toString().trim() || "";
  const quantity = quantityRaw ? Number(quantityRaw) : null;
  const slaRaw = formData.get("fulfillment_sla_hours")?.toString().trim() || "";
  const fulfillmentSlaHours = slaRaw ? Number(slaRaw) : null;
  const maxTotalRaw = formData.get("max_total_claims")?.toString().trim() || "";
  const maxTotalClaims = maxTotalRaw ? Number(maxTotalRaw) : null;
  const claimWindowRaw = formData.get("claim_window_days")?.toString().trim() || "";
  const claimWindowDays = claimWindowRaw ? Number(claimWindowRaw) : null;

  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }
  if (!isFile(iconFile)) {
    return NextResponse.json({ error: "Icon is required" }, { status: 400 });
  }
  if (!lifecycle.ok) return NextResponse.json({ error: lifecycle.error }, { status: 400 });
  if (audienceId && !isGrowthUuid(audienceId)) return NextResponse.json({ error: "audience_id must be a UUID" }, { status: 400 });
  if (tierIds.some((tierId) => !isGrowthUuid(tierId))) return NextResponse.json({ error: "tier_ids must contain only UUIDs" }, { status: 400 });
  if (!["none", "eligible", "claimed"].includes(exclusivityMode)) return NextResponse.json({ error: "Invalid exclusivity_mode" }, { status: 400 });
  if (!["physical", "cash", "discount", "experience", "digital", "other"].includes(giftType)) return NextResponse.json({ error: "Invalid gift_type" }, { status: 400 });
  if (!["manual", "shipping", "wallet", "coupon", "external", "none"].includes(fulfillmentMethod)) return NextResponse.json({ error: "Invalid fulfillment_method" }, { status: 400 });
  for (const [field, value] of [["value_amount", valueAmount], ["quantity", quantity], ["fulfillment_sla_hours", fulfillmentSlaHours], ["max_total_claims", maxTotalClaims], ["claim_window_days", claimWindowDays]] as const) {
    if (value !== null && (!Number.isFinite(value) || value < 0 || (field !== "value_amount" && !Number.isInteger(value)) || (field !== "value_amount" && value === 0))) {
      return NextResponse.json({ error: `${field} is invalid` }, { status: 400 });
    }
  }
  if (maxConcurrent !== null && (!Number.isFinite(maxConcurrent) || !Number.isInteger(maxConcurrent) || maxConcurrent < 1)) {
    return NextResponse.json({ error: "max_concurrent_claims is invalid" }, { status: 400 });
  }

  const iconUrl = await uploadFileToBucket({
    bucket: STORAGE_BUCKETS.giftIcons,
    pathPrefix: "gifts",
    file: iconFile,
  });

  const { data, error } = await supabaseServer
    .from("gifts")
    .insert({
      title,
      title_ar: titleAr,
      description,
      icon_url: iconUrl,
      tier_ids: tierIds.length ? tierIds : [],
      exclusivity_mode: exclusivityMode,
      max_concurrent_claims: maxConcurrent,
      is_active: approvalStatus === "not_required" && (lifecycle.value.lifecycle_state === "active" || lifecycle.value.lifecycle_state === "scheduled"),
      audience_id: audienceId,
      lifecycle_state: lifecycle.value.lifecycle_state,
      start_at: lifecycle.value.start_at,
      end_at: lifecycle.value.end_at,
      created_by_admin: admin.adminId,
      updated_by_admin: admin.adminId,
      gift_type: giftType,
      value_amount: valueAmount,
      quantity,
      fulfillment_method: fulfillmentMethod,
      fulfillment_instructions: formData.get("fulfillment_instructions")?.toString().trim() || null,
      fulfillment_instructions_ar: formData.get("fulfillment_instructions_ar")?.toString().trim() || null,
      fulfillment_sla_hours: fulfillmentSlaHours,
      requires_approval: formData.get("requires_approval")?.toString() !== "false",
      terms: formData.get("terms")?.toString().trim() || null,
      terms_ar: formData.get("terms_ar")?.toString().trim() || null,
      metadata: { requires_second_approval: approvalStatus === "pending" },
      max_total_claims: maxTotalClaims,
      claim_window_days: claimWindowDays,
      approval_status: approvalStatus,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminActivity({
    adminId: admin.adminId,
    action: "gifts.create",
    resourceType: "gifts",
    resourceId: data?.id ?? null,
    metadata: { title },
  });

  return NextResponse.redirect(new URL("/gifts", request.url));
}
