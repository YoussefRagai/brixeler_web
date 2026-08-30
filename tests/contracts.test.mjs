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

test("developer workspace archives nested inventory and preserves browser drafts", () => {
  const projectPage = readFileSync(new URL("../src/app/developer/projects/page.tsx", import.meta.url), "utf8");
  const listingWizard = readFileSync(new URL("../src/components/DeveloperListingWizard.tsx", import.meta.url), "utf8");
  assert.match(projectPage, /archiveProjectUnitType/);
  assert.match(projectPage, /restoreProjectUnitType/);
  assert.match(projectPage, /archiveProjectUnitVariant/);
  assert.match(projectPage, /restoreProjectUnitVariant/);
  assert.doesNotMatch(projectPage, /Delete this unit type and all of its variants\?/);
  assert.doesNotMatch(projectPage, /Delete this variant permanently\?/);
  assert.match(projectPage, /if \(result\?\.error\)/);
  assert.match(projectPage, /draft=clear/);
  assert.match(projectPage, /PROJECT_WIZARD_DRAFT_KEY}:\$\{session\.developerId}/);
  assert.match(projectPage, /settings=1#project-settings/);
  assert.doesNotMatch(projectPage, /section=leads#project-leads/);
  assert.doesNotMatch(projectPage, /fetchDeveloperContactRequests/);
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
  assert.match(activation, /membership\.status !== "pending"|activate_developer_account_invite/);
  assert.match(activation, /\.eq\("status", "pending"\)|status !== "pending"/);
});

test("mobile synchronization is bearer-authenticated and publication-gated", () => {
  const route = readFileSync(new URL("../src/app/api/mobile/commission-rate/route.ts", import.meta.url), "utf8");
  const publication = readFileSync(new URL("../supabase/migrations/20260830091000_developer_publication_contract.sql", import.meta.url), "utf8");
  assert.match(route, /getMobileUserFromRequest\(request\)/);
  assert.match(route, /resolve_commission_rate/);
  assert.match(route, /status: 503/);
  assert.match(route, /source: "default"/);
  assert.match(publication, /lifecycle_state/);
  assert.match(publication, /published_at/);
  assert.match(publication, /is_demo = false/);
  assert.match(publication, /approval_status = 'approved'/);
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

test("developer invitations are transactional, idempotent, auditable, and demo-cleanable", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20260830090000_developer_invitation_reliability.sql", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/app/developers/page.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("../src/components/AdminDeveloperInviteForm.tsx", import.meta.url), "utf8");
  const table = readFileSync(new URL("../src/components/AdminDevelopersTable.tsx", import.meta.url), "utf8");
  const resend = readFileSync(new URL("../src/app/api/admin/developers/resend-invite/route.ts", import.meta.url), "utf8");
  const revoke = readFileSync(new URL("../src/app/api/admin/developers/revoke/route.ts", import.meta.url), "utf8");
  const activation = readFileSync(new URL("../src/app/api/developer/activate-invite/route.ts", import.meta.url), "utf8");
  const login = readFileSync(new URL("../src/app/api/developer-login/route.ts", import.meta.url), "utf8");
  const invites = readFileSync(new URL("../src/lib/developerAccountInvites.ts", import.meta.url), "utf8");
  const settings = readFileSync(new URL("../src/app/settings/page.tsx", import.meta.url), "utf8");

  assert.match(migration, /alter table public\.developers[\s\S]*add column if not exists is_demo/);
  assert.match(migration, /alter table public\.developer_accounts[\s\S]*add column if not exists is_demo/);
  assert.match(migration, /developer_account_events/);
  for (const event of ["developer_account.invite", "developer_account.resend_invite", "developer_account.accepted", "developer_account.login", "developer_account.revoke"])
    assert.match(migration, new RegExp(event.replaceAll(".", "\\.")));
  for (const fn of [
    "create_developer_account_invite",
    "activate_developer_account_invite",
    "record_developer_account_login",
    "revoke_developer_account",
    "cleanup_demo_developer_invites",
  ]) assert.match(migration, new RegExp(`create or replace function public\\.${fn}`));
  assert.match(migration, /unique \(developer_account_id, event_type, idempotency_key\)/);
  assert.match(migration, /demo_data_batches_cleanup_developer_invites/);
  assert.match(page, /useActionState|AdminDeveloperInviteForm/);
  assert.match(page, /Developer name is required when creating a new developer/);
  assert.doesNotMatch(page, /developers[\s\S]*\.update\(\{ contact_email/);
  assert.match(form, /required=\{isCreating\}/);
  assert.match(form, /Contact details stay unchanged/);
  assert.match(form, /name="isDemo"/);
  assert.match(form, /name="demoBatch"/);
  assert.match(table, /crypto\.randomUUID\(\)/);
  assert.match(table, /Network error/);
  assert.match(resend, /create_developer_account_invite/);
  assert.match(resend, /Only pending invitations can be resent/);
  assert.match(revoke, /revoke_developer_account/);
  assert.match(revoke, /revoke reason between 3 and 500 characters/);
  assert.match(activation, /activate_developer_account_invite/);
  assert.match(login, /record_developer_account_login/);
  assert.match(invites, /compensateDeveloperInviteAuthUser/);
  assert.match(settings, /cleanup_demo_batch/);
  assert.match(settings, /compensateDeveloperInviteAuthUser/);
});

test("developer membership and public profile changes fail closed", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20260830103000_developer_portal_security_and_profile_review.sql", import.meta.url), "utf8");
  assert.match(migration, /revoke insert, update, delete, truncate on public\.developer_accounts from anon, authenticated/);
  assert.match(migration, /drop policy if exists developer_accounts_update_own/);
  assert.match(migration, /drop policy if exists developer_projects_update/);
  assert.match(migration, /drop policy if exists project_unit_variants_update/);
  assert.match(migration, /status in \('pending', 'active'\)/);
  assert.match(migration, /create table if not exists public\.developer_profile_revisions/);
  assert.match(migration, /create unique index if not exists developer_profile_revisions_one_pending_idx/);
  assert.match(migration, /alter table public\.project_unit_types[\s\S]*archived_at/);
  assert.match(migration, /alter table public\.project_unit_variants[\s\S]*archived_at/);
  assert.match(migration, /alter table public\.properties[\s\S]*archived_by_developer_account_id/);
  assert.match(migration, /guard_archived_property_visibility/);
  assert.match(migration, /unit_type\.archived_at is null/);
  assert.match(migration, /create or replace function public\.submit_developer_profile_revision/);
  assert.match(migration, /and status = 'active'/);
  assert.match(migration, /create or replace function public\.review_developer_profile_revision/);
  assert.match(migration, /admin\.role::text in \('super_admin', 'developers_admin'\)/);
  assert.match(migration, /update public\.developers/);
  assert.match(migration, /revoke all on function public\.submit_developer_profile_revision[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /revoke all on function public\.review_developer_profile_revision[\s\S]*from public, anon, authenticated/);
});

test("developer operations console and portal use reviewed, recoverable workflows", () => {
  const adminPage = readFileSync(new URL("../src/app/developers/page.tsx", import.meta.url), "utf8");
  const adminConsole = readFileSync(new URL("../src/components/AdminDevelopersTable.tsx", import.meta.url), "utf8");
  const reviewRoute = readFileSync(new URL("../src/app/api/admin/developers/profile-review/route.ts", import.meta.url), "utf8");
  const profilePage = readFileSync(new URL("../src/app/developer/profile/page.tsx", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../src/app/developer/page.tsx", import.meta.url), "utf8");
  const queries = readFileSync(new URL("../src/lib/developerQueries.ts", import.meta.url), "utf8");
  const listingsPage = readFileSync(new URL("../src/app/developer/listings/page.tsx", import.meta.url), "utf8");

  assert.match(adminPage, /DEVELOPER_PAGE_SIZE/);
  assert.match(adminPage, /count: "exact"/);
  assert.match(adminPage, /\.range\(developerOffset/);
  assert.match(adminPage, /developer_profile_revisions/);
  assert.doesNotMatch(adminConsole, /JSON\.stringify\(entry\.metadata/);
  assert.match(adminConsole, /Public profile review/);
  assert.match(reviewRoute, /hasAdminRole\(admin\.roles, \["developers_admin", "super_admin"\]\)/);
  assert.match(reviewRoute, /admin\.developerIds/);
  assert.match(reviewRoute, /review_developer_profile_revision/);
  assert.match(profilePage, /submit_developer_profile_revision/);
  assert.match(profilePage, /p_account_id: session\.accountId/);
  assert.match(profilePage, /discardUploadedLogo/);
  assert.match(dashboard, /\.eq\("developer_id", session\.developerId\)/);
  assert.match(queries, /restoreDeveloperListing/);
  assert.match(queries, /archiveProjectUnitType/);
  assert.match(queries, /restoreProjectUnitVariant/);
  assert.match(listingsPage, /view=archived/);
});

test("developer onboarding is server-gated and unlocks on a complete submitted profile", () => {
  const auth = readFileSync(new URL("../src/lib/developerAuth.ts", import.meta.url), "utf8");
  const profile = readFileSync(new URL("../src/app/developer/profile/page.tsx", import.meta.url), "utf8");
  const layout = readFileSync(new URL("../src/components/DeveloperLayout.tsx", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/20260830104000_developer_onboarding_and_branding.sql", import.meta.url), "utf8");

  assert.match(auth, /hasCompletedDeveloperProfile/);
  assert.match(auth, /redirect\("\/developer\/profile\?onboarding=1"\)/);
  assert.match(auth, /status === "pending" \|\| status === "approved"/);
  assert.match(profile, /allowIncompleteProfile: true/);
  assert.match(profile, /logo_url/);
  assert.match(layout, /const visibleNavItems = onboarding/);
  assert.match(layout, /item\.href === "\/developer\/profile"/);
  assert.match(migration, /add column if not exists slogan/);
  assert.match(migration, /A developer logo is required to complete onboarding/);
  assert.match(migration, /to service_role/);
});

test("admin access changes use a strict allowlist and preserve super-admin coverage", () => {
  const roles = readFileSync(new URL("../src/lib/adminRoles.ts", import.meta.url), "utf8");
  const update = readFileSync(new URL("../src/app/api/admins/update/route.ts", import.meta.url), "utf8");
  const editor = readFileSync(new URL("../src/components/AdminRoleEditor.tsx", import.meta.url), "utf8");
  assert.match(roles, /export const ADMIN_ROLES/);
  assert.match(roles, /isAdminRole/);
  assert.match(update, /Roles must use the supported admin role allowlist/);
  assert.match(update, /At least one active super admin must remain/);
  assert.match(update, /You cannot remove your own super-admin access/);
  assert.match(update, /You cannot suspend your own admin access/);
  assert.match(update, /reason between 3 and 500 characters/);
  assert.match(editor, /Review changes/);
  assert.match(editor, /Keep the server-confirmed state/);
});

test("admin activity and exports are scoped, paginated, and readable", () => {
  const queries = readFileSync(new URL("../src/lib/adminQueries.ts", import.meta.url), "utf8");
  const activity = readFileSync(new URL("../src/app/settings/admin-activities/page.tsx", import.meta.url), "utf8");
  const exportsLib = readFileSync(new URL("../src/lib/adminExports.ts", import.meta.url), "utf8");
  const exportsRoute = readFileSync(new URL("../src/app/api/admin/exports/download/route.ts", import.meta.url), "utf8");
  const exportsPage = readFileSync(new URL("../src/app/exports/page.tsx", import.meta.url), "utf8");
  assert.match(queries, /fetchAdminActivityPage/);
  assert.match(queries, /count: "exact"/);
  assert.match(activity, /Audit filters/);
  assert.match(activity, /No admin activity matches these filters/);
  assert.doesNotMatch(activity, /JSON\.stringify\(entry\.metadata\)/);
  assert.match(exportsLib, /ADMIN_EXPORT_DEFINITIONS/);
  assert.match(exportsLib, /normalizeExportFilters/);
  assert.match(exportsRoute, /canExportType/);
  assert.match(exportsRoute, /filters,/);
  assert.match(exportsPage, /Data scope/);
  assert.match(exportsPage, /Confidential operational data/);
});
