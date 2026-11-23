import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const migration = readFileSync(join(repoRoot, "supabase/migrations/20261121215614_safe_demo_cleanup_workflow.sql"), "utf8");
const runner = readFileSync(join(repoRoot, "scripts/demo-cleanup.sh"), "utf8");
const renderer = join(repoRoot, "scripts/render-demo-cleanup-sql.mjs");

test("preview is service-only and never trusts SECURITY DEFINER owner identity", () => {
  assert.match(migration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/g);
  assert.doesNotMatch(migration, /current_user\s+not\s+in/);
  assert.match(migration, /p_cutoff > clock_timestamp\(\) - interval '7 days'/);
  assert.match(migration, /cutoff_value > clock_timestamp\(\) - interval '7 days'/);
  assert.match(migration, /revoke all on function public\.preview_demo_cleanup/);
  assert.match(migration, /grant execute on function public\.preview_demo_cleanup[\s\S]*to service_role/);
  assert.match(migration, /require_backup_and_hash_revalidation/);
});

test("the runner requires a reviewed manifest, mode-600 backup, exact confirmation, and fixed revalidation", () => {
  assert.match(runner, /BRIXELER_DATABASE_URL is required/);
  assert.match(runner, /DELETE_EXACT_DEMO_CLEANUP/);
  assert.match(runner, /Backup is missing or empty/);
  assert.match(runner, /render-demo-cleanup-sql\.mjs/);
  assert.match(runner, /md5 -q/);
  assert.match(runner, /chmod 600/);
  assert.match(runner, /--format=custom/);
});

