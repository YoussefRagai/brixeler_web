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

const formatIdentifier = (value: string) => {
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
};

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
          <p className="text-sm uppercase tracking-[0.3em] text-neutral-500">Developers</p>
          <p className="text-base text-neutral-600">Manage partner portals, listings, and projects.</p>
        </div>
        <a
          href="#developer-invite"
          className="rounded-full border border-black/10 px-4 py-2 text-sm text-neutral-700 hover:bg-black/5"
        >
          Add developer
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search developers"
          className="w-full max-w-md rounded-2xl border border-black/10 bg-white px-4 py-2 text-sm text-[#050505]"
        />
      </div>

      <div className="space-y-3 lg:hidden">
        {filteredDevelopers.map((dev) => (
          <article key={`card-${dev.id}`} className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm shadow-black/5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-[#050505]">{dev.name}</p>
                <p className="text-sm text-neutral-500">{formatIdentifier(dev.id)}</p>
              </div>
              <button
                onClick={() => {
                  setActiveDeveloperId(dev.id);
                  setActiveTab("Overview");
                }}
                className="rounded-full border border-black/10 px-3 py-1 text-sm text-neutral-700"
              >
                View
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-neutral-600">
              <p>Email: {dev.contact_email ?? "—"}</p>
              <p>Phone: {dev.contact_phone ?? "—"}</p>
              <p>Projects: {dev.projectsCount}</p>
              <p>Listings: {dev.listingsCount}</p>
            </div>
            <div className="mt-3">
              <span className="rounded-full border border-black/10 bg-[#f8f8f8] px-3 py-1 text-xs text-neutral-600">
                {dev.portalEmail ? "Portal active" : "No portal"}
              </span>
            </div>
          </article>
        ))}
        {!filteredDevelopers.length && (
          <div className="rounded-2xl border border-black/10 bg-white px-4 py-6 text-center text-sm text-neutral-500">
            No developers match your search.
          </div>
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-black/10 lg:block">
        <table className="w-full min-w-[980px] text-left text-sm text-neutral-700">
          <thead className="bg-black/[0.03] text-xs uppercase tracking-[0.2em] text-neutral-500">
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
              <tr key={dev.id} className="border-b border-black/5">
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-black/10 bg-black/[0.03]">
                      {dev.logo_url ? (
                        <img src={dev.logo_url} alt={dev.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-sm font-semibold text-[#050505]">{dev.name.charAt(0)}</span>
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-[#050505]">{dev.name}</p>
                      <p className="text-sm text-neutral-500">{formatIdentifier(dev.id)}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-neutral-600">
                  {dev.contact_email ?? "—"}
                  <br />
                  <span className="text-sm text-neutral-500">{dev.contact_phone ?? ""}</span>
                </td>
                <td className="px-4 py-4">{dev.projectsCount}</td>
                <td className="px-4 py-4">{dev.listingsCount}</td>
                <td className="px-4 py-4">
                  <p className="text-[#050505]">{dev.portalEmail ?? "No portal"}</p>
                  <p className="text-sm text-neutral-500">{dev.lastLogin ? `Last login ${new Date(dev.lastLogin).toLocaleString()}` : "—"}</p>
                </td>
                <td className="px-4 py-4 text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      onClick={() => {
                        setActiveDeveloperId(dev.id);
                        setActiveTab("Overview");
                      }}
                      className="rounded-full border border-black/10 px-3 py-1 text-sm text-neutral-700 hover:bg-black/5"
                    >
                      View
                    </button>
                    {dev.portalEmail ? (
                      <button
                        onClick={() => revokePortal(dev.id)}
                        className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-sm text-rose-800 hover:bg-rose-100"
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
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-neutral-500">
                  No developers match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {activeDeveloper ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div className="w-full max-w-4xl rounded-3xl border border-black/10 bg-white p-6 text-[#050505] shadow-2xl shadow-black/10">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-black/10 bg-black/[0.03]">
                  {activeDeveloper.logo_url ? (
                    <img src={activeDeveloper.logo_url} alt={activeDeveloper.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-lg font-semibold">{activeDeveloper.name.charAt(0)}</span>
                  )}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Developer</p>
                  <p className="text-2xl font-semibold text-[#050505]">{activeDeveloper.name}</p>
                  <p className="text-sm text-neutral-500">{activeDeveloper.contact_email ?? "—"}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveDeveloperId(null)}
                className="rounded-full border border-black/10 px-3 py-1 text-sm text-neutral-700"
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
                      ? "border-black bg-black text-white"
                      : "border-black/10 text-neutral-700 hover:bg-black/5",
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-black/10 bg-[#f8f8f8] p-5 text-sm text-neutral-700">
              {activeTab === "Overview" && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Projects</p>
                    <p className="text-lg text-[#050505]">{activeDeveloper.projectsCount}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Listings</p>
                    <p className="text-lg text-[#050505]">{activeDeveloper.listingsCount}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Portal</p>
                    <p className="text-sm text-[#050505]">{activeDeveloper.portalEmail ?? "No portal"}</p>
                  </div>
                </div>
              )}

              {activeTab === "Projects" && (
                <div className="space-y-3">
                  {developerProjects.map((project) => (
                    <div key={project.id} className="flex items-center justify-between border-b border-black/5 pb-2">
                      <div>
                        <p className="text-[#050505]">{project.name}</p>
                        <p className="text-sm text-neutral-500">{project.created_at ?? "—"}</p>
                      </div>
                    </div>
                  ))}
                  {!developerProjects.length && <p className="text-neutral-500">No projects yet.</p>}
                </div>
              )}

              {activeTab === "Listings" && (
                <div className="space-y-3">
                  {developerListings.map((listing) => (
                    <div key={listing.id} className="flex items-center justify-between border-b border-black/5 pb-2">
                      <div>
                        <p className="text-[#050505]">{listing.property_name}</p>
                        <p className="text-sm text-neutral-500">{listing.approval_status ?? "—"}</p>
                      </div>
                    </div>
                  ))}
                  {!developerListings.length && <p className="text-neutral-500">No listings yet.</p>}
                </div>
              )}

            </div>

            {activeDeveloper.portalEmail ? (
              <div className="mt-4 rounded-2xl border border-black/10 bg-[#f8f8f8] p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Reset portal password</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    value={passwordValue}
                    onChange={(event) => setPasswordValue(event.target.value)}
                    placeholder="New password"
                    className="flex-1 rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm text-[#050505]"
                  />
                  <button
                    onClick={() => resetPassword(activeDeveloper.portalEmail ?? null)}
                    className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white"
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
