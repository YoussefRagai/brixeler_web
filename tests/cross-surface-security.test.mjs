import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import { unzipSync, strFromU8 } from "fflate";

const root = fileURLToPath(new URL("../", import.meta.url));
const nativeRequire = createRequire(import.meta.url);
// Execute actual route code with isolated provider/session/database boundaries.
function load(relative, mocks = {}, cache = new Map()) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loadedModule = { exports: {} };
  cache.set(filename, loadedModule);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const require = (id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id.startsWith(".") || id.startsWith("@/")) {
      const resolved = id.startsWith("@/") ? path.join(root, "src", id.slice(2)) : path.resolve(path.dirname(filename), id);
      return load(resolved.endsWith(".ts") ? resolved : `${resolved}.ts`, mocks, cache);
    }
    return nativeRequire(id);
  };
  new Function("require", "module", "exports", output)(require, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const NextResponse = {
  json: (body, options) => Response.json(body, options),
  redirect: (url) => ({ status: 307, url: String(url), cookies: cookieJar(), headers: new Headers() }),
};
function cookieJar() {
  const values = new Map();
  return { values, get: (key) => values.get(key), set: (key, value, options) => values.set(key, { value, options }), delete: (key) => values.delete(key) };
}
function database(row) {
  const state = { row, beforeWrite: null, failure: null, writes: [], deleted: false };
  state.from = () => {
    let patch;
    let deleting = false;
    const filters = [];
    const finish = async () => {
      if (patch || deleting) await state.beforeWrite?.();
      if (state.failure) return { data: null, error: state.failure };
      if (state.deleted || !state.row || !filters.every((matches) => matches(state.row))) return { data: null, error: null };
      if (deleting) state.deleted = true;
      if (patch) { state.writes.push(patch); Object.assign(state.row, patch); }
      return { data: { ...state.row }, error: null };
    };
    const query = {
      select: () => query,
      update: (value) => { patch = value; return query; },
      delete: () => { deleting = true; return query; },
      eq: (key, value) => { filters.push((row) => row[key] === value); return query; },
      is: (key, value) => { filters.push((row) => row[key] === value); return query; },
      gt: (key, value) => { filters.push((row) => row[key] > value); return query; },
      maybeSingle: finish, single: finish,
      then: (resolve, reject) => finish().then(resolve, reject),
    };
    return query;
  };
  return state;
}
const request = (body) => new Request("https://portal.test/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("OTP approval cannot certify a phone substituted during provider verification", async () => {
  for (const substitute of [null, "+201111111111", " +201234567890 "]) {
    const db = database({ id: "user", phone: "+201234567890", phone_verified: false });
    const { POST } = load("src/app/api/mobile/phone-verification/verify/route.ts", {
      "next/server": { NextResponse }, "@/lib/supabaseServer": { supabaseServer: db },
      "@/lib/mobileSession": { getMobileUserFromRequest: async () => ({ user: { id: "user" } }) },
      "@/lib/twilioVerify": {
        isTwilioVerifyConfigured: () => true,
        checkWhatsAppVerification: async () => { if (substitute) db.row.phone = substitute; return { status: "approved" }; },
      },
    });
    const response = await POST(request({ phone: "+201234567890", code: "123456" }));
    assert.equal(response.status, substitute ? 409 : 200);
    assert.equal(db.row.phone_verified, !substitute);
  }
});

