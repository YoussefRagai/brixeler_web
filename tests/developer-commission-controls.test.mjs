import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adminPage = readFileSync(new URL("../src/app/developers/page.tsx", import.meta.url), "utf8");
const developerPage = readFileSync(new URL("../src/app/developer/projects/page.tsx", import.meta.url), "utf8");
const createForm = readFileSync(new URL("../src/components/DeveloperProjectCreateForm.tsx", import.meta.url), "utf8");
const baseline = readFileSync(new URL("../supabase/baseline/20260826_current_schema.sql", import.meta.url), "utf8");

test("developer project saves cannot create or update commission rules", () => {
  assert.doesNotMatch(createForm, /name="commissionRate"/);
  assert.doesNotMatch(createForm, /name="platformShare"/);
  assert.doesNotMatch(developerPage, /upsertProjectCommissionRule/);
  assert.match(developerPage, /formData\.has\("commissionRate"\) \|\| formData\.has\("platformShare"\)/);
  assert.match(developerPage, /Commission rates are managed by central admins/);
});

test("central commission controls are admin-only and tenant/property scoped", () => {
  assert.match(adminPage, /requireAdminRole\(\["developers_admin"\]\)/);
  assert.match(adminPage, /developerAdminScope\(admin\.roles, admin\.developerIds\)/);
  assert.match(adminPage, /canAccessScopedDeveloper\(scope, developerId\)/);
  assert.match(adminPage, /\.eq\("developer_id", developerId\)/);
  assert.match(adminPage, /name="propertyId"/);
  assert.match(adminPage, /property-unit override/);
  assert.match(adminPage, /DEVELOPER_COMMISSION_RATE_MAX = 10/);
  assert.match(adminPage, /PLATFORM_SHARE_MAX = 100/);
  assert.match(adminPage, /Number\.isFinite\(parsed\)/);
});

test("database contract keeps commission rules admin-only and property-backed", () => {
  assert.match(baseline, /developer_commission_rules_property_id_fkey[\s\S]*REFERENCES properties\(id\)/);
  assert.match(baseline, /constraint valid_dev_commission CHECK \(commission_rate >= 0::numeric AND commission_rate <= 10::numeric\)/);
  assert.match(baseline, /create policy ["']Admins manage developer commission rules["'][\s\S]*for all to authenticated/);
});
