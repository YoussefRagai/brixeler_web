import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("developer roles expose the exact requested capability split", async () => {
  const rbac = await read("src/lib/developerRbac.ts");
  assert.match(rbac, /developer_super_admin/);
  assert.match(rbac, /project_manager: \["manage_projects", "manage_inventory", "view_analytics"\]/);
  assert.match(rbac, /sales_manager: \["manage_inventory", "view_contacts", "manage_contacts"\]/);
  assert.doesNotMatch(rbac, /sales_manager: \[[^\]]*manage_projects/);
  assert.doesNotMatch(rbac, /project_manager: \[[^\]]*view_contacts/);
});

test("team membership is tenant bound and protects the final super admin", async () => {
  const migration = await read("supabase/migrations/20260830111500_developer_team_rbac.sql");
  assert.match(migration, /Cannot remove or demote the final active developer super admin/);
  assert.match(migration, /Developer membership tenant, identity, and demo fields are immutable/);
  assert.doesNotMatch(migration, /one_active_super_admin_idx/);
  assert.match(migration, /invite_developer_team_member\(uuid, uuid, text, text, text, text\)/);
});

test("sales operations use a closed lead lifecycle and service-only mutations", async () => {
  const migration = await read("supabase/migrations/20260830110000_developer_sales_operations.sql");
  for (const status of ["new", "contacted", "qualified", "viewing", "reservation", "won", "lost"]) {
    assert.match(migration, new RegExp(`'${status}'`));
  }
  assert.match(migration, /developer_sales_assert_access/);
  assert.match(migration, /revoke all on function public\.update_developer_contact_request_sales/);
  assert.match(migration, /grant execute on function public\.update_developer_contact_request_sales[^;]+to service_role/s);
  assert.match(migration, /secret_hash text not null/);
});

test("inventory operations are atomic, versioned, and publication gated", async () => {
  const migration = await read("supabase/migrations/20260830111000_developer_inventory_publication_workspace.sql");
  assert.match(migration, /publication_status in \('draft', 'ready', 'submitted', 'changes_requested', 'approved', 'published'\)/);
  assert.match(migration, /availability_state in \('available', 'held', 'reserved', 'contracted', 'sold', 'released'\)/);
  assert.match(migration, /developer_inventory_holds_one_active_idx/);
  assert.match(migration, /create or replace function public\.bulk_update_developer_inventory/);
  assert.match(migration, /create or replace function public\.restore_developer_inventory_version/);
  assert.match(migration, /create or replace function public\.clone_developer_project_from_template/);
});

test("contact PII is isolated from the project-manager project portal", async () => {
  const projectPage = await read("src/app/developer/projects/page.tsx");
  const contactsPage = await read("src/app/developer/contacts/page.tsx");
  assert.doesNotMatch(projectPage, /fetchDeveloperContactRequests/);
  assert.doesNotMatch(projectPage, /updateDeveloperContactRequestStatus/);
  assert.match(projectPage, /showRequests=\{false\}/);
  assert.match(contactsPage, /requireDeveloperCapability\("view_contacts"\)/);
});

test("developer navigation is capability aware", async () => {
  const layout = await read("src/components/DeveloperLayout.tsx");
  const brandRoute = await read("src/app/api/developer/brand/route.ts");
  assert.match(layout, /visibleNavItems/);
  assert.match(layout, /capability: "manage_team"/);
  assert.match(layout, /capability: "view_contacts"/);
  assert.match(layout, /capability: "manage_integrations"/);
  assert.match(brandRoute, /developerRoleCapabilities\(session\.role\)/);
});
