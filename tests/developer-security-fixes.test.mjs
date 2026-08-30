import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isSafeWebhookEndpointUrl } from "../src/lib/webhookUrl.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("webhook validation rejects private, local, and credential-bearing destinations", () => {
  for (const value of [
    "https://127.0.0.1/hook",
    "https://2130706433/hook",
    "https://10.0.0.8/hook",
    "https://172.16.0.4/hook",
    "https://192.168.1.4/hook",
    "https://[::1]/hook",
    "https://service.internal/hook",
    "https://user:password@example.com/hook",
  ]) {
    assert.equal(isSafeWebhookEndpointUrl(value), false, value);
  }
  assert.equal(isSafeWebhookEndpointUrl("https://hooks.example/v1/events"), false, "reserved example host is not deliverable");
  assert.equal(isSafeWebhookEndpointUrl("https://hooks.acme.test/v1/events"), false, "test host is not deliverable");
  assert.equal(isSafeWebhookEndpointUrl("https://hooks.acme.com/v1/events"), true);
});

test("final-admin, phase, upload, rollback, and secret response boundaries are present", async () => {
  const team = await read("supabase/migrations/20260830111500_developer_team_rbac.sql");
  const phases = await read("supabase/migrations/20260830105000_developer_project_phases.sql");
  const projects = await read("src/app/developer/projects/page.tsx");
  const schedules = await read("src/app/api/developer/integrations/schedules/route.ts");
  const credentials = await read("src/app/api/developer/integrations/credentials/route.ts");
  const webhooks = await read("src/app/api/developer/integrations/webhooks/route.ts");
  const sales = await read("supabase/migrations/20260830110000_developer_sales_operations.sql");

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
  assert.match(schedules, /\.from\("developer_import_schedules"\)[\s\S]*\.delete\(\)[\s\S]*\.eq\("developer_id", session\.developerId\)/);
  assert.match(credentials, /secret \}, \{ status: 201, headers: \{ "Cache-Control": "private, no-store" \} \}/);
  assert.match(webhooks, /isSafeWebhookEndpointUrl\(endpointUrl\)/);
  assert.match(webhooks, /secret \}, \{ status: 201, headers: \{ "Cache-Control": "private, no-store" \} \}/);
  assert.match(sales, /developer_webhook_url_is_safe/);
});
