import { chmodSync, readFileSync, writeFileSync } from "node:fs";

const [, , manifestPath, outputPath] = process.argv;
if (!manifestPath) {
  console.error("usage: render-auth-identity-retirement-plan.mjs <manifest.json>");
  process.exit(64);
}

const root = JSON.parse(readFileSync(manifestPath, "utf8"));
const manifest = root.manifest ?? root;
const policy = manifest.identity_policy;
if (manifest.manifest_version !== 1 || !manifest.cutoff || !policy) {
  throw new Error("Manifest is missing the identity-retirement policy");
}
if (policy.security_artifacts?.recent_sessions_do_not_protect_old_identity !== true
  || policy.security_artifacts?.revoke_sessions !== false
  || policy.security_artifacts?.revoke_refresh_tokens !== false
  || policy.security_artifacts?.delete_auth_users !== false
  || policy.referential_stub_option?.not_implemented_by_this_workflow !== true) {
  throw new Error("Manifest does not carry the protected identity/security-artifact policy");
}

const protectedAuthIds = new Set(manifest.protected_auth_ids ?? []);
const blockersByAccount = new Map();
for (const blocker of manifest.dependency_blockers ?? []) {
  if (blocker.target_table !== "developer_accounts") continue;
  const key = blocker.target_id;
  const list = blockersByAccount.get(key) ?? [];
  list.push({
    source_table: blocker.source_table,
    source_column: blocker.source_column,
    source_count: blocker.source_count,
    recent_source_count: blocker.recent_source_count,
    on_delete: blocker.on_delete,
  });
  blockersByAccount.set(key, list);
}

const accountFkRules = new Map();
for (const rule of manifest.account_fk_rules ?? []) {
  const key = `${rule.source_table}.${rule.source_column}`;
  accountFkRules.set(key, {
    source_table: rule.source_table,
    source_column: rule.source_column,
    on_delete: rule.on_delete,
  });
}

const authFkRules = new Map();
for (const rule of manifest.auth_user_fk_rules ?? []) {
  const key = `${rule.source_schema ?? "public"}.${rule.source_table}.${rule.source_column}`;
  authFkRules.set(key, {
    source_schema: rule.source_schema ?? "public",
    source_table: rule.source_table,
    source_column: rule.source_column,
    on_delete: rule.on_delete,
  });
}

const countEntries = (value) => Object.entries(value ?? {})
  .map(([key, count]) => [key, Number(count)])
  .filter(([, count]) => Number.isFinite(count) && count > 0);

const hasIdentityProtectionSignal = (row) => Boolean(
  row.has_mobile_profile
  || row.has_auth_phone
  || row.has_phone_identity
  || row.has_push_token
  || row.is_platform_admin
  || row.in_protected_union,
);

const safeDependency = (entry, fallbackRule) => ({
  source_table: entry.source_table ?? fallbackRule?.source_table ?? "unknown",
  source_column: entry.source_column ?? fallbackRule?.source_column ?? null,
  source_count: Number(entry.source_count ?? 0),
  recent_source_count: Number(entry.recent_source_count ?? 0),
  on_delete: entry.on_delete ?? fallbackRule?.on_delete ?? "unknown",
});

