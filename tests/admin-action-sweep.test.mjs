import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("workspace and details apply role checks before loading restricted data", () => {
  const overview = source("src/app/page.tsx");
  assert.match(overview, /access\.deals\s*\? supabaseServer\s*\.from\("workspace_operations"\)/);
  assert.match(overview, /access\.verification\s*\? supabaseServer\s*\.from\("users_profile"\)[\s\S]*?\.eq\("is_demo", modeFilter\)/);
  assert.match(overview, /canExportType\(ui.roles, "dashboard"\) \? \(/);
  assert.match(overview, /format=xlsx&demo=\$\{mode === "demo" \? "demo" : "production"\}/);

  for (const [route, loader] of [["deals", "loadDeal"], ["properties", "loadProperty"]]) {
    const detail = source(`src/app/${route}/[id]/page.tsx`);
    assert.match(detail, /params: Promise<\{ id: string \}>/);
    assert.ok(detail.indexOf("if (!ui.hasAccess)") < detail.indexOf(`await ${loader}(id`));
    assert.doesNotMatch(detail, /params\.id/);
  }
});

test("admin exports apply demo scope to agents and use exact case-insensitive deal status", async (context) => {
  const libraryUrl = new URL("../src/lib/", import.meta.url).href;
  const hooks = registerHooks({
    resolve(specifier, resolutionContext, nextResolve) {
      const needsTypeScriptExtension = resolutionContext.parentURL?.startsWith(libraryUrl)
        && /^\.\/[a-z][a-zA-Z]+$/.test(specifier);
      return nextResolve(needsTypeScriptExtension ? `${specifier}.ts` : specifier, resolutionContext);
    },
  });
  const previousEnv = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:47132";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-test-key";
  context.after(() => {
    hooks.deregister();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const requests = [];
  context.mock.method(globalThis, "fetch", async (input, options) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "http://127.0.0.1:47132");
    requests.push(url);
    if (options?.method === "HEAD") return new Response(null, { headers: { "content-range": "0-0/1" } });
    return Response.json([]);
  });

  const { loadAdminExportRows, normalizeExportFilters } = await import("../src/lib/adminExports.ts");
  await loadAdminExportRows("agents", { demo: "demo" });
  assert.equal(requests.at(-1).pathname, "/rest/v1/users_profile");
  assert.equal(requests.at(-1).searchParams.get("is_demo"), "eq.true");

  requests.length = 0;
  await loadAdminExportRows("dashboard", { demo: "production", status: "paid", from: "2026-11-17", to: "2026-11-17" });
  assert.equal(requests.length, 4);
  for (const url of requests) assert.equal(url.searchParams.get("is_demo"), "eq.false");
  const dealQuery = requests.find((url) => url.pathname.endsWith("workspace_operations"));
  assert.equal(dealQuery.searchParams.get("status"), "ilike.paid");
  assert.deepEqual(dealQuery.searchParams.getAll("created_at"), ["gte.2026-11-17T00:00:00.000Z", "lt.2026-11-18T00:00:00.000Z"]);
  assert.equal(normalizeExportFilters({ status: "Accepted - Processing" }).status, "Accepted - Processing");
});

test("admin tier tables disambiguate the current assignment from the previous tier", () => {
  for (const path of ["gifts/claims/page.tsx", "agents/page.tsx", "api/admin/agents/profile/route.ts", "rewards/page.tsx"]) {
    const code = source(`src/app/${path}`);
    assert.match(code, /tiers!user_tiers_tier_id_fkey\(/);
    assert.doesNotMatch(code, /\.select\("[^"\n]*\btiers\(/);
  }
});
