import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("dark dashboard controls keep a readable foreground inside the light compatibility layer", () => {
  assert.match(css, /\.dashboard-shell :is\(\.bg-white[\s\S]*?--dashboard-ink: #050505/);
  assert.match(css, /\.dashboard-shell :is\(\.bg-black[\s\S]*?--dashboard-ink: #fff/);
  assert.match(css, /\.dashboard-shell \.text-white,[\s\S]*?color: var\(--dashboard-ink\) !important/);
  assert.match(css, /\[class~="bg-black\/60"\]/);
  assert.doesNotMatch(css, /\.glassless \.bg-black \.text-white/);
});

test("developer media fields support picker, drag-and-drop, and safe URL entry", () => {
  const field = readFileSync(new URL("../src/components/DeveloperMediaField.tsx", import.meta.url), "utf8");

  assert.match(field, /type="file"/);
  assert.match(field, /onDrop=/);
  assert.match(field, /event\.dataTransfer\.files/);
  assert.match(field, /type="url"/);
  assert.match(field, /acceptsFile/);
  assert.match(field, /aria-live="polite"/);
});

test("project wizard cannot mark skipped invalid steps complete", () => {
  const wizard = readFileSync(new URL("../src/components/ProjectWizard.tsx", import.meta.url), "utf8");

  assert.match(wizard, /const \[completedSteps, setCompletedSteps\]/);
  assert.match(wizard, /const complete = completedSteps\.includes\(index\)/);
  assert.match(wizard, /const locked = index > activeStep \+ 1 && !complete/);
  assert.match(wizard, /if \(index === activeStep \+ 1 && !complete\)[\s\S]*moveForward\(\)/);
  assert.doesNotMatch(wizard, /const complete = index < activeStep/);
});
