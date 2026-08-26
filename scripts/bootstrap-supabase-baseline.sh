#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <percent-encoded-postgres-url>" >&2
  exit 64
fi

database_url="$1"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "$script_dir/.." && pwd)"
baseline_file="$repo_dir/supabase/baseline/20260826_current_schema.sql"
versions_file="$repo_dir/supabase/baseline/20260826_migration_versions.txt"

for command_name in psql supabase; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command not found: $command_name" >&2
    exit 69
  fi
done

existing_public_tables="$(psql "$database_url" -X -A -t -v ON_ERROR_STOP=1 -c "
  select count(*)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p');
")"

if [ "$existing_public_tables" -ne 0 ]; then
  echo "Refusing to bootstrap: target has $existing_public_tables public tables." >&2
  exit 65
fi

psql "$database_url" -X -v ON_ERROR_STOP=1 -f "$baseline_file"

versions=()
while IFS= read -r version; do
  if [ -n "$version" ]; then
    versions+=("$version")
  fi
done < "$versions_file"

supabase migration repair \
  --db-url "$database_url" \
  --status applied \
  --yes \
  "${versions[@]}"

echo "Baseline applied and historical migration ledger repaired."
echo "Run 'supabase db push --db-url <url>' to apply migrations newer than the baseline."
