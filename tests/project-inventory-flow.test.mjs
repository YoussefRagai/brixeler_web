import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/components/DeveloperInventoryGrid.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const collect = (node) => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(collect) : [node, ...collect(node.props?.children)];

test("editing inventory selects the affected row and invalidates the old local check", () => {
  const updates = [];
  let hook = 0;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)((name) => {
    if (name === "react") return {
      ...require("react"), useMemo: (fn) => fn(), useRef: (value) => ({ current: value }),
      useState: (initial) => { const index = hook++; const value = typeof initial === "function" ? initial() : initial; return [value, (next) => updates.push({ index, value: typeof next === "function" ? next(value) : next })]; },
    };
    if (name === "read-excel-file/browser") return { readSheet: () => { throw new Error("Not used in this test"); } };
    if (name === "@/components/ProjectWorkflowSubmitButton") return { ProjectWorkflowSubmitButton: "workflow-button" };
    return require(name);
  }, loaded, loaded.exports);
  const action = () => {};
  const nodes = collect(loaded.exports.DeveloperInventoryGrid({
    projectId: "project-1", phaseId: "phase-1", phaseName: "Garden release",
    rows: [{ id: "unit-1", property_name: "Garden apartment", price: 2000000, unit_area: 120, availability_state: "available", active_hold: null }],
    bulkUpdateAction: action, importAction: action, holdAction: action, releaseHoldAction: action, saveFilterAction: action,
  }));
  const nameInput = nodes.find((node) => node.props?.["aria-label"] === "Unit name for Garden apartment");
  assert.ok(nameInput);
  nameInput.props.onChange({ target: { value: "Updated apartment" } });
  assert.deepEqual(updates.find((entry) => entry.index === 2)?.value, ["unit-1"]);
  assert.equal(updates.find((entry) => entry.index === 4)?.value, false);
  assert.ok(nodes.some((node) => node.type === "workflow-button" && node.props.children === "Save filter"));
  assert.ok(nodes.some((node) => node.props?.["aria-label"] === "Price in EGP for Garden apartment"));
});

test("inventory saves validate on the server only as part of the commit", () => {
  assert.doesNotMatch(source, /Validate on server|Back to saving/);
  assert.match(source, /name="dryRun" value="false"/);
  assert.match(source, /disabled=\{!phaseId \|\| Boolean\(importErrors\.length\)\}/);
  assert.match(source, /pendingLabel="Importing…"/);
});

test("inventory action forms preserve the selected phase and prevent duplicate submits", () => {
  assert.match(source, /form action=\{saveFilterAction\}[\s\S]*?name="phaseId"/);
  assert.match(source, /form action=\{releaseHoldAction\}[\s\S]*?name="phaseId"/);
  assert.match(source, /form action=\{holdAction\}[\s\S]*?name="phaseId"/);
  assert.match(source, /pendingLabel="Saving…">Save filter/);
  assert.match(source, /pendingLabel="Releasing…">Release hold/);
  assert.match(source, /pendingLabel="Creating hold…">Create hold/);
});
