import { readFileSync } from "node:fs";

const [, , manifestPath, expectedMd5] = process.argv;
if (!manifestPath || !expectedMd5) {
  console.error("usage: render-demo-cleanup-sql.mjs <manifest.json> <expected-md5>");
  process.exit(64);
}

const root = JSON.parse(readFileSync(manifestPath, "utf8"));
const manifest = root.manifest ?? root;
if (manifest.manifest_version !== 1 || !manifest.cutoff) {
  throw new Error("Unsupported or incomplete demo cleanup manifest");
}
if (manifest.execution_policy?.delete_auth_users !== false
  || manifest.execution_policy?.delete_storage_objects !== false
  || manifest.execution_policy?.delete_admins !== false
  || manifest.execution_policy?.delete_users_profile !== false
  || manifest.execution_policy?.delete_recent_rows !== false
  || manifest.execution_policy?.require_backup_and_hash_revalidation !== true) {
  throw new Error("Manifest execution policy is not the required protected policy");
}
if (manifest.identity_policy?.security_artifacts?.delete_auth_users !== false
  || manifest.identity_policy?.security_artifacts?.revoke_sessions !== false
  || manifest.identity_policy?.security_artifacts?.revoke_refresh_tokens !== false
  || manifest.identity_policy?.security_artifacts?.recent_sessions_do_not_protect_old_identity !== true
  || manifest.identity_policy?.referential_stub_option?.not_implemented_by_this_workflow !== true) {
  throw new Error("Manifest identity/security-artifact policy is not the required review-only policy");
}
if (manifest.business_eligibility_policy?.created_at_before_cutoff_required !== true
  || manifest.business_eligibility_policy?.updated_at_before_cutoff_required_when_present !== true
  || manifest.business_eligibility_policy?.missing_updated_at_action !== "protect"
  || manifest.business_eligibility_policy?.recent_created_action !== "protect"
  || manifest.business_eligibility_policy?.recent_edit_action !== "protect") {
  throw new Error("Manifest does not carry the conservative business retention policy");
}

const cleanupTables = new Set([
  "admin_agent_notes", "admin_export_jobs", "admin_rules", "admin_tasks",
  "agent_badge_awards", "agent_badges", "badges", "commissions",
  "dashboard_content", "deal_operation_outbox", "deal_stage_entries",
  "deal_status_history", "deals", "developer_commission_rules",
  "developer_contact_request_notes", "developer_contact_request_status_history",
  "developer_contact_requests", "developer_inventory_activity",
  "developer_inventory_holds", "developer_inventory_saved_filters",
  "developer_inventory_versions", "developer_project_moderation_events",
  "developer_account_events", "developer_activity_events",
  "developer_api_credentials", "developer_import_schedules",
  "developer_integration_field_mappings", "developer_notifications",
  "developer_profile_revisions",
  "developer_project_phases", "developer_project_templates", "developer_projects",
  "developer_accounts", "developers",
  "developer_property_price_history", "developer_publication_feedback",
  "developer_support_messages", "developer_support_tickets",
  "developer_sync_conflicts", "developer_sync_runs", "developer_webhook_deliveries",
  "developer_webhook_endpoints", "gift_claims", "gift_eligibilities", "gift_rules",
  "gifts", "growth_audit_log", "growth_audience_versions",
  "growth_evaluation_results", "growth_resource_versions", "mobile_deal_transition_receipts",
  "notification_campaigns", "notifications", "properties", "property_expiration_events",
  "property_inquiries", "property_renewal_requests", "project_favorites",
  "project_unit_types", "project_unit_variants", "push_delivery_batches",
  "saved_properties", "support_macro_versions", "support_macros", "support_ticket_events",
  "support_ticket_messages", "support_tickets", "tiers", "user_tiers",
]);

const identityKeepTables = new Set(["admins", "auth.users", "users_profile"]);

