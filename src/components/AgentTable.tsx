"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { useRouter } from "next/navigation";

export type AgentRow = {
  id: string;
  name: string;
  phone: string;
  deals: number;
  earnings: string;
  status: string;
  account_status?: string;
  tier: string;
  growth_tier_level?: number | null;
  badges: string[];
  profile_picture_url?: string | null;
  language_preference?: string | null;
  verification_status?: string | null;
  verification_review_version?: number;
};

type Props = {
  agents: AgentRow[];
};

const tabs = [
  "Overview",
  "Deal analytics",
  "Preferences",
  "Tickets",
  "Connections",
  "Badges",
  "Tiers",
];

type AgentProfileResponse = {
  profile: {
    id: string;
    display_name: string | null;
    phone: string | null;
    profile_picture_url: string | null;
    language_preference: string | null;
    notification_preferences: Record<string, boolean> | null;
    profile_visibility: string | null;
    account_status: string | null;
    account_lifecycle_state: string | null;
    verification_documents_url: string[] | null;
    verification_review_version: number | null;
    total_deals: number | null;
    successful_deals: number | null;
    total_earnings: number | null;
    total_referrals: number | null;
    verified_referrals: number | null;
    referrals_with_first_deal: number | null;
  } | null;
  deals: {
    id: string;
    deal_reference: string;
    status: string;
    sale_amount: number;
    submitted_at: string;
    paid_at: string | null;
    property_name: string;
    developer_name: string;
  }[];
  tickets: {
    id: string;
    subject: string;
    status: string;
    priority: string;
    last_message_at: string | null;
  }[];
  connections: {
    id: string;
    display_name: string | null;
    phone: string | null;
    verification_status: string | null;
    account_status: string | null;
  }[];
  badges: {
    unlocked_at: string | null;
    badges?: {
      name: string;
      badge_type: string;
      benefit_type: string | null;
      benefit_value: number | null;
    } | null;
  }[];
  tier: { name: string; level: number | null; benefit_type?: string | null; benefit_value?: number | null };
  notes: { id: string; note: string; created_at: string; created_by: string; is_demo: boolean }[];
};

