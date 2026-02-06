"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { clsx } from "clsx";
import {
  Activity,
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
} from "lucide-react";

const navItems = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: Users2 },
  { href: "/verification", label: "Verification", icon: FileCheck2 },
  { href: "/deals", label: "Deals", icon: Activity },
  { href: "/properties", label: "Properties", icon: Home },
  { href: "/properties/renewals", label: "Renewals", icon: History },
  { href: "/developers", label: "Developers", icon: Home },
  { href: "/gifts", label: "Gifts", icon: Gift },
  { href: "/analytics", label: "Analytics", icon: Bell },
  { href: "/notifications", label: "Notifications", icon: BellRing },
  { href: "/exports", label: "Exports", icon: Download },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/settings/admins", label: "Admin roles", icon: Users2 },
  { href: "/content", label: "Content", icon: Home },
  { href: "/support", label: "Support", icon: Shield },
];

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function AdminLayout({ title, description, actions, children }: Props) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-[#f8f8f8] text-[#050505]">
      <aside className="hidden w-72 flex-col border-r border-black/5 bg-white px-6 py-10 shadow-xl shadow-black/5 lg:flex">
        <div className="mb-8 space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">
            Brixeler
          </p>
          <p className="text-lg font-semibold text-[#050505]">Command Center</p>
          <p className="text-xs text-neutral-400">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>

        <nav className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition",
                  isActive
                    ? "bg-black text-white"
                    : "text-neutral-500 hover:bg-black/5 hover:text-black",
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
              {description && (
                <p className="text-sm text-neutral-500">{description}</p>
              )}
            </div>
            {actions}
          </div>
        </header>
        <main className="flex-1 px-6 py-8">
          <div className="glassless mx-auto flex max-w-6xl flex-col gap-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
