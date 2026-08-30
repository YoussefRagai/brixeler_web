import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20260830101000_people_operations_hardening.sql");

test("People hardening migration is additive and transactional", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /\ncommit;\s*$/);
  assert.match(migration, /account_lifecycle_state/);
  assert.match(migration, /agent_account_lifecycle_events/);
  assert.match(migration, /agent_account_purge_requests/);
  assert.match(migration, /verification_reviews/);
  assert.match(migration, /support_ticket_events/);
  assert.match(migration, /add column if not exists revision bigint not null default 1/);
  assert.doesNotMatch(migration, /delete from public\.users_profile/);
  assert.doesNotMatch(migration, /auth\.admin\.deleteUser/);
});

test("account lifecycle preserves records and requires independent fresh approval", () => {
  assert.match(migration, /archive_agent_account/);
  assert.match(migration, /restore_archived_agent_account/);
  assert.match(migration, /request_agent_purge/);
  assert.match(migration, /approve_agent_purge/);
  assert.match(migration, /requested_by = p_approved_by/);
  assert.match(migration, /Independent super admin approval required/);
  assert.match(migration, /preserved_business_records/);
  assert.match(migration, /business_records_preserved/);
  assert.match(migration, /verification_documents_url = null/);
  const approveRoute = read("../src/app/api/admin/agents/purge/approve/route.ts");
  assert.match(approveRoute, /FRESH_SESSION_MAX_AGE_MS/);
  assert.match(approveRoute, /admin\.session\.issuedAt/);
  assert.match(approveRoute, /independent super admin/i);
  assert.match(read("../src/app/api/admin/agents/delete/route.ts"), /recoverable archive/i);
  assert.doesNotMatch(read("../src/app/api/admin/agents/delete/route.ts"), /deleteUser/);
});

test("purge operators must create and download a recent retained-data snapshot", () => {
  assert.match(migration, /agent_account_retention_snapshots/);
  assert.match(migration, /create_agent_retention_snapshot/);
  assert.match(migration, /Download a recent retained-data snapshot before requesting purge/);
  assert.match(migration, /retention_snapshot_id/);
  assert.match(migration, /downloaded_at/);
  assert.match(migration, /generated_at >= now\(\) - interval '24 hours'/);
  const agentsPage = read("../src/app/agents/page.tsx");
  const purgePanel = read("../src/components/AgentPurgeOperations.tsx");
  const snapshotRoute = read("../src/app/api/admin/agents/retained-snapshot/route.ts");
  assert.match(agentsPage, /AgentPurgeOperations/);
  assert.match(purgePanel, /downloaded and reviewed/);
  assert.match(purgePanel, /Self-approval is disabled/);
  assert.match(purgePanel, /fresh signed admin session/);
  assert.match(read("../src/app/api/admin/agents/purge/request/route.ts"), /snapshotId/);
  assert.match(snapshotRoute, /Content-Disposition/);
  assert.match(snapshotRoute, /retention-snapshot/);
  assert.match(snapshotRoute, /downloaded_at/);
});

