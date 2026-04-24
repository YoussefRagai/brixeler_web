"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";

type DeveloperRow = {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  logo_url?: string | null;
  projectsCount: number;
  listingsCount: number;
  membersCount: number;
  activeMembersCount: number;
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

type DeveloperMember = {
  id: string;
  developer_id: string;
  auth_user_id: string;
  email: string | null;
  full_name: string | null;
  status: string | null;
  invited_at: string | null;
  invitation_sent_at: string | null;
  activated_at: string | null;
  revoked_at: string | null;
  last_login: string | null;
};

type DeveloperActivity = {
  id: string;
  action: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  resource_id: string | null;
};

type Props = {
  developers: DeveloperRow[];
  projects: DeveloperProject[];
  properties: DeveloperProperty[];
  members: DeveloperMember[];
  activity: DeveloperActivity[];
};

const tabs = ["Overview", "Members", "Projects", "Listings"] as const;
type Tab = (typeof tabs)[number];

const formatIdentifier = (value: string) => (value.length <= 12 ? value : `${value.slice(0, 8)}...${value.slice(-4)}`);

const formatTimestamp = (value?: string | null) => (value ? new Date(value).toLocaleString() : "—");

const statusStyles: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  revoked: "border-rose-200 bg-rose-50 text-rose-700",
};

export function AdminDevelopersTable({ developers, projects, properties, members, activity }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeDeveloperId, setActiveDeveloperId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);

  const filteredDevelopers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return developers;
    return developers.filter((dev) =>
      [dev.name, dev.contact_email, dev.contact_phone]
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
  const developerMembers = useMemo(
    () => members.filter((member) => member.developer_id === activeDeveloperId),
    [members, activeDeveloperId],
  );
  const developerActivity = useMemo(
    () =>
      activity.filter((entry) => String(entry.metadata?.developer_id ?? "") === activeDeveloperId),
    [activity, activeDeveloperId],
  );

  const runMemberAction = async (accountId: string, path: string) => {
    setActionError(null);
    setBusyAccountId(accountId);
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setActionError(payload.error ?? "Action failed.");
      setBusyAccountId(null);
      return;
    }
    router.refresh();
    setBusyAccountId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-neutral-500">Developers</p>
          <p className="text-base text-neutral-600">Manage partner portals, member access, listings, and projects.</p>
        </div>
        <a
          href="#developer-invite"
          className="rounded-full border border-black/10 px-4 py-2 text-sm text-neutral-700 hover:bg-black/5"
        >
          Invite member
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
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-600">
              <span className="rounded-full border border-black/10 bg-[#f8f8f8] px-3 py-1">
                {dev.activeMembersCount} active
              </span>
              <span className="rounded-full border border-black/10 bg-[#f8f8f8] px-3 py-1">
                {dev.membersCount} members
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
        <table className="w-full min-w-[1080px] text-left text-sm text-neutral-700">
          <thead className="bg-black/[0.03] text-xs uppercase tracking-[0.2em] text-neutral-500">
            <tr>
              <th className="px-4 py-3">Developer</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Projects</th>
              <th className="px-4 py-3">Listings</th>
              <th className="px-4 py-3">Access</th>
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
                  <p className="text-[#050505]">
                    {dev.activeMembersCount} active · {dev.membersCount} total
                  </p>
                  <p className="text-sm text-neutral-500">
                    {dev.lastLogin ? `Last access ${new Date(dev.lastLogin).toLocaleString()}` : "No sign-ins yet"}
                  </p>
                </td>
                <td className="px-4 py-4 text-right">
                  <button
                    onClick={() => {
                      setActiveDeveloperId(dev.id);
                      setActiveTab("Overview");
                    }}
                    className="rounded-full border border-black/10 px-3 py-1 text-sm text-neutral-700 hover:bg-black/5"
                  >
                    View
                  </button>
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
          <div className="w-full max-w-5xl rounded-3xl border border-black/10 bg-white p-6 text-[#050505] shadow-2xl shadow-black/10">
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
                    activeTab === tab ? "border-black bg-black text-white" : "border-black/10 text-neutral-700 hover:bg-black/5",
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>

            {actionError ? (
              <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{actionError}</p>
            ) : null}

            <div className="mt-4 rounded-2xl border border-black/10 bg-[#f8f8f8] p-5 text-sm text-neutral-700">
              {activeTab === "Overview" && (
                <div className="grid gap-4 sm:grid-cols-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Projects</p>
                    <p className="text-lg text-[#050505]">{activeDeveloper.projectsCount}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Listings</p>
                    <p className="text-lg text-[#050505]">{activeDeveloper.listingsCount}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Active members</p>
                    <p className="text-lg text-[#050505]">{activeDeveloper.activeMembersCount}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Last access</p>
                    <p className="text-sm text-[#050505]">{formatTimestamp(activeDeveloper.lastLogin)}</p>
                  </div>
                </div>
              )}

              {activeTab === "Members" && (
                <div className="space-y-4">
                  {developerMembers.map((member) => (
                    <article key={member.id} className="rounded-2xl border border-black/10 bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[#050505]">{member.full_name ?? member.email ?? "Developer member"}</p>
                          <p className="text-sm text-neutral-500">{member.email ?? "—"}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={clsx(
                              "rounded-full border px-3 py-1 text-xs",
                              statusStyles[member.status ?? "pending"] ?? "border-black/10 bg-[#f8f8f8] text-neutral-700",
                            )}
                          >
                            {member.status ?? "pending"}
                          </span>
                          {member.status !== "revoked" ? (
                            <button
                              onClick={() => runMemberAction(member.id, "/api/admin/developers/revoke")}
                              disabled={busyAccountId === member.id}
                              className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-sm text-rose-800 hover:bg-rose-100 disabled:opacity-60"
                            >
                              Revoke
                            </button>
                          ) : null}
                          {member.status !== "active" ? (
                            <button
                              onClick={() => runMemberAction(member.id, "/api/admin/developers/resend-invite")}
                              disabled={busyAccountId === member.id}
                              className="rounded-full border border-black/10 px-3 py-1 text-sm text-neutral-700 hover:bg-black/5 disabled:opacity-60"
                            >
                              Re-send invite
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 text-sm text-neutral-600 sm:grid-cols-2 xl:grid-cols-4">
                        <p>Invited: {formatTimestamp(member.invited_at ?? member.invitation_sent_at)}</p>
                        <p>Activated: {formatTimestamp(member.activated_at)}</p>
                        <p>Last login: {formatTimestamp(member.last_login)}</p>
                        <p>Revoked: {formatTimestamp(member.revoked_at)}</p>
                      </div>
                    </article>
                  ))}
                  {!developerMembers.length && <p className="text-neutral-500">No members invited yet.</p>}

                  <div className="rounded-2xl border border-black/10 bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Access activity</p>
                    <div className="mt-3 space-y-3">
                      {developerActivity.map((entry) => (
                        <div key={entry.id} className="border-b border-black/5 pb-3 last:border-b-0 last:pb-0">
                          <p className="font-medium text-[#050505]">{entry.action.replaceAll("_", " ")}</p>
                          <p className="text-xs text-neutral-500">{new Date(entry.created_at).toLocaleString()}</p>
                          <p className="text-sm text-neutral-600">{JSON.stringify(entry.metadata ?? {})}</p>
                        </div>
                      ))}
                      {!developerActivity.length && <p className="text-neutral-500">No recent access actions logged.</p>}
                    </div>
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