const itemId = "00000000-0000-4000-8000-000000000001";
function approvalHarness({ concurrent = false, version = 3, actor = "reviewer", type = "gift" } = {}) {
  const db = database({ id: itemId, version, approval_status: "pending", lifecycle_state: "active", created_by_admin: "author", metadata: {} });
  if (concurrent) db.beforeWrite = () => { db.row.version += 1; db.row.title = "substituted"; };
  const { POST } = load("src/app/api/admin/growth/approval/route.ts", {
    "next/server": { NextResponse }, "@/lib/supabaseServer": { supabaseServer: db },
    "@/lib/adminAuth": { requireAdminRole: async () => ({ adminId: actor, roles: ["super_admin"] }) },
    "@/lib/adminQueries": { logAdminActivity: async () => {} },
  });
  return { db, approve: (overrides = {}) => POST(request({ entity_type: type, entity_id: itemId, decision: "approve", expected_version: 3, ...overrides })) };
}
test("Growth approval binds both the displayed and atomically updated revision", async () => {
  for (const options of [{ version: 4 }, { concurrent: true }]) {
    const { db, approve } = approvalHarness(options);
    assert.equal((await approve()).status, 409);
    assert.equal(db.row.approval_status, "pending");
    assert.equal(db.writes.length, 0);
  }
  const { db, approve } = approvalHarness();
  assert.equal((await approve()).status, 200);
  assert.equal(db.row.approval_status, "approved");
  assert.equal(db.row.approved_by, "reviewer");
  assert.equal((await approvalHarness({ actor: "author" }).approve()).status, 409);
});
test("Growth input rejects missing, coerced, fractional and unsafe review versions", async () => {
  for (const expected_version of [undefined, null, "3", 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal((await approvalHarness().approve({ expected_version })).status, 400);
  }
  const { db, approve } = approvalHarness();
  assert.equal((await approve({ decision: "reject", reason: "Revise targeting" })).status, 200);
  assert.equal(db.row.rejection_reason, "Revise targeting");
});
test("Audience approval publishes the reviewed version without nonexistent is_active", async () => {
  const { db, approve } = approvalHarness({ type: "audience" });
  assert.equal((await approve()).status, 200);
  assert.equal(Object.hasOwn(db.writes[0], "is_active"), false);
  assert.ok(db.row.published_at);
  const rejected = approvalHarness({ type: "audience" });
  assert.equal((await rejected.approve({ decision: "reject", reason: "Narrow the target group" })).status, 200);
  assert.equal(rejected.db.row.lifecycle_state, "draft");
  assert.equal(rejected.db.row.published_at, null);
});

test("Developer cookies reject legacy impersonation, enforce short expiry, preserve normal login", () => {
  process.env.DEVELOPER_SESSION_SECRET = "isolated-regression-test-secret";
  const sessions = load("src/lib/developerSession.ts");
  const jar = cookieJar();
  const session = { developerId: "developer", accountId: "account", userId: "user", issuedAt: Date.now() };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.DEVELOPER_SESSION_SECRET).update(payload).digest("base64url");
  jar.set(sessions.DEVELOPER_SESSION_COOKIE, `${payload}.${signature}`);
  assert.equal(sessions.getDeveloperSession(jar), null);
  sessions.setDeveloperSession(jar, session);
  assert.equal(sessions.getDeveloperSession(jar).userId, "user");
  assert.equal(jar.get(sessions.DEVELOPER_SESSION_COOKIE).options.maxAge, 604800);
  const impersonation = { grantHash: "a".repeat(64), adminId: "admin", adminAuthUserId: "admin" };
  sessions.setDeveloperSession(jar, { ...session, impersonation });
  assert.equal(jar.get(sessions.DEVELOPER_SESSION_COOKIE).options.maxAge, 14400);
  assert.ok(sessions.getDeveloperSession(jar));
  sessions.setDeveloperSession(jar, { ...session, impersonation, issuedAt: Date.now() - 14400001 });
  assert.equal(sessions.getDeveloperSession(jar), null);
});

test("Impersonation authorization follows persisted grant and issuer, not the removable marker", async () => {
  const claim = { grantHash: "a".repeat(64), adminId: "admin", adminAuthUserId: "admin" };
  const session = { developerId: "developer", accountId: "account", userId: "user", issuedAt: Date.now(), impersonation: claim };
  const originalGrant = { token_hash: claim.grantHash, admin_id: "admin", admin_auth_user_id: "admin", developer_id: "developer", impersonated_account_id: "account", impersonated_user_id: "user", consumed_at: new Date().toISOString() };
  const db = database({ ...originalGrant });
  let admin = { id: "admin", status: "active", roles: ["super_admin"] };
  const { isDeveloperImpersonationAuthorized: authorized } = load("src/lib/developerImpersonationAuth.ts", {
    "./supabaseServer": { supabaseServer: db }, "./adminQueries": { fetchAdminAccountByUser: async () => admin },
  });
  assert.equal(await authorized(session), true);
  for (const revoked of [null, { id: "admin", status: "suspended", roles: ["super_admin"] }, { id: "admin", status: "active", roles: ["marketing_admin"] }]) {
    admin = revoked;
    assert.equal(await authorized(session), false);
  }
  admin = { id: "admin", status: "active", roles: ["super_admin"] };
  for (const change of [{ consumed_at: null }, { consumed_at: new Date(Date.now() - 14400001).toISOString() }, { impersonated_account_id: "different" }, { admin_id: "different" }]) {
    db.row = { ...originalGrant, ...change };
    assert.equal(await authorized(session), false);
  }
  db.row = { ...originalGrant };
  db.deleted = true;
  assert.equal(await authorized(session), false);
  assert.equal(await authorized({ ...session, impersonation: undefined }), true);
});

test("Exit revokes the signed grant even when the display marker is absent", async () => {
  const grantHash = "a".repeat(64);
  const db = database({ token_hash: grantHash });
  let cleared = false;
  const { POST } = load("src/app/api/developer/impersonation/exit/route.ts", {
    "next/server": { NextResponse }, "@/lib/supabaseServer": { supabaseServer: db },
    "@/lib/developerSession": { getDeveloperSession: () => ({ impersonation: { grantHash } }), clearDeveloperSession: () => { cleared = true; } },
    "@/lib/developerImpersonation": { getDeveloperImpersonation: () => null, clearDeveloperImpersonation: () => {} },
    "@/lib/adminQueries": { logAdminActivity: async () => {} },
    "@/lib/requestUrl": { getRequestBaseUrl: () => "https://developer.test", getAdminPortalUrl: () => "https://admin.test" },
  });
  assert.equal((await POST({ cookies: cookieJar() })).status, 307);
  assert.equal(db.deleted, true);
  assert.equal(cleared, true);
  db.failure = { message: "offline" };
  cleared = false;
  assert.equal((await POST({ cookies: cookieJar() })).status, 503);
  assert.equal(cleared, false);
});

