import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20260830100000_workspace_deal_operations.sql");

test("Workspace deal operations are additive, transactional, and canonical", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /\ncommit;\s*$/);
  for (const column of [
    "payment_reference",
    "payment_proof_url",
    "payment_amount",
    "payment_amount_confirmed",
    "payment_recorded_by",
    "payment_approved_by",
  ]) assert.match(migration, new RegExp(`add column if not exists ${column}`));
  assert.match(migration, /create or replace view public\.workspace_operations/);
  assert.match(migration, /source_of_truth/);
  assert.match(migration, /deal_stage_entries/);
  assert.match(migration, /p_mode text default 'live'/);
  assert.match(migration, /operation_count bigint/);
  assert.match(migration, /pending_verification_count bigint/);
});

test("Sales claim decisions lock the row and atomically write audit, outbox, and mobile notification", () => {
  assert.match(migration, /create or replace function public\.transition_sales_claim/);
  assert.match(migration, /from public\.deal_stage_entries[\s\S]*for update/);
  assert.match(migration, /set_config\('brixeler\.sales_claim_transition', '1'/);
  assert.match(migration, /insert into public\.notifications/);
  assert.match(migration, /'admin_message'::public\.notification_type/);
  assert.match(migration, /'deal_stage_entry'/);
  assert.match(migration, /action_url[\s\S]*'\/deals'/);
  assert.match(migration, /insert into public\.admin_activity_log/);
  assert.match(migration, /insert into public\.deal_operation_outbox/);
  assert.match(migration, /revoke all on function public\.transition_sales_claim/);
  assert.match(migration, /grant execute on function public\.transition_sales_claim[\s\S]*to service_role/);
});

test("Paid requires payment evidence, amount confirmation, and an independent active administrator", () => {
  assert.match(migration, /Payment proof, reference, amount confirmation, and first approval are required before Paid/);
  assert.match(migration, /claim_row\.payment_recorded_by = p_actor_id/);
  assert.match(migration, /An independent administrator must approve the payment/);
  assert.match(migration, /payment_recorded_by is not null/);
  assert.match(migration, /payment_approved_by = case when p_next_status = 'Paid'/);
  assert.match(migration, /record_sales_claim_payment/);
  assert.match(migration, /approve_sales_claim_payment/);
  assert.match(migration, /Payment evidence must be recorded through the review transition/);
});

test("Workspace and deal detail never use the legacy deals table for operational truth", () => {
  const overview = read("../src/app/page.tsx");
  const dealRoom = read("../src/app/deals/page.tsx");
  const detail = read("../src/app/deals/[id]/page.tsx");
  const deals = read("../src/lib/adminDeals.ts");
  for (const source of [overview, detail, deals]) {
    assert.doesNotMatch(source, /\.from\(["']deals["']\)/);
    assert.match(source, /deal_stage_entries|workspace_operations/);
  }
  assert.doesNotMatch(dealRoom, /\.from\(["']deals["']\)/);
  assert.match(overview, /workspace_operations_metrics/);
  assert.match(overview, /is_demo/);
  assert.match(dealRoom, /fetchSalesClaims/);
  assert.match(detail, /deal_operation_outbox/);
});

test("Deal APIs route status changes through the guarded transition boundary", () => {
  const statusRoute = read("../src/app/api/sales-claims/[id]/status/route.ts");
  const feedbackRoute = read("../src/app/api/sales-claims/[id]/feedback/route.ts");
  assert.match(statusRoute, /record_sales_claim_payment/);
  assert.match(statusRoute, /approve_sales_claim_payment/);
  assert.match(statusRoute, /transition_sales_claim/);
  assert.doesNotMatch(statusRoute, /\.from\(["']deal_stage_entries["']\)[\s\S]*\.update\(/);
  assert.doesNotMatch(statusRoute, /enqueue_agent_notification/);
  assert.match(feedbackRoute, /transition_sales_claim/);
  assert.doesNotMatch(feedbackRoute, /enqueue_agent_notification/);
});

test("Deal queue exposes readable responsive controls and safe task workflow", () => {
  const table = read("../src/components/DealsClaimsTable.tsx");
  const page = read("../src/app/deals/page.tsx");
  assert.match(table, /role="tablist"/);
  assert.match(table, /aria-selected/);
  assert.match(table, /lg:hidden/);
  assert.match(table, /role="dialog" aria-modal="true"/);
  assert.match(table, /Record payment evidence/);
  assert.match(table, /Approve payment/);
  assert.match(table, /Payment reference/);
  assert.match(table, /Independent payment approval/);
  assert.match(page, /create_admin_deal_task/);
  assert.match(page, /complete_admin_deal_task/);
  assert.doesNotMatch(page, /admin_tasks[\s\S]*\.update\(/);
  assert.match(page, /related_entity_type.*deal_stage_entry|deal_stage_entry/);
  assert.match(page, /mode === "demo"/);
});
