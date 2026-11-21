import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("non-project developer surfaces use the shared accessible feedback banner", async () => {
  const files = [
    "src/app/developer/profile/page.tsx",
    "src/components/DeveloperProfileForm.tsx",
    "src/components/DeveloperTeamManager.tsx",
    "src/components/DeveloperSupportCenter.tsx",
    "src/components/DeveloperSupportConversationForm.tsx",
    "src/components/DeveloperSupportConversation.tsx",
    "src/app/developer/contacts/page.tsx",
    "src/app/developer/contacts/[contactId]/page.tsx",
    "src/components/DeveloperLeadInbox.tsx",
    "src/components/DeveloperLeadDetail.tsx",
  ];
  for (const path of files) {
    const source = await read(path);
    assert.match(source, /FeedbackBanner/, `${path} should render the shared feedback primitive`);
  }
  const banner = await read("src/components/FeedbackBanner.tsx");
  assert.match(banner, /role=\{isError \? "alert" : "status"\}/);
  assert.match(banner, /aria-live=\{isError \? "assertive" : "polite"\}/);
});

test("background mutations expose pending state without forcing scroll", async () => {
  for (const path of [
    "src/components/DeveloperTeamManager.tsx",
    "src/components/DeveloperSupportCenter.tsx",
    "src/components/DeveloperSupportConversationForm.tsx",
    "src/components/DeveloperLeadInbox.tsx",
    "src/components/DeveloperLeadDetail.tsx",
  ]) {
    const source = await read(path);
    assert.match(source, /role="status" aria-live="polite"/i, `${path} should expose pending status`);
    assert.doesNotMatch(source, /<FeedbackBanner[^>]+autoFocus/, `${path} must not autofocus background feedback`);
  }
  const profile = await read("src/components/DeveloperProfileForm.tsx");
  assert.match(profile, /useActionState/);
  assert.match(profile, /role="status"/);
});

test("failed submissions preserve drafts and only clear after success", async () => {
  const profile = await read("src/components/DeveloperProfileForm.tsx");
  assert.match(profile, /value=\{name\}/);
  assert.match(profile, /value=\{description\}/);
  assert.match(profile, /actionState\.status === "success"/);

  const support = await read("src/components/DeveloperSupportCenter.tsx");
  assert.match(support, /setRetryDraft\(draft\)/);
  assert.match(support, /setSubject\(""\); setDescription\(""\)/);
  assert.match(support, /if \(!response\.ok\)[\s\S]*setRetryDraft\(draft\)/);

  const detail = await read("src/components/DeveloperLeadDetail.tsx");
  assert.match(detail, /if \(!response\.ok\) throw new Error\("Unable to save this note\. Please retry\."\)/);
  assert.match(detail, /setNoteBody\(""\)/);
  assert.match(detail, /setFeedback\(\{ type: "success", message: "Internal note added\." \}\)/);

  const team = await read("src/components/DeveloperTeamManager.tsx");
  assert.match(team, /if \(!response\.ok\) throw new Error\(payload\?\.error/);
  assert.match(team, /setEmail\(""\);/);
  assert.match(team, /setFullName\(""\);/);
});

test("contact mutations never return provider or database error text", async () => {
  const leadRoute = await read("src/app/api/developer/contacts/[contactId]/route.ts");
  const noteRoute = await read("src/app/api/developer/contacts/[contactId]/notes/route.ts");
  assert.doesNotMatch(leadRoute, /result\.error\.message/);
  assert.doesNotMatch(noteRoute, /result\.error\.message/);
  assert.match(leadRoute, /Unable to update this lead\. Please retry\./);
  assert.match(noteRoute, /Unable to save this note\. Please retry\./);
});
