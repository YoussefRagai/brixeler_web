#!/usr/bin/env bash
set -euo pipefail

if [ -z "${BRIXELER_DATABASE_URL:-}" ]; then
  echo "BRIXELER_DATABASE_URL must point to an isolated migration-built database." >&2
  exit 64
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for suite in "$script_dir"/../supabase/tests/*.sql; do
  psql "$BRIXELER_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$suite"
done
