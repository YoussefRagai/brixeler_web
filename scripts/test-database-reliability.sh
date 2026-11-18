#!/usr/bin/env bash
set -euo pipefail

if [ -z "${BRIXELER_DATABASE_URL:-}" ]; then
  echo "BRIXELER_DATABASE_URL must point to an isolated migration-built database." >&2
  exit 64
fi

is_local_database_url() {
  case "$1" in
    postgres://*@127.0.0.1:*|postgresql://*@127.0.0.1:*|\
    postgres://*@localhost:*|postgresql://*@localhost:*|\
    postgres://*@\[::1\]:*|postgresql://*@\[::1\]:*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_local_admin_database_url() {
  case "$1" in
    postgres://supabase_admin@*|postgres://supabase_admin:*@*|\
    postgresql://supabase_admin@*|postgresql://supabase_admin:*@*)
      is_local_database_url "$1"
      ;;
    *)
      return 1
      ;;
  esac
}

local_admin_database_url=""
if [ -n "${BRIXELER_DATABASE_ADMIN_URL:-}" ]; then
  if ! is_local_database_url "$BRIXELER_DATABASE_URL" || ! is_local_admin_database_url "$BRIXELER_DATABASE_ADMIN_URL"; then
    echo "BRIXELER_DATABASE_ADMIN_URL must be a supabase_admin loopback URL paired with an explicit loopback BRIXELER_DATABASE_URL." >&2
    exit 65
  fi
  local_admin_database_url="$BRIXELER_DATABASE_ADMIN_URL"
elif is_local_database_url "$BRIXELER_DATABASE_URL"; then
  local_admin_database_url="$(printf '%s' "$BRIXELER_DATABASE_URL" | sed -E 's#^(postgres(ql)?://)postgres([:@])#\1supabase_admin\3#')"
  if [ "$local_admin_database_url" = "$BRIXELER_DATABASE_URL" ]; then
    local_admin_database_url=""
  fi
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for suite in "$script_dir"/../supabase/tests/*.sql; do
  suite_url="$BRIXELER_DATABASE_URL"
  if [ "$(basename "$suite")" = "transactional_notification_pushes.sql" ] && [ -n "$local_admin_database_url" ]; then
    suite_url="$local_admin_database_url"
  fi
  psql "$suite_url" -X -v ON_ERROR_STOP=1 -f "$suite"
done
