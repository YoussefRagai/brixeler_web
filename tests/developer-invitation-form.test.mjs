import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../src/components/AdminDeveloperInviteForm.tsx", import.meta.url), "utf8");

test("developer invite form preserves retry inputs and resets only after success", () => {
  for (const field of ["developerName", "contactEmail", "contactPhone", "memberEmail", "demoBatch"]) {
    assert.match(component, new RegExp(`value=\\{formValues\\.${field}\\}`));
    assert.match(component, new RegExp(`updateFormValue\\(\\"${field}\\"`));
  }
  assert.match(component, /if \(nextState\.status === "success"\) resetForm\(\)/);
  assert.match(component, /requestIdRef\.current = null/);
  assert.match(component, /setFormValues\(initialFormValues\)/);
  assert.doesNotMatch(component, /defaultValue=""\s*\n\s*onChange=\{resetRequestId\}/);
});
