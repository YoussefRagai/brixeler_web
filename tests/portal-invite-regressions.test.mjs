import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { readPortalInviteLink } from "../src/lib/portalInviteSession.ts";
import { describePortalInviteDeliveryError, getPortalInviteSubmissionMessage } from "../src/lib/portalInviteDelivery.ts";

const authUserId = "c2142b8c-8bb3-4c67-aece-35c7605100a1";
const email = "invitee@example.com";
const authCalls = [];
const authRedirects = [];
let existingAdmin;
let recipient;
let inserted;

globalThis.portalInviteTestClient = {
  auth: {
    admin: {
      async inviteUserByEmail(invitedEmail, options) {
        authCalls.push({ kind: "invite", email: invitedEmail });
        authRedirects.push({ kind: "invite", redirectTo: options?.redirectTo });
        return { data: { user: { id: authUserId, email } }, error: null };
      },
      async getUserById(id) {
        assert.equal(id, authUserId);
        return { data: { user: recipient }, error: null };
      },
      async deleteUser() {
        assert.fail("A repeated invitation must never delete the Auth identity");
      },
    },
    async resetPasswordForEmail(sentEmail, options) {
      authCalls.push({ kind: "recovery", email: sentEmail });
      authRedirects.push({ kind: "recovery", redirectTo: options?.redirectTo });
      return { error: null };
    },
  },
  from(table) {
    assert.equal(table, "admins");
    return {
      upsert(record, options) {
        assert.equal(record.id, authUserId);
        assert.deepEqual(options, { onConflict: "id", ignoreDuplicates: true });
        return {
          select: () => ({ maybeSingle: async () => ({ data: inserted, error: null }) }),
        };
      },
      select() {
        return {
          eq: () => ({ maybeSingle: async () => ({ data: existingAdmin, error: null }) }),
        };
      },
    };
  },
};

