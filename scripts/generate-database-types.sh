#!/usr/bin/env bash
set -euo pipefail

if [ -z "${BRIXELER_DATABASE_URL:-}" ]; then
  echo "BRIXELER_DATABASE_URL must point to an isolated migration-built database." >&2
  exit 64
fi

mode="${1:-check}"
if [ "$mode" != "check" ] && [ "$mode" != "update" ]; then
  echo "Usage: BRIXELER_DATABASE_URL=... $0 [check|update]" >&2
  exit 64
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
web_root="$(cd "$script_dir/.." && pwd)"
mobile_root="$(cd "$web_root/../brixeler-mobile" && pwd)"
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT
generated="$temp_dir/database.generated.ts"

supabase gen types typescript --db-url "$BRIXELER_DATABASE_URL" --schema public > "$generated"

targets=(
  "$web_root/src/types/database.generated.ts"
  "$mobile_root/src/types/database.generated.ts"
)

if [ "$mode" = "update" ]; then
  for target in "${targets[@]}"; do
    mkdir -p "$(dirname "$target")"
    cp "$generated" "$target"
  done
  echo "Updated generated database types in both repositories."
  exit 0
fi

for target in "${targets[@]}"; do
  if [ ! -f "$target" ] || ! cmp -s "$generated" "$target"; then
    echo "Generated database types are stale or missing: $target" >&2
    exit 1
  fi
done

echo "Generated database types match the isolated database."