export function AgentTable({ agents }: Props) {
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [profileData, setProfileData] = useState<AgentProfileResponse | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const router = useRouter();
  const previousAgentIdRef = useRef<string | null>(null);

  const activeAgent = useMemo(
    () => agents.find((agent) => agent.id === activeAgentId) ?? null,
    [activeAgentId, agents],
  );

  const closeModal = () => {
    setActiveAgentId(null);
    setActiveTab(tabs[0]);
    setProfileData(null);
    setActionMessage(null);
    setNote("");
  };

  useEffect(() => {
    if (!activeAgentId) return;
    let mounted = true;
    if (previousAgentIdRef.current !== activeAgentId) {
      previousAgentIdRef.current = activeAgentId;
      queueMicrotask(() => {
        if (mounted) setProfileLoading(true);
      });
    }
    fetch("/api/admin/agents/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: activeAgentId }),
    })
      .then((res) => res.json())
      .then((data: AgentProfileResponse) => {
        if (mounted) setProfileData(data);
      })
      .catch(() => {
        if (mounted) setProfileData(null);
      })
      .finally(() => {
        if (mounted) setProfileLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [activeAgentId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };
    if (activeAgentId) {
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }
    return undefined;
  }, [activeAgentId]);

  const runAccountAction = async (agent: AgentRow, action: "suspend" | "reactivate" | "archive" | "restore") => {
    const label = action === "reactivate" || action === "restore" ? "restore" : action;
    if (!window.confirm(`Are you sure you want to ${label} ${agent.name}?`)) return;
    const reason = window.prompt(`Enter a reason for ${label} ${agent.name} (3–1000 characters):`, "")?.trim();
    if (!reason || reason.length < 3) {
      setActionMessage("A reason of at least 3 characters is required.");
      return;
    }
    setActionMessage("Working…");
    const endpoint = action === "archive" ? "archive" : action === "restore" ? "restore" : "suspend";
    const response = await fetch(`/api/admin/agents/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: agent.id, suspended: action === "suspend", reason }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setActionMessage(payload.error ?? `Unable to ${action} account.`);
      return;
    }
    setActionMessage(action === "archive" ? "Account archived and recoverable." : action === "restore" || action === "reactivate" ? "Account restored." : "Account suspended.");
    router.refresh();
  };

  return (
    <>
      <div className="mt-6 hidden overflow-x-auto rounded-2xl border border-white/10 md:block">
        <table className="min-w-[920px] w-full text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-[0.2em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Deals</th>
              <th className="px-4 py-3">Earnings</th>
              <th className="px-4 py-3">Tier</th>
              <th className="px-4 py-3">Badges</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={agent.id} className="border-b border-white/5 text-slate-200">
                <td className="px-4 py-4 font-medium text-white">{agent.name}</td>
                <td className="px-4 py-4 text-slate-400">{agent.phone}</td>
                <td className="px-4 py-4">{agent.deals}</td>
                <td className="px-4 py-4">{agent.earnings}</td>
                <td className="px-4 py-4">{agent.tier}</td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    {agent.badges?.length ? (
                      agent.badges.map((badge) => (
                        <span key={badge} className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-200">
                          {badge}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500">—</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs">{agent.status}</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      onClick={() => setActiveAgentId(agent.id)}
                      className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
                    >
                      Open profile
                    </button>
                    {agent.status === "suspended" ? (
                      <button
                        onClick={() => runAccountAction(agent, "reactivate")}
                        className="rounded-full border border-emerald-300/50 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-500/10"
                      >
                        Reactivate user
                      </button>
                    ) : agent.status === "active" ? (
                      <button
                        onClick={() => runAccountAction(agent, "suspend")}
                        className="rounded-full border border-amber-300/50 px-3 py-1 text-xs text-amber-200 hover:bg-amber-500/10"
                      >
                        Suspend user
                      </button>
                    ) : null}
                    {agent.status === "active" || agent.status === "suspended" ? (
                      <button onClick={() => runAccountAction(agent, "archive")} className="rounded-full border border-rose-300/50 px-3 py-1 text-xs text-rose-200 hover:bg-rose-500/10">
                        Archive account
                      </button>
                    ) : agent.status === "archived" ? (
                      <button onClick={() => runAccountAction(agent, "restore")} className="rounded-full border border-emerald-300/50 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-500/10">
                        Restore account
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-3 md:hidden">
        {agents.map((agent) => (
          <article key={agent.id} className="rounded-2xl border border-white/10 bg-black/10 p-4 text-sm text-slate-200">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/10">
                {agent.profile_picture_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={agent.profile_picture_url} alt="" className="h-full w-full object-cover" />
                ) : <span className="font-semibold">{agent.name.charAt(0)}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-white">{agent.name}</p>
                <p className="truncate text-xs text-slate-400">{agent.phone}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded-full border border-white/10 px-2 py-1">{agent.status}</span>
                  <span className="rounded-full border border-white/10 px-2 py-1">Growth: {agent.tier}</span>
                  {agent.verification_status ? <span className="rounded-full border border-white/10 px-2 py-1">KYC: {agent.verification_status}</span> : null}
                </div>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div><dt className="text-slate-500">Deals</dt><dd className="mt-1 text-white">{agent.deals}</dd></div>
              <div><dt className="text-slate-500">Earnings</dt><dd className="mt-1 text-white">{agent.earnings}</dd></div>
              <div><dt className="text-slate-500">Badges</dt><dd className="mt-1 text-white">{agent.badges.length || "—"}</dd></div>
              <div><dt className="text-slate-500">Tier level</dt><dd className="mt-1 text-white">{agent.growth_tier_level ?? "—"}</dd></div>
            </dl>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setActiveAgentId(agent.id)} className="min-h-10 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-white">Open profile</button>
              {agent.status === "archived" ? <button type="button" onClick={() => runAccountAction(agent, "restore")} className="min-h-10 rounded-full border border-emerald-300/50 px-3 py-2 text-xs font-semibold text-emerald-200">Restore</button> : agent.status === "suspended" ? <button type="button" onClick={() => runAccountAction(agent, "reactivate")} className="min-h-10 rounded-full border border-emerald-300/50 px-3 py-2 text-xs font-semibold text-emerald-200">Reactivate</button> : <button type="button" onClick={() => runAccountAction(agent, "suspend")} className="min-h-10 rounded-full border border-amber-300/50 px-3 py-2 text-xs font-semibold text-amber-200">Suspend</button>}
              {agent.status !== "archived" && agent.status !== "purged" ? <button type="button" onClick={() => runAccountAction(agent, "archive")} className="min-h-10 rounded-full border border-rose-300/50 px-3 py-2 text-xs font-semibold text-rose-200">Archive</button> : null}
            </div>
          </article>
        ))}
        {!agents.length ? <p className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-400">No agents match these filters.</p> : null}
      </div>

      {activeAgent ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          onClick={closeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="agent-profile-title"
            className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/10 bg-[#0f1115] p-6 text-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-1 flex-col items-center text-center">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/10">
                  {activeAgent.profile_picture_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activeAgent.profile_picture_url}
                      alt={activeAgent.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl font-semibold">{activeAgent.name.charAt(0)}</span>
                  )}
                </div>
                <p className="mt-3 text-xs uppercase tracking-[0.3em] text-slate-500">Agent profile</p>
                <p id="agent-profile-title" className="text-2xl font-semibold">{activeAgent.name}</p>
                <p className="text-xs text-slate-400">{activeAgent.phone}</p>
              </div>
              <button type="button" onClick={closeModal} aria-label="Close agent profile" className="min-h-10 rounded-full border border-white/10 px-3 py-1 text-xs text-white/80">
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Status</p>
                <p className="text-sm text-white">{profileData?.profile?.account_lifecycle_state ?? activeAgent.status}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Tier</p>
                <p className="text-sm text-white">{profileData?.tier?.name ?? activeAgent.tier}</p>
                <p className="text-[10px] text-slate-500">Canonical Growth tier</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Language</p>
                <p className="text-sm text-white">{profileData?.profile?.language_preference ?? activeAgent.language_preference ?? "—"}</p>
              </div>
            </div>
            {actionMessage ? <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">{actionMessage}</p> : null}

            <div className="mt-6 flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  aria-controls={`agent-tab-panel-${tab.toLowerCase().replaceAll(" ", "-")}`}
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

            <div id={`agent-tab-panel-${activeTab.toLowerCase().replaceAll(" ", "-")}`} role="tabpanel" className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-slate-300">
              {profileLoading ? <p className="text-slate-400">Loading profile data…</p> : null}
              {!profileLoading && activeTab === "Overview" && (
                <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Deals</p>
                    <p className="text-lg text-white">{profileData?.profile?.total_deals ?? activeAgent.deals}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Earnings</p>
                    <p className="text-lg text-white">{profileData?.profile?.total_earnings ?? activeAgent.earnings}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Referrals</p>
                    <p className="text-lg text-white">{profileData?.profile?.total_referrals ?? 0}</p>
                  </div>
                </div>
                <div className="border-t border-white/10 pt-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Admin notes</p>
                  <form
                    className="mt-3 flex gap-2"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      if (!note.trim() || !activeAgentId) return;
                      const response = await fetch("/api/admin/agents/notes", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ agentId: activeAgentId, note }),
                      });
                      const payload = await response.json().catch(() => ({}));
                      if (!response.ok) { setActionMessage(payload.error ?? "Unable to save note."); return; }
                      setProfileData((current) => current ? { ...current, notes: [payload.note, ...(current.notes ?? [])] } : current);
                      setNote("");
                      setActionMessage("Note saved.");
                    }}
                  >
                    <textarea value={note} onChange={(event) => setNote(event.target.value)} className="min-h-20 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm" placeholder="Add internal context for the support and operations teams." />
                    <button className="h-fit rounded-full bg-white px-4 py-2 text-xs font-semibold text-black" type="submit">Add note</button>
                  </form>
                  <div className="mt-3 space-y-2">
                    {(profileData?.notes ?? []).map((item) => <div key={item.id} className="rounded-xl border border-white/5 bg-white/[0.03] p-3"><p className="text-sm text-slate-200">{item.note}</p><p className="mt-1 text-[10px] text-slate-500">{new Date(item.created_at).toLocaleString()}{item.is_demo ? " · DEMO" : ""}</p></div>)}
                    {!profileData?.notes?.length ? <p className="text-xs text-slate-500">No admin notes.</p> : null}
                  </div>
                </div>
                </div>
              )}
              {!profileLoading && activeTab === "Deal analytics" && (
                <div className="space-y-3">
                  {(profileData?.deals ?? []).map((deal) => (
                    <div key={deal.id} className="flex items-center justify-between border-b border-white/5 pb-2 text-sm">
                      <div>
                        <p className="text-white">{deal.deal_reference}</p>
                        <p className="text-xs text-slate-500">{deal.property_name} · {deal.developer_name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-white">{deal.sale_amount}</p>
                        <p className="text-xs text-slate-500">{deal.status}</p>
                      </div>
                    </div>
                  ))}
                  {!profileData?.deals?.length && <p className="text-slate-400">No deals found.</p>}
                </div>
              )}
              {!profileLoading && activeTab === "Preferences" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Profile visibility</span>
                    <span className="text-white">{profileData?.profile?.profile_visibility ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Language</span>
                    <span className="text-white">{profileData?.profile?.language_preference ?? "—"}</span>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-slate-400">
                    <p className="text-slate-500">Notifications</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {profileData?.profile?.notification_preferences
                        ? Object.entries(profileData.profile.notification_preferences).map(([key, value]) => (
                            <div key={key} className="flex items-center justify-between">
                              <span>{key}</span>
                              <span className="text-white">{value ? "On" : "Off"}</span>
                            </div>
                          ))
                        : "—"}
                    </div>
                  </div>
                </div>
              )}
              {!profileLoading && activeTab === "Tickets" && (
                <div className="space-y-3">
                  {(profileData?.tickets ?? []).map((ticket) => (
                    <div key={ticket.id} className="flex items-center justify-between border-b border-white/5 pb-2 text-sm">
                      <div>
                        <p className="text-white">{ticket.subject}</p>
                        <p className="text-xs text-slate-500">{ticket.priority} · {ticket.status}</p>
                      </div>
                      <p className="text-xs text-slate-500">
                        {ticket.last_message_at ? new Date(ticket.last_message_at).toLocaleString() : "—"}
                      </p>
                    </div>
                  ))}
                  {!profileData?.tickets?.length && <p className="text-slate-400">No tickets found.</p>}
                </div>
              )}
              {!profileLoading && activeTab === "Connections" && (
                <div className="space-y-3">
                  {(profileData?.connections ?? []).map((connection) => (
                    <div key={connection.id} className="flex items-center justify-between border-b border-white/5 pb-2 text-sm">
                      <div>
                        <p className="text-white">{connection.display_name ?? "Agent"}</p>
                        <p className="text-xs text-slate-500">{connection.phone ?? "—"}</p>
                      </div>
                      <p className="text-xs text-slate-400">
                        {connection.verification_status ?? "pending"} · {connection.account_status ?? "active"}
                      </p>
                    </div>
                  ))}
                  {!profileData?.connections?.length && <p className="text-slate-400">No connections yet.</p>}
                </div>
              )}
              {!profileLoading && activeTab === "Badges" && (
                <div className="space-y-3">
                  {(profileData?.badges ?? []).map((badge, idx) => (
                    <div key={`${badge.badges?.name ?? "badge"}-${idx}`} className="flex items-center justify-between border-b border-white/5 pb-2 text-sm">
                      <div>
                        <p className="text-white">{badge.badges?.name ?? "Badge"}</p>
                        <p className="text-xs text-slate-500">{badge.badges?.badge_type ?? "—"}</p>
                      </div>
                      <p className="text-xs text-slate-400">
                        {badge.unlocked_at ? new Date(badge.unlocked_at).toLocaleDateString() : "—"}
                      </p>
                    </div>
                  ))}
                  {!profileData?.badges?.length && <p className="text-slate-400">No badges yet.</p>}
                </div>
              )}
              {!profileLoading && activeTab === "Tiers" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Current tier</span>
                    <span className="text-white">{profileData?.tier?.name ?? activeAgent.tier}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Growth benefit</span>
                    <span className="text-white">{profileData?.tier?.benefit_type && profileData.tier.benefit_type !== "none" ? `${profileData.tier.benefit_type}${profileData.tier.benefit_value != null ? ` · ${profileData.tier.benefit_value}` : ""}` : "None"}</span>
                  </div>
                  <p className="text-xs text-slate-500">Based on referral achievements.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
