# Launch cleanup and recovery — 2026-09-08

Status: local source review and checklist only. No live inventory, flag changes, deletion, email, migration or deployment was performed. The working tree already contains unrelated changes; this task adds only this document. Historical observations below are leads for verification, not a current production inventory.

## Explicit demo classification

- [ ] Produce a restricted manifest with table, exact primary key, tenant/project parent, existing `is_demo`, existing `demo_batch`, owner, classification evidence, intended keep/flag/remove action, and linked-record counts. Keep personal account details out of this repository.
- [ ] Have the data owner map every ambiguous legacy row to an exact ID and decision. The August 31 project memory identifies an active “Demo Gift” and Atlas developer/project/listing records as historically unflagged. Names alone never authorize classification or deletion; some may be intended launch fixtures. Source: `.context/repo_summary.md`, “Cross-surface regression state”; `DECISIONS.md`, August 26 and August 29 demo decisions.
- [ ] For confirmed fixtures intended to remain, explicitly record that decision. For confirmed demos, prepare exact-ID updates to `is_demo` and the approved batch only after resolving all dependent real business data. Do not execute these updates as part of this preparation.
- [ ] Inventory `users_profile.is_demo` separately. Analytics rejects flagged demo users; `users_profile.demo_batch` is a plain text field in the analytics migration, and the current cleanup RPC does not delete these accounts. Flagging analytics accounts is not an account-purge workflow. Sources: `supabase/migrations/20260907133000_app_usage_analytics.sql:4`, `docs/app-usage-analytics.md`.
- [ ] Recheck developer → project → phase → listing visibility after flagging in staging. Demo flags affect public/mobile visibility, so even a reversible flag change can hide genuine inventory. Sources: `supabase/migrations/20260830091000_developer_publication_contract.sql`, `supabase/migrations/20260830105000_developer_project_phases.sql`, `src/lib/developerQueries.ts`.

## Cleanup execution prerequisites

The supported route is platform-super-admin Settings → exact demo batch, backed by service-only `cleanup_demo_batch(text)`. A company `developer_super_admin` is a different role and does not acquire platform Settings authority. Sources: `src/app/settings/page.tsx:37`, `src/app/settings/page.tsx:140`, `supabase/migrations/20260829120000_growth_shared_data_model.sql:2445`.

- [ ] Resolve an existing active batch and compare a read-only count/ID inventory with the approved manifest. The RPC rejects empty batches and returns `not_found` for missing/inactive batches; it is not a dry-run API.
- [ ] Inventory dependencies beyond explicitly flagged rows. Cleanup also removes dependent gift claims/eligibilities, badge awards, tier assignments, Growth evaluations, versions and audit rows. Non-demo resources referencing a demo audience retain their rows but lose the optional audience link. Those link changes require a before-image for recovery. Do not describe this as affecting only flagged rows.
- [ ] Inspect current foreign keys/triggers for descendants of properties, projects, support tickets, and developer companies; rehearse actual deletion effects on a disposable database. The manifest must include cascades and preserved dependents, not just RPC return counts.
- [ ] Capture an access-controlled backup with schema/migration revision, exact affected rows and linked rows, old audience links, batch status, Auth invitation identifiers/metadata, and referenced storage object inventory. Verify provider backup/PITR availability and perform a restore rehearsal; neither availability nor recoverability was checked in this task.
- [ ] Rehearse the approved batch on an isolated restored database, verifying both candidate deletion and untouched real-record controls. Retain counts and outcomes outside public logs. Check media separately: the reviewed cleanup path does not implement storage-object cleanup, and database restore does not establish storage recovery.
- [ ] Before a future authorized execution, record the exact batch, backup location, operator and acceptance counts. Stop if any real deal, contact, account, gift entitlement or launch fixture falls within the affected graph without an explicit decision.
- [ ] After execution, independently verify batch status and counts. Settings currently checks the RPC error but does not inspect its JSON `status`; a success banner alone is insufficient evidence of deletion.

Developer invitation cleanup runs from the batch-status transition trigger, deleting flagged batch memberships/events and removing a flagged developer only when its protective dependency checks permit. The later RBAC trigger explicitly permits deletion of an `is_demo` membership, while protecting the final active non-demo developer super admin. Sources: `supabase/migrations/20260830090000_developer_invitation_reliability.sql:502`, `supabase/migrations/20260830111500_developer_team_rbac.sql:136`.

