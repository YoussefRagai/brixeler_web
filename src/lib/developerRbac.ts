/**
 * The developer portal currently has one company-wide role. Keep the role
 * column and capability contract explicit so deferred role tiers can be added
 * in a later migration without making browser input an authorization source.
 */
export const DEVELOPER_ROLES = [
  "developer_super_admin",
] as const;

export type CanonicalDeveloperRole = (typeof DEVELOPER_ROLES)[number];
/** Legacy values remain only for stale cookies and compatibility consumers. */
export type LegacyDeveloperRole =
  | "developer_admin"
  | "super_admin"
  | "admin"
  | "owner"
  | "project_manager"
  | "project_admin"
  | "manager"
  | "member"
  | "sales_manager"
  | "sales";
export type DeveloperRole = CanonicalDeveloperRole | LegacyDeveloperRole;
export const DEVELOPER_SUPER_ADMIN_ROLE: CanonicalDeveloperRole = "developer_super_admin";

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

const ROLE_ALIASES: Record<string, CanonicalDeveloperRole> = {
  developer_super_admin: "developer_super_admin",
  developer_admin: "developer_super_admin",
  super_admin: "developer_super_admin",
  admin: "developer_super_admin",
  owner: "developer_super_admin",
  // Legacy company-member roles all receive the current company-wide access
  // while role tiers are deferred. Unknown values remain rejected.
  project_manager: "developer_super_admin",
  project_admin: "developer_super_admin",
  manager: "developer_super_admin",
  member: "developer_super_admin",
  sales_manager: "developer_super_admin",
  sales: "developer_super_admin",
};

/**
 * Normalize values that may have been written by the pre-single-role portal.
 * Known legacy role values are promoted to the canonical company role. An
 * unknown value is deliberately rejected instead of being granted access.
 * The additive SQL migration performs the durable normalization.
 */
export function normalizeDeveloperRole(value: unknown): CanonicalDeveloperRole | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ROLE_ALIASES, normalized)
    ? ROLE_ALIASES[normalized]
    : null;
}

export function isDeveloperRole(value: unknown): value is CanonicalDeveloperRole {
  return value === DEVELOPER_SUPER_ADMIN_ROLE;
}

/**
 * Capability matrix shared with the database migration. All current developer
 * members have company-wide access. The historical `manage_integrations`
 * capability remains in this closed contract for membership/database
 * compatibility, but the optional integration product surface is no longer
 * exposed by the dashboard. Future role tiers can narrow this map additively.
 */
const CAPABILITIES_BY_ROLE: Record<CanonicalDeveloperRole, readonly DeveloperCapability[]> = {
  developer_super_admin: DEVELOPER_CAPABILITIES,
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
