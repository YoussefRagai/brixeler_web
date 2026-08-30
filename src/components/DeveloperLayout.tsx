"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Menu, X } from "lucide-react";
import type { DeveloperImpersonationMarker } from "@/lib/developerImpersonation";
import type { DeveloperPortalBrand } from "@/lib/developerPortalBrand";
import type { DeveloperCapability } from "@/lib/developerRbac";

const navItems = [
  { href: "/developer", label: "Overview" },
  { href: "/developer/listings", label: "Inventory", capability: "manage_inventory" },
  { href: "/developer/contacts", label: "Contacts", capability: "view_contacts" },
  { href: "/developer/activity", label: "Sales activity", capability: "view_contacts" },
  { href: "/developer/profile", label: "Profile" },
  { href: "/developer/team", label: "Team", capability: "manage_team" },
  { href: "/developer/integrations", label: "Integrations", capability: "manage_integrations" },
  { href: "/developer/support", label: "Support" },
] satisfies Array<{ href: string; label: string; capability?: DeveloperCapability }>;

type DeveloperSidebarProject = {
  id: string;
  name: string;
  launchStatus?: string | null;
};

type ProjectStatusKey = "new_release" | "upcoming" | "live";

const projectStatusSections: Array<{ key: ProjectStatusKey; label: string }> = [
  { key: "new_release", label: "New Release" },
  { key: "upcoming", label: "Upcoming" },
  { key: "live", label: "Live" },
];

const fallbackBrand: DeveloperPortalBrand = {
  name: "Brixeler Partners",
  logoUrl: null,
  tagline: "Your portfolio command center",
  pendingReview: false,
  role: null,
  capabilities: [],
};

const normalizeLaunchStatus = (value?: string | null): ProjectStatusKey => {
  if (value === "new_release" || value === "new_launch") return "new_release";
  if (value === "upcoming") return "upcoming";
  return "live";
};

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  impersonation?: DeveloperImpersonationMarker | null;
  onboarding?: boolean;
}