const candidates = [];
const blocked = [];
const protectedRows = [];
const executionCandidates = [];
const ownerGuardBlocked = [];
const dependencyBlocked = [];
const hardDeleteBlocked = [];
const authCascadeReview = [];
for (const row of manifest.developer_identity_rows ?? []) {
  if (row.window !== "old") continue;
  const reasons = [];
  if (row.eligible_identity !== true) reasons.push("identity policy did not mark this row eligible");
  if (!row.auth_user_id) reasons.push("missing auth_user_id");
  if (protectedAuthIds.has(row.auth_user_id) || row.in_protected_union) reasons.push("Auth ID is in the protected union");
  if (hasIdentityProtectionSignal(row)) {
    reasons.push("mobile/phone/push/admin protection signal");
  }
  if (Number(row.other_account_count ?? 0) > 0) {
    reasons.push("Auth ID is linked to another developer account");
  }
  if (row.has_recent_membership_link || row.has_non_demo_membership_link) {
    reasons.push("recent or non-demo membership link");
  }
  if (row.has_recent_business_parent || countEntries(row.recent_account_fk_counts).length) {
    reasons.push("required as an FK parent of recent business rows");
  }
  if (row.is_last_active_super_admin || row.is_active_last_developer_super_admin) {
    reasons.push("last active developer super admin guard");
  }

  const dependencyBlockers = [
    ...(blockersByAccount.get(row.id) ?? []),
    ...countEntries(row.developer_account_fk_counts)
      .filter(([key]) => !(blockersByAccount.get(row.id) ?? []).some((entry) => `${entry.source_table}.${entry.source_column}` === key))
      .map(([key, sourceCount]) => safeDependency(
        { source_count: sourceCount, recent_source_count: row.recent_account_fk_counts?.[key] ?? 0 },
        accountFkRules.get(key),
      )),
  ];
  const uniqueDependencyBlockers = dependencyBlockers.filter((entry, index, all) => (
    all.findIndex((candidate) => candidate.source_table === entry.source_table
      && candidate.source_column === entry.source_column) === index
  ));
  const restrictiveDependencies = uniqueDependencyBlockers.filter((entry) => ["RESTRICT", "NO ACTION"].includes(entry.on_delete));
  if (uniqueDependencyBlockers.length) reasons.push("required as an FK parent of recent or unflagged rows");
  if (restrictiveDependencies.length) reasons.push("required as an FK parent with a restrictive delete rule");
  if (manifest.identity_policy?.account_fk_evidence_required === true && !row.developer_account_fk_counts) {
    reasons.push("missing developer-account FK evidence");
  }

  const record = {
    developer_account_id: row.id,
    developer_id: row.developer_id,
    auth_user_id: row.auth_user_id,
    expected: {
      is_demo: true,
      demo_batch: row.demo_batch,
      created_at: row.created_at,
      window: row.window,
    },
    auth_artifacts: {
      auth_identity_count: Number(row.auth_identity_count ?? 0),
      auth_session_count: Number(row.auth_session_count ?? 0),
      auth_refresh_token_count: Number(row.auth_refresh_token_count ?? 0),
      recent_session_count: Number(row.recent_session_count ?? 0),
      recent_refresh_token_count: Number(row.recent_refresh_token_count ?? 0),
      recent_sessions_do_not_protect_old_identity: true,
    },
    developer_account_fk_counts: Object.fromEntries(countEntries(row.developer_account_fk_counts)),
    recent_developer_account_fk_counts: Object.fromEntries(countEntries(row.recent_account_fk_counts)),
    auth_user_fk_counts: Object.fromEntries(countEntries(row.auth_user_fk_counts)),
    dependency_blockers: uniqueDependencyBlockers,
  };

  const protectedByIdentity = hasIdentityProtectionSignal(row)
    || row.has_recent_membership_link
    || row.has_non_demo_membership_link;
  if (protectedByIdentity) protectedRows.push(record);

  if (reasons.length) {
    const blockedRecord = {
      ...record,
      reasons,
      recommended_disposition: {
        access: "service-only public.revoke_developer_account with an active admin actor",
        identity: "retain the Auth user and developer_accounts referential stub",
        direct_auth_delete: "not allowed while restrictive/recent account dependencies remain",
        revoke_audit_event: "the supported revoke RPC adds one developer_account_events row, which remains part of the retained history",
      },
    };
    blocked.push(blockedRecord);
    if (row.is_last_active_super_admin || row.is_active_last_developer_super_admin) ownerGuardBlocked.push(blockedRecord);
    if (restrictiveDependencies.length || row.has_recent_business_parent || countEntries(row.recent_account_fk_counts).length) {
      dependencyBlocked.push(blockedRecord);
    }
    continue;
  }

  const accountCascade = uniqueDependencyBlockers.some((entry) => entry.on_delete === "CASCADE")
    || Object.entries(row.developer_account_fk_rules ?? {}).some(([, rule]) => rule?.on_delete === "CASCADE");
  const authMembershipCascade = row.auth_membership_delete_rule === "CASCADE"
    || [...authFkRules.values()].some((rule) => rule.source_table === "developer_accounts"
      && rule.source_column === "auth_user_id"
      && rule.on_delete === "CASCADE")
    || Object.entries(row.auth_user_fk_rules ?? {}).some(([key, rule]) => key.includes("developer_accounts") && rule?.on_delete === "CASCADE");
  const expectedCascadeEffects = [];
  const authReferenceCounts = row.auth_user_fk_counts ?? {};
  const authCascadeRules = [...authFkRules.values()].filter((rule) => rule.on_delete === "CASCADE");
  for (const [reference, sourceCount] of countEntries(authReferenceCounts)) {
    const matchingRule = authCascadeRules.find((rule) => (
      `${rule.source_schema}.${rule.source_table}` === reference
      || `${rule.source_schema}.${rule.source_table}.${rule.source_column}` === reference
    ));
    if (matchingRule) {
      expectedCascadeEffects.push({
        source_schema: matchingRule.source_schema,
        source_table: matchingRule.source_table,
        source_column: matchingRule.source_column,
        source_count: sourceCount,
        on_delete: matchingRule.on_delete,
        effect: matchingRule.source_table === "developer_accounts"
          ? "Auth Admin API deleteUser removes the linked developer membership row"
          : "Auth Admin API deleteUser removes the linked Auth child rows",
      });
    }
  }
  if (authMembershipCascade && !expectedCascadeEffects.some((effect) => effect.source_table === "developer_accounts")) {
    expectedCascadeEffects.push({
      source_schema: "public",
      source_table: "developer_accounts",
      source_column: "auth_user_id",
      source_count: 1,
      on_delete: "CASCADE",
      effect: "Auth Admin API deleteUser removes the linked developer membership row",
    });
  }
  if (expectedCascadeEffects.length) authCascadeReview.push({
    developer_account_id: row.id,
    auth_user_id: row.auth_user_id,
    effects: expectedCascadeEffects,
  });
  const hardDeleteBlockers = [];
  if (accountCascade) hardDeleteBlockers.push("deleting the Auth user cascades a developer-account dependency with no explicit evidence");
  if (hardDeleteBlockers.length) hardDeleteBlocked.push({ ...record, hard_delete_blockers: hardDeleteBlockers });

  const reviewRecord = {
    ...record,
    disposition: hardDeleteBlockers.length ? "owner_review_required" : "eligible_after_owner_review_and_revalidation",
    hard_delete_blockers: hardDeleteBlockers,
    expected_cascade_effects: expectedCascadeEffects,
    recommended_disposition: {
      access: "optional service-only public.revoke_developer_account audit step",
      identity: "supported Auth Admin API signOut/global, then deleteUser only after revalidation",
      direct_auth_delete: "never use direct auth-table SQL",
    },
    optional_revoke_event_effect: {
      source_table: "developer_account_events",
      source_column: "developer_account_id",
      source_count: 1,
      on_delete: "CASCADE",
      effect: "the supported revoke RPC adds one audit row; it is retained with a stub or cascades with the membership if Auth delete follows",
    },
  };
  candidates.push(reviewRecord);
  if (!hardDeleteBlockers.length) executionCandidates.push(reviewRecord);
}

