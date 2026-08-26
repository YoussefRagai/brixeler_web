"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { clsx } from "clsx";
import {
  Activity,
  Award,
  BarChart3,
  BellRing,
  Building2,
  CircleHelp,
  Download,
  FileCheck2,
  Gift,
  History,
  Home,
  LayoutDashboard,
  Menu,
  Settings,
  Users2,
  ClipboardList,
  X,
} from "lucide-react";
import type { AdminNavItem } from "@/lib/adminRoles";

const defaultNavItems: AdminNavItem[] = [
  { href: "/", label: "Overview", icon: "layout" },
  { href: "/agents", label: "Agents", icon: "users" },
  { href: "/verification", label: "Verification", icon: "verification" },
  { href: "/deals", label: "Deals", icon: "deals" },
  { href: "/properties", label: "Properties", icon: "home" },
  { href: "/properties/renewals", label: "Renewals", icon: "renewals" },
  { href: "/developers", label: "Developers", icon: "home" },
  { href: "/gifts", label: "Gifts", icon: "gifts" },
  { href: "/rewards", label: "Tiers & Badges", icon: "rewards" },
  { href: "/analytics", label: "Analytics", icon: "analytics" },
  { href: "/notifications", label: "Notifications", icon: "notifications" },
  { href: "/exports", label: "Exports", icon: "exports" },
  { href: "/settings", label: "Settings", icon: "settings" },
  { href: "/settings/admins", label: "Admin roles", icon: "admins" },
  { href: "/content", label: "Content", icon: "content" },
  { href: "/support", label: "Support", icon: "support" },
];

const iconMap = {
  layout: LayoutDashboard,
  users: Users2,
  verification: FileCheck2,
  deals: Activity,
  home: Home,
  renewals: History,
  gifts: Gift,
  rewards: Award,
  analytics: BarChart3,
  notifications: BellRing,
  exports: Download,
  settings: Settings,
  admins: Users2,
  adminActivities: ClipboardList,
  content: Building2,
  support: CircleHelp,
};

const sectionOrder: Array<NonNullable<AdminNavItem["section"]>> = [
  "Workspace",
  "People",
  "Inventory",
  "Growth",
  "System",
];

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  navItems?: AdminNavItem[];
  meta?: ReactNode;
}

export function AdminLayout({ title, description, actions, children, navItems, meta }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const items = navItems ?? defaultNavItems;
  const groupedItems = sectionOrder
    .map((section) => ({ section, items: items.filter((item) => (item.section ?? "Workspace") === section) }))
    .filter((group) => group.items.length > 0);
  const activeHref = items
    .filter((item) => pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`)))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;

  const renderNav = (mobile = false) => (
    <nav aria-label={mobile ? "Admin mobile navigation" : "Admin navigation"} className={mobile ? "grid gap-5 sm:grid-cols-2" : "space-y-5"}>
      {groupedItems.map((group) => (
        <div key={`${mobile ? "mobile-" : ""}${group.section}`} className="space-y-1">
          <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-neutral-400">
            {group.section}
          </p>
          <div className="space-y-1">
            {group.items.map((item) => {
              const Icon = iconMap[item.icon] ?? LayoutDashboard;
              const isActive = item.href === activeHref;
              return (
                <Link
                  key={`${mobile ? "mobile-" : ""}${item.href}`}
                  href={item.href}
                  onClick={mobile ? () => setMobileMenuOpen(false) : undefined}
                  aria-current={isActive ? "page" : undefined}
                  className={clsx(
                    "flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                    isActive ? "bg-black text-white shadow-sm" : "text-neutral-600 hover:bg-black/5 hover:text-black",
                  )}
                >
                  <Icon aria-hidden="true" size={16} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen min-w-0 bg-[#f8f8f8] text-[#050505]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-black focus:px-4 focus:py-2 focus:text-sm focus:text-white">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col overflow-y-auto border-r border-black/5 bg-white px-6 py-10 shadow-xl shadow-black/5 lg:flex xl:w-80">
        <div className="mb-8 space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Brixeler</p>
          <p className="text-lg font-semibold text-[#050505]">Command Center</p>
          <p className="text-xs text-neutral-400">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </p>
          {meta ? <div className="pt-3 text-xs text-neutral-400">{meta}</div> : null}
        </div>
        {renderNav()}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-black/5 bg-white px-4 py-5 sm:px-6">
          <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="dashboard-heading text-2xl font-semibold text-[#050505] sm:text-3xl">{title}</h1>
              {description && <p className="text-sm text-neutral-500">{description}</p>}
            </div>
            <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen((current) => !current)}
                aria-expanded={mobileMenuOpen}
                aria-controls="admin-mobile-nav"
                className="rounded-full border border-black/10 p-2.5 text-neutral-700 transition-colors hover:border-black/30 hover:text-black lg:hidden"
                aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              >
                {mobileMenuOpen ? <X aria-hidden="true" size={18} /> : <Menu aria-hidden="true" size={18} />}
              </button>
              {actions}
              <button
                onClick={async () => {
                  try {
                    await fetch("/api/admin-logout", { method: "POST" });
                  } finally {
                    router.replace("/admin/login");
                  }
                }}
                className="rounded-full border border-black/10 px-4 py-2 text-sm text-neutral-600 transition-colors hover:border-black/30 hover:text-black"
              >
                Logout
              </button>
            </div>
          </div>
          {mobileMenuOpen ? (
            <div
              id="admin-mobile-nav"
              className="mx-auto mt-5 max-w-[1600px] rounded-2xl border border-black/10 bg-neutral-50 p-3 shadow-lg shadow-black/5 lg:hidden"
            >
              {renderNav(true)}
            </div>
          ) : null}
        </header>
        <main id="main-content" className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="glassless mx-auto flex w-full max-w-[1600px] min-w-0 flex-col gap-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
