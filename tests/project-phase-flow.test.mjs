import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const board = read("../src/components/DeveloperProjectPhaseBoard.tsx");
const form = read("../src/components/DeveloperPhaseForm.tsx");
const merchandising = read("../src/components/DeveloperPhaseMerchandisingFields.tsx");

test("phase board uses one accessible create trigger and parent-owned phase links", () => {
  assert.match(board, /DeveloperPhaseFormTrigger/);
  assert.match(board, /targetId="new-project-phase"/);
  assert.doesNotMatch(board, /href="#new-project-phase"/);
  assert.match(board, /phaseForm\?: "create" \| "edit" \| null/);
  assert.match(board, /hrefForPhase\(phase\.id\)/);
  assert.match(board, /hrefForInventory\(selectedPhase\.id\)/);
  assert.match(board, /Next: add phase inventory/);
});

test("phase form keeps action field names while adding compact basics and pending/cancel controls", () => {
  for (const field of [
    "phaseName",
    "phaseOrder",
    "phaseLaunchStatus",
    "phaseLaunchDate",
    "phaseSalesStatus",
    "phaseDeliveryDate",
    "phaseDescription",
    "phaseFacilities",
    "phaseSellingPoints",
  ]) {
    assert.match(form + merchandising, new RegExp(`name=\\"${field}\\"`), field);
  }
  assert.match(form, /urlName="phaseHeroImageUrl"/);
  assert.match(merchandising, /urlName="phaseMasterplanUrl"/);
  assert.match(form, /required[^>]+defaultValue=\{phase\?\.name/);
  assert.match(form, /required[^>]+defaultValue=\{phase\?\.phase_order/);
  assert.match(form, /DeveloperPhaseFormCancelButton/);
  assert.match(form, /pendingLabel=\{editing \? "Saving…" : "Creating…"\}/);
  assert.match(form, /data-phase-form-focus/);
  assert.match(form, /hidden=\{!open\}/);
});

test("optional merchandising controls stay in the submitted form when collapsed", () => {
  assert.match(merchandising, /compact\?: boolean/);
  assert.match(merchandising, /Optional facilities & materials/);
  assert.match(merchandising, /name="phaseFacilities"/);
  assert.match(merchandising, /name="phaseSellingPoints"/);
  assert.match(merchandising, /fileName="phaseMasterplan"/);
  assert.doesNotMatch(merchandising, /disabled=.*phaseFacilities|disabled=.*phaseSellingPoints|disabled=.*phaseMasterplan/);
});
