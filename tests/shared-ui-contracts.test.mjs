import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("dark dashboard controls keep a readable foreground inside the light compatibility layer", () => {
  const lightOverride = css.indexOf(".glassless .text-white");
  const darkOverride = css.indexOf(".glassless .bg-black.text-white");

  assert.ok(lightOverride >= 0, "expected the legacy light-dashboard text remap");
  assert.ok(darkOverride > lightOverride, "dark-control exception must follow the light text remap");
  assert.match(css, /\.glassless \.bg-black\.text-white[\s\S]*color:\s*#fff\s*!important/);
  assert.match(css, /\[class~="bg-black\/60"\]\.text-white/);
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