export function DeveloperLayout({ title, description, actions, children, impersonation, onboarding = false }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<DeveloperSidebarProject[]>([]);
  const [brand, setBrand] = useState<DeveloperPortalBrand | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const activeProjectId = searchParams.get("project");
  const activeStatusParam = searchParams.get("status");
  const activeStatus = activeStatusParam ? normalizeLaunchStatus(activeStatusParam) : null;

  useEffect(() => {
    if (onboarding) {
      return;
    }
    let active = true;
    fetch("/api/developer/projects")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!active) return;
        setProjects(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!active) return;
        setProjects([]);
      });
    return () => {
      active = false;
    };
  }, [onboarding]);

  useEffect(() => {
    let active = true;
    fetch("/api/developer/brand")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data || typeof data.name !== "string") return;
        setBrand(data as DeveloperPortalBrand);
      })
      .catch(() => {
        if (active) setBrand(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const groupedProjects = projectStatusSections.map((section) => ({
    ...section,
    projects: projects.filter((project) => normalizeLaunchStatus(project.launchStatus) === section.key),
  }));
  const displayBrand = brand ?? fallbackBrand;
  const visibleNavItems = onboarding
    ? navItems.filter((item) => item.href === "/developer/profile")
    : navItems.filter((item) => !item.capability || displayBrand.capabilities?.includes(item.capability));
  const canUseProjects = Boolean(
    displayBrand.capabilities?.includes("manage_projects") ||
      displayBrand.capabilities?.includes("manage_inventory"),
  );
  const canCreateProjects = Boolean(displayBrand.capabilities?.includes("manage_projects"));

  return (
    <div className="dashboard-shell flex min-h-screen min-w-0 bg-[#f8f8f8] text-[#050505]">
      <a href="#developer-main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-black focus:px-4 focus:py-2 focus:text-sm focus:text-white">
        Skip to content
      </a>
      <aside className="dashboard-sidebar sticky top-0 hidden h-screen w-72 shrink-0 flex-col overflow-y-auto border-r border-black/5 bg-white px-6 py-10 shadow-xl shadow-black/5 lg:flex xl:w-80">
        <div className="mb-7">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark brand={displayBrand} />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-400">Developer Console</p>
              <p className="mt-1 truncate text-lg font-semibold tracking-tight text-[#050505]">{displayBrand.name}</p>
            </div>
          </div>
          <p className="mt-3 line-clamp-2 text-xs leading-5 text-neutral-500">{displayBrand.tagline}</p>
          {displayBrand.pendingReview ? <span className="mt-3 inline-flex rounded-full bg-[#f1f5d9] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4c5d11]">Brand review pending</span> : null}
        </div>
        <nav className="space-y-2">
          {visibleNavItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={clsx(
                  "block rounded-2xl px-4 py-3 text-sm transition",
                  isActive
                    ? "bg-black text-white"
                    : "text-neutral-500 hover:bg-black/5 hover:text-black",
                )}
              >
                {item.label}
              </Link>
            );
          })}
          {!onboarding && canUseProjects ? <div className="pt-3">
            <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">Projects</p>
            <div className="mt-2 space-y-3">
              {groupedProjects.map((section) => {
                const sectionActive = pathname === "/developer/projects" && activeStatus === section.key && !activeProjectId;
                return (
                  <div key={section.key} className="space-y-1">
                    <Link
                      href={`/developer/projects?status=${section.key}`}
                      aria-current={sectionActive ? "page" : undefined}
                      className={clsx(
                        "block rounded-2xl px-4 py-2 text-xs font-semibold transition",
                        sectionActive
                          ? "text-black hover:bg-black/5"
                          : "text-neutral-500 hover:bg-black/5 hover:text-black",
                      )}
                    >
                      {section.label}
                    </Link>
                    {section.projects.map((project) => {
                      const isActive = pathname === "/developer/projects" && activeProjectId === project.id;
                      return (
                        <Link
                          key={project.id}
                          href={`/developer/projects?status=${section.key}&project=${project.id}`}
                          aria-current={isActive ? "page" : undefined}
                          className={clsx(
                            "ml-3 block rounded-2xl px-4 py-2 text-xs transition",
                            isActive
                              ? "bg-black text-white"
                              : "text-neutral-500 hover:bg-black/5 hover:text-black",
                          )}
                        >
                          {project.name}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
              {canCreateProjects ? <Link
                href="/developer/projects?create=1"
                className="block rounded-2xl border border-dashed border-black/10 px-4 py-2 text-xs text-neutral-500 hover:border-black/30 hover:text-black"
              >
                + Add Project
              </Link> : null}
            </div>
          </div> : null}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="dashboard-topbar border-b border-black/5 bg-white px-4 py-5 sm:px-6">
          <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-3 flex min-w-0 items-center gap-2 lg:hidden">
                <BrandMark brand={displayBrand} compact />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#050505]">{displayBrand.name}</p>
                  <p className="truncate text-[11px] text-neutral-500">{displayBrand.tagline}</p>
                </div>
              </div>
              <h1 className="dashboard-heading text-2xl font-semibold text-[#050505] sm:text-3xl">{title}</h1>
              {description && <p className="text-sm text-neutral-500">{description}</p>}
            </div>
            <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2 sm:gap-3">
              {!onboarding ? <button
                type="button"
                onClick={() => setMobileMenuOpen((current) => !current)}
                aria-expanded={mobileMenuOpen}
                aria-controls="developer-mobile-nav"
                aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
                className="rounded-full border border-black/10 p-2.5 text-neutral-700 transition-colors hover:border-black/30 hover:text-black lg:hidden"
              >
                {mobileMenuOpen ? <X aria-hidden="true" size={18} /> : <Menu aria-hidden="true" size={18} />}
              </button> : null}
              {actions}
              <form method="post" action="/developer/logout">
                <button
                  type="submit"
                  className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold text-neutral-600 transition-colors hover:border-black/30 hover:text-black"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
          {!onboarding && mobileMenuOpen ? (
            <nav id="developer-mobile-nav" aria-label="Developer mobile navigation" className="mx-auto mt-5 max-w-[1600px] rounded-2xl border border-black/10 bg-neutral-50 p-3 lg:hidden">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-neutral-400">Workspace</p>
                  {visibleNavItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={`mobile-${item.href}`}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        aria-current={isActive ? "page" : undefined}
                        className={clsx(
                          "block rounded-xl px-3 py-2.5 text-sm transition-colors",
                          isActive ? "bg-black text-white" : "text-neutral-700 hover:bg-black/5 hover:text-black",
                        )}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
                {canUseProjects ? <div className="space-y-1">
                  <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-neutral-400">Projects</p>
                  {projectStatusSections.map((section) => {
                    const isActive = pathname === "/developer/projects" && activeStatus === section.key && !activeProjectId;
                    return (
                      <Link
                        key={`mobile-status-${section.key}`}
                        href={`/developer/projects?status=${section.key}`}
                        onClick={() => setMobileMenuOpen(false)}
                        aria-current={isActive ? "page" : undefined}
                        className={clsx(
                          "block rounded-xl px-3 py-2.5 text-sm transition-colors",
                          isActive ? "bg-black text-white" : "text-neutral-700 hover:bg-black/5 hover:text-black",
                        )}
                      >
                        {section.label}
                      </Link>
                    );
                  })}
                  {canCreateProjects ? <Link href="/developer/projects?create=1" onClick={() => setMobileMenuOpen(false)} className="mt-2 block rounded-xl border border-dashed border-black/15 px-3 py-2.5 text-sm font-semibold text-neutral-700 hover:border-black/30 hover:text-black">
                    + Add project
                  </Link> : null}
                </div> : null}
              </div>
            </nav>
          ) : null}
          {impersonation ? (
            <div className="mx-auto mt-4 flex max-w-[1600px] flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-amber-700">Super admin impersonation</p>
                <p className="mt-1">
                  You are viewing <span className="font-semibold">{impersonation.developerName ?? "this developer"}</span> as{" "}
                  {impersonation.adminName ?? impersonation.adminEmail ?? "Super Admin"}.
                </p>
              </div>
              <form method="post" action="/api/developer/impersonation/exit">
                <button
                  type="submit"
                  className="rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                >
                  Exit impersonation
                </button>
              </form>
            </div>
          ) : null}
        </header>
        <main id="developer-main-content" className="dashboard-main min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="dashboard-content mx-auto flex w-full max-w-[1600px] min-w-0 flex-col gap-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

function BrandMark({ brand, compact = false }: { brand: DeveloperPortalBrand; compact?: boolean }) {
  return (
    <div className={clsx("grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#111211] text-[#dff579]", compact ? "size-9 p-1.5" : "size-12 p-2") }>
      {brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logoUrl} alt="" className="h-full w-full object-contain" />
      ) : (
        <span className={compact ? "text-xs font-bold" : "text-sm font-bold"}>{brandInitials(brand.name)}</span>
      )}
    </div>
  );
}

function brandInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "BP";
}
