"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { clsx } from "clsx";

const navItems = [
  { href: "/developer", label: "Overview" },
  { href: "/developer/listings", label: "Resales" },
  { href: "/developer/profile", label: "Profile" },
];

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function DeveloperLayout({ title, description, actions, children }: Props) {
  const pathname = usePathname();
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);

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

  return (
    <div className="flex min-h-screen bg-[#f8f8f8] text-[#050505]">
      <aside className="hidden w-64 flex-col border-r border-black/5 bg-white px-6 py-10 shadow-xl shadow-black/5 lg:flex">
        <div className="mb-8 space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Developer Console</p>
          <p className="text-lg font-semibold text-[#050505]">Brixeler Partners</p>
          <p className="text-xs text-neutral-400">Empower your listings</p>
        </div>
        <nav className="space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "block rounded-2xl px-4 py-3 text-sm transition",
                pathname === item.href
                  ? "bg-black text-white"
                  : "text-neutral-500 hover:bg-black/5 hover:text-black",
              )}
            >
              {item.label}
            </Link>
          ))}
          <div className="pt-3">
            <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">Projects</p>
            <div className="mt-2 space-y-1">
              {projects.map((project) => {
                const isActive = pathname === `/developer/projects?project=${project.id}`;
                return (
                  <Link
                    key={project.id}
                    href={`/developer/projects?project=${project.id}`}
                    className={clsx(
                      "block rounded-2xl px-4 py-2 text-xs transition",
                      isActive
                        ? "bg-black text-white"
                        : "text-neutral-500 hover:bg-black/5 hover:text-black",
                    )}
                  >
                    {project.name}
                  </Link>
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
        </header>
        <main className="flex-1 px-6 py-8">
          <div className="mx-auto flex max-w-5xl flex-col gap-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