const securityArtifacts = policy.security_artifacts ?? {};
const plan = {
  plan_version: 1,
  source_manifest_version: manifest.manifest_version,
  cutoff: manifest.cutoff,
  operation: "owner-reviewed membership disposition, session invalidation, then Supabase Auth Admin API deleteUser",
  execution: "not executed",
  owner_approval_required: true,
  hard_delete_decision: "pending owner review; this file does not call the API or mutate database/Auth state",
  candidate_count: candidates.length,
  candidates,
  execution_candidate_count: executionCandidates.length,
  execution_candidates: executionCandidates,
  blocked_count: blocked.length,
  blocked,
  protected_old_row_count: protectedRows.length,
  protected_old_rows: protectedRows,
  auth_cascade_review: authCascadeReview,
  counts: {
    old_identity_rows: (manifest.developer_identity_rows ?? []).filter((row) => row.window === "old").length,
    old_nonmobile_nonadmin_rows: (manifest.developer_identity_rows ?? []).filter((row) => row.window === "old" && !hasIdentityProtectionSignal(row)).length,
    eligible_review_candidates: candidates.length,
    execution_candidates: executionCandidates.length,
    blocked_rows: blocked.length,
    owner_guard_blocked_rows: ownerGuardBlocked.length,
    dependency_blocked_rows: dependencyBlocked.length,
    hard_delete_blocked_rows: hardDeleteBlocked.length,
    auth_cascade_review_rows: authCascadeReview.length,
  },
  protected_union: {
    business_preview_base_count: Number(manifest.protected_union?.business_preview_base_count ?? 0),
    extended_count: protectedAuthIds.size,
    added_for_recent_auth_and_membership_retention: manifest.protected_union?.added_for_recent_auth_and_membership_retention ?? [],
    shared_auth_ids: Number(manifest.protected_union?.shared_auth_ids ?? 0),
  },
  security_artifacts: {
    review_only: securityArtifacts.review_only ?? true,
    revoke_sessions: securityArtifacts.revoke_sessions ?? false,
    revoke_refresh_tokens: securityArtifacts.revoke_refresh_tokens ?? false,
    delete_auth_users: securityArtifacts.delete_auth_users ?? false,
    recent_sessions_do_not_protect_old_identity: true,
    auth_admin_api_only: true,
    no_direct_auth_table_sql_delete: true,
    sessions_require_invalidation_before_delete: true,
    refresh_tokens_require_invalidation_before_delete: true,
    auth_sessions: securityArtifacts.auth_sessions,
    auth_refresh_tokens: securityArtifacts.auth_refresh_tokens,
  },
  referential_stub_option: policy.referential_stub_option,
  safety: {
    no_email_or_name_fields_emitted: true,
    no_mobile_or_admin_auth_id_allowed: true,
    no_recent_identity_allowed: true,
    recent_sessions_do_not_protect_old_identity: true,
    auth_sessions_and_refresh_tokens_require_a_separate_owner_reviewed_step: true,
    direct_auth_table_sql_delete_forbidden: true,
    auth_admin_api_required_for_any_future_identity_delete: true,
    last_owner_guard_must_not_be_bypassed: true,
    recent_business_parents_require_stub_or_scrub_review: true,
    auth_membership_cascade_requires_explicit_owner_ack: true,
  },
  next_operation: {
    review: "Root must review this plan and the business cleanup manifest before any mutation.",
    retained_accounts: "For dependency-retained demo rows, use the existing service-only public.revoke_developer_account(account_id, active_admin_id, request_id, revoked_at, reason) boundary, then retain the developer_accounts/Auth stub so restrictive and recent FK parents remain addressable. Do not use a direct table UPDATE or delete the Auth row first.",
    eligible_candidate: "For a candidate with zero developer-account FK children, explicitly acknowledge the Auth cascade effects listed in auth_cascade_review before considering retirement; revocation can precede retirement for an audit event.",
    invalidate: "For an approved identity retirement or retained-stub revoke, invalidate sessions and refresh tokens through the supported Auth Admin API, then re-read protected unions and FK counts.",
    delete: "Only after revalidation and explicit owner approval may the supported Auth Admin API deleteUser operation be used for an execution candidate; no direct auth-table SQL DELETE is permitted.",
  },
};
const rendered = `${JSON.stringify(plan, null, 2)}\n`;
if (outputPath) {
  writeFileSync(outputPath, rendered, { mode: 0o600 });
  chmodSync(outputPath, 0o600);
  process.stdout.write(`plan=${outputPath}\n`);
} else {
  process.stdout.write(rendered);
}
