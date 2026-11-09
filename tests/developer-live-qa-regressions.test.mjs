import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { databaseProjectLaunchStatus } from "../src/lib/developerProjectFlow.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("project release writes the database launch value and hides the action once set", () => {
  const page = read("../src/app/developer/projects/page.tsx");
  const migration = read("../supabase/migrations/20260415192727_add_developer_project_plan_templates_and_launch_state.sql");
  assert.match(migration, /launch_status in \('live', 'new_launch', 'upcoming'\)/);
  assert.equal(databaseProjectLaunchStatus("new_release"), "new_launch");
  assert.equal(databaseProjectLaunchStatus("upcoming"), "upcoming");
  assert.equal(databaseProjectLaunchStatus("live"), "live");
  assert.match(page, /launch_status: databaseProjectLaunchStatus\(launchStatus\)/);
  assert.match(page, /launch_status: databaseProjectLaunchStatus\(status\)/);
  assert.match(page, /normalizeLaunchStatus\(selectedProject\?\.launch_status\) !== "new_release"/);
  assert.doesNotMatch(page, /encodeURIComponent\(error\?\.message \?\? "Project not found or access denied\."\)/);
});

test("projects created under demo developers inherit explicit demo metadata", () => {
  const queries = read("../src/lib/developerQueries.ts");
  assert.match(queries, /\.from\("developers"\)\s*\.select\("is_demo, demo_batch"\)/);
  assert.match(queries, /is_demo: Boolean\(developer\.is_demo\), demo_batch: developer\.is_demo \? developer\.demo_batch : null/);
});

test("project setup copy matches direct upload behavior", () => {
  const form = read("../src/components/DeveloperProjectCreateForm.tsx");
  assert.match(form, /Upload files now or paste hosted URLs\. Save the project to attach them/);
  assert.doesNotMatch(form, /Files are sent only when you create the project/);
});
