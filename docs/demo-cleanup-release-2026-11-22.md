# Brixeler release and cleanup checkpoint — 2026-11-22

This is the public, aggregate-only handoff for the dashboard release and the
fixed-cutoff demo-cleanup work. Private manifests, row IDs, Auth IDs, object
paths, recovery backups, and provider credentials remain outside Git.

## Released dashboard

- Tested dashboard source: `49e8bff`.
- Verified Railway deployment: `8c0eabe0-f980-4645-b25f-ec41a9ac6e75` on the canonical Brixeler production service.
- The app-side hosted-invite correction normalizes known portal aliases to
  `https://admin.brixeler.com/developer/accept`. The verified Brixeler provider
  session changed only the displayed `{{ .SiteURL }}` occurrence in the Invite
  user body to literal `https://admin.brixeler.com`; the
  `{{ .ConfirmationURL }}` CTA, subject, shared Site URL, all 8 redirects,
  SMTP, and all other templates were unchanged. Save/reopen/preview verified
  the result, and no invitation was sent. Private mode-600 evidence is under
  `.local/provider-20261121/invite-template-change.md`.

## Retention and cleanup result

The frozen cutoff is `2026-11-14T08:51:56.215083Z`.

- Auth: one reviewed old non-mobile Auth user/membership was removed through
  the supported Auth Admin API boundary. Two old super-admin memberships remain
  blocked by final-owner and recent-business dependencies.
- Retained identity scope: 7 admins, 11 mobile profiles, 3 phone-valued Auth
  users, 2 push-token rows, 7 recent memberships, 6 recent Auth users, and the
  corrected 26-ID protected Auth union.
- Business rows: after fail-closed review of the broader candidates, the final
  conservative transaction committed 38 rows across 17 delete groups. It used
  the frozen cutoff and exact reviewed fingerprints, retained one company and
  23 inventory rows to avoid changing retained projects or their inventory,
  and did not classify that retention as a recent edit. Readback confirms 38/38
  candidates absent, 32/32 protected business fingerprints unchanged, all 7
  admins, 11 profiles, and all 26 protected Auth IDs intact. The remaining
  business scope is explicit: 49 FK-blocked rows, 24 operator-retained rows
  (one company plus 23 inventory rows), and 8 recent/unknown protected rows—81
  business rows total. No Auth, Storage, admin, or mobile-profile deletion was
  part of this transaction. This is a partial cleanup result; no blanket
  all-old-data-removed claim is made.
- Storage: 0 objects deleted. All 135 live objects remain, including 37
  mobile/admin protected-owner objects. A 26-object ambiguous developer-media
  review queue remains pending attributable ownership and a byte-level backup;
  it is not a deletion authorization.

## Verification and limitations

- The read-only cleanup migration `20261121215614_safe_demo_cleanup_workflow`
  and reviewed delete-audit activity fix
  `20261123072926_inventory_delete_audit_fk_safety` are live and
  service-role-only. The latter preserves audit snapshots while the business
  executor remains fingerprint-, FK-, and retention-guarded.
- `npm run test:database` passed against the disposable database, including the
  cleanup, delete-audit FK, and sibling blocker-snapshot suites. The focused
  cleanup/retirement Node suite passed 7/7, and the full JavaScript suite
  passed 191/191; targeted lint, Node syntax, shell syntax, and diff checks
  passed.
- This handoff contains dashboard/source and cleanup-contract work only; no
  mobile or WhatsApp source, native build, OTA, or deployment is included.
- This checkpoint deliberately makes no blanket “demo cleanup complete” claim.
  Recent/mobile/admin retention, 49 FK-blocked rows, 24 operator-retained
  rows, 8 recent/unknown rows, and Storage ownership/backup requirements remain
  explicit limitations. The hosted Invite template correction is verified
  separately.
