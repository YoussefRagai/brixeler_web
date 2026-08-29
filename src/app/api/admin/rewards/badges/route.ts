import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import { uploadFileToBucket, isFile, STORAGE_BUCKETS } from "@/lib/storageServer";
import { supabaseServer } from "@/lib/supabaseServer";
import { logAdminActivity } from "@/lib/adminQueries";
import { growthErrorMessage, isGrowthUuid, parseLifecycleFields } from "@/lib/growthContracts";

const BADGE_TYPES = ["special", "deal_milestone", "earnings", "referrals", "speed", "contributions"] as const;

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
  const description = formText(formData, "description", 2000);
  const badgeType = formText(formData, "badge_type", 40) ?? "special";
  const iconFile = formData.get("icon");
  const lifecycle = parseLifecycleFields({
    lifecycle_state: formText(formData, "lifecycle_state", 30) ?? formText(formData, "lifecycle_status", 30) ?? "active",
    start_at: formText(formData, "start_at", 80),
    end_at: formText(formData, "end_at", 80),
  }, "active");
  const audienceId = formText(formData, "audience_id", 80);
  const visibility = formText(formData, "visibility", 20) ?? "public";
  const repeatability = formText(formData, "repeatability", 20) ?? "once";
  const revocationPolicy = formText(formData, "revocation_policy", 20) ?? "keep";
  const expiryMode = formText(formData, "expiry_mode", 20) ?? "permanent";
  const expiresRaw = formText(formData, "expires_in_days", 20);
  const expiresInDays = expiresRaw ? Number(expiresRaw) : null;
  const priorityRaw = formText(formData, "display_order", 20) ?? formText(formData, "priority", 20);
  const priority = priorityRaw ? Number(priorityRaw) : 0;
  const benefitType = formText(formData, "benefit_type", 40) ?? "none";
  const benefitValueRaw = formText(formData, "benefit_value", 30);
  const benefitValue = benefitValueRaw ? Number(benefitValueRaw) : null;
  const benefitDescription = formText(formData, "benefit_description", 1000);
  // Live badges use the same independent approval gate as other Growth
  // resources. Existing/paused/draft-compatible rows remain not_required.
  const approvalStatus = lifecycle.ok && ["active", "scheduled"].includes(lifecycle.value.lifecycle_state) ? "pending" : "not_required";

  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });
  if (!isFile(iconFile)) return NextResponse.json({ error: "Icon is required" }, { status: 400 });
  if (!lifecycle.ok) return NextResponse.json({ error: lifecycle.error }, { status: 400 });
  if (!BADGE_TYPES.includes(badgeType as (typeof BADGE_TYPES)[number])) return NextResponse.json({ error: "Invalid badge_type" }, { status: 400 });
  if (audienceId && !isGrowthUuid(audienceId)) return NextResponse.json({ error: "audience_id must be a UUID" }, { status: 400 });
  if (!["public", "private", "hidden"].includes(visibility)) return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
  if (!["once", "renewable"].includes(repeatability)) return NextResponse.json({ error: "Invalid repeatability" }, { status: 400 });
  if (!["keep", "revoke", "review"].includes(revocationPolicy)) return NextResponse.json({ error: "Invalid revocation_policy" }, { status: 400 });
  if (!["permanent", "days"].includes(expiryMode)) return NextResponse.json({ error: "Invalid expiry_mode" }, { status: 400 });
  if (expiryMode === "days" && (expiresInDays === null || !Number.isInteger(expiresInDays) || expiresInDays < 1)) return NextResponse.json({ error: "expires_in_days must be a positive integer" }, { status: 400 });
  if (expiryMode === "permanent" && expiresInDays !== null) return NextResponse.json({ error: "Permanent badges cannot include expires_in_days" }, { status: 400 });
  if (!Number.isInteger(priority) || priority < 0) return NextResponse.json({ error: "priority must be a non-negative integer" }, { status: 400 });
  if (benefitValue !== null && (!Number.isFinite(benefitValue) || benefitValue < 0)) return NextResponse.json({ error: "benefit_value must be a non-negative number" }, { status: 400 });

  const iconUrl = await uploadFileToBucket({ bucket: STORAGE_BUCKETS.badgeIcons, pathPrefix: "badges", file: iconFile });
  const metadata = {
    repeatability,
    revocation_policy: revocationPolicy,
    benefit_value: benefitValue,
    benefit_description: benefitDescription,
    requires_second_approval: approvalStatus === "pending",
  };
  const { data, error } = await supabaseServer
    .from("badges")
    .insert({
      name,
      name_ar: nameAr,
      description,
      icon_url: iconUrl,
      badge_type: badgeType,
      unlock_criteria: { type: "rule" },
      expires_in_days: expiryMode === "days" ? expiresInDays : null,
      is_active: approvalStatus === "not_required" && (lifecycle.value.lifecycle_state === "active" || lifecycle.value.lifecycle_state === "scheduled"),
      audience_id: audienceId || null,
      lifecycle_state: lifecycle.value.lifecycle_state,
      start_at: lifecycle.value.start_at,
      end_at: lifecycle.value.end_at,
      is_repeatable: repeatability === "renewable",
      visibility,
      priority,
      is_revocable: revocationPolicy !== "keep",
      benefit_type: benefitType,
      benefit_value: benefitValue,
      benefit_description: benefitDescription,
      metadata,
      approval_status: approvalStatus,
      created_by_admin: admin.adminId,
      updated_by_admin: admin.adminId,
      published_at: lifecycle.value.lifecycle_state === "active" ? new Date().toISOString() : null,
    })
    .select("id, name, lifecycle_state, visibility, is_repeatable, priority")
    .single();
  if (error) return NextResponse.json({ error: growthErrorMessage(error, "Unable to create badge") }, { status: 400 });

  await logAdminActivity({ adminId: admin.adminId, action: "rewards.badge.create", resourceType: "badges", resourceId: data?.id ?? null, metadata: { name, lifecycle_state: lifecycle.value.lifecycle_state, approval_status: approvalStatus } });
  return NextResponse.redirect(new URL("/rewards", request.url));
}
