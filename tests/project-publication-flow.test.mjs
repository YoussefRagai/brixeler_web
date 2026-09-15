import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync(new URL("../src/components/DeveloperPublicationWorkflow.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const loadedModule = { exports: {} };
new Function("require", "module", "exports", code)(
  (name) => name === "@/components/ProjectWorkflowSubmitButton" ? { ProjectWorkflowSubmitButton: "workflow-button" } : require(name), loadedModule, loadedModule.exports,
);
const { DeveloperPublicationWorkflow } = loadedModule.exports;
const collect = (node) => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(collect) : [node, ...collect(node.props?.children)];
const render = (status, missing = [], extra = {}) => collect(DeveloperPublicationWorkflow({
  projectId: "project-1", status, readiness: { score: 100, missing }, markReadyAction: () => {}, submitAction: () => {}, ...extra,
}));

test("published demo workflow keeps approval stage but labels customer visibility honestly", () => {
  const nodes = render("published", [], { isDemo: true });
  assert.ok(nodes.some((node) => node.props?.children === "Published · demo hidden"));
  assert.ok(nodes.find((node) => node.props?.["aria-current"] === "step").props.children.includes("Publication"));
  assert.equal(nodes.filter((node) => node.type === "form").length, 0);
});

test("submitted, approved, published and archived projects do not offer duplicate submission", () => {
  for (const status of ["submitted", "approved", "published", "archived", "unexpected"])
    assert.equal(render(status).filter((node) => node.type === "form").length, 0, status);
});

test("drafts can prepare and submit, ready projects only submit, blockers disable both actions", () => {
  assert.equal(render("draft").filter((node) => node.type === "form").length, 2);
  assert.equal(render("ready").filter((node) => node.type === "form").length, 1);
  for (const node of render("draft", ["Location"]).filter((node) => node.type === "workflow-button")) assert.equal(node.props.disabled, true);
});

test("changes requested returns to preparation instead of appearing as a completed forward stage", () => {
  const nodes = render("changes_requested");
  const current = nodes.find((node) => node.props?.["aria-current"] === "step");
  assert.ok(current.props.children.includes("Prepare"));
  assert.ok(nodes.some((node) => node.type === "workflow-button" && node.props.children === "Resubmit for review"));
});

test("readiness issues link to editable project sections and demo visibility is explicit", () => {
  const nodes = render("draft", ["Hero media", "Unit details", "Phase"], { isDemo: true });
  const links = nodes.filter((node) => node.type === "a").map((node) => node.props.href);
  assert.ok(links.some((href) => href.includes("section=settings#project-media")));
  assert.ok(links.some((href) => href.includes("inventoryView=types")));
  assert.ok(links.some((href) => href.includes("section=phases")));
  assert.ok(nodes.some((node) => typeof node.props?.children === "string" && node.props.children.includes("hidden from customers")));
});
