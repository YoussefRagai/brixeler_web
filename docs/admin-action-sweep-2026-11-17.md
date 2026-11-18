# Admin action coverage sweep — 2026-11-17

## Result

The admin-access database patch is verified on a disposable local Supabase
database. The frozen cutover baseline and all 37 post-baseline migrations are
present in the local ledger through `20261118221855_admin_access_scope`; all 15
SQL contract suites pass, and database lint has no error-level findings. The
web release gate also passes (`154/154` tests, lint, typecheck, build, and
high-severity dependency audit).

No production Auth users or business data were changed during the live sweep.
The reviewed migration was subsequently applied to production by the root
Brixeler connector as provider version `20261118221855_admin_access_scope`;
its access/restore function privileges were verified afterward.

## Release-preparation checkpoint — 2026-11-19

The final browser fixture passed `10/10` with exit code 0 and no browser
errors. The reviewed working tree remains uncommitted; local `HEAD` and the
last known `origin/main` ref are both `35c0cb1` (zero ahead/behind by local
ref comparison). The staged-path secret check found no staged paths, and the
changed-file scan found no credential-shaped matches.

The restricted local rollback artifact is under
`.local/release-20261119/`. It drops only the two new access/restore functions
and restores the preceding `developer_support_conversation_action` definition;
it does not contain credentials or production data.

Production ledger verification is now complete through the root Brixeler
connector: the remote ledger reports the exact provider version
`20261118221855_admin_access_scope`, matching the renamed local migration and
the tested SQL hash. The authenticated role cannot execute the access/restore
functions; `service_role` can execute them. No historical migration rows were
renamed or repaired. The disposable ledger was reconciled only for the
just-created migration (`20261117194804` reverted, `20261118221855` applied),
and now reports local/remote equality through the provider version. Commit/push
and Railway release remain the next release actions; no mobile build or update
is in scope.

## Evidence boundary

The browser evidence is split between the authenticated production sweep in
[admin-live-sweep-2026-11-17.md](admin-live-sweep-2026-11-17.md) and a local
synthetic PostgREST fixture. The live sweep is the source of truth for actions
actually performed against production; this report does not turn source
contracts, screenshots, or rollback-only SQL fixtures into live evidence.

The live sweep explicitly did not perform a production purge, payment
approval, role reassignment, bulk reward evaluation, or customer campaign send.
It also observed intermittent Cloudflare 525 and React 418/412 navigation
failures, so those are retained as environmental/product follow-ups rather
than silently treated as passing coverage.

## Database verification

The isolated stack was `supabase_db_brixeler-admin-db.3Ud3NJ` on
`127.0.0.1:55441`. The baseline log records successful application of the
schema-only cutover and repair of the 21 frozen historical versions; the push
log records successful application of every newer migration, including
`20261118221855_admin_access_scope.sql`. A ledger readback returned 58 rows
(21 frozen + 37 post-baseline), with both `pg_cron` and `pg_net` installed.

The exact post-baseline and lint commands used for the existing disposable
database were:

~~~sh
supabase db push \
  --db-url 'postgresql://postgres:postgres@127.0.0.1:55441/postgres?sslmode=disable' \
  --yes
# Result: Remote database is up to date.

supabase db lint \
  --db-url 'postgresql://postgres:postgres@127.0.0.1:55441/postgres?sslmode=disable' \
  --schema public --level error --fail-on error
# Result: {"results":[],"message":"db lint"}
~~~

All 15 SQL suites pass. Fourteen suites run as the normal local `postgres`
role. `transactional_notification_pushes.sql` runs as local
`supabase_admin` because its rollback-only fixture replaces `net.http_post`,
and the local `net` schema is intentionally owned by `supabase_admin`; no
production grant was broadened. The split command was:

