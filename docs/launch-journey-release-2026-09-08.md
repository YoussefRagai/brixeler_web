# Launch journey verification — September 8, 2026

## Approved scope

User authorized dashboard/database release, confirmed all current business data is demo, and skipped native device testing. No mobile build/OTA or unfinished WhatsApp changes are included. No data deletion is authorized or performed.

## Verified

- Existing Resend sender domain `auth.brixeler.com` is Verified. Authorized new-company developer-super-admin invitation was Delivered; database confirms acceptance, active membership, and login to Brixeler Portal QA (Demo). Company and membership are explicitly flagged demo. Profile completion remains pending.
- Local authenticated browser: all eight developer sidebar destinations load with company branding and expected headings. Live pre-release browser eventually loads branding, confirming client-fetch dependency; new server-hydrated shell removes that dependency without weakening capability checks.
- Exact selective release commit `f60153c`, based on prior production `b426d68`: release gate passed lint, build/type validation and 116 JS tests. Existing three moderate dependency advisories remain; no high/critical gate failure.
- Ten isolated rollback SQL suites passed after inquiry/inbox additions. Covers invitation, project/phase/inventory publication, customer inquiry, correct company inbox, cross-company denial, project-manager PII denial and sales-manager response. This is not a complete native end-to-end test.
- Mobile: 28 reliability tests, security policies and typecheck passed. No device/emulator; native submissions/attachments/consent interactions remain untested by user choice.
- Supabase migration `20260908100000_fix_inventory_publication_guard` applied using linked CLI. Dry-run before: this migration only. Dry-run after: up to date. No phone-verification migration applied.

## Recovery and remaining gates

- Pre-release public schema backup: `/tmp/brixeler-pre-portal-release-20260908-schema.sql`, restricted permissions. Preserve outside temporary storage before any future destructive cleanup.
- Dashboard rollback baseline: `b426d68`, previous Railway deployment `5b23006f-ca38-4fd5-85da-675216773616`. The additive publication fix can remain with old dashboard code; do not automatically restore the faulty function.
- Current deployment requested: `17e165a1-9f4e-4a1d-baa7-cc653ed532ef`; post-release result to be recorded below.
- Cleanup review: `launch-cleanup-recovery-2026-09-08.md`. Some legacy demo-flag updates invoke reward evaluators; membership demo metadata is immutable. Do not disable these guards or claim every row was flagged without a verified exact-ID manifest.
- Remaining: user's real profile completion/downstream UI journey; native testing; live three-role session acceptance; eventual mobile release with explicit approval. Isolated role/SQL tests do not substitute for these checks.

## Final production result

- Railway deployment `17e165a1-9f4e-4a1d-baa7-cc653ed532ef`: **SUCCESS**. Fresh authenticated navigation to Overview, Inventory, Contacts, Sales activity, Profile, Team, Support and Projects: correct heading, immediate Atlas branding, no visible error alerts on every page. Unauthenticated project requests on both dashboard domains redirect to developer login; unauthenticated brand endpoint also redirects to login.
- Exact-ID demo flag transaction committed 25 rows (5 companies, 8 projects, 11 app profiles, 1 gift). Postcheck: all 6 companies, 9 projects and 11 app profiles flagged, including preexisting demo rows. No deletion, trigger suppression, role or credential changes. Public/mobile parent demo predicates now hide company project inventory; this is intended demo exclusion, not missing data.
- Deferred unflagged records: 11 properties, 10 deal stage entries, 2 developer memberships, 1 deal, 1 potentially built-in badge. Listings/deal flag updates trigger reward evaluation that can delete expired/unmatched reward assignments; membership metadata is deliberately immutable. These need a separate tested maintenance path. Do not call cleanup complete.
- Durable local recovery copies (gitignored, directory mode700/files600): `.local/launch-20260908/` holds schema-before.sql, manifest.json, apply.sql, rehearse.sql, restore-flags.sql and README.md. Restoration is flag-only, preserves audit/version history, and must not mark the batch removed. No cleanup RPC was called.
- Minor remaining UI inconsistency observed: demo projects can retain the legacy “Published to mobile” status chip despite demo exclusion. Demo badge is visible; correct the status wording separately without republishing data.
