# Developer secondary-portal action sweep — 2026-11-19

## Scope and evidence

This pass covered the developer portal surfaces outside the project-flow workstream: profile/onboarding and media, shell branding/navigation, team, contacts, support, and the shared responsive/accessible controls. No deployment, commit, secret handling, or additional live mutation was performed by this pass. The live observations below are the primary sweep's demo-scoped evidence and are recorded separately from the isolated executable checks added here.

The browser was at a narrow/mobile viewport. The live account had no real sales lead, so no customer record was created or changed. The existing QA support ticket/reply was created by the primary sweep in the demo account; it is not a claim that this pass exercised production data.

For the primary sweep's complete live project and portal evidence, see [`developer-live-sweep-2026-11-20.md`](developer-live-sweep-2026-11-20.md). This report focuses on the secondary controls, isolated behavior checks, and the exact gaps that remain.

## Tested controls

| Surface/control | Evidence | Result |
| --- | --- | --- |
| Branded developer shell and sidebar | Live primary sweep at the narrow viewport; Overview, Projects, Contacts, Sales activity, Profile, Team, and Support routes were opened. | Branded shell rendered; nested route activation and role-gated entries are covered by source/operation contracts. |
| Contact list empty state | Live primary sweep. | Empty list loaded as 0 without an error state. |
| Contact search, Apply, and CSV export | Live primary sweep. | `q` and export filter survived Apply; CSV downloaded as `developer-leads-2026-11-19.csv`. |
| Profile media URL safety | Live primary sweep with `javascript:alert(1)`. | Server rejected the URL with the approved-HTTPS-host message; no revision changed. |
| Demo profile preview wording | Isolated source check and profile wiring check. | Demo preview now says the demo identity stays hidden; non-demo profiles retain the approval wording. Post-deploy visual confirmation remains outstanding. |
| Support open/reply | Live primary sweep in the demo account. | Ticket creation and reply persisted; reply textarea cleared. |
| Support request retry | Isolated source and route checks. | Failed ticket creation returns a generic 503 response; the form preserves the draft and exposes “Try again”. |
| Support conversation reply/read feedback | Isolated render/action test. | Pending controls, `role="alert"` errors, `role="status"` success, and read-state feedback render. Failed replies preserve the draft; a successful reply clears it; a successful read does not clear it. |
| Team validation | Live primary sweep. | Invalid email was blocked by native HTML validation; changing one’s own role was disabled. |
| Team mutation refresh handling | Isolated source check. | A successful mutation followed by a refresh failure reports that the action was submitted and asks the operator to refresh, avoiding a false “send failed” message. |
| Contact detail PATCH | Executable mocked route test. | Valid status/assignee/follow-up input reaches the tenant-scoped mutation; invalid status returns 400 without mutation. |
| Contact internal note | Executable mocked route test. | Body is trimmed and non-UUID mentions are removed before the tenant-scoped note mutation. |
| Support ticket API boundary | Executable mocked route test. | Tenant/developer IDs are passed to the RPC; provider/database details are not returned to the browser on failure. |
| Profile upload/save guard, nav capability visibility, focus/contrast contracts | Static contracts and focused lint. | Existing upload-error guard, skip link/focus styles, contrast tokens, nested active routes, and capability checks remain present. |

## Un-tested or not available

- No live lead existed, so real contact-detail status changes, assignee changes, follow-up changes, internal notes, customer replies, or lead-detail action buttons were not exercised.
- No live team invitation, resend, revoke, or role-change mutation was performed in this pass. The tested invalid-email/self-role controls do not prove provider delivery or mutation persistence.
- The primary sweep observed that Mark read had no visible live result. The source now provides pending/success/error feedback, but a live post-change Mark read interaction was not repeated.
- There is no support attachment control in the current UI; attachment upload, retry, size/type validation, and persistence were not tested and must not be considered supported.
- Browser media upload failure/retry, onboarding invite acceptance/password setup, role-specific accounts, keyboard-only traversal, screen-reader announcements, and cross-browser behavior were not tested here.
- The demo profile preview fix and support conversation feedback need a post-deploy browser confirmation. The isolated render test does not replace a real browser/network check.
- Project mark-ready and submit-for-review were live-tested by the primary/project sweep and passed with the demo project explicitly hidden. Project-flow implementation and its stale tests are outside this secondary-surface patch.

## Code and test changes

- `DeveloperSupportConversationForm.tsx` is a client action form with pending buttons, generic retryable errors, read-state feedback, and draft-preserving behavior.
- `DeveloperSupportConversation.tsx` keeps the tenant/admin scope checks, returns generic action errors, revalidates both support paths, and adds a back link.
- `DeveloperSupportCenter.tsx` preserves failed request drafts and adds an explicit retry action.
- `DeveloperTeamManager.tsx` distinguishes a mutation failure from a post-mutation list-refresh failure.
- `DeveloperProfileForm.tsx` receives the profile demo flag so the preview is truthful for demo identities.
- `src/app/api/developer/support/route.ts` no longer returns provider/database error text to the browser.
- `tests/developer-secondary-portal-sweep.test.mjs` contains 11 tests, including mocked contact/support route journeys and an isolated virtual render of the conversation form.

## Verification

Passed:

- `node --experimental-strip-types --test tests/developer-secondary-portal-sweep.test.mjs` — 11/11.
- `npm run test:developer-operations` — 19/19.
- `npm run test:developer-phases` — 5/5.
- `npm run test:contracts` — 20/20.
- Focused ESLint over the changed secondary-surface files and sweep test — pass.

Known workspace-wide blockers, not introduced by this pass:

- `npm run lint` reports the existing `react-hooks/set-state-in-effect` error in `src/components/DeveloperInventoryGrid.tsx`.
- `npx tsc --noEmit` and `npm run build` report the existing project-page `string | false` boolean mismatch and inventory-grid `floor_number` string/number mismatch.
- `npm run test:project-flow` has stale source-regex expectations for the current project-flow refactor; project-flow ownership remains with the primary agent.

Confidence: **0.88** for the secondary UI contracts and isolated route behavior; **0.65** for live support read/team mutation behavior because those controls were not re-exercised against the deployed service after the patch.


## Final integration status (supersedes concurrent-work blockers)

Release `4afe9ed` and migration `20261121083326` are live. Final lint, types, build,171JS tests and16SQL suites pass. Patched loopback browser verified support reply pending/persistence/reset, team email fallback, import diagnostics, draft cleanup and correct hold timestamps/fresh release state. Final archive UI check was blocked by the browser connection; production service-role archive/restore readback passed. See the live sweep report for exact boundaries. No completed independent Luna review is claimed because the reviewer reached its usage limit.
