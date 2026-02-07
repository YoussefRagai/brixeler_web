export type AdminRole =
  | "super_admin"
  | "user_auth_admin"
  | "user_support_admin"
  | "developers_admin"
  | "listing_admin"
  | "deals_admin"
  | "marketing_admin";

export type AdminNavIcon =
  | "layout"
  | "users"
  | "verification"
  | "deals"
  | "home"
  | "renewals"
  | "gifts"
  | "analytics"
  | "notifications"
  | "exports"
  | "settings"
  | "admins"
  | "adminActivities"
  | "content"
  | "support";

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super admin",
  user_auth_admin: "User auth admin",
  user_support_admin: "User support",
  developers_admin: "Developers admin",
  listing_admin: "Listing admin",
  deals_admin: "Deals admin",
  marketing_admin: "Marketing/Notifications/Gifts/Tiers/Badges admin",
};

export const ADMIN_ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  super_admin: "Full access. Can assign admins and view activity logs.",
  user_auth_admin: "Reviews user IDs and verification status.",
  user_support_admin: "Handles user support tickets and escalations.",
  developers_admin: "Manages developer accounts, projects, and activity.",
  listing_admin: "Reviews, approves, rejects, or edits listings.",
  deals_admin: "Oversees deal pipeline and sales claims.",
  marketing_admin: "Manages notifications, gifts, tiers, and badges content.",
};

export type AdminNavItem = {
  href: string;
  label: string;
  icon: AdminNavIcon;
  roles?: AdminRole[];
};

export function hasAdminRole(userRoles: AdminRole[], required?: AdminRole[]) {
  if (!required || required.length === 0) return true;
  if (userRoles.includes("super_admin")) return true;
  return required.some((role) => userRoles.includes(role));
}

export function filterAdminNav(items: AdminNavItem[], roles: AdminRole[]) {
  if (roles.includes("super_admin")) return items;
  return items.filter((item) => hasAdminRole(roles, item.roles));
}
