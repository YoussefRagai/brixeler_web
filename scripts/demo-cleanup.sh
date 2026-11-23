#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage:
  scripts/demo-cleanup.sh plan [--manifest PATH] [--cutoff ISO-8601]
  scripts/demo-cleanup.sh backup --manifest PATH [--backup PATH]
  scripts/demo-cleanup.sh execute --manifest PATH --backup PATH --confirm DELETE_EXACT_DEMO_CLEANUP

BRIXELER_DATABASE_URL must point at the explicitly reviewed Brixeler database.
The default plan/backup directory is the gitignored .local/demo-cleanup tree.
USAGE
  exit 64
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
database_url="${BRIXELER_DATABASE_URL:-}"
psql_bin="${PSQL_BIN:-psql}"
pg_dump_bin="${PG_DUMP_BIN:-pg_dump}"
if [ -z "$database_url" ]; then
  echo "BRIXELER_DATABASE_URL is required; no database action was attempted." >&2
  exit 64
fi

mode="${1:-}"
shift || true
manifest_path=""
backup_path=""
confirm=""
cutoff="${DEMO_CLEANUP_CUTOFF:-}"
cleanup_root="${DEMO_CLEANUP_DIR:-$repo_root/.local/demo-cleanup}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --manifest)
      manifest_path="${2:-}"
      shift 2
      ;;
    --backup)
      backup_path="${2:-}"
      shift 2
      ;;
    --confirm)
      confirm="${2:-}"
      shift 2
      ;;
    --cutoff)
      cutoff="${2:-}"
      shift 2
      ;;
    *) usage ;;
  esac
done

umask 077
mkdir -p "$cleanup_root"
chmod 700 "$cleanup_root"

manifest_md5() {
  md5 -q "$1"
}

manifest_value() {
  local path="$1"
  local expression="$2"
  MANIFEST_PATH="$path" node --input-type=module -e \
    "import { readFileSync } from 'node:fs'; const value = JSON.parse(readFileSync(process.env.MANIFEST_PATH, 'utf8')); const manifest = value.manifest ?? value; const result = (${expression}); if (result === undefined || result === null) process.exit(1); process.stdout.write(String(result));"
}

