import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const nativeRequire = createRequire(import.meta.url);

function load(relativePath, mocks = {}) {
  const code = ts.transpileModule(
    readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText;
  const loadedModule = { exports: {} };
  new Function("require", "module", "exports", code)(
    (id) => mocks[id] ?? nativeRequire(id),
    loadedModule,
    loadedModule.exports,
  );
  return loadedModule.exports;
}

test("developer navigation hydrates authorized capabilities on the server", async () => {
  const serverLayout = await read("src/components/DeveloperLayout.tsx");
  const clientLayout = await read("src/components/DeveloperLayoutClient.tsx");
  const profilePage = await read("src/app/developer/profile/page.tsx");

  assert.doesNotMatch(serverLayout, /[\"']use client[\"']/);
  assert.match(serverLayout, /requireDeveloperSession\(\{ allowIncompleteProfile: onboarding \}\)/);
  assert.match(serverLayout, /fetchDeveloperPortalBrand\(session\.developerId\)/);
  assert.match(serverLayout, /capabilities: developerRoleCapabilities\(session\.role\)/);
  assert.match(serverLayout, /brand \?\? fallbackBrand/);
  assert.match(serverLayout, /preview && \(!process\.env\.NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(profilePage, /DeveloperLayout[\s\S]*preview>/);
  assert.match(clientLayout, /initialBrand \?\? fallbackBrand/);
});

test("a client brand request cannot erase server-authorized navigation", async () => {
  const clientLayout = await read("src/components/DeveloperLayoutClient.tsx");

  assert.doesNotMatch(clientLayout, /fetch\([\"']\/api\/developer\/brand[\"']/);
  assert.doesNotMatch(clientLayout, /setBrand\(null\)/);
  assert.match(clientLayout, /server wrapper/);
  assert.match(clientLayout, /AbortController/);
  assert.match(clientLayout, /setProjects\(null\)/);
  assert.match(clientLayout, /projects \? <span/);
});

test("server hydration keeps verified navigation when branding fails and preserves onboarding auth", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousWarn = console.warn;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  console.warn = () => {};

  try {
    const calls = [];
    const DeveloperLayoutClient = () => null;
    const { DeveloperLayout } = load("src/components/DeveloperLayout.tsx", {
      "@/lib/developerAuth": {
        requireDeveloperSession: async (options) => {
          calls.push(options);
          return { developerId: "developer-1", role: "sales_manager" };
        },
      },
      "@/lib/developerPortalBrand": {
        fetchDeveloperPortalBrand: async () => {
          throw new Error("brand query unavailable");
        },
      },
      "@/lib/developerRbac": {
        developerRoleCapabilities: () => ["manage_inventory", "view_contacts", "manage_contacts"],
      },
      "./DeveloperLayoutClient": { DeveloperLayoutClient },
    });

    const rendered = await DeveloperLayout({ title: "Overview", children: null });
    assert.deepEqual(rendered.props.initialBrand, {
      name: "Brixeler Partners",
      logoUrl: null,
      tagline: "Your portfolio command center",
      pendingReview: false,
      role: "sales_manager",
      capabilities: ["manage_inventory", "view_contacts", "manage_contacts"],
    });
    assert.deepEqual(calls[0], { allowIncompleteProfile: false });

    const onboardingRendered = await DeveloperLayout({ title: "Profile", children: null, onboarding: true });
    assert.deepEqual(calls[1], { allowIncompleteProfile: true });
    assert.equal(onboardingRendered.props.onboarding, true);
  } finally {
    console.warn = previousWarn;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test("missing-backend rendering is only available through the explicit profile preview", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    let authCalls = 0;
    const { DeveloperLayout } = load("src/components/DeveloperLayout.tsx", {
      "@/lib/developerAuth": {
        requireDeveloperSession: async () => {
          authCalls += 1;
          throw new Error("auth should not run for explicit preview");
        },
      },
      "@/lib/developerPortalBrand": { fetchDeveloperPortalBrand: async () => null },
      "@/lib/developerRbac": { developerRoleCapabilities: () => [] },
      "./DeveloperLayoutClient": { DeveloperLayoutClient: () => null },
    });

    const rendered = await DeveloperLayout({ title: "Profile", children: null, preview: true });
    assert.equal(rendered.props.initialBrand, null);
    assert.equal(authCalls, 0);
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});
