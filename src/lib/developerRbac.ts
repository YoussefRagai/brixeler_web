/**
 * The developer portal has one closed role vocabulary.  Keep this module free
 * of database and Next.js imports so it can be used by server actions, route
 * handlers, and tests without accidentally becoming an authorization source
 * that trusts browser input.
 */
export const DEVELOPER_ROLES = [
  "developer_super_admin",
  "project_manager",
  "sales_manager",
] as const;

export type DeveloperRole = (typeof DEVELOPER_ROLES)[number];

export const DEVELOPER_CAPABILITIES = [
  "manage_company",
  "manage_team",
  "manage_projects",
  "manage_inventory",
  "view_contacts",
  "manage_contacts",
  "view_analytics",
  "manage_integrations",
] as const;

export type DeveloperCapability = (typeof DEVELOPER_CAPABILITIES)[number];

const ROLE_ALIASES: Record<string, DeveloperRole> = {
  developer_super_admin: "developer_super_admin",
  developer_admin: "developer_super_admin",
  super_admin: "developer_super_admin",
  admin: "developer_super_admin",
  owner: "developer_super_admin",
  project_manager: "project_manager",
  project_admin: "project_manager",
  manager: "project_manager",
  member: "project_manager",
  sales_manager: "sales_manager",
  sales: "sales_manager",
};

/**
 * Normalize values that may have been written by the pre-RBAC portal.  An
 * unknown value is deliberately rejected instead of being granted a default
 * privilege.  The SQL migration performs the durable normalization.
 */
export function normalizeDeveloperRole(value: unknown): DeveloperRole | null {
  if (typeof value !== "string") return null;
  return ROLE_ALIASES[value.trim().toLowerCase()] ?? null;
}

export function isDeveloperRole(value: unknown): value is DeveloperRole {
  return normalizeDeveloperRole(value) !== null && DEVELOPER_ROLES.includes(value as DeveloperRole);
}

/**
 * Capability matrix shared with the database migration. A super admin is the
 * only role with company and team authority. The historical
 * `manage_integrations` capability remains in this closed contract for
 * membership/database compatibility, but the optional integration product
 * surface is no longer exposed by the dashboard. Project managers own project
 * content and analytics; sales managers own inventory and the contacts inbox.
 */
const CAPABILITIES_BY_ROLE: Record<DeveloperRole, readonly DeveloperCapability[]> = {
  developer_super_admin: DEVELOPER_CAPABILITIES,
  project_manager: ["manage_projects", "manage_inventory", "view_analytics"],
  sales_manager: ["manage_inventory", "view_contacts", "manage_contacts"],
};

export function hasDeveloperCapability(
  role: DeveloperRole | string | null | undefined,
  capability: DeveloperCapability,
): boolean {
  const normalizedRole = normalizeDeveloperRole(role);
  return normalizedRole ? CAPABILITIES_BY_ROLE[normalizedRole].includes(capability) : false;
}

export function developerRoleCapabilities(role: DeveloperRole | string | null | undefined) {
  const normalizedRole = normalizeDeveloperRole(role);
  return normalizedRole ? [...CAPABILITIES_BY_ROLE[normalizedRole]] : [];
}
