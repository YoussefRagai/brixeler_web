import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20261125123000_relax_project_type_publication_requirement.sql", import.meta.url), "utf8");
const propertiesPage = readFileSync(new URL("../src/app/properties/page.tsx", import.meta.url), "utf8");

test("project publication treats unit inventory as the mobile type contract", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /create or replace function public\.developer_project_publication_check/);
  assert.match(migration, /unit_type\.archived_at is null/);
  assert.match(migration, /release_phase\.archived_at is null/);
  assert.match(migration, /release_phase\.project_id = p_project_id/);
  assert.match(migration, /At least one unit type is required/);
  assert.match(migration, /Every unit type needs a label and positive price/);
  assert.match(migration, /'project_types', unit_count > 0 and incomplete_unit_count = 0/);
  assert.match(migration, /'unit_types', unit_count > 0 and incomplete_unit_count = 0/);
  assert.doesNotMatch(migration, /At least one project type is required/);
  assert.doesNotMatch(migration, /min_price < 100000/);
  assert.doesNotMatch(migration, /unit_area_min is null or unit_area_min < 10/);
  assert.doesNotMatch(migration, /unit_type\.description/);
  assert.match(migration, /revoke all on function public\.developer_project_publication_check\(uuid\)/);
  assert.match(migration, /grant execute on function public\.developer_project_publication_check\(uuid\) to service_role/);
  assert.match(migration, /\ncommit;\s*$/);
});

test("admin project review mirrors the phase-scoped publication contract", () => {
  assert.match(propertiesPage, /developer_project_phases/);
  assert.match(propertiesPage, /phase_id, label, min_price, archived_at/);
  assert.match(propertiesPage, /lifecycle_state, archived_at/);
  assert.match(propertiesPage, /lifecycle_state != null/);
  assert.match(propertiesPage, /lifecycle_state !== "archived"/);
  assert.match(propertiesPage, /Number\(unit\.min_price\) > 0/);
  assert.doesNotMatch(propertiesPage, /project\.project_types\?\.length/);
  assert.doesNotMatch(propertiesPage, /unit\.unit_area_min/);
  assert.doesNotMatch(propertiesPage, /unit\.description\?\.trim\(\)/);
});
