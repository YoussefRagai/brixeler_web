import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const repositoryRoot = path.resolve(new URL("../", import.meta.url).pathname);
const nativeRequire = createRequire(import.meta.url);

function load(relativePath, mocks = {}, cache = new Map()) {
  const filename = path.resolve(repositoryRoot, relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loadedModule = { exports: {} };
  cache.set(filename, loadedModule);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      ...(filename.endsWith(".tsx") ? { jsx: ts.JsxEmit.ReactJSX } : {}),
    },
  }).outputText;
  const require = (id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id.startsWith(".") || id.startsWith("@/")) {
      const resolved = id.startsWith("@/") ? path.join(repositoryRoot, "src", id.slice(2)) : path.resolve(path.dirname(filename), id);
      return load(resolved.endsWith(".ts") ? resolved : `${resolved}.ts`, mocks, cache);
    }
    return nativeRequire(id);
  };
  new Function("require", "module", "exports", output)(require, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

const NextResponse = { json: (body, options) => Response.json(body, options) };
const jsonRequest = (url, body, method = "POST") => new Request(`https://developer.test${url}`, {
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

test("invite acceptance and onboarding fail closed while preserving a retry path", () => {
  const accept = read("src/app/developer/accept/AcceptInviteClient.tsx");
  const auth = read("src/lib/developerAuth.ts");
  const profile = read("src/app/developer/profile/page.tsx");
  const form = read("src/components/DeveloperProfileForm.tsx");

  assert.match(accept, /openPortalInviteSession\("developer"\)/);
  assert.match(accept, /auth\.updateUser\(/);
  assert.match(accept, /\/api\/developer\/activate-invite/);
  assert.match(accept, /auth\.signOut\(\{ scope: "local" \}\)/);
  assert.match(accept, /setState\("invalid"\)/);
  assert.match(accept, /setState\("ready"\)/);
  assert.match(auth, /redirect\("\/developer\/profile\?onboarding=1"\)/);
  assert.match(auth, /allowIncompleteProfile/);
  assert.match(profile, /submit_developer_profile_revision/);
  assert.match(profile, /p_account_id: session\.accountId/);
  assert.match(profile, /discardUploadedLogo/);
  assert.match(form, /onError=\{setUploadError\}/);
  assert.match(form, /blockedByUploadError/);
  assert.doesNotMatch(profile, /✓ Company name/);
  assert.doesNotMatch(profile, /✓ Brand line/);
  assert.match(profile, /isDemo=\{Boolean\(profile\?\.is_demo\)\}/);
  assert.match(form, /Demo identity stays hidden from agents/);
});

test("profile media errors reach the form and direct-upload saves stay guarded", () => {
  const media = read("src/components/DeveloperMediaField.tsx");
  const form = read("src/components/DeveloperProfileForm.tsx");

  assert.match(media, /onError\?: \(message: string\) => void/);
  assert.match(media, /onError\?\.\(message\)/);
  assert.match(media, /onError\?\.\(""\)/);
  assert.match(media, /Wait for the media upload to finish before saving/);
  assert.match(media, /Upload failed:/);
  assert.match(form, /if \(!uploadError\) return/);
  assert.match(form, /disabled=\{pending \|\| blocked\}/);
});

test("developer navigation keeps nested tabs active and hides role-scoped controls", () => {
  const layout = read("src/components/DeveloperLayoutClient.tsx");

  for (const [href, label] of [
    ["/developer", "Overview"],
    ["/developer/contacts", "Contacts"],
    ["/developer/activity", "Sales activity"],
    ["/developer/profile", "Profile"],
    ["/developer/team", "Team"],
    ["/developer/support", "Support"],
  ]) {
    assert.match(layout, new RegExp(`href: "${href}"`));
    assert.match(layout, new RegExp(`label: "${label}"`));
  }
  assert.match(layout, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.match(layout, /pathname\.startsWith\(`\$\{href\}\/`\)/);
  assert.match(layout, /id="developer-mobile-nav"/);
  assert.match(layout, /href="#developer-main-content"/);
  assert.match(layout, /displayBrand\.capabilities\?\.includes\(item\.capability\)/);
});

test("team controls use isolated idempotent requests and expose load failures", () => {
  const manager = read("src/components/DeveloperTeamManager.tsx");
  const page = read("src/app/developer/team/page.tsx");

  for (const path of ["/api/developer/team/invite", "/api/developer/team/resend", "/api/developer/team/role", "/api/developer/team/revoke"]) {
    assert.match(manager, new RegExp(path.replaceAll("/", "\\/")));
  }
  assert.match(manager, /crypto\.randomUUID\(\)/);
  assert.match(manager, /window\.prompt/);
  assert.match(manager, /role: nextRole/);
  assert.match(manager, /role="alert"/);
  assert.match(manager, /Invitation submitted, but the team list could not refresh/);
  assert.match(manager, /Member role updated, but the team list could not refresh/);
  assert.match(page, /initialLoadError=\{loadError\}/);
  assert.match(page, /The team could not be loaded right now/);
});

test("contacts preserve view-only roles while covering statuses, search, detail, and export", () => {
  const page = read("src/app/developer/contacts/page.tsx");
  const detailPage = read("src/app/developer/contacts/[contactId]/page.tsx");
  const inbox = read("src/components/DeveloperLeadInbox.tsx");
  const detail = read("src/components/DeveloperLeadDetail.tsx");
  const salesOps = read("src/lib/developerSalesOps.ts");
  const exportRoute = read("src/app/api/developer/contacts/export/route.ts");

  assert.match(page, /requireDeveloperCapability\("view_contacts"\)/);
  assert.match(page, /hasDeveloperCapability\(session\.role, "manage_contacts"\)/);
  assert.match(detailPage, /hasDeveloperCapability\(session\.role, "manage_contacts"\)/);
  for (const status of ["new", "contacted", "qualified", "viewing", "reservation", "won", "lost"]) {
    assert.match(salesOps, new RegExp(`"${status}"`));
  }
  assert.match(inbox, /name="q"/);
  assert.match(inbox, /name="status"/);
  assert.match(inbox, /name="assignee"/);
  assert.match(inbox, /name="age"/);
  assert.match(inbox, /\/api\/developer\/contacts\/export/);
  assert.match(detail, /Team notes/);
  assert.match(detail, /Add an internal note/);
  assert.match(exportRoute, /Content-Disposition/);
  assert.match(exportRoute, /attachment; filename="developer-leads-/);
});

test("support center and conversation cover open, reply, read, and missing-ticket states", () => {
  const center = read("src/components/DeveloperSupportCenter.tsx");
  const conversation = read("src/components/DeveloperSupportConversation.tsx");
  const conversationForm = read("src/components/DeveloperSupportConversationForm.tsx");
  const page = read("src/app/developer/support/page.tsx");
  const detailPage = read("src/app/developer/support/[ticketId]/page.tsx");

  assert.match(center, /fetch\("\/api\/developer\/support"/);
  assert.match(center, /aria-label="Support conversations"/);
  assert.match(center, /Open a support request/);
  assert.match(center, /Try again/);
  assert.match(center, /setRetryDraft/);
  assert.match(conversation, /developer_support_conversation_action/);
  assert.match(conversation, /p_action: operation/);
  assert.match(conversation, /DeveloperSupportConversationForm/);
  assert.match(conversation, /← Back to support/);
  assert.match(conversationForm, /useActionState/);
  assert.match(conversationForm, /value="reply"/);
  assert.match(conversationForm, /value="read"/);
  assert.match(conversationForm, /Already read/);
  assert.match(conversationForm, /role=\{state\.status === "error" \? "alert" : "status"\}/);
  assert.match(conversation, /role="alert"/);
  assert.match(conversation, /Return to support/);
  assert.match(page, /fetchDeveloperSupportTickets/);
  assert.match(detailPage, /DeveloperSupportConversation/);
});

test("support conversation form preserves failed drafts and clears only a successful reply", async () => {
  const values = [];
  let hookIndex = 0;
  let reduceAction;
  const jsx = (type, props = {}) => ({ type, props });
  const find = (node, predicate) => {
    if (!node || typeof node !== "object") return null;
    if (predicate(node)) return node;
    const children = node.props?.children;
    for (const child of Array.isArray(children) ? children : [children]) {
      const found = find(child, predicate);
      if (found) return found;
    }
    return null;
  };
  const react = {
    useState(initial) {
      const index = hookIndex++;
      if (!(index in values)) values[index] = initial;
      return [values[index], (next) => { values[index] = typeof next === "function" ? next(values[index]) : next; }];
    },
    useActionState(reducer, initial) {
      reduceAction = reducer;
      return [initial, () => {}, false];
    },
  };
  const formModule = load("src/components/DeveloperSupportConversationForm.tsx", {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
  });
  let result = { status: "error", message: "Unable to save; please retry." };
  const tree = formModule.DeveloperSupportConversationForm({
    action: async () => result,
    ticketId: "ticket-1",
    developerId: "developer-a",
    audience: "developer",
    initiallyRead: false,
  });
  assert.equal(tree.type, "form");
  const textarea = find(tree, (node) => node.type === "textarea");
  const readButton = find(tree, (node) => node.type === "button" && node.props.value === "read");
  assert.ok(textarea);
  assert.ok(readButton);
  assert.equal(readButton.props.disabled, false);
  textarea.props.onChange({ target: { value: "draft reply" } });
  assert.equal(values[0], "draft reply");

  const failedReply = new FormData();
  failedReply.set("operation", "reply");
  await reduceAction({ status: "idle" }, failedReply);
  assert.equal(values[0], "draft reply");

  result = { status: "success", message: "Marked as read." };
  const read = new FormData();
  read.set("operation", "read");
  await reduceAction({ status: "error", message: "retry" }, read);
  assert.equal(values[0], "draft reply");
  assert.equal(values[1], true);

  result = { status: "success", message: "Reply sent." };
  await reduceAction({ status: "success", message: "Marked as read." }, failedReply);
  assert.equal(values[0], "");
});

test("developer surfaces retain keyboard focus and readable dashboard contrast", () => {
  const css = read("src/app/globals.css");
  const shared = read("tests/shared-ui-contracts.test.mjs");

  assert.match(css, /button:focus-visible,\s*a:focus-visible/);
  assert.match(css, /--dashboard-ink: #050505/);
  assert.match(css, /--dashboard-ink: #fff/);
  assert.match(css, /button:disabled/);
  assert.match(shared, /dark dashboard controls keep a readable foreground/);
  assert.equal(existsSync(new URL("src/app/developer/contacts/page.tsx", root)), true);
});

test("contact detail PATCH is tenant-bound and validates status before mutation", async () => {
  const leadId = "11111111-1111-4111-8111-111111111111";
  const accountId = "22222222-2222-4222-8222-222222222222";
  const updates = [];
  const { PATCH } = load("src/app/api/developer/contacts/[contactId]/route.ts", {
    "next/server": { NextResponse },
    "@/lib/developerAuth": {
      DeveloperCapabilityError: class DeveloperCapabilityError extends Error {},
      requireDeveloperCapability: async () => ({ developerId: "developer-a", accountId, role: "sales_manager" }),
    },
    "@/lib/developerSalesOps": {
      fetchDeveloperSalesLead: async () => ({ data: { id: leadId, developer_id: "developer-a", status: "new", assigned_to_account_id: null, next_follow_up_at: null, lost_reason: null }, error: null }),
      isDeveloperLeadStatus: (value) => ["new", "contacted", "qualified", "viewing", "reservation", "won", "lost"].includes(value),
      updateDeveloperSalesLead: async (input) => { updates.push(input); return { data: { id: leadId, status: input.status, assigned_to_account_id: input.assignedToAccountId, next_follow_up_at: input.nextFollowUpAt }, error: null }; },
    },
  });

  const response = await PATCH(jsonRequest(`/api/developer/contacts/${leadId}`, {
    status: "qualified",
    assignedToAccountId: "33333333-3333-4333-8333-333333333333",
    nextFollowUpAt: "2026-11-20T10:00:00.000Z",
  }, "PATCH"), { params: Promise.resolve({ contactId: leadId }) });
  assert.equal(response.status, 200);
  assert.deepEqual(updates, [{
    developerId: "developer-a",
    accountId,
    leadId,
    status: "qualified",
    assignedToAccountId: "33333333-3333-4333-8333-333333333333",
    nextFollowUpAt: "2026-11-20T10:00:00.000Z",
    lostReason: null,
  }]);
  assert.equal((await response.json()).lead.status, "qualified");

  const invalid = await PATCH(jsonRequest(`/api/developer/contacts/${leadId}`, { status: "closed" }, "PATCH"), { params: Promise.resolve({ contactId: leadId }) });
  assert.equal(invalid.status, 400);
  assert.equal(updates.length, 1);
});

test("contact notes POST trims content and limits mentions through the same tenant boundary", async () => {
  const leadId = "11111111-1111-4111-8111-111111111111";
  const mentioned = "33333333-3333-4333-8333-333333333333";
  let noteInput;
  const { POST } = load("src/app/api/developer/contacts/[contactId]/notes/route.ts", {
    "next/server": { NextResponse },
    "@/lib/developerAuth": {
      DeveloperCapabilityError: class DeveloperCapabilityError extends Error {},
      requireDeveloperCapability: async () => ({ developerId: "developer-a", accountId: "22222222-2222-4222-8222-222222222222", role: "sales_manager" }),
    },
    "@/lib/developerSalesOps": {
      addDeveloperLeadNote: async (input) => { noteInput = input; return { data: "note-1", error: null }; },
      fetchDeveloperLeadNotes: async () => [],
      fetchDeveloperCompanyMembers: async () => ({ data: [], error: null }),
    },
  });

  const response = await POST(jsonRequest(`/api/developer/contacts/${leadId}/notes`, { body: "  Follow up after the viewing.  ", mentionedAccountIds: [mentioned, "not-a-uuid"] }), { params: Promise.resolve({ contactId: leadId }) });
  assert.equal(response.status, 201);
  assert.deepEqual(noteInput, {
    developerId: "developer-a",
    accountId: "22222222-2222-4222-8222-222222222222",
    leadId,
    body: "Follow up after the viewing.",
    mentionedAccountIds: [mentioned],
  });
});

test("support ticket creation keeps the retry boundary generic and tenant-scoped", async () => {
  const rpcCalls = [];
  let fail = false;
  const { POST } = load("src/app/api/developer/support/route.ts", {
    "next/server": { NextResponse },
    "@/lib/developerAuth": { requireDeveloperSession: async () => ({ developerId: "developer-a", accountId: "account-a" }) },
    "@/lib/developerSalesOps": { fetchDeveloperSupportTickets: async () => [] },
    "@/lib/supabaseServer": {
      supabaseServer: {
        rpc: async (_name, args) => {
          rpcCalls.push(args);
          return fail ? { data: null, error: { message: "private database detail" } } : { data: "ticket-1", error: null };
        },
      },
    },
  });

  const response = await POST(jsonRequest("/api/developer/support", { subject: "Portal question", category: "technical", priority: "high", description: "  Please check this flow.  " }));
  assert.equal(response.status, 201);
  assert.deepEqual(rpcCalls[0], { p_developer_id: "developer-a", p_actor_account_id: "account-a", p_subject: "Portal question", p_category: "technical", p_priority: "high", p_description: "Please check this flow." });

  fail = true;
  const retry = await POST(jsonRequest("/api/developer/support", { subject: "Portal question", category: "technical", priority: "high", description: "Please check this flow." }));
  assert.equal(retry.status, 503);
  assert.doesNotMatch(await retry.text(), /private database detail/);

  const invalid = await POST(jsonRequest("/api/developer/support", { subject: "", description: "" }));
  assert.equal(invalid.status, 400);
});
