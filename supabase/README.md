# Supabase schema history

The files in `migrations/` mirror the production Supabase migration ledger by
version, name, and stored SQL. Do not rename or edit an applied migration.
Create a new additive migration for every schema change.

The production project predates the first tracked migration. The earliest
migration hardens tables that already existed, so it cannot be replayed into an
empty database on its own.

`baseline/20260826_current_schema.sql` is the schema-only cutover snapshot for
new Supabase projects. It contains the current public schema, functions, views,
indexes, triggers, RLS policies, grants, storage policies/buckets, and realtime
publication membership. It contains no application rows.

Bootstrap a genuinely empty Supabase project with:

```sh
./scripts/bootstrap-supabase-baseline.sh 'postgresql://...'
```

The script refuses a target that already has public tables, applies the
baseline transactionally, and marks only the historical migrations listed in
`baseline/20260826_migration_versions.txt` as applied. Future migrations
remain pending and can then be applied normally with `supabase db push`.

The baseline was parser/execution-tested on a clean local PostgreSQL instance
with minimal Supabase auth/storage stubs. Its catalog totals match production:
43 tables, 5 views, 45 functions, 16 enums, 151 indexes, 27 triggers, 94 public
policies, 28 storage policies, and 18 storage buckets.

Do not run the baseline against production or any populated project. Do not
rename or edit the snapshot after it is used; create a new dated baseline and
cutover manifest instead.