~~~sh
pg_url='postgresql://postgres:postgres@127.0.0.1:55441/postgres'
admin_url='postgresql://supabase_admin:postgres@127.0.0.1:55441/postgres'
for suite in supabase/tests/*.sql; do
  case "$suite" in
    supabase/tests/transactional_notification_pushes.sql)
      PGPASSWORD=postgres psql "$admin_url" -X -v ON_ERROR_STOP=1 -q -f "$suite"
      ;;
    *)
      PGPASSWORD=postgres psql "$pg_url" -X -v ON_ERROR_STOP=1 -q -f "$suite"
      ;;
  esac
done
# Result: ALL SQL SUITES PASS
~~~

The runner now selects `supabase_admin` for that fixture only when the target
URL is explicitly loopback; remote URLs remain on their supplied role and no
`net` grants are changed. The repository command now passes end-to-end:

```sh
BRIXELER_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55441/postgres?sslmode=disable' \
  ./scripts/test-database-reliability.sh
# RC 0; all 15 suites pass
```

Passing suites:

`admin_access_scope.sql`, `agent_access_restore.sql`,
`agent_resume_contracts.sql`, `app_usage_analytics.sql`,
`demo_metadata_maintenance.sql`, `developer_integrations_retirement.sql`,
`developer_journey_contracts.sql`, `developer_portal_contracts.sql`,
`developer_project_phases_contracts.sql`, `developer_support_workflow.sql`,
`developer_team_rbac_contracts.sql`, `growth_contracts.sql`,
`mobile_deal_transition_contracts.sql`, `reliability_contracts.sql`, and
`transactional_notification_pushes.sql`.

The new SQL fixtures exercise these admin patches directly:

| Patch | Verified in the isolated database |
|---|---|
| `update_admin_access` | Service-role-only execution; active super-admin actor recheck; supported role allowlist; self-suspension and self-demotion denial; delegated developer scope persistence; final active super-admin preservation; stale/revoked actor denial; no-op idempotence; and one audit row for the committed change. |
| `restore_agent_access` | Service-role-only execution; user-auth-admin requirement; dashboard-identity separation; archived/suspended eligibility; preview without activation; expected-version rejection; archived restore and suspended reactivation; commit/preview database boundary; idempotent completion; and one restore audit row. Auth unban itself remains an application-boundary follow-up. |
| `developer_support_conversation_action` | Service-only execution; admin role and assigned-company scope; active developer membership requirement; tenant-bound ticket lookup; read/reply transitions; bounded message input; and unread/status updates. |

At warning level, lint still reports four pre-existing warning groups in
`preview_admin_rule`, `preview_gift_rule`, `create_gift_claim_active_impl`,
and `enqueue_developer_webhook_event`; `--fail-on error` remains clean and the
new admin migration is not implicated.

## Static and release verification

The targeted admin/portal/security contract run passed `39/39` tests:

~~~sh
node --experimental-strip-types --test \
  tests/admin-action-sweep.test.mjs \
  tests/portal-invite-regressions.test.mjs \
  tests/contracts.test.mjs \
  tests/people-contracts.test.mjs \
  tests/developer-security-fixes.test.mjs
~~~

The complete release command passed:

~~~sh
npm run release:check
~~~

Result: `154/154` tests passed, ESLint passed, TypeScript/build passed, and
`npm audit --audit-level=high` reported `0 vulnerabilities`. The build emits
the expected local warnings when dashboard/developer signing secrets are not
present; no secret values were read or recorded.

## Synthetic fixture coverage

The final isolated browser run used the synthetic fixture and app copy at:

- `/private/tmp/brixeler-admin-qa.H4H3k0/fixtures.mjs` — seven synthetic admin
  roles, live/demo people, properties, claims, renewal history, export rows,
  and draft Growth/content/campaign state behind a PostgREST-shaped server.
- `/private/tmp/brixeler-admin-qa.H4H3k0/qa.mjs` — the Playwright coverage
  script.
- `/private/tmp/brixeler-admin-qa-isolated/app` — a clean Next build/runtime
  copy used to avoid the workspace `.next` and dependency state.
- `127.0.0.1:47132` — fixture server; `127.0.0.1:47131` — isolated app server.
  All credentials and data were synthetic local values.

The final run exited `0` with `10` passes, `0` failures, and
`Browser script errors []`. The exact checks passed were:

1. Role-scoped overview and detail requests, including denial of cross-scope
   live data and export links.
2. All 20 sidebar routes plus demo-scoped XLSX and CSV payloads for dashboard,
   agents, and deals.
3. Deal history links and posted deal details.
4. Verification SOP, queue navigation, reason-form validation, approval, and
   next-record navigation.
5. Renewal-history navigation with JavaScript disabled.
6. Guarded listing and deal status mutations, including denied and invalid
   requests.
7. Audience draft creation, edit, and persisted readback.
8. Content and notification draft submissions with persisted readback.
9. Logout session clearing and unauthenticated redirect to the login page.
10. Zero page-level or console browser errors.

Positive screenshots retained from the run are:

- `/private/tmp/brixeler-admin-qa.H4H3k0/verification-reason.png`
- `/private/tmp/brixeler-admin-qa.H4H3k0/renewal-approved-phone.png`

The final run generated no failed-check artifacts. The synthetic result covers
the ten checks above; it is separate from the live-sweep evidence and does not
constitute production authorization or production-side execution.

## Controls still untested or only indirectly covered

The following remain outside the evidence above:

- Real production purge, payment approval, role reassignment, bulk reward
  evaluation, active content mutation, and customer/test campaign delivery.
- A controlled-inbox invitation failure/retry matrix beyond the one delivered
  Hotmail demo invitation recorded in the live sweep; provider acceptance is
  not mailbox delivery.
- Parallel live requests for final-super-admin preservation, admin scope
  changes, or agent restore. SQL contracts cover locks, expected-version
  rejection, idempotent completion, and audit cardinality, but not a load or
  race test against production.
- Real Auth unban/ban behavior around agent restore, native iOS/Android
  interaction, screen-reader traversal, and full keyboard testing.

These limitations are deliberate. The next safe gate is a staged or explicitly
authorized production run of the high-impact controls, followed by a fresh
browser sweep after deployment.

## Released verification — 2026-11-19

- Source commit `0333378` pushed to GitHub; Railway deployment `98f6e18d-3aac-492b-9a03-797001ea4fe2` ACTIVE / Deployment successful.
- Supabase migration applied through project-specific connector as `20261118221855_admin_access_scope`; authenticated callers cannot execute access/restore RPCs; service-role access verified. Exact prior support function retained in ignored mode-600 rollback artifact.
- Post-release authenticated browser: verification SOP and change reason expand, incomplete-document approval disabled; renewal Approved link navigates to correct status; claim detail warning absent; live Overview excludes demo applicants and export uses `demo=production`.
- Validation: 154 JS tests, 15 SQL suites, 10/10 synthetic browser journeys, lint/types/build, zero dependency vulnerabilities. Real payment approvals, purge, customer broadcast, and concurrency load tests were not performed in production.
- Hotmail QA invitation Delivered, accepted, activated, and login recorded; demo project_manager membership only. Sukoon invitation failure was a nonexistent mailbox followed by provider suppression. Existing Gmail identity was preserved.
