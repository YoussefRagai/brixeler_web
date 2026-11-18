import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const runner = join(repoRoot, "scripts/test-database-reliability.sh");
const suiteCount = readdirSync(join(repoRoot, "supabase/tests")).filter((file) => file.endsWith(".sql")).length;

function runRunner(databaseUrl, adminUrl = "") {
  const binDir = mkdtempSync(join(tmpdir(), "brixeler-db-runner-"));
  const logPath = join(binDir, "psql-urls.log");
  const fakePsql = join(binDir, "psql");
  writeFileSync(fakePsql, '#!/bin/sh\nprintf "%s\\n" "$1" >> "$BRIXELER_TEST_PSQL_LOG"\n');
  chmodSync(fakePsql, 0o755);
  const result = spawnSync("bash", [runner], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      BRIXELER_DATABASE_URL: databaseUrl,
      BRIXELER_DATABASE_ADMIN_URL: adminUrl,
      BRIXELER_TEST_PSQL_LOG: logPath,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
    },
  });
  const calls = existsSync(logPath) ? readFileSync(logPath, "utf8").trim().split(/\r?\n/).filter(Boolean) : [];
  rmSync(binDir, { recursive: true, force: true });
  return { ...result, calls };
}

test("database runner uses supabase_admin only for an explicit local URL", () => {
  const localUrl = "postgresql://postgres:postgres@127.0.0.1:55441/postgres?sslmode=disable";
  const result = runRunner(localUrl);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.length, suiteCount);
  assert.equal(result.calls.filter((url) => url.includes("supabase_admin")).length, 1);
  assert.equal(result.calls.at(-1), "postgresql://supabase_admin:postgres@127.0.0.1:55441/postgres?sslmode=disable");
});
test("database runner keeps remote URLs on the supplied role", () => {
  const remoteUrl = "postgresql://postgres:remote-secret@db.example.com:5432/postgres";
  const result = runRunner(remoteUrl);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, Array.from({ length: suiteCount }, () => remoteUrl));
});

test("database runner rejects an admin URL when the target is not local", () => {
  const result = runRunner(
    "postgresql://postgres:remote-secret@db.example.com:5432/postgres",
    "postgresql://supabase_admin:local-secret@127.0.0.1:55441/postgres",
  );

  assert.equal(result.status, 65);
  assert.match(result.stderr, /must be a supabase_admin loopback URL/);
  assert.deepEqual(result.calls, []);
});

test("database runner rejects a local override that is not supabase_admin", () => {
  const result = runRunner(
    "postgresql://postgres:postgres@127.0.0.1:55441/postgres?sslmode=disable",
    "postgresql://postgres:local-secret@127.0.0.1:55441/postgres",
  );
  assert.equal(result.status, 65);
  assert.match(result.stderr, /must be a supabase_admin loopback URL/);
  assert.deepEqual(result.calls, []);
});
