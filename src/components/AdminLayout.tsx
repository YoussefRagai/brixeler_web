"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { clsx } from "clsx";
import {
  Activity,
  Award,
  Bell,
  BellRing,
  Download,
  FileCheck2,
  Gift,
  History,
  Home,
  LayoutDashboard,
  Settings,
  Shield,
  Users2,
  ClipboardList,
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
  analytics: Bell,
  notifications: BellRing,
  exports: Download,
  settings: Settings,
  admins: Users2,
  adminActivities: ClipboardList,
  content: Home,
  support: Shield,
};

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
  const items = navItems ?? defaultNavItems;

  return (
    <div className="flex min-h-screen bg-[#f8f8f8] text-[#050505]">
      <aside className="hidden w-72 flex-col border-r border-black/5 bg-white px-6 py-10 shadow-xl shadow-black/5 lg:flex">
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

        <nav className="space-y-2">
          {items.map((item) => {
            const Icon = iconMap[item.icon] ?? LayoutDashboard;
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition",
                  isActive ? "bg-black text-white" : "text-neutral-500 hover:bg-black/5 hover:text-black",
                )}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="border-b border-black/5 bg-white px-6 py-5">
          <div className="mx-auto flex max-w-6xl items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-[#050505]">{title}</h1>
              {description && <p className="text-sm text-neutral-500">{description}</p>}
            </div>
            <div className="flex items-center gap-3">
              {actions}
              <button
                onClick={async () => {
                  try {
                    await fetch("/api/admin-logout", { method: "POST" });
                  } finally {
                    router.replace("/admin/login");
                  }
                }}
                className="rounded-full border border-black/10 px-4 py-2 text-sm text-neutral-600 hover:border-black/30 hover:text-black"
              >
                Logout
              </button>
            </div>
          </div>
        </header>
        <main className="flex-1 px-6 py-8">
          <div className="glassless mx-auto flex max-w-6xl flex-col gap-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
