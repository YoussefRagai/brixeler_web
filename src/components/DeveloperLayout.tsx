"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import type { DeveloperImpersonationMarker } from "@/lib/developerImpersonation";

const navItems = [
  { href: "/developer", label: "Overview" },
  { href: "/developer/listings", label: "Resales" },
  { href: "/developer/profile", label: "Profile" },
];

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
}

export function DeveloperLayout({ title, description, actions, children, impersonation }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<DeveloperSidebarProject[]>([]);
  const activeProjectId = searchParams.get("project");
  const activeStatusParam = searchParams.get("status");
  const activeStatus = activeStatusParam ? normalizeLaunchStatus(activeStatusParam) : null;

  useEffect(() => {
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
  }, []);

  const groupedProjects = projectStatusSections.map((section) => ({
    ...section,
    projects: projects.filter((project) => normalizeLaunchStatus(project.launchStatus) === section.key),
  }));

  return (
    <div className="flex min-h-screen bg-[#f8f8f8] text-[#050505]">
      <aside className="hidden w-64 flex-col border-r border-black/5 bg-white px-6 py-10 shadow-xl shadow-black/5 lg:flex">
        <div className="mb-8 space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Developer Console</p>
          <p className="text-lg font-semibold text-[#050505]">Brixeler Partners</p>
          <p className="text-xs text-neutral-400">Empower your listings</p>
        </div>
        <nav className="space-y-2">
          {navItems.map((item) => {
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
          <div className="pt-3">
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
              <Link
                href="/developer/projects?create=1"
                className="block rounded-2xl border border-dashed border-black/10 px-4 py-2 text-xs text-neutral-500 hover:border-black/30 hover:text-black"
              >
                + Add Project
              </Link>
            </div>
          </div>
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="border-b border-black/5 bg-white px-6 py-5">
          <div className="mx-auto flex max-w-5xl items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-[#050505]">{title}</h1>
              {description && <p className="text-sm text-neutral-500">{description}</p>}
            </div>
            <div className="flex items-center gap-3">
              {actions}
              <form method="post" action="/developer/logout">
                <button
                  type="submit"
                  className="rounded-full border border-black/10 px-4 py-2 text-xs font-semibold text-neutral-500 hover:border-black/20 hover:text-black"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <nav aria-label="Developer mobile navigation" className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={`mobile-${item.href}`}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={clsx(
                    "shrink-0 rounded-full border px-4 py-2 text-xs font-medium transition",
                    isActive
                      ? "border-black bg-black text-white"
                      : "border-black/10 bg-white text-neutral-600 hover:border-black/25 hover:text-black",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            {projectStatusSections.map((section) => (
              <Link
                key={`mobile-status-${section.key}`}
                href={`/developer/projects?status=${section.key}`}
                className="shrink-0 rounded-full border border-black/10 bg-white px-4 py-2 text-xs text-neutral-600 hover:border-black/25 hover:text-black"
              >
                {section.label}
              </Link>
            ))}
          </nav>
          {impersonation ? (
            <div className="mx-auto mt-4 flex max-w-5xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
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
        <main className="flex-1 px-6 py-8">
          <div className="mx-auto flex max-w-5xl flex-col gap-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
