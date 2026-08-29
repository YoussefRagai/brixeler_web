import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import { logAdminActivity } from "@/lib/adminQueries";
import { growthErrorMessage, parseApprovalInput, readGrowthJson } from "@/lib/growthContracts";
import { supabaseServer } from "@/lib/supabaseServer";

const TABLES = {
  audience: { table: "growth_audiences", columns: "id, approval_status, metadata, lifecycle_state, created_by, updated_by, created_by_admin, updated_by_admin" },
  gift: { table: "gifts", columns: "id, approval_status, audience_id, metadata, lifecycle_state, is_active, created_by_admin, updated_by_admin" },
  gift_rule: { table: "gift_rules", columns: "id, approval_status, audience_id, metadata, lifecycle_state, is_active, created_by_admin, updated_by_admin" },
  admin_rule: { table: "admin_rules", columns: "id, approval_status, audience_id, metadata, lifecycle_state, is_active, created_by_admin, updated_by_admin" },
  tier: { table: "tiers", columns: "id, approval_status, audience_id, metadata, lifecycle_state, is_active, created_by_admin, updated_by_admin" },
  badge: { table: "badges", columns: "id, approval_status, audience_id, metadata, lifecycle_state, is_active, created_by_admin, updated_by_admin" },
  notification_campaign: { table: "notification_campaigns", columns: "id, approval_status, audience_id, metadata, lifecycle_state, created_by, updated_by" },
} as const;

export async function POST(request: Request) {
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin?.adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await readGrowthJson(request);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  const parsed = parseApprovalInput(body.value);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { entity_type: entityType, entity_id: entityId, decision, rejection_reason: rejectionReason } = parsed.value;

  // Commission-affecting tiers/rules require a super admin. Marketing admins
  // can prepare and reject other records, but approval of any broad campaign
  // must remain a super-admin action even when it uses the legacy audience
  // presets instead of audience_id.
  if (["tier", "gift_rule", "admin_rule"].includes(entityType) && !admin.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Only a super admin can approve commission-affecting Growth changes" }, { status: 403 });
  }

  const resource = TABLES[entityType];
  // The table map constrains the writable targets; selecting the complete row
  // keeps Supabase's generated union types from treating table-specific
  // creator columns as an invalid shared projection.
  const { data: current, error: currentError } = await supabaseServer.from(resource.table).select("*").eq("id", entityId).maybeSingle();
  if (currentError) return NextResponse.json({ error: growthErrorMessage(currentError, "Unable to load Growth item") }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Growth item not found" }, { status: 404 });
  const currentRecord = current as unknown as Record<string, unknown>;
  const highRisk = ["tier", "gift_rule", "admin_rule"].includes(entityType)
    || (entityType === "badge" && currentRecord.benefit_type === "commission_boost")
    || (entityType === "gift" && currentRecord.gift_type === "cash");
  if (highRisk && !admin.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Only a super admin can approve this high-impact Growth change" }, { status: 403 });
  }
  const legacyCampaignAudiences = new Set(["all", "verified", "no_deals", "waiting_payment"]);
  const legacyCampaignAudience = typeof currentRecord.audience === "string" ? currentRecord.audience.trim().toLowerCase() : "";
  const broadCampaign = entityType === "notification_campaign"
    && (Boolean(currentRecord.audience_id) || legacyCampaignAudiences.has(legacyCampaignAudience));
  if (decision === "approved" && (Boolean(currentRecord.audience_id) || broadCampaign) && !admin.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Only a super admin can approve audience-targeted Growth changes" }, { status: 403 });
  }
  const metadata = currentRecord.metadata && typeof currentRecord.metadata === "object" && !Array.isArray(currentRecord.metadata) ? currentRecord.metadata as Record<string, unknown> : {};
  const priorActors = [currentRecord.created_by_admin, currentRecord.created_by, currentRecord.updated_by_admin, currentRecord.updated_by].filter((value): value is string => typeof value === "string");
  if (decision === "approved" && priorActors.includes(admin.adminId)) {
    return NextResponse.json({ error: "The creator cannot approve the same Growth change" }, { status: 409 });
  }
  if (decision === "approved" && metadata.requires_second_approval === true) {
    if (priorActors.includes(admin.adminId)) {
      return NextResponse.json({ error: "A second administrator must approve this Growth change" }, { status: 409 });
    }
  }
  if (currentRecord.approval_status === "approved" && decision === "approved") return NextResponse.json({ item: current, approval_status: "approved" });

  const update: Record<string, unknown> = {
    approval_status: decision,
    approved_by: decision === "approved" ? admin.adminId : null,
    approved_at: decision === "approved" ? new Date().toISOString() : null,
    rejection_reason: decision === "rejected" ? rejectionReason : null,
  };
  // Keep the legacy flag aligned with the canonical lifecycle and approval
  // state. Live visibility/evaluation is only enabled after approval.
  const lifecycleState = currentRecord.lifecycle_state;
  if (entityType !== "notification_campaign") {
    update.is_active = decision === "approved" && (lifecycleState === "active" || lifecycleState === "scheduled");
  }
  if (["gift", "tier", "badge", "gift_rule", "admin_rule", "audience"].includes(entityType)) update.updated_by_admin = admin.adminId;
  if (entityType === "notification_campaign" || entityType === "audience") update.updated_by = admin.adminId;
  if (entityType === "audience") {
    update.published_at = decision === "approved" && (lifecycleState === "active" || lifecycleState === "scheduled")
      ? new Date().toISOString()
      : null;
  }
  const { data, error } = await supabaseServer
    .from(resource.table)
    .update(update)
    .eq("id", entityId)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: growthErrorMessage(error, "Unable to update Growth approval") }, { status: 400 });
  await logAdminActivity({ adminId: admin.adminId, action: `growth.${entityType}.${decision}`, resourceType: resource.table, resourceId: entityId, metadata: { rejection_reason: rejectionReason } });
  return NextResponse.json({ item: data, approval_status: decision });
}
