import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { parseMobileActionUrl, MOBILE_ACTIONS } from "../src/lib/mobileActions.ts";

test("notification actions are a closed mobile route allowlist", () => {
  assert.deepEqual(MOBILE_ACTIONS.map((item) => item.value), ["/", "/properties", "/deals", "/gifts", "/profile", "/support"]);
  assert.equal(parseMobileActionUrl("/support"), "/support");
  assert.equal(parseMobileActionUrl("/support?redirect=https://evil.example"), "/");
});

test("cross-surface migration preserves suspension, moderation, and support boundaries", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260826164946_dashboard_cross_surface_completion.sql", import.meta.url), "utf8");
  for (const contract of [
    "current_account_not_suspended",
    "reply_to_support_ticket",
    "developer_projects_approval_status_check",
    "developer_notifications",
    "authenticated_accounts_not_suspended",
  ]) assert.match(sql, new RegExp(contract));
});

test("Expo batches require receipts before delivered state", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260826164950_expo_push_receipt_tracking.sql", import.meta.url), "utf8");
  assert.match(sql, /queue_due_push_receipts/);
  assert.match(sql, /receipt_response_status/);
  assert.match(sql, /jsonb_object_length\(expo_ticket_map\) then 'delivered'/);
});

test("release guards close moderation, support, and mixed-receipt bypasses", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260826165644_cross_surface_release_guards.sql", import.meta.url), "utf8");
  assert.match(sql, /revoke insert, update, delete on public\.developer_projects from authenticated/);
  assert.match(sql, /project\.approval_status = 'approved'/);
  assert.match(sql, /ticket\.status <> 'closed'/);
  assert.match(sql, /p_property_id, '\/properties'/);
  assert.match(sql, /new\.ticket_error_count > 0/);
  assert.match(sql, /retry scheduled/);
});

test("receipt object counting is available on the production Postgres version", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260826165752_jsonb_object_length_compat.sql", import.meta.url), "utf8");
  assert.match(sql, /from jsonb_object_keys\(p_value\)/);
});

test("truncated Expo ticket responses cannot become delivered", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260826170118_push_ticket_cardinality_guard.sql", import.meta.url), "utf8");
  assert.match(sql, /new\.token_count - expected_receipts - new\.ticket_error_count/);
  assert.match(sql, /new\.ticket_error_count := new\.ticket_error_count \+ missing_tickets/);
});

test("developer resale renewals cannot take over agent-owned listings", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260826211237_developer_resale_source_guard.sql", import.meta.url), "utf8");
  assert.match(sql, /new\.requested_by_role <> 'developer'/);
  assert.match(sql, /property\.listed_by_agent_id/);
  assert.match(sql, /Agent-submitted resales are read-only for developers/);
  assert.match(sql, /before insert on public\.property_renewal_requests/);
});

test("global response headers and upload body limits are production-safe", () => {
  const config = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.match(config, /poweredByHeader:\s*false/);
  assert.match(config, /X-Content-Type-Options.*nosniff/);
  assert.match(config, /Referrer-Policy.*strict-origin-when-cross-origin/);
  assert.match(config, /X-Frame-Options.*DENY/);
  assert.match(config, /Permissions-Policy.*camera=\(\), microphone=\(\), geolocation=\(\)/);
  assert.match(config, /Strict-Transport-Security.*max-age=31536000/);
  assert.match(config, /bodySizeLimit:\s*["']110mb["']/);
  assert.doesNotMatch(config, /Content-Security-Policy/);
});

test("developer workspace protects nested deletion and preserves browser drafts", () => {
  const projectPage = readFileSync(new URL("../src/app/developer/projects/page.tsx", import.meta.url), "utf8");
  const listingWizard = readFileSync(new URL("../src/components/DeveloperListingWizard.tsx", import.meta.url), "utf8");
  assert.match(projectPage, /Delete this unit type and all of its variants\?/);
  assert.match(projectPage, /Delete this variant permanently\?/);
  assert.match(projectPage, /if \(result\?\.error\)/);
  assert.match(projectPage, /draft=clear/);
  assert.match(projectPage, /PROJECT_WIZARD_DRAFT_KEY}:\$\{session\.developerId}/);
  assert.match(projectPage, /settings=1#project-settings/);
  assert.match(projectPage, /section=leads#project-leads/);
  assert.match(listingWizard, /DEVELOPER_LISTING_DRAFT_KEY}:\$\{developerId}:\$\{preselectedSaleType}/);
  assert.match(listingWizard, /localStorage\.setItem\(draftKey/);
  assert.match(listingWizard, /Uploads are never saved/);
  assert.match(listingWizard, /role="alert" aria-live="assertive"/);
});

test("privileged settings and developer activation fail closed", () => {
  const settings = readFileSync(new URL("../src/app/settings/page.tsx", import.meta.url), "utf8");
  const activation = readFileSync(new URL("../src/app/api/developer/activate-invite/route.ts", import.meta.url), "utf8");
  assert.match(settings, /requireAdminRole\(\["super_admin"\]\)/);
  assert.doesNotMatch(settings, /requireAdminContext\(\)/);
  assert.match(activation, /membership\.status !== "pending"/);
  assert.match(activation, /\.eq\("status", "pending"\)/);
});

test("reliability transactions keep user-visible workflows atomic", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260827223000_reliability_transactions.sql", import.meta.url), "utf8");
  for (const contract of [
    "create_support_ticket_with_message",
    "create_developer_contact_request_with_notification",
    "update_developer_contact_request_with_notification",
    "admin_reply_to_support_ticket",
  ]) assert.match(sql, new RegExp(contract));
  assert.match(sql, /grant execute on function public\.create_support_ticket_with_message.*to authenticated/s);
  assert.match(sql, /grant execute on function public\.admin_reply_to_support_ticket.*to service_role/s);
});

test("project uploads validate ownership and compensate failed writes", () => {
  const projectPage = readFileSync(new URL("../src/app/developer/projects/page.tsx", import.meta.url), "utf8");
  const ownershipCheck = projectPage.indexOf("Project not found or access denied.");
  const firstTrackedUpload = projectPage.indexOf("await uploadTracked");
  assert.ok(ownershipCheck >= 0 && firstTrackedUpload >= 0 && ownershipCheck < firstTrackedUpload);
  assert.match(projectPage, /removeUploadedStorageObjects\(uploadedObjects\)/);
});

test("baseline bootstrap validates migration history and recreates cron prerequisites", () => {
  const versions = readFileSync(new URL("../supabase/baseline/20260826_migration_versions.txt", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter(Boolean);
  const migrations = readdirSync(new URL("../supabase/migrations", import.meta.url));
  assert.ok(versions.length > 0);
  for (const version of versions) {
    assert.match(version, /^\d{14}$/);
    assert.ok(migrations.some((file) => file.startsWith(`${version}_`) && file.endsWith(".sql")), `missing migration for ${version}`);
  }
  const bootstrap = readFileSync(new URL("../scripts/bootstrap-supabase-baseline.sh", import.meta.url), "utf8");
  assert.match(bootstrap, /create extension if not exists pg_cron/);
  assert.match(bootstrap, /\^\[0-9\]\{14\}\$/);
});
