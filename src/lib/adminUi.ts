import { ADMIN_NAV_ITEMS } from "./adminNav";
import { filterAdminNav, hasAdminRole } from "./adminRoles";
import { requireAdminContext } from "./adminAuth";
import type { AdminRole } from "./adminRoles";

export async function buildAdminUi(requiredRoles?: AdminRole[]) {
  const context = await requireAdminContext();
  const roles = context.roles;
  const navItems = filterAdminNav(ADMIN_NAV_ITEMS, roles);
  const meta = `Roles: ${roles.join(", ")}`;
  const hasAccess = requiredRoles ? hasAdminRole(roles, requiredRoles) : true;
  return { context, roles, navItems, meta, hasAccess };
}
