import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const expectedProjectRef = "zihysavpjeyurshpohqf";
const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const manifestPath = process.env.DEMO_CLEANUP_MANIFEST ?? resolve(repoRoot, ".local/demo-cleanup/manifest-20261114T085156Z.json");
const backupPath = process.env.DEMO_CLEANUP_BACKUP ?? resolve(repoRoot, ".local/demo-cleanup/exact-row-backup-20261114T085156Z.json");

function readEnvFile(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}

const env = { ...readEnvFile(resolve(repoRoot, ".env.local")), ...process.env };
const supabaseUrl = env.BRIXELER_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.BRIXELER_SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Supabase URL and service-role key are required");
const parsedUrl = new URL(supabaseUrl);
if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== expectedProjectRef + ".supabase.co") {
  throw new Error("Refusing backup: Supabase URL is not the authoritative Brixeler project");
}

const root = JSON.parse(readFileSync(manifestPath, "utf8"));
const manifest = root.manifest ?? root;
if (manifest.manifest_version !== 1 || !manifest.cutoff) throw new Error("Unsupported cleanup manifest");
if (manifest.execution_policy?.delete_auth_users !== false
  || manifest.execution_policy?.delete_storage_objects !== false
  || manifest.execution_policy?.delete_admins !== false
  || manifest.execution_policy?.delete_users_profile !== false) {
  throw new Error("Manifest protection policy is incomplete");
}
if (manifest.business_eligibility_policy?.created_at_before_cutoff_required !== true
  || manifest.business_eligibility_policy?.updated_at_before_cutoff_required_when_present !== true
  || manifest.business_eligibility_policy?.missing_updated_at_action !== "protect"
  || manifest.business_eligibility_policy?.recent_created_action !== "protect"
  || manifest.business_eligibility_policy?.recent_edit_action !== "protect") {
  throw new Error("Manifest does not carry the conservative business retention policy");
}
const authManifestPath = process.env.DEMO_CLEANUP_AUTH_MANIFEST
  ?? resolve(repoRoot, ".local/auth-identity-retirement-20261121/manifest.json");
const authRoot = JSON.parse(readFileSync(authManifestPath, "utf8"));
const authManifest = authRoot.manifest ?? authRoot;
if (authManifest.manifest_version !== 1
  || authManifest.project_ref !== expectedProjectRef
  || !authManifest.cutoff
  || new Date(authManifest.cutoff).getTime() !== new Date(manifest.cutoff).getTime()
  || !Array.isArray(authManifest.protected_auth_ids)
  || authManifest.protected_auth_ids.length < (manifest.protected_auth_ids ?? []).length
  || !(manifest.protected_auth_ids ?? []).every((id) => authManifest.protected_auth_ids.includes(id))) {
  throw new Error("Auth protected-union manifest is missing, stale, or incompatible");
}

const rowsToBackUp = [...new Map((manifest.business_rows ?? [])
  .map((row) => [row.table_name + ":" + row.id, row])).values()];
const allowedEligibility = new Set(["eligible", "recent_created", "recent_edit", "unknown_recent_edit"]);
if (!Array.isArray(manifest.business_rows) || rowsToBackUp.length !== manifest.business_rows.length) {
  throw new Error("Manifest business rows are missing or duplicated");
}
for (const row of rowsToBackUp) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(row.table_name) || !/^[0-9a-f-]{36}$/i.test(row.id)) {
    throw new Error("Invalid manifest row " + row.table_name + ":" + row.id);
  }
  if (!allowedEligibility.has(row.eligibility) || !/^[0-9a-f]{32}$/i.test(String(row.fingerprint ?? ""))) {
    throw new Error("Manifest row lacks explicit eligibility or full-row fingerprint: " + row.table_name + ":" + row.id);
  }
}

const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const backupTables = new Map();
for (const row of rowsToBackUp) {
  const list = backupTables.get(row.table_name) ?? [];
  list.push(row);
  backupTables.set(row.table_name, list);
}
const tables = {};
async function readExactRows(table, ids) {
  const { data, error } = await client.from(table).select("*").in("id", ids);
  if (error) throw new Error("Backup read failed for " + table + ": " + error.message);
  const actual = data ?? [];
  const actualIds = new Set(actual.map((row) => String(row.id)));
  if (actualIds.size !== ids.length || ids.some((id) => !actualIds.has(id))) {
    throw new Error("Backup readback mismatch for " + table + ": expected " + ids.length + ", got " + actualIds.size);
  }
  return actual.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}
for (const [table, expectedRows] of [...backupTables.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const ids = [...new Set(expectedRows.map((row) => row.id))];
  tables[table] = {
    expected_count: ids.length,
    rows: await readExactRows(table, ids),
    manifest_rows: expectedRows
      .map(({ table_name, id, eligibility, window, created_at, updated_at, demo_batch, ownership, fingerprint }) => ({
        table_name, id, eligibility, window, created_at, updated_at, demo_batch, ownership, fingerprint,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}
for (const [table, ids] of [
  ["admins", (manifest.protected_admins ?? []).map((row) => row.id)],
  ["users_profile", (manifest.mobile_profiles ?? []).map((row) => row.id)],
]) {
  tables[table] = { expected_count: ids.length, rows: await readExactRows(table, ids) };
}

const backup = {
  backup_version: 1,
  project_ref: expectedProjectRef,
  source_manifest_md5: createHash("md5").update(readFileSync(manifestPath)).digest("hex"),
  cutoff: manifest.cutoff,
  generated_at: new Date().toISOString(),
  execution: "not executed",
  protected_auth_ids: authManifest.protected_auth_ids,
  business_preview_protected_auth_ids: manifest.protected_auth_ids ?? [],
  auth_manifest_md5: createHash("md5").update(readFileSync(authManifestPath)).digest("hex"),
  protected_admin_ids: (manifest.protected_admins ?? []).map((row) => row.id),
  protected_mobile_profile_ids: (manifest.mobile_profiles ?? []).map((row) => row.id),
  tables,
};
const rendered = JSON.stringify(backup, null, 2) + "\n";
mkdirSync(dirname(backupPath), { recursive: true, mode: 0o700 });
writeFileSync(backupPath, rendered, { mode: 0o600 });
chmodSync(backupPath, 0o600);
process.stdout.write(JSON.stringify({
  backup: backupPath,
  source_manifest_md5: backup.source_manifest_md5,
  table_count: Object.keys(tables).length,
  row_count: Object.values(tables).reduce((sum, table) => sum + table.rows.length, 0),
}));
