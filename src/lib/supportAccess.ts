import type { AdminRole } from "./adminRoles";

/** Categories that belong to the developer operations inbox. */
export const DEVELOPER_SUPPORT_CATEGORIES = [
  "technical",
  "property",
  "property_request",
] as const;

export const SUPPORT_CATEGORIES = [
  "verification",
  "deal",
  "payout",
  "technical",
  "property",
  "property_request",
  "other",
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export function supportCategoryScope(roles: AdminRole[]): readonly string[] | null {
  if (roles.includes("super_admin") || roles.includes("user_support_admin")) return null;
  if (roles.includes("developers_admin")) return DEVELOPER_SUPPORT_CATEGORIES;
  return [];
}

export function canAccessSupportCategory(roles: AdminRole[], category: string | null | undefined) {
  const scope = supportCategoryScope(roles);
  return scope === null ? true : Boolean(category && scope.includes(category));
}

export function macroCategoriesForRoles(roles: AdminRole[]): readonly string[] {
  const scope = supportCategoryScope(roles);
  return scope === null ? SUPPORT_CATEGORIES : scope;
}
