import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20261111141109_agent_lifetime_resume.sql', import.meta.url), 'utf8');

test('shared resume strips client and document fields and verifies only paid non-demo claims', () => {
  const publicRpc = migration.split('create or replace function public.get_shared_agent_resume(p_token uuid)')[1].split('revoke all on function')[0];
  assert.doesNotMatch(publicRpc, /'clientName'|'documentPath'/);
  assert.match(publicRpc, /share\.token = p_token/);
  assert.match(publicRpc, /claim\.status = 'Paid'/);
  assert.match(publicRpc, /coalesce\(claim\.is_demo, false\) = false/);
  assert.match(migration, /agent_resume_external_owner_select/);
  assert.match(migration, /agent_resume_docs_owner_select/);
});
