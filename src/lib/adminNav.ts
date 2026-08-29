import type { AdminNavItem, AdminRole } from "./adminRoles";

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: "/", label: "Overview", icon: "layout", section: "Workspace", roles: ["super_admin", "deals_admin", "listing_admin", "developers_admin", "user_auth_admin", "user_support_admin", "marketing_admin"] },
  { href: "/agents", label: "Agents", icon: "users", section: "People", roles: ["super_admin", "user_auth_admin"] },
  { href: "/verification", label: "Verification", icon: "verification", section: "People", roles: ["super_admin", "user_auth_admin"] },
  { href: "/support", label: "Support", icon: "support", section: "People", roles: ["super_admin", "user_support_admin", "developers_admin"] },
  { href: "/deals", label: "Deals", icon: "deals", section: "Workspace", roles: ["super_admin", "deals_admin"] },
  { href: "/properties", label: "Properties", icon: "home", section: "Inventory", roles: ["super_admin", "listing_admin"] },
  { href: "/properties/renewals", label: "Renewals", icon: "renewals", section: "Inventory", roles: ["super_admin", "listing_admin"] },
  { href: "/developers", label: "Developers", icon: "home", section: "Inventory", roles: ["super_admin", "developers_admin"] },
  { href: "/gifts", label: "Gifts", icon: "gifts", section: "Growth", roles: ["super_admin", "marketing_admin"] },
  { href: "/growth/audiences", label: "Audiences", icon: "users", section: "Growth", roles: ["super_admin", "marketing_admin"] },
  { href: "/gifts/claims", label: "Gift Claims", icon: "gifts", section: "Growth", roles: ["super_admin", "marketing_admin"] },
  { href: "/rewards", label: "Tiers & Badges", icon: "rewards", section: "Growth", roles: ["super_admin", "marketing_admin"] },
  { href: "/analytics", label: "Analytics", icon: "analytics", section: "Growth", roles: ["super_admin"] },
  { href: "/notifications", label: "Notifications", icon: "notifications", section: "Growth", roles: ["super_admin", "marketing_admin"] },
  { href: "/content", label: "Content", icon: "content", section: "Growth", roles: ["super_admin", "marketing_admin"] },
  { href: "/exports", label: "Exports", icon: "exports", section: "System", roles: ["super_admin"] },
  { href: "/settings", label: "Settings", icon: "settings", section: "System", roles: ["super_admin"] },
  { href: "/admins", label: "Admins", icon: "admins", section: "System", roles: ["super_admin"] },
  { href: "/settings/admin-activities", label: "Admin activities", icon: "adminActivities", section: "System", roles: ["super_admin"] },
];

export function defaultAdminRoles(): AdminRole[] {
  const raw = process.env.ADMIN_DEFAULT_ROLES;
  if (!raw) return ["super_admin"];
  return raw
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean) as AdminRole[];
}
