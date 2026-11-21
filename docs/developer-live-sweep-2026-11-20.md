# Developer portal live sweep — November 19–20, 2026

## Scope and safety

Authenticated browser checks used Atlas development (DEMO) at
`developer.brixeler.com`, with desktop (1440×1000) and narrow layouts. All
writes were explicit demo tests. No customer message, new access grant,
irreversible deletion, or mobile release was performed. This is observed
coverage, not a claim that every possible input or concurrent interaction was tested.

Fixture project: `26279b7e-d580-4c11-b980-0c4c27c13f14`,
“Portal Sweep Demo 2026-11-19”; phase:
`a3428eee-d08b-46c0-a16f-49cbe8699226`, “QA Launch Phase”.
The project inherited the company's explicit demo batch. It remains hidden
from customers, including after review submission.

## Observed live behavior before the fixes

| Flow/control | Result |
| --- | --- |
| Login; Overview, Contacts, Sales activity, Profile, Team, Support, Projects, Add project | Rendered with Atlas branding |
| Creation wizard: clear saved details, details/materials/review, preview/close, create | Passed; default phase created |
| Project logo upload; approved image URL; three-image upload and gallery save | Passed without a crash; owned Storage URLs persisted |
| New phase: name/order/selling status/facilities/EV Charger/selling point/masterplan | Saved and selected correctly |
| Phase new release | Saved |
| Unit type: Studio, prices/BUA/finishing/notes/image | Saved to selected phase |
| Variant: create, open, edit, archive with confirmation, restore with confirmation | Passed; edited values retained |
| Payment plan: title, booking %, years, discount, compound/type/price, maintenance, finishing fees, staged deposit, delivery years | All entered values persisted after save |
| Mark ready; submit for review | Passed; demo-hidden message remained visible |
| Portfolio search/expand/overflow; phase selection; individual-unit view | Worked, with context/menu defects below |
| Inventory template download | Valid XLSX downloaded (6,749 bytes, 10 ZIP parts); no crash |
| Empty/populated CSV exports | Downloaded; populated CSV matched unit/code/price/area/released state |
| Complete CSV import with three owned photo URLs | Imported one pending unit in the correct phase |
| Row price/building edit → Check changes → Save selected | Saved as pending changes; readback matched |
| Hold create using native date input; release | Database transitions succeeded; timezone and stale-client defects below |
| Saved inventory filter: save and apply | Persisted and applied search |
| Contacts search/Apply and scoped CSV export | Passed; empty inbox, so no live detail mutation exercised |
| Profile unsafe logo URL (`javascript:`) | Rejected with approved-HTTPS-host error; revision unchanged |
| Team malformed email; own role selector | Invalid email blocked; own role selector disabled |
| Support create → open conversation → reply | Passed, with persisted reply and cleared form |
| Mobile preview: open, English/Arabic selection, close | Passed; illustrative preview, no native-app launch tested |
| Console errors/warnings captured during this browser pass | None observed |

Individual unit: `a852e194-c3fb-45e5-9d8d-f74c51a3530c`, code
`QA-20261119-101`; variant: `9a1190b3-423c-4703-9079-927e1c81ceef`.
Support ticket: `0084c6b8-0e94-4924-bc35-02138bdef608` (“Demo QA portal
sweep — no action needed”).

## Defects handed to implementation

- CSV preview accepted a row without required photos; server rejected it,
  discarded the preview, and showed no actionable row errors.
- Creation details were restored even after successful project creation.
- Mark-ready and project new-release redirects lost the selected phase/section.
- Some native selects had visible labels without programmatic associations.
- Project overflow menu was clipped by the hero; several overflow actions
  lacked accessible names.
- Hold expiry entered as noon Cairo was displayed as 2 p.m. afterward.
- Hold release succeeded on the server while the grid retained stale held
  edits until a hard reload.
- Imported inventory under the explicitly demo project was not itself demo
  flagged. It was still hidden by draft/parent gates. This needs inheritance
  and exact backfill, not name-based inference.
- Support “Mark read” had no visible acknowledgement; demo profile preview
  wording incorrectly implied approval would make it visible.
