import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("final-admin, phase, upload, and rollback boundaries are present", async () => {
  const team = await read("supabase/migrations/20260830111500_developer_team_rbac.sql");
  const phases = await read("supabase/migrations/20260830105000_developer_project_phases.sql");
  const projects = await read("src/app/developer/projects/page.tsx");

  assert.match(team, /perform 1[\s\S]*from public\.developers developer[\s\S]*for update/);
  for (const functionName of ["create_developer_project_phase", "update_developer_project_phase", "archive_developer_project_phase", "restore_developer_project_phase"]) {
    const start = phases.indexOf(`create or replace function public.${functionName}`);
    const end = phases.indexOf("create or replace function public.", start + 1);
    const body = phases.slice(start, end < 0 ? phases.length : end);
    assert.ok(start >= 0, `missing ${functionName}`);
    assert.match(body, /lower\(coalesce\(account\.role, ''\)\) in \([\s\S]*'project_manager'/, functionName);
  }
  const phaseCreateStart = projects.indexOf("async function createProjectPhaseAction");
  const phaseCreateBody = projects.slice(phaseCreateStart, projects.indexOf("async function updateProjectPhaseAction", phaseCreateStart));
  const phaseUpdateStart = projects.indexOf("async function updateProjectPhaseAction");
  const phaseUpdateBody = projects.slice(phaseUpdateStart, projects.indexOf("async function archiveProjectPhaseAction", phaseUpdateStart));
  const unitStart = projects.indexOf("async function upsertProjectUnitTypeAction");
  const unitBody = projects.slice(unitStart, projects.indexOf("async function archiveUnitTypeAction", unitStart));
  for (const [name, body, uploadCall] of [["phase create", phaseCreateBody, "uploadPhaseHeroImage"], ["phase update", phaseUpdateBody, "uploadPhaseHeroImage"], ["unit type", unitBody, "uploadFileToBucket"]]) {
    assert.ok(body.indexOf("developerProjectUploadPreflight") >= 0, `${name} must preflight project ownership`);
    assert.ok(body.indexOf("developerProjectUploadPreflight") < body.indexOf(uploadCall), `${name} must preflight before upload`);
  }
  assert.match(projects, /uploadedObjects\.push\(\{ bucket: STORAGE_BUCKETS\.projectUnitImages/);
  assert.match(projects, /removeUploadedStorageObjects\(uploadedObjects\)/);
});