test("The current-session boundary returns null after issuer revocation, allowing login", async () => {
  const jar = cookieJar();
  const sessions = load("src/lib/developerSession.ts");
  sessions.setDeveloperSession(jar, {
    developerId: "developer", accountId: "account", userId: "user", issuedAt: Date.now(),
    impersonation: { grantHash: "a".repeat(64), adminId: "admin", adminAuthUserId: "admin" },
  });
  let allowed = true;
  const { currentDeveloperSession } = load("src/lib/developerAuth.ts", {
    "next/headers": { cookies: async () => jar },
    "next/navigation": { redirect: () => { throw Error("unexpected redirect"); } },
    "./developerSession": sessions,
    "./developerQueries": {}, "./supabaseServer": {},
    "./developerImpersonationAuth": { isDeveloperImpersonationAuthorized: async () => allowed },
  });
  assert.ok(await currentDeveloperSession());
  allowed = false;
  assert.equal(await currentDeveloperSession(), null);
});

test("Handoff checks the issuing administrator again before issuing a developer cookie", async () => {
  for (const issuerActive of [false, true]) {
    const db = database({ token_hash: "hash", consumed_at: null, expires_at: new Date(Date.now() + 300000).toISOString(), admin_id: "admin", admin_auth_user_id: "admin", developer_id: "developer", impersonated_user_id: "user", impersonated_account_id: "account" });
    const accountDb = database({ id: "account", developer_id: "developer", auth_user_id: "user", status: "active" });
    let issued = null;
    const { GET } = load("src/app/api/developer/impersonate/route.ts", {
      "next/server": { NextResponse },
      "@/lib/supabaseServer": { supabaseServer: { from: (table) => (table === "developer_accounts" ? accountDb : db).from(table) } },
      "@/lib/developerSession": { setDeveloperSession: (_, value) => { issued = value; } },
      "@/lib/developerImpersonation": { readDeveloperImpersonationToken: () => ({}), hashDeveloperImpersonationToken: () => "hash", setDeveloperImpersonation: () => {} },
      "@/lib/developerImpersonationAuth": { isActiveImpersonationIssuer: async () => issuerActive },
      "@/lib/requestUrl": { getRequestBaseUrl: () => "https://developer.test", getDeveloperPortalUrl: () => "https://developer.test" },
    });
    const response = await GET({ nextUrl: new URL("https://developer.test/api/developer/impersonate?token=token") });
    assert.equal(Boolean(issued), issuerActive);
    if (issuerActive) assert.equal(issued.impersonation.grantHash, "hash");
    else assert.match(response.url, /Administrator\+access\+revoked/);
  }
});

test("Developer contact export uses the protected CSV boundary for attacker-supplied lead fields", async () => {
  const { GET } = load("src/app/api/developer/contacts/export/route.ts", {
    "next/server": { NextResponse: class extends Response {} },
    "@/lib/developerAuth": { requireDeveloperCapability: async () => ({ developerId: "developer" }) },
    "@/lib/developerSalesOps": { isDeveloperLeadStatus: () => false, fetchDeveloperSalesLeads: async () => ({ data: [{ id: "lead", status: "new", requester_display_name: "=1+1", requester_phone: "+201234567890", request_body: "\t@SUM(1,2)" }] }) },
  });
  const response = await GET(new Request("https://developer.test/api/developer/contacts/export"));
  assert.equal(response.status, 200);
  const csv = await response.text();
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"\'+201234567890"'));
  assert.ok(csv.includes('"\'\t@SUM(1,2)"'));
});

test("Shared CSV serializer neutralizes formulas and preserves quoting; XLSX stays text typed", () => {
  const { csvCell } = load("src/lib/csv.ts");
  const decode = (cell) => cell.slice(1, -1).replaceAll('""', '"');
  for (const input of ["=1+1", "+SUM(1,2)", "-1+2", "@SUM(1,2)", "\t=1", "\r\n+1", " \u0000=1", "\uFEFF=1"]) {
    assert.equal(decode(csvCell(input)), `'${input}`);
  }
  for (const input of ["ordinary", "a,b", 'say "hello"', "two\nlines", "", "contains = sign"]) assert.equal(decode(csvCell(input)), input);
  assert.equal(decode(csvCell(null)), "");
  assert.equal(decode(csvCell(-125.5)), "-125.5");
  assert.equal(decode(csvCell("-125.5")), "'-125.5");
  const { buildCsv, buildXlsx } = load("src/lib/adminExports.ts", { "./supabaseServer": { supabaseServer: {} } });
  assert.equal(buildCsv([{ amount: -125.5 }]), '"amount"\r\n"-125.5"');
  assert.equal(buildCsv([{ "=header": "\t=1" }]), '"\'=header"\r\n"\'\t=1"');
  const sheet = strFromU8(unzipSync(buildXlsx([{ name: "=1+1" }]))["xl/worksheets/sheet1.xml"]);
  assert.match(sheet, /t="inlineStr"/);
  assert.match(sheet, /<t>=1\+1<\/t>/);
  assert.doesNotMatch(sheet, /<f>/);
});