const deleteOrder = [
  "push_delivery_batches", "mobile_deal_transition_receipts", "deal_operation_outbox",
  "developer_activity_events", "developer_account_events",
  "support_ticket_messages", "support_ticket_events", "support_macro_versions",
  "developer_support_messages", "developer_project_moderation_events",
  "developer_inventory_activity", "developer_inventory_versions",
  "developer_contact_request_notes", "developer_contact_request_status_history",
  "developer_api_credentials", "developer_integration_field_mappings",
  "developer_import_schedules", "developer_notifications", "developer_profile_revisions",
  "property_expiration_events", "property_inquiries", "property_renewal_requests",
  "saved_properties", "project_favorites", "developer_inventory_holds",
  "developer_property_price_history", "developer_commission_rules",
  "deal_status_history", "commissions", "agent_badge_awards", "agent_badges",
  "gift_claims", "gift_eligibilities", "growth_evaluation_results",
  "growth_resource_versions", "growth_audience_versions", "growth_audit_log",
  "project_unit_variants", "developer_project_templates", "project_unit_types",
  "developer_contact_requests", "properties", "developer_project_phases",
  "deal_stage_entries", "deals", "support_tickets", "notification_campaigns",
  "notifications", "admin_agent_notes", "admin_export_jobs", "admin_rules",
  "admin_tasks", "dashboard_content", "support_macros", "gift_rules", "gifts",
  "badges", "tiers", "user_tiers", "developer_projects", "developer_accounts", "developers",
];
const orderIndex = new Map(deleteOrder.map((table, index) => [table, index]));

const allowedEligibility = new Set(["eligible", "recent_created", "recent_edit", "unknown_recent_edit"]);
if (!Array.isArray(manifest.business_rows)) {
  throw new Error("Manifest business_rows must be an array");
}
for (const row of manifest.business_rows) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(String(row.table_name ?? ""))
    || !/^[0-9a-f-]{36}$/i.test(String(row.id ?? ""))
    || !allowedEligibility.has(row.eligibility)
    || !/^[0-9a-f]{32}$/i.test(String(row.fingerprint ?? ""))) {
    throw new Error("Manifest business row lacks explicit eligibility or full-row fingerprint");
  }
}
const blocked = new Set((manifest.dependency_blockers ?? []).map((row) => `${row.target_table}:${row.target_id}`));
const candidates = (manifest.business_rows ?? [])
  .filter((row) => row.window === "old")
  .filter((row) => row.eligibility === "eligible")
  .filter((row) => !blocked.has(`${row.table_name}:${row.id}`))
  .filter((row) => cleanupTables.has(row.table_name))
  .filter((row) => !identityKeepTables.has(row.table_name));
const candidateKeys = new Set(candidates.map((row) => `${row.table_name}:${row.id}`));
const protectedBusinessRows = (manifest.business_rows ?? [])
  .filter((row) => row.eligibility !== "eligible");
const blockerSnapshotGroups = new Map();
for (const blocker of manifest.dependency_blockers ?? []) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(String(blocker.target_table ?? ""))
    || !/^[a-z_][a-z0-9_]*$/i.test(String(blocker.source_table ?? ""))
    || !/^[0-9a-f-]{36}$/i.test(String(blocker.target_id ?? ""))) {
    throw new Error("Dependency blocker has an invalid table or UUID");
  }
  const edges = (manifest.foreign_key_graph ?? []).filter((edge) =>
    edge.source_table === blocker.source_table && edge.target_table === blocker.target_table);
  if (!edges.length) {
    throw new Error(`Dependency blocker has no matching foreign-key edge: ${blocker.source_table} -> ${blocker.target_table}`);
  }
  for (const edge of edges) {
    if (![edge.source_table, edge.source_column, edge.target_table, edge.target_column]
      .every((value) => /^[a-z_][a-z0-9_]*$/i.test(String(value ?? "")))) {
      throw new Error("Foreign-key graph contains an invalid identifier");
    }
    const key = [edge.source_table, edge.source_column, edge.target_table, edge.target_column].join("|");
    const group = blockerSnapshotGroups.get(key) ?? { edge, targetIds: new Set() };
    group.targetIds.add(blocker.target_id);
    blockerSnapshotGroups.set(key, group);
  }
}

const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
const valuesRows = (rows) => rows.map((row) => `(${sqlLiteral(row.id)}::uuid, ${sqlLiteral(row.fingerprint ?? "")})`).join(", ");
const grouped = new Map();
for (const row of candidates) {
  if (!/^[0-9a-f-]{36}$/i.test(row.id)) throw new Error(`Invalid UUID in ${row.table_name}`);
  const inherited = String(row.ownership ?? "").startsWith("inherited_from:");
  const key = `${row.table_name}|${inherited ? "inherited" : row.demo_batch ?? ""}`;
  const rows = grouped.get(key) ?? [];
  rows.push(row);
  grouped.set(key, rows);
}

const groups = [...grouped.entries()].sort(([a], [b]) => {
  const [tableA] = a.split("|");
  const [tableB] = b.split("|");
  return (orderIndex.get(tableA) ?? 999) - (orderIndex.get(tableB) ?? 999) || tableA.localeCompare(tableB);
});

