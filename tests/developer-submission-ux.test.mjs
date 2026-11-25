import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync(new URL("../src/components/DeveloperPublicationFeedbackPanel.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const runtime = {
  Fragment: "fragment",
  jsx: (type, props) => ({ type, props }),
  jsxs: (type, props) => ({ type, props }),
};
const loadedModule = { exports: {} };
new Function("require", "module", "exports", code)(
  (name) => name === "react/jsx-runtime" ? runtime : require(name),
  loadedModule,
  loadedModule.exports,
);
const { DeveloperPublicationFeedbackPanel } = loadedModule.exports;
const collect = (node) => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(collect) : [node, ...collect(node.props?.children)];

const feedback = {
  id: "feedback-1",
  developer_id: "developer-1",
  entity_type: "project",
  entity_id: "project-1",
  field_name: null,
  message: "Add Location & property types",
  status: "open",
  source: "admin",
  created_at: "2026-11-25T10:00:00Z",
};

test("review feedback shows a stale-note warning when current saved checks pass", () => {
  const nodes = collect(DeveloperPublicationFeedbackPanel({
    projectId: "project-1",
    feedback: [feedback],
    resolveAction: () => {},
    rejectionReason: feedback.message,
    readinessMissing: [],
  }));
  assert.ok(nodes.some((node) => node.props?.children === "Current checklist is satisfied"));
  assert.ok(nodes.some((node) => typeof node.props?.children === "string" && node.props.children.includes("may be stale")));
  assert.ok(nodes.some((node) => node.type === "a" && node.props.href.includes("section=settings")));
});

test("review feedback identifies a current blocker without removing the resubmission path", () => {
  const nodes = collect(DeveloperPublicationFeedbackPanel({
    projectId: "project-1",
    feedback: [feedback],
    resolveAction: () => {},
    readinessMissing: ["Location"],
  }));
  assert.ok(nodes.some((node) => node.props?.children === "Still blocks the current checklist"));
  assert.ok(nodes.some((node) => node.type === "button" && node.props?.children === "Mark resolved"));
});
