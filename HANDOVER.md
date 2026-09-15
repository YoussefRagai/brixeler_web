# Dashboard and database handover

## Repository and production surfaces

- GitHub: `https://github.com/YoussefRagai/brixeler_web`
- Default branch: `main`
- Admin dashboard: `https://admin.brixeler.com`
- Developer dashboard: `https://developer.brixeler.com`
- Companion mobile repository: `https://github.com/YoussefRagai/brixeler-mobile`

## Architecture

- Next.js provides both dashboards and their server/API routes.
- Railway hosts the production web service.
- Supabase provides PostgreSQL, Auth and Storage. This repository owns the authoritative migration history.
- Cloudflare owns public DNS. Resend is used by Supabase Auth SMTP. Twilio Verify supplies WhatsApp phone verification when configured.

## Required environment names

Public client configuration:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Server-only configuration:

- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_SESSION_SECRET`
- `DEVELOPER_SESSION_SECRET`
- `DEVELOPER_IMPERSONATION_SECRET`
- `ADMIN_PORTAL_URL`
- `DEVELOPER_PORTAL_URL`
- optional `ADMIN_DEFAULT_ROLES`
- Twilio: `TWILIO_ACCOUNT_SID`, either `TWILIO_AUTH_TOKEN` or API-key credentials, and `TWILIO_VERIFY_SERVICE_SID`

Values are intentionally not stored in Git. Grant the recipient team access in Railway, Supabase, Cloudflare, Resend, Twilio, and GitHub rather than sharing account passwords or copying secrets into documentation.

## Verification and release

```bash
npm ci
npm run release:check
```

For database changes, reproduce the migration chain in an isolated database, run the SQL contracts, compare the linked migration ledger, back up affected structures/data, then apply only reviewed additive migrations. Never delete or rename an already-applied migration.

Railway and Supabase resource identifiers and safe access procedures are documented in the local Brixeler infrastructure skill on the current owner machine; provider team access must be recreated for the recipient rather than committing tokens.

## Handover checklist

- Add the recipient's GitHub account or transfer both repositories to the destination organization.
- Grant least-privilege provider access separately.
- Rotate credentials after ownership changes; verify the applications before revoking the outgoing owner's access.
- Confirm custom domains, Auth SMTP, phone verification, EAS project, and app-store roles from the recipient's own account.
- Keep demo data flagged until an authorized launch cleanup; do not delete it heuristically by name.
