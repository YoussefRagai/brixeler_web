import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20260830105000_developer_project_phases.sql");
const queries = read("../src/lib/developerQueries.ts");
const projectsPage = read("../src/app/developer/projects/page.tsx");
const portalRoute = read("../src/app/developer/projects/[projectId]/page.tsx");
const phaseBoard = read("../src/components/DeveloperProjectPhaseBoard.tsx");
const importPanel = read("../src/components/ProjectImportPanel.tsx");
const listingWizard = read("../src/components/DeveloperListingWizard.tsx");
const listingCreatePage = read("../src/app/developer/listings/new/page.tsx");
const listingEditPage = read("../src/app/developer/listings/[listingId]/page.tsx");
const listingProjectFields = read("../src/components/DeveloperListingProjectFields.tsx");

test("phase migration is additive, ordered, tenant-safe, and backward compatible", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /\ncommit;\s*$/);
  assert.match(migration, /create table if not exists public\.developer_project_phases/);
  for (const column of ["project_id", "phase_order", "is_default", "launch_status", "lifecycle_state", "approval_status", "archived_at", "archived_by_account_id"]) {
    assert.match(migration, new RegExp(`\\b${column}\\b`));
  }
  assert.match(migration, /alter table public\.project_unit_types\s+add column if not exists phase_id/);
  assert.match(migration, /alter table public\.properties\s+add column if not exists phase_id/);
  assert.match(migration, /alter table public\.developer_projects\s+add column if not exists project_logo_url/);
  assert.match(migration, /Compatibility release for existing project inventory/);
  assert.match(migration, /create_default_developer_project_phase/);
  assert.match(migration, /unique \(project_id, phase_order\)/);
  assert.match(migration, /project_unit_types_active_phase_label_idx/);
});

test("phase publication and mobile visibility remain subordinate to project publication", () => {
  assert.match(migration, /developer_project_phase_is_public/);
  assert.match(migration, /unit_type\.phase_id = phase\.id/);
  assert.match(migration, /unit_type\.archived_at is null/);
  assert.match(migration, /phase\.approval_status = 'approved'/);
  assert.match(migration, /phase\.lifecycle_state = 'published'/);
  assert.match(migration, /project\.approval_status = 'approved'/);
  assert.match(migration, /project\.lifecycle_state = 'published'/);
  assert.match(migration, /developer\.lifecycle_state = 'published'/);
  assert.match(migration, /create policy developer_project_phases_mobile_read/);
  assert.match(migration, /grant select on public\.developer_project_phases to anon, authenticated/);
  assert.match(migration, /sync_developer_project_phase_publication/);
  assert.match(migration, /revoke all on function public\.create_developer_project_phase/);
  assert.match(migration, /p_account_id uuid/);
  assert.match(migration, /Active developer membership required/);
  assert.match(migration, /A release phase is required for developer project inventory/);
  assert.match(migration, /import_developer_project_inventory/);
});

test("phase RPCs archive instead of destroying records and query layer carries phase scope", () => {
  for (const fn of ["create_developer_project_phase", "update_developer_project_phase", "archive_developer_project_phase", "restore_developer_project_phase"]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${fn}`));
    assert.match(queries, new RegExp(fn));
  }
  assert.match(migration, /set archived_at = now\(\), archived_by_account_id = p_account_id/);
  assert.match(migration, /set archived_at = null, archived_by_account_id = null/);
  assert.match(queries, /phase_id: phaseResult\.data\?\.id/);
  assert.match(queries, /resolveDeveloperProjectPhase/);
  assert.match(queries, /importDeveloperProjectInventory/);
  assert.match(queries, /developer_project_phases\(id, project_id/);
  assert.match(queries, /archiveProjectUnitType/);
  assert.match(queries, /archiveProjectUnitVariant/);
});

test("project portal exposes phase workspaces, scoped inventory, media validation, and previews", () => {
  assert.equal(existsSync(new URL("../src/app/developer/projects/[projectId]/page.tsx", import.meta.url)), true);
  assert.match(portalRoute, /DeveloperProjectsPage/);
  assert.match(projectsPage, /DeveloperProjectPhaseBoard/);
  assert.match(projectsPage, /selectedPhaseId/);
  assert.match(projectsPage, /unit\.phase_id === selectedPhaseId/);
  assert.match(projectsPage, /createProjectPhaseAction/);
  assert.match(projectsPage, /updateProjectPhaseAction/);
  assert.match(projectsPage, /archiveProjectPhaseAction/);
  assert.match(projectsPage, /restoreProjectPhaseAction/);
  assert.match(projectsPage, /session\.accountId/);
  assert.match(projectsPage, /normalizeHttpMediaUrl/);
  assert.match(projectsPage, /projectPortalHref/);
  assert.match(projectsPage, /DeveloperMediaField/);
  for (const field of ["project_logo_url", "project_image_urls", "project_brochure_url", "project_masterplan_url", "voice_note_urls", "project_video_urls", "project_inventory_url"]) {
    assert.match(projectsPage, new RegExp(field));
  }
  assert.match(projectsPage, /MobilePreviewButton/);
  assert.match(phaseBoard, /Release phases/);
  assert.match(phaseBoard, /Archived phases/);
  assert.match(phaseBoard, /Restore/);
  assert.match(phaseBoard, /DeveloperMediaField/);
  assert.match(phaseBoard, /phaseHeroImageUrl/);
  assert.match(importPanel, /phaseId/);
  assert.match(projectsPage, /No rows were saved/);
});

test("developer resale flows require an explicit active phase for linked projects", () => {
  assert.match(listingWizard, /name="phaseId"/);
  assert.match(listingWizard, /Release phase/);
  assert.match(listingWizard, /phase_id/);
  assert.match(listingWizard, /value=\{selectedPhaseId\}/);
  assert.match(listingWizard, /setSelectedPhaseId\(nextPhaseId\)/);
  assert.match(listingCreatePage, /const phaseId = formData\.get\("phaseId"\)/);
  assert.match(listingCreatePage, /phaseId, price/);
  assert.match(listingEditPage, /DeveloperListingProjectFields/);
  assert.match(listingProjectFields, /setPhaseId\(nextPhases\[0\]\?\.id \?\? ""\)/);
  assert.match(listingProjectFields, /disabled={!projectId \|\| !phases\.length}/);
  assert.match(listingEditPage, /listing\.phase_id/);
  assert.match(listingEditPage, /const phaseId = formData\.get\("phaseId"\)/);
  assert.match(listingEditPage, /phaseId,/);
});
