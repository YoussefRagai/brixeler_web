import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import {
  parseAudienceDefinition,
  parseApprovalInput,
  parseGrowthRule,
  parseLifecycleFields,
} from "../src/lib/growthContracts.ts";
import { normalizePreviewConflictMessages, stablePreviewFingerprint } from "../src/lib/growthPreview.ts";
import { summarizeGiftGrowthMetrics } from "../src/lib/growthAnalytics.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260829120000_growth_shared_data_model.sql", import.meta.url), "utf8");

test("preview contracts flatten aggregate and per-recipient conflicts without losing detail", () => {
  assert.deepEqual(
    normalizePreviewConflictMessages({ conflicts: { count: 2 } }),
    ["2 conflicts detected in preview."],
  );
  assert.deepEqual(
    normalizePreviewConflictMessages([
      { code: "approval", message: "Tier is awaiting approval" },
      { reason: "Already claimed" },
    ]),
    ["Tier is awaiting approval", "Already claimed"],
  );
});

test("preview fingerprints are key-order independent but invalidate changed payloads", () => {
  assert.equal(stablePreviewFingerprint({ metric: "revenue", value: 10 }), stablePreviewFingerprint({ value: 10, metric: "revenue" }));
  assert.notEqual(stablePreviewFingerprint({ metric: "revenue", value: 10 }), stablePreviewFingerprint({ metric: "revenue", value: 11 }));
});

test("Growth builders and tier creation require fresh previews and persist mobile criteria", () => {
  for (const route of [
    "../src/components/GiftRuleBuilder.tsx",
    "../src/components/RewardsRuleBuilder.tsx",
    "../src/components/GrowthAudienceStudio.tsx",
  ]) {
    const source = readFileSync(new URL(route, import.meta.url), "utf8");
    assert.match(source, /stablePreviewFingerprint/);
    assert.match(source, /Refresh .*preview before (saving|saving this reward)/);
  }
  const tierForm = readFileSync(new URL("../src/components/TierCatalogForm.tsx", import.meta.url), "utf8");
  const tierRoute = readFileSync(new URL("../src/app/api/admin/rewards/tiers/route.ts", import.meta.url), "utf8");
  assert.match(tierForm, /name="promotion_metric"/);
  assert.match(tierForm, /name="promotion_threshold"/);
  assert.match(tierRoute, /promotion_criteria: \{ metric: promotionMetric, operator: ">=", value_single: promotionThreshold/);
});

test("Growth analytics excludes blocked eligibility and rejected/cancelled claims", () => {
  assert.deepEqual(
    summarizeGiftGrowthMetrics(
      [{ status: "eligible" }, { status: "claimed" }, { status: "blocked" }],
      [{ status: "pending" }, { status: "fulfilled" }, { status: "rejected" }, { status: "cancelled" }],
    ),
    { eligibleCount: 2, claimedCount: 2, approvedCount: 1, fulfilledCount: 1, claimRate: 100, fulfillmentRate: 50 },
  );
});

test("Growth migration is additive, transactional, and versioned", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /\ncommit;\s*$/);
  assert.match(migration, /create table if not exists public\.growth_audiences/);
  assert.match(migration, /create table if not exists public\.growth_resource_versions/);
  assert.match(migration, /created_by uuid references public\.admins\(id\)/);
  assert.match(migration, /updated_by uuid references public\.admins\(id\)/);
  assert.match(migration, /changed_by uuid references public\.admins\(id\)/);
  assert.match(migration, /growth_audiences[\s\S]*add column if not exists approval_status text not null default 'not_required'/);
  assert.match(migration, /growth_audiences_approval_status_check/);
  assert.match(migration, /growth_audiences_live_requires_approval_check/);
  assert.match(migration, /lifecycle_state in \('draft', 'scheduled', 'active', 'paused', 'archived'\)/);
  assert.match(migration, /add column if not exists audience_id uuid references public\.growth_audiences\(id\)/);
  assert.match(migration, /add column if not exists body_ar text/);
  assert.match(migration, /alter table public\.badges[\s\S]*add column if not exists approval_status text not null default 'not_required'/);
  assert.match(migration, /add column if not exists is_demo boolean not null default false/);
  assert.doesNotMatch(migration, /drop policy if exists %I on public\.%I/);
  assert.match(migration, /growth-demo-verified[\s\S]*'draft'/);
  assert.match(migration, /Demo welcome experience[\s\S]*false[\s\S]*demo_batch/);
  assert.match(migration, /p_batch := nullif\(btrim\(p_batch\), ''\)/);
  assert.match(migration, /batch_key = p_batch and status = 'active'/);
  assert.doesNotMatch(migration, /related_entity_id = any\(campaign_ids\)/);
});