test("agent and verification surfaces use canonical Growth data and paginated review", () => {
  const agentsPage = read("../src/app/agents/page.tsx");
  const profileRoute = read("../src/app/api/admin/agents/profile/route.ts");
  const verificationPage = read("../src/app/verification/page.tsx");
  const carousel = read("../src/components/VerificationCarousel.tsx");
  assert.match(agentsPage, /from\("user_tiers"\)/);
  assert.match(agentsPage, /Canonical Growth|growth_tier/i);
  assert.doesNotMatch(agentsPage, /from\("referral_bonus_rules"\)/);
  assert.match(profileRoute, /from\("user_tiers"\)/);
  assert.doesNotMatch(profileRoute, /referral_bonus_rules/);
  assert.match(verificationPage, /count: "exact"/);
  assert.match(verificationPage, /\.range\(/);
  assert.match(verificationPage, /verification_submitted_at/);
  assert.match(verificationPage, /ageHours/);
  assert.match(carousel, /reviewVersion/);
  assert.match(carousel, /reviewable/);
  assert.match(read("../src/app/api/admin/verification/approve/route.ts"), /review_agent_verification/);
  assert.match(read("../src/app/api/admin/verification/reject/route.ts"), /review_agent_verification/);
});

test("verification review locks active pending profiles, validates documents, and notifies mobile", () => {
  assert.match(migration, /review_agent_verification/);
  assert.match(migration, /for update/);
  assert.match(migration, /Only active profiles can be reviewed/);
  assert.match(migration, /Only pending verification profiles can be reviewed/);
  assert.match(migration, /At least one and at most three verification documents are required/);
  assert.match(migration, /verification_reviewed_by/);
  assert.match(migration, /verification_reviewed_at/);
  assert.match(migration, /insert into public\.notifications/);
  assert.match(migration, /'verification', p_agent_id, '\/profile'/);
});

test("support access is category-scoped and operations are atomic with optimistic concurrency", () => {
  const supportPage = read("../src/app/support/page.tsx");
  const supportHelper = read("../src/lib/supportAccess.ts");
  const composer = read("../src/components/SupportReplyComposer.tsx");
  assert.match(supportHelper, /technical/);
  assert.match(supportHelper, /property_request/);
  assert.match(supportHelper, /user_support_admin/);
  assert.match(supportPage, /supportCategoryScope/);
  assert.match(supportPage, /unread/);
  assert.match(supportPage, /priority/);
  assert.match(supportPage, /owner/);
  assert.match(supportPage, /closed/);
  assert.match(supportPage, /count: "exact"/);
  assert.match(supportPage, /expectedUpdatedAt/);
  assert.match(supportPage, /admin_claim_support_ticket/);
  assert.match(supportPage, /admin_update_support_ticket_status/);
  assert.match(supportPage, /admin_reply_to_support_ticket/);
  assert.match(supportPage, /admin_create_support_macro/);
  assert.match(composer, /expectedUpdatedAt/);
  assert.match(composer, /aria-label="Saved reply macros"/);
  assert.match(migration, /support_admin_can_access_category/);
  assert.match(migration, /Support category is outside your role scope/);
  assert.match(migration, /p_expected_updated_at/);
  assert.match(migration, /for update/);
  assert.match(migration, /support_ticket_events/);
  assert.match(migration, /unread_for_admin/);
});

test("support macros are scoped, editable, deactivatable, and version-audited", () => {
  const supportPage = read("../src/app/support/page.tsx");
  const macroManager = read("../src/components/SupportMacroManager.tsx");
  assert.match(migration, /support_macro_versions/);
  assert.match(migration, /admin_update_support_macro/);
  assert.match(migration, /admin_set_support_macro_active/);
  assert.match(migration, /Macro changed; reload before editing/);
  assert.match(migration, /'deactivated'/);
  assert.match(migration, /support_admin_can_access_category/);
  assert.match(supportPage, /updateMacroAction/);
  assert.match(supportPage, /toggleMacroAction/);
  assert.match(supportPage, /p_expected_revision/);
  assert.match(macroManager, /Save new version/);
  assert.match(macroManager, /Deactivate macro/);
  assert.match(macroManager, /Activate macro/);
  assert.match(macroManager, /expectedRevision/);
});

test("People API compatibility routes exist without destructive Auth deletion", () => {
  for (const route of [
    "../src/app/api/admin/agents/archive/route.ts",
    "../src/app/api/admin/agents/restore/route.ts",
    "../src/app/api/admin/agents/purge/request/route.ts",
    "../src/app/api/admin/agents/purge/approve/route.ts",
    "../src/app/api/admin/agents/retained-snapshot/route.ts",
  ]) assert.equal(existsSync(new URL(route, import.meta.url)), true, route);
  for (const route of [
    "../src/app/api/admin/agents/delete/route.ts",
    "../src/app/api/admin/agents/archive/route.ts",
    "../src/app/api/admin/agents/restore/route.ts",
  ]) assert.doesNotMatch(read(route), /auth\.admin\.deleteUser/);
});
