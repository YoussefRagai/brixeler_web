# Developer invite provider inspection — 2026-11-21

## Scope

Read-only inspection of the Brixeler Supabase Auth invite configuration. No
email was sent, no invitation was created, and no provider or production
configuration was changed.

## Surface reached

- The infrastructure skill identifies the authoritative project as Supabase
  project `Brixeler`, ref `zihysavpjeyurshpohqf`.
- The stored infrastructure Supabase access token is present but rejected as
  invalid by the Supabase CLI.
- The Supabase Dashboard Auth → Email Templates URL redirected to sign-in.
  The ChatGPT account chooser showed stored Youssef Ragai profiles, but the
  user confirmed those accounts are not the Brixeler Supabase account. No
  verification code was accessed or entered, and account guessing stopped.
- The project data-plane endpoint exposes general Auth settings only; it does
  not expose the hosted email-template HTML or management redirect allowlist.

## Repository evidence

The web app submits developer invitations through Supabase Auth
`inviteUserByEmail`, and resends through `resetPasswordForEmail`, both with a
`redirectTo` value. The email body, CTA wording, and SMTP From address are
therefore provider-owned; no hosted Supabase email HTML exists in this
repository.

The repository now canonicalizes known Brixeler portal aliases to
`https://admin.brixeler.com/developer/accept`, preserving the developer ID,
name, and email query parameters. This verifies the app-supplied redirect
contract but cannot prove the current hosted Invite template body.

## Provider change pending verified access

Do not apply until the matching Brixeler Supabase account is available and the
current values are captured:

1. Auth → URL Configuration: add the exact redirect URL
   `https://admin.brixeler.com/developer/accept`; do not change the shared
   mobile/app Site URL.
2. Auth → Email Templates → Invite user: preserve the existing copy and
   metadata, but replace only any hardcoded apex CTA/URL with a token-preserving
   CTA such as:

   ```html
   <a href="{{ .ConfirmationURL }}">Accept developer invitation</a>
   ```

   The body sentence should name `https://admin.brixeler.com/developer`.
3. Do not change the shared Reset Password template, SMTP sender, or unrelated
   mobile auth wording.
4. Render/preview the Invite template and verify the generated URL retains the
   token/code and lands on `/developer/accept`; do not send a live invitation.