const cutoff = sqlLiteral(manifest.cutoff);
const quoteIdentifier = (value) => `"${String(value).replaceAll('"', '""')}"`;
const lockTables = new Set(["admins", "users_profile"]);
for (const row of candidates) lockTables.add(row.table_name);
for (const row of protectedBusinessRows) lockTables.add(row.table_name);
for (const edge of manifest.foreign_key_graph ?? []) {
  if (edge.source_table) lockTables.add(edge.source_table);
  if (edge.target_table) lockTables.add(edge.target_table);
}
const lockStatements = [...lockTables]
  .filter((table) => /^[a-z_][a-z0-9_]*$/i.test(table))
  .sort()
  .map((table) => `LOCK TABLE public.${quoteIdentifier(table)} IN SHARE MODE;`);
const lines = [
  "-- Generated from a reviewed, mode-600 manifest. Do not edit IDs by hand.",
  "-- The caller must have a Supabase service-role JWT/database boundary.",
  "BEGIN;",
  "SET LOCAL lock_timeout = '5s';",
  "SET LOCAL statement_timeout = '120s';",
  "SELECT pg_advisory_xact_lock(hashtextextended('brixeler:demo-cleanup', 0));",
  "-- Lock every candidate/protected/FK-family table before the preview hash or deletes.",
  "-- SHARE conflicts with normal INSERT/UPDATE/DELETE (ROW EXCLUSIVE) and prevents a recent child from arriving after preview.",
  ...lockStatements,
  "-- psql execution uses the supplied privileged connection; this setting is",
  "-- only for the preview function's caller-role check in a direct psql run.",
  "SELECT set_config('request.jwt.claim.role', 'service_role', true);",
  "CREATE TEMP TABLE demo_cleanup_profile_snapshot ON COMMIT DROP AS",
  "  SELECT id, md5(to_jsonb(p)::text) AS fingerprint FROM public.users_profile p;",
  "CREATE TEMP TABLE demo_cleanup_admin_snapshot ON COMMIT DROP AS",
  "  SELECT id, md5(to_jsonb(a)::text) AS fingerprint FROM public.admins a;",
  "CREATE TEMP TABLE demo_cleanup_protected_business_snapshot (table_name text NOT NULL, row_id uuid NOT NULL, fingerprint text NOT NULL, PRIMARY KEY (table_name, row_id)) ON COMMIT DROP;",
  "CREATE TEMP TABLE demo_cleanup_blocker_snapshot (table_name text NOT NULL, row_id uuid NOT NULL, fingerprint text NOT NULL, PRIMARY KEY (table_name, row_id)) ON COMMIT DROP;",
  "DO $$",
  "DECLARE current_plan jsonb;",
  "BEGIN",
  `  current_plan := public.preview_demo_cleanup(${cutoff}::timestamptz);`,
  `  IF md5(current_plan::text) <> ${sqlLiteral(expectedMd5)} THEN`,
  "    RAISE EXCEPTION 'Demo cleanup manifest changed; aborting before delete';",
  "  END IF;",
  "END $$;",
];
if (protectedBusinessRows.some((row) => !/^[0-9a-f-]{36}$/i.test(row.id) || !/^[0-9a-f]{32}$/i.test(String(row.fingerprint ?? "")))) {
  throw new Error("Protected business row is missing a valid ID or full-row fingerprint");
}
if (protectedBusinessRows.length) {
  lines.splice(lines.indexOf("DO $$"), 0,
    `INSERT INTO demo_cleanup_protected_business_snapshot(table_name, row_id, fingerprint) VALUES ${protectedBusinessRows.map((row) => `(${sqlLiteral(row.table_name)}, ${sqlLiteral(row.id)}::uuid, ${sqlLiteral(row.fingerprint)})`).join(", ")};`,
  );
}

for (const { edge, targetIds } of blockerSnapshotGroups.values()) {
  const targets = [...targetIds].map((id) => `(${sqlLiteral(id)}::uuid)`).join(", ");
  const approvedSourceIds = candidates
    .filter((row) => candidateKeys.has(`${edge.source_table}:${row.id}`))
    .map((row) => row.id);
  const approvedSourceExclusion = approvedSourceIds.length
    ? ` WHERE NOT EXISTS (SELECT 1 FROM (VALUES ${approvedSourceIds.map((id) => `(${sqlLiteral(id)}::uuid)`).join(", ")}) AS approved_candidates(id) WHERE approved_candidates.id = child.id)`
    : "";
  lines.push(
    `INSERT INTO demo_cleanup_blocker_snapshot(table_name, row_id, fingerprint) SELECT ${sqlLiteral(edge.source_table)}, child.id, md5(to_jsonb(child)::text) FROM public.${quoteIdentifier(edge.source_table)} child JOIN (VALUES ${targets}) AS targets(id) ON child.${quoteIdentifier(edge.source_column)} = targets.id${approvedSourceExclusion} ON CONFLICT (table_name, row_id) DO NOTHING;`,
  );
}

