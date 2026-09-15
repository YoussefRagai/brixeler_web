# Dashboard contrast and demo completion — 2026-09-08

## Implemented

- Shared nearest-surface foreground tokens in `src/app/globals.css` cover admin and developer shells, dark cards, nested light controls, status actions, disabled labels, and wrapping long labels. Removed the incomplete glassless dark-button exception mechanism. Project photo headers have an explicit dark surface and stronger scrim.
- Gift approval actions use an accessible darker green; reward-builder step subtitles and mobile project-wizard labels are readable. Added contrast palette/source regression tests.
- Publication labels distinguish approval from mobile eligibility, including published-but-demo-hidden projects, company profile status, and listing gates.
- Applied `20260908110000_safe_demo_metadata_maintenance.sql`: actual service-role-only metadata maintenance, no reward evaluation on flag-only updates, tenant-safe agent resale history handling. No triggers disabled.
- Classified remaining 25 exact-ID records as demos: 11 properties, 10 stage entries, one deal, two developer memberships, one QA project. Reward assignments/eligibilities were unchanged. No deletion. Built-in Verified badge remains system configuration.

## Verification

- Railway deployment `8c6f6c48-a237-44d7-9572-6831c27ecd29`: SUCCESS. Twenty production admin routes passed visible action-contrast scanning after release. Public developer login responds HTTP 200; admin login redirects normally.

- Selective release worktree `/tmp/brixeler-portal-release-20260908`; commits `a743387` and `544164d`. Unrelated dirty main-worktree changes, WhatsApp work and mobile builds excluded.
- `npm run release:check`: dependency gate, lint, build and 127 tests pass. Eleven isolated SQL suites pass, including RBAC and inquiry/inbox contracts. Existing SQL lint diagnostics remain; no new diagnostics from maintenance migration.
- Linked Supabase dry-run reports up to date after production migration. Production unflagged counts for properties, deals, memberships and projects are zero.
- Live QA company profile revision submitted, onboarding unlocked with company branding, project created, second phase created, phase-specific Studio price/area range saved. All remain demo/draft. Authenticated customer RLS sees zero matching QA projects. Impersonation exited.
- Browser checks cover 20 admin routes and eight developer sections plus selected/disabled actions. Eight developer sections pass the computed action-contrast scan after fixes. The scanner checks visible solid-color text/background pairs; it is not an exhaustive guarantee for every hover, dialog, image, viewport or future data state.

## Recovery and remaining gates

- Restricted, ignored artifacts: `.local/launch-20260908/schema-before-demo-maintenance.sql`, `remaining-demo-manifest.json`, `remaining-demo-apply.sql`, `remaining-demo-restore.sql`. Review current-row changes before any restore; restore flags only, not business fields. Do not run demo deletion/cleanup without new authorization.
- Dashboard rollback: redeploy the prior known-good selective snapshot; retain additive database guards unless a separately tested forward fix is needed. Do not erase migration ledger rows.
- Native device tests and production mobile release remain explicitly deferred. Full live native customer inquiry-to-inbox journey is not claimed; isolated SQL contracts passed. Live sessions for each of the three developer roles were not all exercised in this pass.
