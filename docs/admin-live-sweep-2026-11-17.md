# Admin dashboard live sweep — 2026-11-17

## Evidence boundary

Authenticated production walkthrough as super admin, through browser UI. This record distinguishes live interaction from source, synthetic-handler, and isolated database tests. It does not certify every possible input, record, or concurrent action. No production purge, payment approval, role reassignment, bulk reward evaluation, or customer campaign send was performed. Those boundaries require isolated fixtures.

## Live checks

| Area | Interactions and result |
|---|---|
| Access/hosting | Initial Cloudflare525; retry recovered. Login succeeded. Intermittent client navigation and React418/412 observed; no TLS setting changed. |
| Overview | Live mode rendered demo pending agents (confirmed defect); export scope URL used unsupported scope parameter (confirmed defect). |
| Deals | Live/demo loads; all six queue tabs clicked; payment evidence open/cancel. History incorrectly labeled nonarchived entries Archived (confirmed defect). |
| Agents | Demo agent profile opens; Overview, Deal analytics, Preferences, Tickets, Connections, Badges, Tiers clicked. |
| Verification | Queue loads; SOP button has no handler. Change request affordance difficult to reach in nested scroll; assigned fixture review. |
| Support | Demo ticket Mark read saved; unread marker removed and read audit event appeared. History and saved macro editor expand. No reply sent to another person. |
| Properties | Import preview disabled without CSV; approval checklist correctly disables incomplete project/listing publication; list and projects load. |
| Renewals | Empty queues load; Approved tab did not respond through AX or coordinate click; fixture investigation assigned. |
| Developers | Existing-company invite selected; company contact fields disabled. Approved Hotmail demo invitation sent once; provider Delivered; Auth confirmed, membership activated, portal login recorded. Role project_manager in demo company only. |
| Gifts | Wizard steps, missing-threshold validation, review, safe recipient preview exercised. No live rule published. |
| Audiences | Missing-name validation and named audience preview exercised; qualified recipients returned. No audience saved. |
| Gift claims | Detail disclosure/evidence/contact/history load; warning about unavailable data traced to ambiguous tier FK query. |
| Rewards | All four wizard steps and safe impact preview exercised; preview returns without mutation. |
| Analytics | Report and range controls render. |
| App usage | Apply/refresh submits filters and reloads report. |
| Notifications | Campaign form and preview control render; no customer/test campaign sent. |
| Content | Filters, publishing form, preview, lifecycle controls render. No active content changed. |
| Exports | Dashboard CSV and XLSX clicked and downloaded actual files to Downloads. |
| Settings | Referral band editor/add disclosure and exact-batch demo cleanup controls render; no financial policy or batch changed. |
| Admins | Role editor, scope controls, invite form render. Existing empty-scope label conflicts with enforcement; fix assigned. |
| Admin activities | Filter submission updates query and renders audit log. |

## Invitation delivery root cause

The complained-about Sukoon invitation was accepted by Supabase Auth, then bounced at Resend because the recipient mailbox did not exist, and was suppressed. A subsequent password reset to a working Gmail delivered. An approved new invitation to the user's Hotmail inbox delivered and completed activation/login. Provider acceptance alone is not delivery evidence. No suppression removed and no existing Gmail identity deleted.

## Remaining gates

Review patch diff; full lint/types/tests/build; isolated migration chain and permission tests; release provider status; repeat key live interactions after deployment. Password setup is user-performed. See companion action audit for per-control source and fixture coverage and explicit untested actions.
