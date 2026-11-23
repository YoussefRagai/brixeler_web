# Developer invite provider inspection — 2026-11-21

## Scope

Inspection and minimal provider correction of the Brixeler Supabase Auth invite
configuration. No email was sent and no invitation was created.

## Surface reached

- The infrastructure skill identifies the authoritative project as Supabase
  project `Brixeler`, ref `zihysavpjeyurshpohqf`.
- The verified existing Safari session reached the Brixeler Supabase Auth
  Emails → Invite user surface. No account guessing, sign-in, verification
  code, or new access grant was used.

## Repository evidence

The web app submits developer invitations through Supabase Auth
`inviteUserByEmail`, and resends through `resetPasswordForEmail`, both with a
`redirectTo` value. The email body, CTA wording, and SMTP From address are
therefore provider-owned; no hosted Supabase email HTML exists in this
repository.

The repository now canonicalizes known Brixeler portal aliases to
`https://admin.brixeler.com/developer/accept`, preserving the developer ID,
name, and email query parameters. The hosted provider receipt below verifies
the complementary Invite-template body and redirect configuration.

## Verified provider change

Only the displayed `{{ .SiteURL }}` occurrence in the Invite user sentence was
replaced with the literal `https://admin.brixeler.com`.

- The CTA remains token-preserving: `<a href="{{ .ConfirmationURL }}">`.
- Subject, heading, CTA label, SMTP settings, shared Site URL
  (`https://brixeler.com`), Reset Password, and the other templates were
  unchanged.
- The eight existing redirect entries were unchanged.
- Save, reload, and provider preview showed the literal admin domain and
  preserved the `{{ .ConfirmationURL }}` placeholder. No invitation or email
  was sent.
- Mode-600 rollback/readback evidence is retained privately at
  `.local/provider-20261121/invite-template-change.md`.
