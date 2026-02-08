import type { AdminNavItem, AdminRole } from "./adminRoles";

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: "/", label: "Overview", icon: "layout", roles: ["super_admin", "deals_admin", "listing_admin", "developers_admin", "user_auth_admin", "user_support_admin", "marketing_admin"] },
  { href: "/agents", label: "Agents", icon: "users", roles: ["super_admin", "user_auth_admin"] },
  { href: "/verification", label: "Verification", icon: "verification", roles: ["super_admin", "user_auth_admin"] },
  { href: "/deals", label: "Deals", icon: "deals", roles: ["super_admin", "deals_admin"] },
  { href: "/properties", label: "Properties", icon: "home", roles: ["super_admin", "listing_admin"] },
  { href: "/properties/renewals", label: "Renewals", icon: "renewals", roles: ["super_admin", "listing_admin"] },
  { href: "/developers", label: "Developers", icon: "home", roles: ["super_admin", "developers_admin"] },
  { href: "/gifts", label: "Gifts", icon: "gifts", roles: ["super_admin", "marketing_admin"] },
  { href: "/gifts/claims", label: "Gift Claims", icon: "gifts", roles: ["super_admin", "marketing_admin"] },
  { href: "/rewards", label: "Tiers & Badges", icon: "rewards", roles: ["super_admin", "marketing_admin"] },
  { href: "/analytics", label: "Analytics", icon: "analytics", roles: ["super_admin"] },
  { href: "/notifications", label: "Notifications", icon: "notifications", roles: ["super_admin", "marketing_admin"] },
  { href: "/exports", label: "Exports", icon: "exports", roles: ["super_admin"] },
  { href: "/settings", label: "Settings", icon: "settings", roles: ["super_admin"] },
  { href: "/admins", label: "Admins", icon: "admins", roles: ["super_admin"] },
  { href: "/settings/admin-activities", label: "Admin activities", icon: "adminActivities", roles: ["super_admin"] },
  { href: "/content", label: "Content", icon: "content", roles: ["super_admin", "marketing_admin"] },
  { href: "/support", label: "Support", icon: "support", roles: ["super_admin", "user_support_admin"] },
];

export function defaultAdminRoles(): AdminRole[] {
  const raw = process.env.ADMIN_DEFAULT_ROLES;
  if (!raw) return ["super_admin"];
  return raw
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean) as AdminRole[];
}