for (const [, rows] of groups) {
  const table = rows[0].table_name;
  const inherited = String(rows[0].ownership ?? "").startsWith("inherited_from:");
  const expected = rows.length;
  const batch = rows[0].demo_batch;
  const expectedValues = valuesRows(rows);
  if (rows.some((row) => !/^[0-9a-f]{32}$/i.test(String(row.fingerprint ?? "")))) {
    throw new Error(`Missing full-row fingerprint in ${table}`);
  }
  const condition = inherited
    ? `t.id = e.id AND t.created_at::timestamptz < ${cutoff}::timestamptz`
    : `t.id = e.id AND t.is_demo IS TRUE AND t.demo_batch = ${sqlLiteral(batch)} AND t.created_at::timestamptz < ${cutoff}::timestamptz`;
  lines.push(
    "DO $$",
    "DECLARE deleted_count integer;",
    "BEGIN",
    `  DELETE FROM public.${quoteIdentifier(table)} AS t USING (VALUES ${expectedValues}) AS e(id, fingerprint) WHERE ${condition} AND md5(to_jsonb(t)::text) = e.fingerprint;`,
    "  GET DIAGNOSTICS deleted_count = ROW_COUNT;",
    `  IF deleted_count <> ${expected} THEN`,
    `    RAISE EXCEPTION 'Demo cleanup revalidation failed for ${table}: expected ${expected}, deleted %', deleted_count;`,
    "  END IF;",
    "END $$;",
  );
}

for (const table of new Set([...blockerSnapshotGroups.values()].map(({ edge }) => edge.source_table))) {
  lines.push(
    "DO $$",
    "BEGIN",
    `  IF EXISTS (SELECT 1 FROM demo_cleanup_blocker_snapshot s LEFT JOIN public.${quoteIdentifier(table)} child ON child.id = s.row_id WHERE s.table_name = ${sqlLiteral(table)} AND (child.id IS NULL OR md5(to_jsonb(child)::text) IS DISTINCT FROM s.fingerprint)) THEN`,
    `    RAISE EXCEPTION 'Protected inbound blocker row changed or disappeared in ${table}; rolling back';`,
    "  END IF;",
    "END $$;",
  );
}

const protectedByTable = new Map();
for (const row of protectedBusinessRows) {
  const list = protectedByTable.get(row.table_name) ?? [];
  list.push(row);
  protectedByTable.set(row.table_name, list);
}
for (const [table, rows] of protectedByTable) {
  const values = rows.map((row) => `(${sqlLiteral(row.id)}::uuid, ${sqlLiteral(row.fingerprint)})`).join(", ");
  lines.push(
    "DO $$",
    "BEGIN",
    `  IF EXISTS (SELECT 1 FROM (VALUES ${values}) AS e(id, fingerprint) LEFT JOIN public.${quoteIdentifier(table)} AS t ON t.id = e.id WHERE t.id IS NULL OR md5(to_jsonb(t)::text) IS DISTINCT FROM e.fingerprint) THEN`,
    `    RAISE EXCEPTION 'Protected business row changed or disappeared in ${table}; rolling back';`,
    "  END IF;",
    "END $$;",
  );
}

lines.push(
  "DO $$",
  "BEGIN",
  "  IF EXISTS (SELECT 1 FROM demo_cleanup_profile_snapshot s FULL OUTER JOIN public.users_profile p ON p.id = s.id WHERE s.id IS NULL OR p.id IS NULL OR md5(to_jsonb(p)::text) IS DISTINCT FROM s.fingerprint)",
  "     OR EXISTS (SELECT 1 FROM demo_cleanup_admin_snapshot s FULL OUTER JOIN public.admins a ON a.id = s.id WHERE s.id IS NULL OR a.id IS NULL OR md5(to_jsonb(a)::text) IS DISTINCT FROM s.fingerprint) THEN",
  "    RAISE EXCEPTION 'Protected mobile profile or admin row changed; rolling back';",
  "  END IF;",
  "END $$;",
  "COMMIT;",
);

process.stdout.write(`${lines.join("\n")}\n`);
