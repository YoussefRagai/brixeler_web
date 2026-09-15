# Developer journey verification — 2026-09-08

## Latest email status

Existing Resend team recovered on September 8: `auth.brixeler.com` has existed since April 24. The exact missing DKIM TXT and `send.auth` SPF TXT/MX records were restored to the active authoritative Cloudflare zone, preserving all existing mail and dashboard DNS. Both Google and Cloudflare public DNS resolve the new records. Resend verification was restarted and remains **Pending** at the last check. No invitation retry has been sent yet; delivery and password setup are not yet verified. No new account/API key or SMTP configuration was needed.

Scope: navigation reliability and the admin invitation → company onboarding → project → phase → inventory path. No production business records, emails, passwords or publication states were changed in the initial live walkthrough.

## Live observations

- Existing developer session opens the overview. Initial branding falls back to “Brixeler Partners” and capability-dependent tabs are absent; after the browser finishes loading, Atlas branding and the full authorized navigation appear. This does not establish a permanent server outage. The critical shell's client-request dependency is the confirmed reliability weakness.
- Portfolio opens a selected project. Overview → Phases → View phase inventory preserves both project and phase identifiers.
- Add a unit type preselects the selected release phase. Manual CSV/XLSX inventory import remains available after optional integrations were removed.
- Admin invitation form supports Create new and existing-company choices. Selecting Palm Hills disables company/contact/demo fields and explains that only member access is added. The initial walkthrough did not submit this form.
- Inventory shows an individual row's publication status, while the parent project remains pending review. Effective mobile publication must be checked against parent/phase gates, not inferred from the row label alone.

## Acceptance boundaries

- SQL fixture and mocked-boundary tests are not proof of email delivery or a real browser password-setup flow.
- An actual email acceptance test needs a user-controlled inbox and user completion of password setup.
- Production writes and native mobile release/device testing remain separate from this read-only walkthrough.

Implementation and final executable test results are recorded in TASK_LOG.md.

## Follow-up implementation and real email attempt

- Server-rendered developer branding and role-derived navigation now appear on the first local authenticated response. Missing project count is omitted instead of displayed as zero.
- Invitation inputs and request identity survive an action failure; success alone resets the form.
- Isolated SQL testing exposed a publication-trigger record-shape error (`NEW.is_active` on project/phase records). Additive migration `20260908100000_fix_inventory_publication_guard.sql` separates table-specific branches. It is tested locally, not applied live.
- After explicit confirmation, one live demo-company invitation was attempted. Supabase Auth returned SMTP 550: the sending domain associated with the Resend key is unverified. No developer company or membership was recorded (confirmed by read-only counts). No retry was sent.
- Configured sender is `no-reply@auth.brixeler.com` through `smtp.resend.com`. Authoritative Cloudflare records contain no Resend verification records; ordinary root mailbox records remain untouched. Exact provider-issued records require access to the existing Resend account; available browser sessions were logged out. No credentials or DNS settings changed.
- Parent verification: all 103 Node tests, full lint, TypeScript, production build, ten isolated rollback SQL suites and diff whitespace check passed. No production deployment, database migration, native build or successful email/password-setup round trip is claimed.