case "$mode" in
  plan)
    if [ -z "$manifest_path" ]; then
      stamp="$(date -u +%Y%m%dT%H%M%SZ)"
      manifest_path="$cleanup_root/manifest-$stamp.json"
    fi
    mkdir -p "$(dirname "$manifest_path")"
    chmod 700 "$(dirname "$manifest_path")"
    if [ -n "$cutoff" ]; then
      if [[ ! "$cutoff" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$ ]]; then
        echo "Cutoff must be an ISO-8601 timestamp." >&2
        exit 65
      fi
      plan_json="$("$psql_bin" "$database_url" -X -Atq -v ON_ERROR_STOP=1 -c \
        "with caller as (select set_config('request.jwt.claim.role','service_role',true) as role) select public.preview_demo_cleanup('$cutoff'::timestamptz)::text from caller")"
    else
      plan_json="$("$psql_bin" "$database_url" -X -Atq -v ON_ERROR_STOP=1 -c \
        "with db_clock as (select clock_timestamp() as now), caller as (select set_config('request.jwt.claim.role','service_role',true) as role) select public.preview_demo_cleanup(db_clock.now - interval '7 days')::text from db_clock cross join caller")"
    fi
    if [ -z "$plan_json" ]; then
      echo "The database returned an empty cleanup plan; no manifest was written." >&2
      exit 1
    fi
    # Keep the exact database JSON bytes so the execution hash revalidates the
    # plan, while the file itself remains mode 600.
    printf '%s' "$plan_json" > "$manifest_path"
    chmod 600 "$manifest_path"
    echo "manifest=$manifest_path"
    echo "md5=$(manifest_md5 "$manifest_path")"
    ;;

  backup)
    [ -n "$manifest_path" ] || usage
    [ -f "$manifest_path" ] || { echo "Manifest not found: $manifest_path" >&2; exit 66; }
    manifest_value "$manifest_path" "manifest.cutoff" >/dev/null || { echo "Manifest is not valid JSON with a cutoff." >&2; exit 65; }
    if [ -z "$backup_path" ]; then
      backup_path="$(dirname "$manifest_path")/brixeler-demo-cleanup.backup.dump"
    fi
    mkdir -p "$(dirname "$backup_path")"
    chmod 700 "$(dirname "$backup_path")"
    # This backup intentionally excludes auth/storage internals.  The plan
    # never authorizes touching them; public identity rows are included solely
    # to make recovery/reconciliation possible for the data owner.
    backup_tables=(
      admins users_profile developer_accounts developers developer_account_events
      admin_agent_notes admin_export_jobs admin_rules admin_tasks agent_badge_awards agent_badges badges dashboard_content
      deal_operation_outbox deal_stage_entries deal_status_history deals commissions
      developer_commission_rules developer_contact_request_notes developer_contact_request_status_history
      developer_contact_requests developer_inventory_activity developer_inventory_holds
      developer_inventory_saved_filters developer_inventory_versions developer_project_moderation_events
      developer_activity_events developer_api_credentials developer_import_schedules
      developer_integration_field_mappings developer_notifications developer_profile_revisions
      developer_project_phases developer_project_templates developer_projects developer_property_price_history
      developer_publication_feedback developer_support_messages developer_support_tickets
      developer_sync_conflicts developer_sync_runs developer_webhook_deliveries developer_webhook_endpoints
      gift_claims gift_eligibilities gift_rules gifts growth_audit_log growth_audience_versions
      growth_evaluation_results growth_resource_versions mobile_deal_transition_receipts
      notification_campaigns notifications properties property_expiration_events property_inquiries
      property_renewal_requests project_favorites project_unit_types project_unit_variants
      push_delivery_batches saved_properties support_macro_versions support_macros support_ticket_events
      support_ticket_messages support_tickets tiers user_tiers
    )
    dump_args=()
    for table in "${backup_tables[@]}"; do
      dump_args+=("--table=public.$table")
    done
    "$pg_dump_bin" "$database_url" --format=custom --file="$backup_path" --no-owner --no-privileges "${dump_args[@]}"
    chmod 600 "$backup_path"
    echo "backup=$backup_path"
    echo "manifest_md5=$(manifest_md5 "$manifest_path")"
    ;;

  execute)
    [ -n "$manifest_path" ] || usage
    [ -n "$backup_path" ] || usage
    [ "$confirm" = "DELETE_EXACT_DEMO_CLEANUP" ] || {
      echo "Refusing execution: pass --confirm DELETE_EXACT_DEMO_CLEANUP after reviewing the manifest and backup." >&2
      exit 65
    }
    [ -f "$manifest_path" ] || { echo "Manifest not found: $manifest_path" >&2; exit 66; }
    [ -s "$backup_path" ] || { echo "Backup is missing or empty: $backup_path" >&2; exit 66; }
    manifest_value "$manifest_path" "manifest.cutoff" >/dev/null || { echo "Manifest is not valid JSON with a cutoff." >&2; exit 65; }
    old_candidate_count="$(MANIFEST_PATH="$manifest_path" node --input-type=module -e \
      "import { readFileSync } from 'node:fs'; const value=JSON.parse(readFileSync(process.env.MANIFEST_PATH,'utf8')); const m=value.manifest??value; const keep=new Set((m.dependency_blockers??[]).map(x=>x.target_table+':'+x.target_id)); const n=(m.business_rows??[]).filter(x=>x.window==='old'&&x.eligibility==='eligible'&&!keep.has(x.table_name+':'+x.id)&&!['admins','users_profile'].includes(x.table_name)).length; process.stdout.write(String(n));")"
    [ "$old_candidate_count" -gt 0 ] || { echo "No unblocked business rows are eligible; no delete attempted." >&2; exit 0; }
    execute_dir="$(mktemp -d "$cleanup_root/execute.XXXXXX")"
    chmod 700 "$execute_dir"
    cleanup_execute_dir() { rm -f "$execute_dir/cleanup.sql"; rmdir "$execute_dir"; }
    trap cleanup_execute_dir EXIT
    expected_md5="$(manifest_md5 "$manifest_path")"
    node "$repo_root/scripts/render-demo-cleanup-sql.mjs" "$manifest_path" "$expected_md5" > "$execute_dir/cleanup.sql"
    chmod 600 "$execute_dir/cleanup.sql"
    echo "Executing $old_candidate_count exact old business IDs in one guarded transaction."
    "$psql_bin" "$database_url" -X -v ON_ERROR_STOP=1 -f "$execute_dir/cleanup.sql"
    ;;

  *) usage ;;
esac
