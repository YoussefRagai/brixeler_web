import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const wizard = readFileSync(new URL("../src/components/ProjectWizard.tsx", import.meta.url), "utf8");
const createForm = readFileSync(new URL("../src/components/DeveloperProjectCreateForm.tsx", import.meta.url), "utf8");

test("project creation is a compact three-step wizard with inactive panels hidden", () => {
  assert.match(wizard, /id: "details", label: "Project details"/);
  assert.match(wizard, /id: "materials", label: "Materials"/);
  assert.match(wizard, /id: "review", label: "Review & create"/);
  assert.match(wizard, /hidden: panelId !== steps\[activeStep\]\.id/);
  assert.match(wizard, /const invalidControl = getDraftControls\(form\)\.find/);
  assert.match(wizard, /noValidate onSubmit={submit}/);
});

test("drafts are developer-scoped, exclude file inputs, and guard duplicate submits", () => {
  assert.match(wizard, /PROJECT_WIZARD_DRAFT_KEY}:\$\{developerId\}/);
  assert.match(wizard, /\["file", "submit", "button", "reset"\]\.includes\(control\.type\)/);
  assert.match(wizard, /if \(submitLocked\) \{[\s\S]*event\.preventDefault\(\)/);
  assert.match(wizard, /Uploads are never saved/);
});

test("creation keeps existing server field names and moves inventory out of the initial flow", () => {
  for (const fieldName of [
    "name",
    "description",
    "location",
    "acres",
    "footprint",
    "maintenance",
    "chFees",
    "sellingPoints",
    "deliveryDate",
    "customFacilities",
    "projectAmenities",
    "projectTypes",
    "launchStatus",
    "launchDate",
    "eoiValueApt",
    "eoiValueVilla",
    "commissionRate",
    "platformShare",
  ]) {
    assert.match(createForm, new RegExp(`name=["']${fieldName}["']`), `missing ${fieldName}`);
  }
  for (const fileName of ["project_logo", "project_images", "project_brochure", "project_masterplan", "voice_notes", "project_videos"]) {
    assert.match(createForm, new RegExp(`fileName=["']${fileName}["']`), `missing ${fileName}`);
  }
  assert.match(createForm, /name={`paymentPlanTitle_\$\{index\}`}/);
  assert.match(createForm, /<DownPaymentStages prefix={`paymentPlan\$\{index\}`}/);
  assert.match(createForm, /name="offerTitle_0"/);
  assert.doesNotMatch(createForm, /fileName="project_inventory"/);
  assert.match(createForm, /Inventory spreadsheets are added from the project workspace after creation/);
  assert.match(createForm, /ev_charger/);
});

test("templates are explicit starting points and review reflects entered values", () => {
  assert.match(createForm, /Changing the template may replace the current starting values/);
  assert.match(createForm, /templateProject\?\.name \? `\$\{stringValue\(templateProject\.name\)\} Copy`/);
  assert.match(createForm, /readReviewSnapshot\(form\)/);
  assert.match(createForm, /form\.addEventListener\("input", update\)/);
  assert.match(createForm, /Commercial terms <span className="font-normal text-neutral-500">· optional/);
  assert.match(createForm, /Launch settings <span className="font-normal text-neutral-500">· optional/);
});
