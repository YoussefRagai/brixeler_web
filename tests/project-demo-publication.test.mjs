import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function loadFunctions(path, names) {
  const source = ts.createSourceFile(path, readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const selected = source.statements.filter((node) =>
    (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) ||
    (ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => names.includes(declaration.name.getText(source)))),
  );
  const code = ts.transpileModule(selected.map((node) => node.getText(source)).join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(`${code}\nreturn { ${names.join(", ")} };`)();
}

const { getProjectPublicationStatus } = loadFunctions("src/app/developer/projects/page.tsx", ["getProjectPublicationStatus"]);
const { projectStatus, isProjectMobileVisible } = loadFunctions("src/components/AdminDevelopersTable.tsx", ["projectStatus", "isProjectMobileVisible"]);
const published = { approval_status: "approved", lifecycle_state: "published", published_at: "2026-09-08T12:00:00Z" };
const { publicProfileStatus, publicProfileNote } = loadFunctions("src/app/developer/profile/page.tsx", ["publicProfileStatus", "publicProfileNote"]);
const { listingMobileVisibility } = loadFunctions("src/app/developer/listings/[listingId]/page.tsx", ["listingMobileVisibility"]);
const { listingPublicationLabel } = loadFunctions("src/app/developer/listings/page.tsx", ["listingPublicationLabel"]);

test("listing index describes approval without inferring mobile eligibility", () => {
  const listing = { status: "approved", published_at: published.published_at, visibility: "public" };
  assert.equal(listingPublicationLabel(listing), "Publication approved");
  assert.equal(listingPublicationLabel({ ...listing, is_demo: true }), "Publication approved · demo hidden");
  assert.equal(listingPublicationLabel({ ...listing, archived_at: published.published_at }), "Archived");
  assert.equal(listingPublicationLabel({ ...listing, status: "rejected" }), "Changes requested");
  const source = readFileSync(new URL("../src/app/developer/listings/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Published to mobile|Visible to agents|Listing restored to the mobile catalog/);
  assert.match(source, /Visibility enabled · subject to mobile eligibility/);
});

test("published project and company demo flags hide both modern and legacy portfolio labels", () => {
  for (const project of [published, { ...published, publication_status: "published" }]) {
    assert.equal(getProjectPublicationStatus(project).label, "Published to mobile");
    assert.equal(getProjectPublicationStatus({ ...project, is_demo: true }).label, "Published · demo hidden");
    assert.equal(getProjectPublicationStatus(project, true).label, "Published · demo hidden");
  }
});

test("demo publication retains archived and review states", () => {
  for (const [status, label] of [["draft", "Draft"], ["ready", "Ready to submit"], ["submitted", "Submitted for review"], ["changes_requested", "Changes requested"]]) {
    assert.equal(getProjectPublicationStatus({ ...published, is_demo: true, publication_status: status }).label, label);
  }
  assert.equal(getProjectPublicationStatus({ ...published, is_demo: true, lifecycle_state: "archived" }).label, "Archived");
});

test("admin moderation retains publication history while demo mobile visibility stays hidden", () => {
  for (const contract of [true, false]) {
    assert.equal(projectStatus({ ...published, is_demo: true }), "published");
    assert.equal(isProjectMobileVisible({ ...published, is_demo: true }, contract, true, "published"), false);
    assert.equal(isProjectMobileVisible(published, contract, true, "published", true), false);
    assert.equal(isProjectMobileVisible(published, contract, true, "published", false), true);
  }
});

test("profile publication messaging excludes demo and inactive companies", () => {
  const state = { contractAvailable: true, lifecycleState: "published", publishedAt: published.published_at };
  assert.equal(publicProfileStatus(state, { is_active: true }), "Published to mobile");
  assert.equal(publicProfileStatus(state, { is_active: true, is_demo: true }), "Demo · hidden from mobile");
  assert.match(publicProfileNote(state, { is_active: true, is_demo: true }), /hidden from agents/);
  assert.equal(publicProfileStatus(state, { is_active: false }), "Inactive · hidden from mobile");
  assert.match(publicProfileNote({ ...state, publishedAt: null }, { is_active: true }), /not been confirmed/);
});

test("listing preview requires eligible company, project, phase, inventory and listing", () => {
  const company = { ...published, is_active: true };
  const listing = { ...published, is_active: true, project_id: "project", phase_id: "phase", availability_state: "available" };
  const phase = { ...published, id: "phase" };
  const project = { ...published, id: "project", developer_project_phases: [phase], project_unit_types: [{ phase_id: "phase" }] };
  assert.equal(listingMobileVisibility(listing, [project], company).visible, true);
  for (const [row, projects, profile] of [
    [{ ...listing, is_demo: true }, [project], company],
    [listing, [{ ...project, is_demo: true }], company],
    [listing, [project], { ...company, is_demo: true }],
  ]) {
    assert.deepEqual(listingMobileVisibility(row, projects, profile), { visible: false, isDemo: true });
  }
  for (const [row, projects, profile] of [
    [listing, [project], null],
    [listing, [project], { ...company, is_active: false }],
    [listing, [project], { ...company, lifecycle_state: "draft" }],
    [listing, [], company],
    [listing, [{ ...project, approval_status: "pending" }], company],
    [listing, [{ ...project, developer_project_phases: [{ ...phase, archived_at: "2026-09-08" }] }], company],
    [listing, [{ ...project, project_unit_types: [] }], company],
    [{ ...listing, archived_at: "2026-09-08" }, [project], company],
    [{ ...listing, availability_state: "held" }, [project], company],
    [{ ...listing, is_active: false }, [project], company],
    [{ ...listing, expires_at: "2020-01-01" }, [project], company],
  ]) assert.equal(listingMobileVisibility(row, projects, profile).visible, false);
});
