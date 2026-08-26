import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseMobileActionUrl, MOBILE_ACTIONS } from "../src/lib/mobileActions.ts";

test("notification actions are a closed mobile route allowlist", () => {
  assert.deepEqual(MOBILE_ACTIONS.map((item) => item.value), ["/", "/properties", "/deals", "/gifts", "/profile", "/support"]);
  assert.equal(parseMobileActionUrl("/support"), "/support");
  assert.equal(parseMobileActionUrl("/support?redirect=https://evil.example"), "/");
});

test("cross-surface migration preserves suspension, moderation, and support boundaries", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260826164946_dashboard_cross_surface_completion.sql", import.meta.url), "utf8");
  for (const contract of [
    "current_account_not_suspended",
    "reply_to_support_ticket",
    "developer_projects_approval_status_check",
    "developer_notifications",
    "authenticated_accounts_not_suspended",
  ]) assert.match(sql, new RegExp(contract));
});

test("Expo batches require receipts before delivered state", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260826164950_expo_push_receipt_tracking.sql", import.meta.url), "utf8");
  assert.match(sql, /queue_due_push_receipts/);
  assert.match(sql, /receipt_response_status/);
  assert.match(sql, /jsonb_object_length\(expo_ticket_map\) then 'delivered'/);
});

test("release guards close moderation, support, and mixed-receipt bypasses", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260826165644_cross_surface_release_guards.sql", import.meta.url), "utf8");
  assert.match(sql, /revoke insert, update, delete on public\.developer_projects from authenticated/);
  assert.match(sql, /project\.approval_status = 'approved'/);
  assert.match(sql, /ticket\.status <> 'closed'/);
  assert.match(sql, /p_property_id, '\/properties'/);
  assert.match(sql, /new\.ticket_error_count > 0/);
  assert.match(sql, /retry scheduled/);
});

test("receipt object counting is available on the production Postgres version", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260826165752_jsonb_object_length_compat.sql", import.meta.url), "utf8");
  assert.match(sql, /from jsonb_object_keys\(p_value\)/);
});

test("truncated Expo ticket responses cannot become delivered", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260826170118_push_ticket_cardinality_guard.sql", import.meta.url), "utf8");
  assert.match(sql, /new\.token_count - expected_receipts - new\.ticket_error_count/);
  assert.match(sql, /new\.ticket_error_count := new\.ticket_error_count \+ missing_tickets/);
});