test("Growth service functions fail closed at the database privilege boundary", () => {
  for (const signature of [
    "preview_growth_rule(text, uuid, uuid, jsonb, text, text, text, numeric, numeric, numeric, jsonb, integer)",
    "preview_growth_audience(uuid, jsonb, integer)",
    "run_growth_evaluation(text, boolean, uuid)",
    "restore_growth_resource_version(text, uuid, integer, uuid)",
    "dispatch_notification_campaign(uuid)",
  ]) {
    assert.ok(
      migration.includes(`revoke all on function public.${signature} from public, anon, authenticated;`),
      `public execution must be revoked for ${signature}`,
    );
  }
  assert.match(migration, /grant execute on function public\.preview_growth_rule\(text, uuid, uuid, jsonb, text, text, text, numeric, numeric, numeric, jsonb, integer\) to service_role/);
  assert.match(migration, /grant execute on function public\.create_gift_claim\(uuid, uuid\) to authenticated, service_role/);
  assert.match(migration, /revoke all on function public\.create_gift_claim\(uuid, uuid\) from public, anon/);
  assert.match(migration, /p_agent_id = auth\.uid\(\)/);
});

test("Growth mobile visibility and evaluator gates require approval", () => {
  for (const policy of ["gifts_growth_mobile_read", "tiers_growth_mobile_read", "badges_growth_mobile_read"]) {
    const policyStart = migration.indexOf(`create policy ${policy}`);
    assert.ok(policyStart >= 0, `${policy} is present`);
    const policyEnd = migration.indexOf(";", policyStart);
    assert.match(migration.slice(policyStart, policyEnd), /approval_status in \('not_required', 'approved'\)/);
  }
  assert.match(migration, /where is_active\s+and approval_status in \('not_required', 'approved'\)/);
  assert.match(migration, /badge_row\.approval_status in \('not_required', 'approved'\)/);
  assert.match(migration, /target_tier\.approval_status not in \('not_required', 'approved'\)/);
  assert.match(migration, /growth_audience_matches_agent[\s\S]*a\.approval_status in \('not_required', 'approved'\)/);
  assert.match(migration, /agent_badges_growth_agent_read[\s\S]*expires_at is null or expires_at > now\(\)/);
  assert.match(migration, /agent_badges_growth_boundary[\s\S]*expires_at is null or expires_at > now\(\)/);
});

