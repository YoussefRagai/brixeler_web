"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";

type DeveloperRow = {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  logo_url?: string | null;
  projectsCount: number;
  listingsCount: number;
  portalEmail?: string | null;
  lastLogin?: string | null;
};

type DeveloperProject = {
  id: string;
  developer_id: string;
  name: string;
  created_at: string | null;
};

type DeveloperProperty = {
  id: string;
  developer_id: string | null;
  property_name: string;
  approval_status?: string | null;
};

type Props = {
  developers: DeveloperRow[];
  projects: DeveloperProject[];
  properties: DeveloperProperty[];
};

const tabs = ["Overview", "Projects", "Listings"] as const;

type Tab = (typeof tabs)[number];

export function AdminDevelopersTable({ developers, projects, properties }: Props) {
  const [query, setQuery] = useState("");
  const [activeDeveloperId, setActiveDeveloperId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [passwordValue, setPasswordValue] = useState("");

  const filteredDevelopers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return developers;
    return developers.filter((dev) =>
      [dev.name, dev.contact_email, dev.contact_phone, dev.portalEmail]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(q)),
    );
  }, [developers, query]);

  const activeDeveloper = useMemo(
    () => developers.find((dev) => dev.id === activeDeveloperId) ?? null,
    [activeDeveloperId, developers],
  );

  const developerProjects = useMemo(
    () => projects.filter((project) => project.developer_id === activeDeveloperId),
    [projects, activeDeveloperId],
  );
  const developerListings = useMemo(
    () => properties.filter((property) => property.developer_id === activeDeveloperId),
    [properties, activeDeveloperId],
  );
  const resetPassword = async (authEmail: string | null) => {
    if (!authEmail || !passwordValue.trim()) return;
    await fetch("/api/admin/developers/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: authEmail, newPassword: passwordValue.trim() }),
    });
    setPasswordValue("");
  };

  const revokePortal = async (developerId: string) => {
    await fetch("/api/admin/developers/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ developerId }),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Developers</p>
          <p className="text-lg text-slate-300">Manage partner portals, listings, and projects.</p>
        </div>
        <a
          href="#developer-invite"
          className="rounded-full border border-white/10 px-4 py-2 text-xs text-white/80 hover:bg-white/10"
        >
          Add developer
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search developers"
          className="w-full max-w-md rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-left text-sm text-slate-200">
          <thead className="bg-white/5 text-xs uppercase tracking-[0.2em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Developer</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Projects</th>
              <th className="px-4 py-3">Listings</th>
              <th className="px-4 py-3">Portal</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredDevelopers.map((dev) => (
              <tr key={dev.id} className="border-b border-white/5">
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/10">
                      {dev.logo_url ? (
                        <img src={dev.logo_url} alt={dev.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-sm font-semibold text-white">{dev.name.charAt(0)}</span>
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-white">{dev.name}</p>
                      <p className="text-xs text-slate-500">{dev.id}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-slate-400">
                  {dev.contact_email ?? "—"}
                  <br />
                  <span className="text-xs text-slate-500">{dev.contact_phone ?? ""}</span>
                </td>
                <td className="px-4 py-4">{dev.projectsCount}</td>
                <td className="px-4 py-4">{dev.listingsCount}</td>
                <td className="px-4 py-4">
                  <p className="text-white">{dev.portalEmail ?? "No portal"}</p>
                  <p className="text-xs text-slate-500">{dev.lastLogin ? `Last login ${new Date(dev.lastLogin).toLocaleString()}` : "—"}</p>
                </td>
                <td className="px-4 py-4 text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      onClick={() => {
                        setActiveDeveloperId(dev.id);
                        setActiveTab("Overview");
                      }}
                      className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
                    >
                      View
                    </button>
                    {dev.portalEmail ? (
                      <button
                        onClick={() => revokePortal(dev.id)}
                        className="rounded-full border border-rose-300/50 px-3 py-1 text-xs text-rose-200 hover:bg-rose-500/10"
                      >
                        Revoke portal
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {!filteredDevelopers.length && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-400">
                  No developers match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {activeDeveloper ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-4xl rounded-3xl border border-white/10 bg-[#0f1115] p-6 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/10">
                  {activeDeveloper.logo_url ? (
                    <img src={activeDeveloper.logo_url} alt={activeDeveloper.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-lg font-semibold">{activeDeveloper.name.charAt(0)}</span>
                  )}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Developer</p>
                  <p className="text-2xl font-semibold text-white">{activeDeveloper.name}</p>
                  <p className="text-xs text-slate-400">{activeDeveloper.contact_email ?? "—"}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveDeveloperId(null)}
                className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/80"
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={clsx(
                    "rounded-full border px-4 py-2 text-xs",
                    activeTab === tab
                      ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-200"
                      : "border-white/10 text-slate-300 hover:bg-white/10",
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-slate-300">
              {activeTab === "Overview" && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Projects</p>
                    <p className="text-lg text-white">{activeDeveloper.projectsCount}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Listings</p>
                    <p className="text-lg text-white">{activeDeveloper.listingsCount}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Portal</p>
                    <p className="text-sm text-white">{activeDeveloper.portalEmail ?? "No portal"}</p>
                  </div>
                </div>
              )}

              {activeTab === "Projects" && (
                <div className="space-y-3">
                  {developerProjects.map((project) => (
                    <div key={project.id} className="flex items-center justify-between border-b border-white/5 pb-2">
                      <div>
                        <p className="text-white">{project.name}</p>
                        <p className="text-xs text-slate-500">{project.created_at ?? "—"}</p>
                      </div>
                    </div>
                  ))}
                  {!developerProjects.length && <p className="text-slate-400">No projects yet.</p>}
                </div>
              )}

              {activeTab === "Listings" && (
                <div className="space-y-3">
                  {developerListings.map((listing) => (
                    <div key={listing.id} className="flex items-center justify-between border-b border-white/5 pb-2">
                      <div>
                        <p className="text-white">{listing.property_name}</p>
                        <p className="text-xs text-slate-500">{listing.approval_status ?? "—"}</p>
                      </div>
                    </div>
                  ))}
                  {!developerListings.length && <p className="text-slate-400">No listings yet.</p>}
                </div>
              )}

            </div>

            {activeDeveloper.portalEmail ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Reset portal password</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    value={passwordValue}
                    onChange={(event) => setPasswordValue(event.target.value)}
                    placeholder="New password"
                    className="flex-1 rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                  />
                  <button
                    onClick={() => resetPassword(activeDeveloper.portalEmail ?? null)}
                    className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-900"
                  >
                    Update
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
