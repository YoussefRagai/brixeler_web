import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getProjectWizardDraftKey, normalizeProjectWorkspaceSection, normalizeProjectInventoryView, projectSectionQuery, projectSetupAction } from "../src/lib/developerProjectFlow.ts";

const projectsPage = readFileSync(new URL("../src/app/developer/projects/page.tsx", import.meta.url), "utf8");

test("workspace defaults preserve sales scope and explicit inventory views", () => {
  assert.equal(normalizeProjectWorkspaceSection("settings", false), "inventory");
  assert.equal(normalizeProjectWorkspaceSection("review", true), "review");
  assert.equal(normalizeProjectWorkspaceSection("unknown", true), "overview");
  assert.equal(normalizeProjectInventoryView(null, false), "units");
  assert.equal(normalizeProjectInventoryView(null, true), "types");
  assert.equal(normalizeProjectInventoryView("units", true), "units");
});

test("project wizard drafts are isolated by developer and account", () => {
  assert.equal(getProjectWizardDraftKey("developer-1", "account-1"), "brixeler-project-wizard-draft-v1:developer-1:account-1");
  assert.notEqual(getProjectWizardDraftKey("developer-1", "account-1"), getProjectWizardDraftKey("developer-1", "account-2"));
  assert.notEqual(getProjectWizardDraftKey("developer-1", "account-1"), getProjectWizardDraftKey("developer-2", "account-1"));
});

test("project action menu remains visible and named outside the hero clipping layer", () => {
  assert.match(projectsPage, /id="project-overview" className="relative scroll-mt-24 overflow-visible/);
  assert.match(projectsPage, /<summary role="button" aria-label="More project actions"/);
  assert.match(projectsPage, /aria-label="Download inventory template"/);
  assert.match(projectsPage, /ariaLabel="Archive project"/);
});

test("inventory destinations retain phase and edit existing incomplete types", () => {
  const params = new URLSearchParams(projectSectionQuery("inventory", { phaseId: "phase-2", inventoryView: "units" }));
  assert.equal(params.get("phase"), "phase-2");
  assert.equal(params.get("inventoryView"), "units");
  const action = projectSetupAction({ projectId: "project-1", missing: ["Unit details"], activePhaseCount: 2, selectedPhaseId: "phase-1", incompleteUnitTypeId: "type-2", incompleteUnitTypePhaseId: "phase-2" });
  assert.match(action.href, /phase=phase-2/);
  assert.match(action.href, /editUnitType=type-2/);
  assert.doesNotMatch(action.href, /addUnitType/);
});

test("empty inventory creates a phase first and shared-detail links retain context", () => {
  assert.match(projectSetupAction({ projectId: "p", missing: ["Unit inventory"], activePhaseCount: 0 }).href, /phase=new/);
  assert.match(projectSetupAction({ projectId: "p", missing: ["Hero media"], activePhaseCount: 1, selectedPhaseId: "phase-2" }).href, /phase=phase-2/);
});
