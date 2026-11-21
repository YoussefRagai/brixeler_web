import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const migration = read("supabase/migrations/20260830111500_developer_team_rbac.sql");
const reliabilityMigration = read("supabase/migrations/20260830090000_developer_invitation_reliability.sql");
const auth = read("src/lib/developerAuth.ts");
const session = read("src/lib/developerSession.ts");
const clientLayout = read("src/components/DeveloperLayoutClient.tsx");
const profile = read("src/app/developer/profile/page.tsx");
const teamQuery = read("src/lib/developerTeam.ts");

test("developer RBAC is a closed, tenant-bound capability contract", () => {
  const rbac = read("src/lib/developerRbac.ts");
  for (const role of ["developer_super_admin", "project_manager", "sales_manager"]) {
    assert.match(rbac, new RegExp(`['\"]${role}['\"]`));
    assert.match(migration, new RegExp(`['\"]${role}['\"]`));
  }
  for (const capability of ["manage_company", "manage_team", "manage_projects", "manage_inventory", "view_contacts", "manage_contacts", "view_analytics", "manage_integrations"]) {
    assert.match(rbac, new RegExp(capability));
    assert.match(migration, new RegExp(capability));
  }
  assert.match(auth, /requireDeveloperCapability/);
  assert.match(auth, /hasDeveloperCapability/);
  assert.match(auth, /eq\("developer_id", session\.developerId\)/);
  assert.match(auth, /eq\("auth_user_id", session\.userId\)/);
  assert.match(auth, /normalizeDeveloperRole\(membership\.role\)/);
  assert.match(session, /role\?: DeveloperRole/);
  assert.match(clientLayout, /href: "\/developer\/team"/);
  assert.match(profile, /requireDeveloperCapability\("manage_company"/);
});

test("database migration normalizes legacy memberships and protects the final super admin", () => {
  assert.match(migration, /alter column role type text/);
  assert.match(migration, /'developer_admin', 'super_admin', 'admin', 'owner'/);
  assert.match(migration, /'manager', 'member'/);
  assert.doesNotMatch(migration, /developer_accounts_one_active_super_admin_idx/);
  assert.match(migration, /developer_accounts_role_check/);
  assert.match(migration, /developer_accounts_tenant_and_super_admin_guard/);
  assert.match(migration, /Cannot remove or demote the final active developer super admin/);
  assert.match(migration, /developer_accounts_first_super_admin/);
  assert.match(migration, /new\.role := 'developer_super_admin'/);
  assert.match(migration, /new\.developer_id is distinct from old\.developer_id/);
  assert.match(migration, /new\.auth_user_id is distinct from old\.auth_user_id/);
  assert.match(migration, /before update or delete on public\.developer_accounts/);
});

test("team lifecycle has explicit server routes, service-only RPCs, and no browser tenant selector", () => {
  const routeFiles = [
    "src/app/api/developer/team/route.ts",
    "src/app/api/developer/team/invite/route.ts",
    "src/app/api/developer/team/resend/route.ts",
    "src/app/api/developer/team/role/route.ts",
    "src/app/api/developer/team/revoke/route.ts",
  ];
  for (const path of routeFiles) {
    assert.equal(existsSync(new URL(path, root)), true, `missing ${path}`);
    const source = read(path);
    assert.match(source, /requireDeveloperCapability\("manage_team"\)/);
    assert.match(source, /session\.developerId/);
  }
  const invite = read("src/app/api/developer/team/invite/route.ts");
  assert.match(invite, /invite_developer_team_member/);
  assert.match(invite, /p_actor_account_id: session\.accountId/);
  assert.doesNotMatch(invite, /body\.developerId/);
  for (const fn of ["invite_developer_team_member", "resend_developer_team_invite", "update_developer_team_member_role", "revoke_developer_team_member"]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${fn}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}`));
  }
  assert.match(migration, /revoke all on function public\.invite_developer_team_member[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /p_developer_id is intentionally absent/);
  assert.match(migration, /target_account\.developer_id <> actor_account\.developer_id/);
});

test("team lifecycle preserves admin invite compatibility and makes explicit roles available", () => {
  assert.match(migration, /historical 11-argument invitation RPC remains untouched/);
  assert.match(migration, /create or replace function public\.create_developer_account_invite\([\s\S]*p_role text/);
  assert.match(migration, /first member of a new developer company must be developer_super_admin/);
  const invites = read("src/lib/developerAccountInvites.ts");
  assert.match(invites, /developerRole\?: DeveloperRole/);
  assert.match(invites, /developer_role: params\.developerRole/);
});

test("team listing falls back to the linked Auth identity when account profile fields are empty", () => {
  assert.match(teamQuery, /auth_user_id, email, full_name/);
  assert.match(teamQuery, /auth\.admin\.getUserById\(row\.auth_user_id\)/);
  assert.match(teamQuery, /normalizeDeveloperEmail\(userData\?\.user\?\.email\)/);
  assert.match(teamQuery, /metadata\.full_name/);
  assert.match(teamQuery, /metadata\.name/);
  assert.match(teamQuery, /metadata\.display_name/);
  assert.match(teamQuery, /Account profile fields can be empty/);
});

test("revoke boundaries invalidate stale sessions and keep admin actions tenant-scoped", () => {
  const adminRevoke = read("src/app/api/admin/developers/revoke/route.ts");
  const developerRevoke = read("src/app/api/developer/team/revoke/route.ts");
  const developerAuth = read("src/lib/developerAuth.ts");
  const adminTable = read("src/components/AdminDevelopersTable.tsx");
  assert.match(adminRevoke, /isUuid\(accountId\)/);
  assert.match(adminRevoke, /developerAdminScope\(admin\.roles, admin\.developerIds\)/);
  assert.match(adminRevoke, /canAccessScopedDeveloper\(allowedDeveloperIds, devAccount\.developer_id\)/);
  assert.match(adminRevoke, /revoke_developer_account/);
  assert.doesNotMatch(adminRevoke, /auth\.admin\.deleteUser/);
  assert.match(adminRevoke, /sessionInvalidated: true/);
  assert.match(developerRevoke, /eq\("developer_id", session\.developerId\)/);
  assert.match(developerRevoke, /p_actor_account_id: session\.accountId/);
  assert.match(developerRevoke, /sessionInvalidated: true/);
  assert.match(migration, /target_account\.status = 'revoked'[\s\S]*'idempotent', true/);
  assert.match(migration, /target_account\.id = actor_account\.id/);
  assert.match(migration, /Cannot remove the final active developer super admin/);
  assert.match(reliabilityMigration, /set status = 'revoked'/);
  assert.match(reliabilityMigration, /if account_row\.status <> 'pending'/);
  assert.match(developerAuth, /findDeveloperAccountByUser\(session\.userId\)/);
  assert.match(developerAuth, /account\.status !== "active"/);
  assert.match(adminTable, /\/api\/admin\/developers\/revoke/);
  assert.match(adminTable, /developerRoleLabel\(member\.role\)/);
});