test("creator APIs derive pending approval and require a second administrator", () => {
  for (const route of [
    "../src/app/api/admin/gifts/create/route.ts",
    "../src/app/api/admin/gifts/rules/route.ts",
    "../src/app/api/admin/rewards/rules/route.ts",
    "../src/app/api/admin/rewards/tiers/route.ts",
    "../src/app/api/admin/rewards/badges/route.ts",
  ]) {
    const source = readFileSync(new URL(route, import.meta.url), "utf8");
    assert.match(source, /approvalStatus|approvalValue/);
    assert.match(source, /requires_second_approval/);
    assert.doesNotMatch(source, /approval_status.*formData\.get|approval_status.*payload\.approval_status/);
  }
  const approval = readFileSync(new URL("../src/app/api/admin/growth/approval/route.ts", import.meta.url), "utf8");
  assert.match(approval, /created_by_admin, currentRecord\.created_by, currentRecord\.updated_by_admin, currentRecord\.updated_by/);
  assert.match(approval, /creator cannot approve/);
  assert.match(approval, /entityType === "badge" && currentRecord\.benefit_type === "commission_boost"/);
  assert.match(approval, /entityType === "gift" && currentRecord\.gift_type === "cash"/);
  assert.match(approval, /legacyCampaignAudiences/);
  assert.match(approval, /entityType === "notification_campaign"/);
  assert.match(approval, /decision === "approved" && \(Boolean\(currentRecord\.audience_id\) \|\| broadCampaign\)/);
  assert.match(approval, /entityType: "audience"|audience: \{ table: "growth_audiences"/);
  const audiences = readFileSync(new URL("../src/app/api/admin/growth/audiences/route.ts", import.meta.url), "utf8");
  assert.match(audiences, /requiresApproval = parsed\.value\.lifecycle_state === "active" \|\| parsed\.value\.lifecycle_state === "scheduled"/);
  assert.match(audiences, /approval_status: requiresApproval \? "pending" : "not_required"/);
  assert.match(audiences, /requires_second_approval: requiresApproval/);
});

test("lifecycle and audience validators reject broad or unsupported rules", () => {
  assert.equal(parseLifecycleFields({ lifecycle_state: "draft" }).ok, true);
  assert.equal(parseLifecycleFields({ lifecycle_state: "scheduled" }).ok, false);
  assert.equal(parseLifecycleFields({ lifecycle_state: "active", start_at: "2026-08-29T00:00", end_at: "2026-08-28T00:00" }).ok, false);
  assert.equal(parseGrowthRule({ metric: "deals_count", time_window: "all_time", operator: ">=", value_single: 0, filters: {} }).ok, false);
  assert.equal(parseGrowthRule({ metric: "deals_count", time_window: "all_time", operator: ">=", value_single: 1, filters: { _exclude: true } }).ok, false);
  assert.equal(parseAudienceDefinition({ match: "all", conditions: [{ field: "total_deals", operator: ">=", value: 0 }] }).ok, false);
  assert.equal(parseAudienceDefinition({ match: "all", conditions: [{ field: "developer_id", operator: "equals", value: "x" }] }).ok, false);
  assert.equal(parseAudienceDefinition({ match: "all", conditions: [{ field: "verification_status", operator: "contains", value: "ver" }] }).ok, false);
  assert.equal(parseAudienceDefinition({ match: "all", conditions: [{ field: "developer_name", operator: "contains", value: "Palm" }] }).ok, true);
  assert.equal(parseAudienceDefinition({ match: "all", conditions: [{ field: "tier_level", operator: "not_equals", value: 2 }] }).ok, true);
  assert.equal(parseAudienceDefinition({ match: "all", conditions: [{ field: "tier_level", operator: "between", value: 2, max: 4 }] }).ok, true);
  assert.equal(parseAudienceDefinition({ match: "all", conditions: [{ field: "agent_id", operator: "gt", value: "00000000-0000-4000-8000-000000000001" }] }).ok, false);
  assert.equal(parseAudienceDefinition({ match: "all", conditions: [{ field: "agent_id", operator: "in", value: ["00000000-0000-4000-8000-000000000001"] }] }).ok, true);
});

test("admin Growth compatibility routes expose the delegated paths", () => {
  for (const route of [
    "../src/app/api/admin/growth/audiences/route.ts",
    "../src/app/api/admin/growth/audiences/preview/route.ts",
    "../src/app/api/admin/growth/approvals/route.ts",
    "../src/app/api/admin/growth/versions/restore/route.ts",
  ]) assert.equal(existsSync(new URL(route, import.meta.url)), true, route);
  const approvals = readFileSync(new URL("../src/app/api/admin/growth/approvals/route.ts", import.meta.url), "utf8");
  const restore = readFileSync(new URL("../src/app/api/admin/growth/versions/restore/route.ts", import.meta.url), "utf8");
  assert.match(approvals, /export \{ POST \} from \"\.\.\/approval\/route\"/);
  assert.match(restore, /export \{ POST \} from \"\.\.\/route\"/);
});

test("approval payloads normalize decisions and require rejection reasons", () => {
  const approved = parseApprovalInput({ entity_type: "badge", entity_id: "00000000-0000-4000-8000-000000000001", decision: "approve" });
  assert.equal(approved.ok, true);
  if (approved.ok) assert.equal(approved.value.decision, "approved");
  assert.equal(parseApprovalInput({ entity_type: "audience", entity_id: "00000000-0000-4000-8000-000000000001", decision: "approve" }).ok, true);
  assert.equal(parseApprovalInput({ entity_type: "gift", entity_id: "00000000-0000-4000-8000-000000000001", decision: "reject" }).ok, false);
});