- A second, minimal demo draft was created through the patched loopback UI
  (`0a6c1423-e3fc-48cd-b7d7-5941aa4257b9`). Creation and browser-draft cleanup
  passed. Its Archive project action reported success, but database readback
  remained draft and the archived portfolio was empty. This is a confirmed
  lifecycle/false-success defect, requiring a database fix and a repeated
  archive → archived list → restore journey before release.

An initial hold rejection was traced to the browser automation's
`datetime-local` fill not firing the React state update. Native keyboard date
editing populated the payload and succeeded. That automation limitation is
separate from the confirmed two-hour timezone error.

## Database visibility check

Read-only production transaction under `anon` confirmed both the fixture
project and imported unit were invisible. Service-role readback confirmed the
project's demo flag and the unit's missing inherited demo flag. The latter was
reported for a database-level fix. The exact fixture unit was then classified
`is_demo=true`, batch `prelaunch-demo-20260908`, through the existing
service-role flag-only maintenance boundary. Readback confirmed the flags and
retained draft status; no publication or reward state was changed.

## Coverage still requiring separate evidence

Role mutation/tenant isolation, failed-request retries, partial-batch rollback,
publication boundaries and denied direct requests require the isolated API/SQL
suite. No fresh invitation or role grant was sent during this sweep. Native
mobile deep-link/push delivery, device-specific behavior, large-file performance,
and concurrency/load tests were not performed in this live browser pass.

Release commit, migration, post-fix reruns and outstanding blockers must be
recorded below before declaring this patch released.

## Release and post-fix verification

Patched loopback browser checks against the same demo tenant passed:

- Sign-in, project creation through “Create draft now”, and empty wizard on returning after success.
- Team email fallback, support back link, read-state display, reply pending/clear/persistence.
- Unclipped project action menu with accessible DOM names.
- Missing-photo CSV rejected locally with Row 2 details; duplicate inventory rejected by the server with preview and row errors retained.
- Hold set to noon read back as noon Cairo; release immediately showed `released` without reloading.

The archive trigger fix and all 16 rollback-only SQL suites pass locally. The full release gate, production migration, archive/restore browser rerun and deployment status are recorded below once completed.

Luna Max implemented the project and secondary UI fixes. Its remaining API and independent-review turns ended at the usage limit. Saved API patches were retained; the parent reviewed and finished the archive trigger, server-side import URL checks, demo metadata preservation and final tests. No completed independent review is claimed.


### Released verification — 2026-11-21

- Code commit `4afe9ed1182e9aa00585d8b4688c9fd8e05a2a26` pushed to GitHub. Railway deployment `08818b05-831f-43ef-b907-522c6c6fdc71` observed ACTIVE / Deployment successful for this release.
- Production Supabase migration `20261121083326_harden_developer_inventory_contracts` applied; wrappers/internal grants verified; demo project/unit remain invisible under anon; no unflagged demo-owned developer units remain.
- Final gate: 171 JS tests, 16 SQL suites, lint, typecheck, build, zero dependency vulnerabilities; renamed-ledger contract rechecked.
- Production service-role archive → archived readback → restore to draft assertions passed against the exact second demo fixture, retaining demo state and no publication timestamp.
- Browser post-release confirmed the new action menu before a confirmation/CDP connection stalled. Recovering in a fresh tab did not complete the final archive/restore UI round trip. This remains an explicit UI verification gap, not a database failure; the direct service-role round trip and local SQL regression passed. The viewport override was reset.
- Earlier patched loopback browser results above cover actual reply/import/hold/wizard interactions. Native mobile, real customer lead mutations, fresh access grants/invitation sends, and load/concurrency tests remain outside this pass. No mobile build/update occurred.
- Existing security advisor warnings remain for Growth search paths, intentionally authenticated RPCs/RLS helper and leaked-password protection. The default-phase trigger's public execution was removed; no new advisor error was introduced. Provider remediation reference: https://supabase.com/docs/guides/database/database-linter.

Recovery: use the prior known-good dashboard deployment if necessary; prefer an additive database repair. Exact pre-change RPC/policy JSON and timestamp-trigger SQL are in ignored mode-600 files under `.local/release-20261120/`. Do not remove migration ledger entries or disable RLS to roll back.
