# Brixeler Dashboards

The shared Next.js application for Brixeler's admin command center, developer portal, mobile-facing API routes, and authoritative Supabase migration history.

## Local setup

1. Install Node.js and run `npm ci`.
2. Create `.env.local` with the variables documented in [HANDOVER.md](HANDOVER.md). Never commit environment files or credentials.
3. Run `npm run dev`.
4. Run `npm run release:check` before release.

The same application serves the admin and developer dashboards. Supabase migrations under `supabase/migrations` are the database source of truth; the mobile repository must not maintain a competing migration chain.

See [HANDOVER.md](HANDOVER.md), [PROJECT_MAP.md](PROJECT_MAP.md), and [SECURITY_SCANNING.md](SECURITY_SCANNING.md).