Auth cleanup follows the committed database cleanup and is not in the same transaction. The Settings action first captures Auth IDs and invitation context, then calls `compensateDeveloperInviteAuthUser`. Missing context, mismatched invitation metadata or a remaining membership can intentionally retain Auth users. Only two failure reasons are surfaced as cleanup failures by Settings. Independently reconcile every captured account; do not delete a retained Auth identity merely because it appeared in the batch. Sources: `src/app/settings/page.tsx:140`, `src/lib/developerAccountInvites.ts:103`.

## Role acceptance matrix

Expected current local capability contract from `src/lib/developerRbac.ts` and `supabase/migrations/20260830111500_developer_team_rbac.sql`:

| Capability | developer_super_admin | project_manager | sales_manager |
| --- | --- | --- | --- |
| Manage company profile | Allow | Deny | Deny |
| Manage team/invitations/roles | Allow | Deny | Deny |
| Create/manage projects and phases | Allow | Allow | Deny |
| Manage inventory | Allow | Allow | Allow |
| View/manage contacts and lead PII | Allow | Deny | Allow |
| View developer analytics | Allow | Allow | Deny |

The historical `manage_integrations` capability remains in the role vocabulary for compatibility; its product surface is retired. It is not a launch feature to re-enable. Source: `supabase/migrations/20260907134000_retire_developer_integrations.sql`.

- [ ] For each role, use an isolated session and confirmed tenant fixtures; test an allowed action and each denied boundary at page, server/API and database layers. Menu visibility alone is not authorization verification.
- [ ] Attempt another tenant's IDs, revoked/inactive membership, unknown role, role demotion with an existing session, and direct authenticated membership writes/service-only RPC calls; expect rejection with no writes.
- [ ] Confirm project managers receive no contacts/lead PII, sales managers cannot create projects or change team/profile, and a non-demo company's final active super admin cannot be revoked, deleted or demoted. Verify a legitimate replacement-admin transition succeeds.
- [ ] Keep inventory approval/publication gates in place for every role; manage-inventory capability alone must not make draft/demo/archived/parent-hidden inventory visible to mobile.

Local verification on September 8: `npm run test:developer-operations` passed **17/17**. This includes runtime capability-matrix checks and source contracts for tenant scope, PII separation, service-only team mutations, final-admin protection, and navigation. Sources: `tests/developer-operations-contracts.test.mjs`, `tests/developer-team-rbac-contracts.test.mjs`, `tests/developer-security-fixes.test.mjs`, `tests/developer-navigation-reliability.test.mjs`.

Database and signed-in role acceptance remain open in this task. Existing SQL suites include `supabase/tests/developer_team_rbac_contracts.sql`, `supabase/tests/developer_journey_contracts.sql`, and `supabase/tests/developer_portal_contracts.sql`. Run them only against an isolated migration-built database via `scripts/test-database-reliability.sh`; no database URL was obtained or used here. Passing source tests does not certify production grants or deployed behavior.

## Recovery decisions

| Failure | Recovery procedure |
| --- | --- |
| Incorrect demo flag, rows still present | Restore only the manifest's exact rows to their prior flag/batch values; recheck publication and analytics. Existing analytics previously excluded during demo status are not fabricated or backfilled. |
| Accidental inventory archive | Use existing archive/restore workflow, then review publication separately. `restoreDeveloperListing` deliberately leaves `is_active=false`; restore does not silently republish. Source: `src/lib/developerQueries.ts:548`. |
| SQL cleanup raises an error | The RPC/trigger work is transactional. Verify batch/row state before retrying; do not manually mark the batch removed or disable protective triggers. Resolve the precise dependency in staging. |
| Database cleanup succeeds, Auth compensation incomplete | Reconcile the pre-captured account manifest and compensation reason. Retry only after validating identity metadata and absence of legitimate membership. Never rerun a broad Auth purge. |
| Wrong batch was hard-deleted | Stop further cleanup. Restore the verified backup into isolation, compare affected data, then prepare a narrowly scoped recovery including lost child/audit rows and audience links. There is no batch undo RPC in the reviewed source. Do not reset `status` and reseed: seeds cannot reconstruct historical IDs or business state. |
| Auth identity or storage object was deleted | Database row restore alone is insufficient. Use a separately verified provider recovery path; otherwise account re-invitation/identity remapping or media restoration needs an explicit recovery plan. Do not claim original credentials or object content recoverable without evidence. |

Launch cleanup is ready for execution only after the exact-ID manifest, dependent-data review, restore rehearsal, live role checks and post-cleanup reconciliation are recorded. No current production cleanup or recovery outcome is claimed by this document.