const inviteModuleDirectory = new URL("../src/lib/", import.meta.url);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith(inviteModuleDirectory.href)) {
      if (["./supabaseServer", "@/lib/supabaseServer"].includes(specifier)) {
        const stubUrl = "data:text/javascript,export const supabaseServer=globalThis.portalInviteTestClient";
        return nextResolve(stubUrl, context);
      }
      if (["./requestUrl", "./adminRoles", "./portalInviteDelivery"].includes(specifier)) {
        return nextResolve(new URL(`${specifier}.ts`, context.parentURL).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
const { createAdminPortalInvite } = await import("../src/lib/adminAccountInvites.ts");
const { buildDeveloperInviteRedirectUrl, resendDeveloperPortalInvite, sendDeveloperPortalInvite } = await import("../src/lib/developerAccountInvites.ts");
hooks.deregister();
delete globalThis.portalInviteTestClient;

const adminParams = { email, displayName: null, roles: ["deals_admin"], developerIds: [], assignedBy: "operator" };
const developerParams = { email, developerId: "company", developerName: "Developer", inviteRequestId: "request" };

test("retrying a staff invitation preserves the existing Auth identity and assignment", async () => {
  inserted = null;
  existingAdmin = { roles: ["deals_admin"], is_active: true, permissions: { developer_ids: [] } };
  const result = await createAdminPortalInvite(adminParams);
  assert.equal(result.authUserId, authUserId);
  assert.equal(result.created, false);
  assert.match(result.message, /submitted for delivery/i);

  const differentRoles = await createAdminPortalInvite({ ...adminParams, roles: ["super_admin"] });
  assert.equal(differentRoles.authUserId, null);
  assert.match(differentRoles.error, /existing admin/i);

  inserted = { id: authUserId };
  const created = await createAdminPortalInvite(adminParams);
  assert.equal(created.created, true);
});

test("developer resend verifies the pending member's Auth identity before submitting recovery email", async () => {
  authCalls.length = 0;
  recipient = { id: authUserId, email: "changed@example.com" };
  const rejected = await resendDeveloperPortalInvite({ ...developerParams, authUserId });
  assert.equal(rejected.error.code, "invite_recipient_changed");
  assert.deepEqual(authCalls, []);

  recipient = { id: authUserId, email };
  const sent = await resendDeveloperPortalInvite({ ...developerParams, authUserId });
  assert.equal(sent.authUserId, authUserId);
  assert.equal(sent.emailKind, "recovery");
  assert.equal(sent.createdAuthUser, false);
  assert.deepEqual(authCalls, [{ kind: "recovery", email }]);
});

test("developer invite deep links stay on the canonical admin origin", () => {
  const previous = process.env.DEVELOPER_PORTAL_URL;
  try {
    for (const configured of ["https://brixeler.com", "https://www.brixeler.com/path", "http://developer.brixeler.com:8443/old"]) {
      process.env.DEVELOPER_PORTAL_URL = configured;
      const link = new URL(buildDeveloperInviteRedirectUrl({ developerId: "company", developerName: "Developer", email }));
      assert.equal(link.origin, "https://admin.brixeler.com");
      assert.equal(link.pathname, "/developer/accept");
      assert.equal(link.searchParams.get("developerId"), "company");
      assert.equal(link.searchParams.get("email"), email);
    }
  } finally {
    if (previous === undefined) delete process.env.DEVELOPER_PORTAL_URL;
    else process.env.DEVELOPER_PORTAL_URL = previous;
  }
});

test("developer Auth submissions carry the canonical admin redirect contract", async () => {
  authRedirects.length = 0;
  const invite = await sendDeveloperPortalInvite(developerParams, null);
  assert.equal(invite.error, null);
  const recovery = await sendDeveloperPortalInvite(developerParams, { id: authUserId, email });
  assert.equal(recovery.error, null);
  assert.equal(authRedirects.length, 2);
  for (const submission of authRedirects) {
    const redirect = new URL(submission.redirectTo);
    assert.equal(redirect.origin, "https://admin.brixeler.com");
    assert.equal(redirect.pathname, "/developer/accept");
    assert.equal(redirect.searchParams.get("developerId"), "company");
    assert.equal(redirect.searchParams.get("email"), email);
  }
});

test("an Auth invite returning a previously existing user never claims ownership for compensation", async () => {
  const result = await sendDeveloperPortalInvite(developerParams, null);
  assert.equal(result.authUserId, authUserId);
  assert.equal(result.emailKind, "invite");
  assert.equal(result.createdAuthUser, false);
});

test("delivery feedback distinguishes submitting, rate limits, and rejected recipients", () => {
  assert.match(getPortalInviteSubmissionMessage("invite"), /submitted for delivery/i);
  assert.match(getPortalInviteSubmissionMessage("recovery"), /password setup/i);
  assert.equal(describePortalInviteDeliveryError({ status: 429 }).status, 429);
  assert.equal(describePortalInviteDeliveryError({ code: "invite_recipient_changed" }).status, 409);
  assert.equal(describePortalInviteDeliveryError({ code: "email_address_invalid" }).status, 400);
  const failure = describePortalInviteDeliveryError({ status: 500, message: "Provider diagnostics" });
  assert.equal(failure.status, 502);
  assert.doesNotMatch(failure.message, /Provider diagnostics/);
});

test("password setup requires an explicit invitation or a developer recovery link", () => {
  const base = "https://portal.example.com";
  assert.equal(readPortalInviteLink(new URL("/admin/accept", base), "admin"), null);
  assert.equal(readPortalInviteLink(new URL("/developer/accept?email=invitee@example.com", base), "developer"), null);
  assert.equal(readPortalInviteLink(new URL("/admin/accept?error=expired#access_token=a&refresh_token=r&type=invite", base), "admin"), null);
  assert.equal(readPortalInviteLink(new URL("/admin/accept#access_token=a&refresh_token=r&type=signup", base), "admin"), null);
  assert.equal(readPortalInviteLink(new URL("/admin/accept#access_token=a&refresh_token=r&type=recovery", base), "admin"), null);
  assert.deepEqual(readPortalInviteLink(new URL("/admin/accept#access_token=a&refresh_token=r&type=invite", base), "admin"), { accessToken: "a", refreshToken: "r" });
  assert.deepEqual(readPortalInviteLink(new URL("/developer/accept#access_token=a&refresh_token=r&type=recovery", base), "developer"), { accessToken: "a", refreshToken: "r" });
  assert.deepEqual(readPortalInviteLink(new URL("/developer/accept?code=old-code", base), "developer"), { code: "old-code" });
});