test("renderer deletes only reviewed old unblocked IDs and snapshots protected rows", () => {
  const work = mkdtempSync(join(tmpdir(), "brixeler-demo-cleanup-"));
  try {
    const oldId = "11111111-1111-4111-8111-111111111111";
    const recentId = "22222222-2222-4222-8222-222222222222";
    const blockedId = "33333333-3333-4333-8333-333333333333";
    const manifest = {
      manifest_version: 1,
      cutoff: "2026-11-14T00:00:00Z",
      business_eligibility_policy: {
        created_at_before_cutoff_required: true,
        updated_at_before_cutoff_required_when_present: true,
        missing_updated_at_action: "protect",
        recent_created_action: "protect",
        recent_edit_action: "protect",
      },
      business_rows: [
        { table_name: "dashboard_content", id: oldId, demo_batch: "batch-a", created_at: "2026-11-01T00:00:00Z", fingerprint: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", window: "old", eligibility: "eligible" },
        { table_name: "support_macros", id: recentId, demo_batch: "batch-a", created_at: "2026-11-20T00:00:00Z", fingerprint: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", window: "recent", eligibility: "recent_created" },
        { table_name: "deals", id: blockedId, demo_batch: "batch-a", created_at: "2026-11-01T00:00:00Z", fingerprint: "cccccccccccccccccccccccccccccccc", window: "old", eligibility: "eligible" },
        { table_name: "developers", id: "66666666-6666-4666-8666-666666666666", demo_batch: "batch-a", created_at: "2026-11-01T00:00:00Z", fingerprint: "dddddddddddddddddddddddddddddddd", window: "old", eligibility: "eligible" },
      ],
      dependency_blockers: [{ target_table: "deals", target_id: blockedId, source_table: "deal_status_history", source_count: 1, reason: "recent or unflagged child" }],
      foreign_key_graph: [{ source_table: "deal_status_history", source_column: "deal_id", target_table: "deals", target_column: "id", delete_rule: "CASCADE" }],
      mobile_profiles: [{ id: "44444444-4444-4444-8444-444444444444", protected: true }],
      protected_admins: [{ id: "55555555-5555-4555-8555-555555555555", protected: true }],
      execution_policy: {
        delete_auth_users: false,
        delete_storage_objects: false,
        delete_admins: false,
        delete_users_profile: false,
        delete_recent_rows: false,
        require_backup_and_hash_revalidation: true,
      },
      identity_policy: {
        security_artifacts: {
          delete_auth_users: false,
          revoke_sessions: false,
          revoke_refresh_tokens: false,
          recent_sessions_do_not_protect_old_identity: true,
        },
        referential_stub_option: { not_implemented_by_this_workflow: true },
      },
    };
    const manifestPath = join(work, "manifest.json");
    writeFileSync(manifestPath, JSON.stringify(manifest));
    chmodSync(manifestPath, 0o600);
    const rendered = spawnSync(process.execPath, [renderer, manifestPath, "0123456789abcdef0123456789abcdef"], { encoding: "utf8" });
    assert.equal(rendered.status, 0, rendered.stderr);
    assert.match(rendered.stdout, new RegExp(oldId));
    assert.match(rendered.stdout, new RegExp(`demo_cleanup_protected_business_snapshot[\\s\\S]*${recentId}`));
    assert.doesNotMatch(rendered.stdout, new RegExp(`DELETE FROM public\."support_macros"[\\s\\S]*${recentId}`));
    assert.doesNotMatch(rendered.stdout, new RegExp(`DELETE FROM public\\."deals"[\\s\\S]*${blockedId}`));
    assert.match(rendered.stdout, /demo_cleanup_profile_snapshot/);
    assert.match(rendered.stdout, /demo_cleanup_admin_snapshot/);
    assert.match(rendered.stdout, /LOCK TABLE public\."developers" IN SHARE MODE/);
    assert.match(rendered.stdout, /md5\(to_jsonb\(t\)::text\) = e\.fingerprint/);
    assert.match(rendered.stdout, /demo_cleanup_blocker_snapshot/);
    assert.match(rendered.stdout, /Protected inbound blocker row changed or disappeared/);
    assert.match(rendered.stdout, /FULL OUTER JOIN public\.users_profile/);
    assert.match(rendered.stdout, /Demo cleanup manifest changed/);
    assert.doesNotMatch(rendered.stdout, /delete\s+from\s+(auth|storage)\./i);
    assert.doesNotMatch(rendered.stdout, /delete\s+from\s+public\.(users_profile|admins)\b/i);
    assert.doesNotMatch(rendered.stdout, /cascade|set\s+null/i);
    assert.equal(statSync(manifestPath).mode & 0o777, 0o600);

    const malformedManifestPath = join(work, "malformed-manifest.json");
    writeFileSync(malformedManifestPath, JSON.stringify({
      ...manifest,
      business_rows: manifest.business_rows.map((row) => row.id === oldId
        ? (({ eligibility, ...withoutEligibility }) => withoutEligibility)(row)
        : row),
    }));
    const malformed = spawnSync(process.execPath, [renderer, malformedManifestPath, "0123456789abcdef0123456789abcdef"], { encoding: "utf8" });
    assert.notEqual(malformed.status, 0);
    assert.match(malformed.stderr, /explicit eligibility or full-row fingerprint/);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("renderer orders candidate deletes child-first for the live project FK edges", () => {
  const work = mkdtempSync(join(tmpdir(), "brixeler-demo-cleanup-order-"));
  try {
    const tables = [
      "project_unit_variants",
      "developer_project_templates",
      "project_unit_types",
      "developer_contact_requests",
      "properties",
      "developer_project_phases",
      "developer_projects",
    ];
    const ids = Object.fromEntries(tables.map((table, index) => [
      table,
      `${String(index + 1).padStart(8, "0")}-0000-4000-8000-000000000000`,
    ]));
    const recentSourceId = "99999999-9999-4999-8999-999999999999";
    const fingerprint = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const manifest = {
      manifest_version: 1,
      cutoff: "2026-11-14T00:00:00Z",
      business_eligibility_policy: {
        created_at_before_cutoff_required: true,
        updated_at_before_cutoff_required_when_present: true,
        missing_updated_at_action: "protect",
        recent_created_action: "protect",
        recent_edit_action: "protect",
      },
      business_rows: [
        ...tables.map((table) => ({
          table_name: table,
          id: ids[table],
          demo_batch: "batch-a",
          created_at: "2026-11-01T00:00:00Z",
          updated_at: "2026-11-01T00:00:00Z",
          fingerprint,
          window: "old",
          eligibility: "eligible",
        })),
        {
        table_name: "developer_projects",
        id: recentSourceId,
        demo_batch: "batch-a",
        created_at: "2026-11-20T00:00:00Z",
        updated_at: "2026-11-20T00:00:00Z",
        fingerprint: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        window: "recent",
        eligibility: "recent_created",
        },
      ],
      dependency_blockers: [{
        target_table: "developers",
        target_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        source_table: "developer_projects",
        source_count: 2,
        reason: "recent or unlisted child",
      }],
      foreign_key_graph: [
        ["project_unit_variants", "project_unit_type_id", "project_unit_types", "id"],
        ["developer_project_templates", "source_unit_type_id", "project_unit_types", "id"],
        ["project_unit_types", "phase_id", "developer_project_phases", "id"],
        ["properties", "phase_id", "developer_project_phases", "id"],
        ["developer_contact_requests", "property_id", "properties", "id"],
        ["properties", "project_id", "developer_projects", "id"],
        ["developer_project_phases", "project_id", "developer_projects", "id"],
        ["developer_project_templates", "source_project_id", "developer_projects", "id"],
        ["developer_projects", "developer_id", "developers", "id"],
      ].map(([source_table, source_column, target_table, target_column]) => ({
        source_table, source_column, target_table, target_column, delete_rule: "RESTRICT",
      })),
      mobile_profiles: [],
      protected_admins: [],
      execution_policy: {
        delete_auth_users: false,
        delete_storage_objects: false,
        delete_admins: false,
        delete_users_profile: false,
        delete_recent_rows: false,
        require_backup_and_hash_revalidation: true,
      },
      identity_policy: {
        security_artifacts: {
          delete_auth_users: false,
          revoke_sessions: false,
          revoke_refresh_tokens: false,
          recent_sessions_do_not_protect_old_identity: true,
        },
        referential_stub_option: { not_implemented_by_this_workflow: true },
      },
    };
    const manifestPath = join(work, "manifest.json");
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const rendered = spawnSync(process.execPath, [renderer, manifestPath, "0123456789abcdef0123456789abcdef"], { encoding: "utf8" });
    assert.equal(rendered.status, 0, rendered.stderr);
    const deleteOrder = [...rendered.stdout.matchAll(/DELETE FROM public\."([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(deleteOrder, tables);
    const blockerLine = rendered.stdout.split("\n").find((line) =>
      line.includes("demo_cleanup_blocker_snapshot") && line.includes("'developer_projects'"));
    assert.ok(blockerLine, "developer-project blocker snapshot was not generated");
    assert.match(blockerLine, /NOT EXISTS/);
    assert.match(blockerLine, new RegExp(ids.developer_projects));
    assert.match(rendered.stdout, new RegExp(recentSourceId));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("Auth retirement plan emits only old eligible non-mobile IDs and keeps sessions separate", () => {
  const work = mkdtempSync(join(tmpdir(), "brixeler-auth-retirement-"));
  try {
    const planRenderer = join(repoRoot, "scripts/render-auth-identity-retirement-plan.mjs");
    const manifestPath = join(work, "manifest.json");
    writeFileSync(manifestPath, JSON.stringify({
      manifest_version: 1,
      cutoff: "2026-11-14T00:00:00Z",
      protected_auth_ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      developer_identity_rows: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          developer_id: "66666666-6666-4666-8666-666666666666",
          auth_user_id: "77777777-7777-4777-8777-777777777777",
          demo_batch: "batch-a",
          created_at: "2026-11-01T00:00:00Z",
          window: "old",
          eligible_identity: true,
          has_mobile_profile: false,
          has_auth_phone: false,
          has_phone_identity: false,
          has_push_token: false,
          is_platform_admin: false,
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          developer_id: "66666666-6666-4666-8666-666666666666",
          auth_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          demo_batch: "batch-a",
          created_at: "2026-11-01T00:00:00Z",
          window: "old",
          eligible_identity: true,
          has_mobile_profile: false,
          has_auth_phone: false,
          has_phone_identity: false,
          has_push_token: false,
          is_platform_admin: false,
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          developer_id: "66666666-6666-4666-8666-666666666666",
          auth_user_id: "88888888-8888-4888-8888-888888888888",
          demo_batch: "batch-a",
          created_at: "2026-11-01T00:00:00Z",
          window: "old",
          eligible_identity: true,
          has_mobile_profile: false,
          has_auth_phone: false,
          has_phone_identity: false,
          has_push_token: false,
          is_platform_admin: false,
        },
      ],
      dependency_blockers: [{
        target_table: "developer_accounts",
        target_id: "33333333-3333-4333-8333-333333333333",
        source_table: "developer_activity_events",
        source_count: 1,
        reason: "recent or unflagged child",
      }],
      identity_policy: {
        security_artifacts: {
          delete_auth_users: false,
          revoke_sessions: false,
          revoke_refresh_tokens: false,
          recent_sessions_do_not_protect_old_identity: true,
        },
        referential_stub_option: { not_implemented_by_this_workflow: true },
      },
    }));
    const rendered = spawnSync(process.execPath, [planRenderer, manifestPath], { encoding: "utf8" });
    assert.equal(rendered.status, 0, rendered.stderr);
    const plan = JSON.parse(rendered.stdout);
    assert.equal(plan.candidate_count, 1);
    assert.equal(plan.candidates[0].auth_user_id, "77777777-7777-4777-8777-777777777777");
    assert.equal(plan.blocked_count, 2);
    assert.match(JSON.stringify(plan), /protected union|FK parent/);
    assert.equal(plan.security_artifacts.recent_sessions_do_not_protect_old_identity, true);
    assert.equal(plan.safety.no_email_or_name_fields_emitted, true);
    assert.doesNotMatch(rendered.stdout, /"(?:email|username)"\s*:/i);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
