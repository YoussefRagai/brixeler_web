import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const renderer = join(repoRoot, "scripts/render-auth-identity-retirement-plan.mjs");

const policy = {
  security_artifacts: {
    review_only: true,
    delete_auth_users: false,
    revoke_sessions: false,
    revoke_refresh_tokens: false,
    recent_sessions_do_not_protect_old_identity: true,
    auth_admin_api_only: true,
    no_direct_auth_table_sql_delete: true,
    auth_sessions: { total: 4, recent_created: 1, linked_old_nonmobile_identity_rows: 2 },
    auth_refresh_tokens: { total: 8, recent_created: 3, linked_old_nonmobile_identity_rows: 5 },
  },
  account_fk_evidence_required: true,
  referential_stub_option: { not_implemented_by_this_workflow: true },
};

const baseRow = (overrides = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  developer_id: "22222222-2222-4222-8222-222222222222",
  auth_user_id: "33333333-3333-4333-8333-333333333333",
  demo_batch: "batch-a",
  created_at: "2026-11-01T00:00:00Z",
  window: "old",
  eligible_identity: true,
  has_mobile_profile: false,
  has_auth_phone: false,
  has_phone_identity: false,
  has_push_token: false,
  is_platform_admin: false,
  in_protected_union: false,
  other_account_count: 0,
  auth_identity_count: 1,
  auth_session_count: 1,
  auth_refresh_token_count: 1,
  recent_session_count: 0,
  recent_refresh_token_count: 0,
  developer_account_fk_counts: {},
  recent_account_fk_counts: {},
  auth_user_fk_counts: {
    "auth.sessions": 1,
    "auth.identities": 1,
    "public.developer_accounts": 1,
  },
  ...overrides,
});

test("renders a review-only identity plan with the owner guard and Auth cascade visible", () => {
  const work = mkdtempSync(join(tmpdir(), "brixeler-auth-plan-"));
  try {
    const manifestPath = join(work, "manifest.json");
    const outputPath = join(work, "plan.json");
    const manifest = {
      manifest_version: 1,
      cutoff: "2026-11-14T08:51:56.215083Z",
      protected_auth_ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      protected_union: {
        business_preview_base_count: 1,
        extended_count: 1,
        added_for_recent_auth_and_membership_retention: [],
        shared_auth_ids: 0,
      },
      developer_identity_rows: [
        baseRow(),
        baseRow({
          id: "44444444-4444-4444-8444-444444444444",
          auth_user_id: "55555555-5555-4555-8555-555555555555",
          is_last_active_super_admin: true,
        }),
        baseRow({
          id: "66666666-6666-4666-8666-666666666666",
          auth_user_id: "77777777-7777-4777-8777-777777777777",
          developer_account_fk_counts: { "developer_profile_revisions.submitted_by_account_id": 1 },
          recent_account_fk_counts: {},
        }),
      ],
      account_fk_rules: [{
        source_table: "developer_profile_revisions",
        source_column: "submitted_by_account_id",
        on_delete: "RESTRICT",
      }],
      auth_user_fk_rules: [{
        source_schema: "public",
        source_table: "developer_accounts",
        source_column: "auth_user_id",
        on_delete: "CASCADE",
      }],
      identity_policy: policy,
    };
    writeFileSync(manifestPath, JSON.stringify(manifest));
    chmodSync(manifestPath, 0o600);

    const rendered = spawnSync(process.execPath, [renderer, manifestPath, outputPath], { encoding: "utf8" });
    assert.equal(rendered.status, 0, rendered.stderr);
    const plan = JSON.parse(readFileSync(outputPath, "utf8"));
    assert.equal(plan.counts.old_identity_rows, 3);
    assert.equal(plan.counts.old_nonmobile_nonadmin_rows, 3);
    assert.equal(plan.counts.eligible_review_candidates, 1);
    assert.equal(plan.counts.execution_candidates, 1);
    assert.equal(plan.counts.owner_guard_blocked_rows, 1);
    assert.equal(plan.counts.dependency_blocked_rows, 1);
    assert.equal(plan.counts.hard_delete_blocked_rows, 0);
    assert.equal(plan.counts.auth_cascade_review_rows, 1);
    assert.equal(plan.protected_union.business_preview_base_count, 1);
    assert.equal(plan.protected_union.extended_count, 1);
    assert.equal(plan.protected_union.shared_auth_ids, 0);
    assert.equal(plan.candidate_count, 1);
    assert.equal(plan.blocked_count, 2);
    assert.match(JSON.stringify(plan.blocked), /last active developer super admin guard/);
    assert.match(JSON.stringify(plan.blocked), /restrictive delete rule/);
    assert.match(JSON.stringify(plan.candidates), /removes the linked developer membership row/);
    assert.equal(plan.execution_candidates.length, 1);
    assert.equal(plan.security_artifacts.no_direct_auth_table_sql_delete, true);
    assert.equal(plan.security_artifacts.sessions_require_invalidation_before_delete, true);
    assert.equal(plan.execution, "not executed");
    assert.doesNotMatch(readFileSync(outputPath, "utf8"), /"(?:email|full_name|name|username)"\s*:/i);
    assert.equal(statSync(outputPath).mode & 0o777, 0o600);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("refuses to treat an evidence-less live row as executable", () => {
  const work = mkdtempSync(join(tmpdir(), "brixeler-auth-plan-evidence-"));
  try {
    const manifestPath = join(work, "manifest.json");
    writeFileSync(manifestPath, JSON.stringify({
      manifest_version: 1,
      cutoff: "2026-11-14T08:51:56.215083Z",
      developer_identity_rows: [baseRow({ developer_account_fk_counts: undefined })],
      identity_policy: policy,
    }));
    const rendered = spawnSync(process.execPath, [renderer, manifestPath], { encoding: "utf8" });
    assert.equal(rendered.status, 0, rendered.stderr);
    const plan = JSON.parse(rendered.stdout);
    assert.equal(plan.candidate_count, 0);
    assert.equal(plan.blocked_count, 1);
    assert.match(JSON.stringify(plan.blocked), /missing developer-account FK evidence/);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
