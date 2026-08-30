import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20260830102000_inventory_operations_hardening.sql");
const inventoryWorkspaceMigration = read("../supabase/migrations/20260830111000_developer_inventory_publication_workspace.sql");
const propertiesPage = read("../src/app/properties/page.tsx");
const approvalQueue = read("../src/components/PropertyApprovalQueue.tsx");
const importParser = read("../src/lib/propertyImport.ts");
const importRoute = read("../src/app/api/properties/import/route.ts");
const importPanel = read("../src/components/PropertyCsvImportPanel.tsx");
const renewalQueries = read("../src/lib/developerQueries.ts");
const renewalsPage = read("../src/app/properties/renewals/page.tsx");
const renewalQueue = read("../src/components/PropertyRenewalQueue.tsx");
const mobileContactRoute = read("../src/app/api/mobile/developer-contact-requests/route.ts");

test("inventory migration is additive, transactional, and preserves mobile state boundaries", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /\ncommit;\s*$/);
  for (const field of ["publication_checklist", "quality_issues", "quality_score"]) {
    assert.match(migration, new RegExp(`add column if not exists ${field}`));
  }
  assert.match(migration, /properties_non_approved_inactive/);
  assert.match(migration, /normalize_pending_property_visibility/);
  assert.match(migration, /guard_property_publication_transition/);
  assert.match(migration, /review_property_listing/);
  assert.match(migration, /review_developer_project/);
  assert.match(migration, /property_listing_publication_check/);
  assert.match(migration, /developer_project_publication_check/);
  assert.match(migration, /for update/);
  assert.match(migration, /developer_notifications/);
  assert.match(migration, /action_url[\s\S]{0,250}\/properties/);
});

test("publication checks cover completeness, media, duplicates, project state, and safe transitions", () => {
  assert.match(migration, /At least three photos are required/);
  assert.match(migration, /Photo URLs must be unique/);
  assert.match(migration, /http\(s\) URL/);
  assert.match(migration, /matching active, pending, or approved listing/);
  assert.match(migration, /Linked project must be approved and published/);
  assert.match(migration, /Every unit type needs a label, price, area, and description/);
  assert.match(migration, /Projects must enter review before publication/);
  assert.match(migration, /Listings must enter review before publication/);
  assert.match(migration, /A review reason of at least 5 characters is required/);
  assert.match(propertiesPage, /count: "exact"/);
  assert.match(propertiesPage, /\.range\(/);
  assert.match(propertiesPage, /Publication checklist/);
  assert.match(propertiesPage, /Mobile preview/);
  assert.match(approvalQueue, /qualityIssues/);
  assert.match(approvalQueue, /isActive/);
  assert.match(approvalQueue, /response\.ok/);
});

test("property CSV import validates rows before commit and keeps imports pending/inactive", () => {
  assert.match(importParser, /parsePropertyCsv/);
  assert.match(importParser, /validatePropertyImportRows/);
  assert.match(importParser, /row-level|invalidRows/i);
  assert.match(importParser, /Photo URLs must be unique/);
  assert.match(importParser, /Associate every imported listing/);
  assert.match(importRoute, /mode.*preview|modeValue.*commit/s);
  assert.match(importRoute, /previewResponse/);
  assert.match(importRoute, /invalidRows/);
  assert.match(importRoute, /developerId/);
  assert.match(importRoute, /projectId/);
  assert.match(importRoute, /approval_status: "pending"/);
  assert.match(importRoute, /is_active: false/);
  assert.match(importRoute, /property-import-/);
  assert.match(importRoute, /crypto\.randomUUID/);
  assert.match(importPanel, /Preview \/ dry run/);
  assert.match(importPanel, /Row-level errors/);
  assert.match(importPanel, /pending and hidden from mobile/);
  assert.match(importPanel, /Network error/);
  assert.equal(existsSync(new URL("../src/app/api/properties/import/route.ts", import.meta.url)), true);
});

test("renewal operations expose paginated history, context, and explicit decision feedback", () => {
  assert.match(renewalQueries, /fetchPropertyRenewalRequestPage/);
  assert.match(renewalQueries, /count: "exact"/);
  assert.match(renewalQueries, /\.range\(/);
  for (const field of ["source", "current_expires_at", "proposed_expires_at", "rejection_reason", "reviewed_at"]) {
    assert.match(renewalQueries, new RegExp(field));
  }
  for (const status of ["pending", "approved", "rejected", "auto_expired"]) assert.match(renewalsPage, new RegExp(status));
  assert.match(renewalsPage, /fetchPropertyRenewalRequestPage/);
  assert.match(renewalsPage, /currentExpiresAt/);
  assert.match(renewalsPage, /proposedExpiresAt/);
  assert.match(renewalQueue, /Approve renewal/);
  assert.match(renewalQueue, /Reject renewal/);
  assert.match(renewalQueue, /rejectionReason/);
  assert.match(renewalQueue, /response\.ok/);
  assert.match(renewalQueue, /Network error|Request failed/);
  assert.match(read("../src/app/api/properties/renewals/reject/route.ts"), /reason.*length.*5/s);
  assert.match(read("../src/app/api/properties/renewals/approve/route.ts"), /reviewRenewalRequest/);
  assert.match(read("../src/app/api/properties/renewals/reject/route.ts"), /reviewRenewalRequest/);
  assert.match(migration, /Renewal request has already been reviewed/);
  assert.match(migration, /Current expiry/);
  assert.match(migration, /Requested new expiry/);
  assert.match(migration, /insert into public\.developer_notifications/);
});

test("inventory final-review guards preserve RBAC, holds, and mobile availability", () => {
  assert.match(
    inventoryWorkspaceMigration,
    /execute 'select public\.developer_account_has_capability\(\$1, \$2, \$3\)'[\s\S]*using p_account_id, p_developer_id, p_capability;/,
  );
  assert.match(
    inventoryWorkspaceMigration,
    /create or replace function public\.release_developer_inventory_hold[\s\S]*perform public\.expire_developer_inventory_holds\(\);[\s\S]*if hold_row\.expires_at <= clock_timestamp\(\) then raise exception 'Hold has expired'; end if;/,
  );
  assert.match(inventoryWorkspaceMigration, /requested_state_value is not null and state_value in \('reserved', 'contracted', 'sold'\)/);
  assert.match(mobileContactRoute, /\.in\("availability_state", \["available", "released"\]\)/);
});
