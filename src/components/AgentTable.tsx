"use client";

import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";

export type AgentRow = {
  id: string;
  name: string;
  phone: string;
  deals: number;
  earnings: string;
  status: string;
  tier: string;
  badges: string[];
  profile_picture_url?: string | null;
  language_preference?: string | null;
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
  tier: { name: string; bonus: number };
};

export function AgentTable({ agents }: Props) {
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [profileData, setProfileData] = useState<AgentProfileResponse | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const activeAgent = useMemo(
    () => agents.find((agent) => agent.id === activeAgentId) ?? null,
    [activeAgentId, agents],
  );

  useEffect(() => {
    if (!activeAgentId) return;
    let mounted = true;
    setProfileLoading(true);
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

  const closeModal = () => {
    setActiveAgentId(null);
    setActiveTab(tabs[0]);
    setProfileData(null);
  };

  return (
    <>
      <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-left text-sm">
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
                    <button
                      onClick={async () => {
                        await fetch("/api/admin/agents/suspend", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ agentId: agent.id }),
                        });
                      }}
                      className="rounded-full border border-amber-300/50 px-3 py-1 text-xs text-amber-200 hover:bg-amber-500/10"
                    >
                      Suspend user
                    </button>
                    <button
                      onClick={async () => {
                        await fetch("/api/admin/agents/delete", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ agentId: agent.id }),
                        });
                      }}
                      className="rounded-full border border-rose-300/50 px-3 py-1 text-xs text-rose-200 hover:bg-rose-500/10"
                    >
                      Delete account
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {activeAgent ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-4xl rounded-3xl border border-white/10 bg-[#0f1115] p-6 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-1 flex-col items-center text-center">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/10">
                  {activeAgent.profile_picture_url ? (
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
                <p className="text-2xl font-semibold">{activeAgent.name}</p>
                <p className="text-xs text-slate-400">{activeAgent.phone}</p>
              </div>
              <button onClick={closeModal} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/80">
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Status</p>
                <p className="text-sm text-white">{profileData?.profile?.account_status ?? activeAgent.status}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Tier</p>
                <p className="text-sm text-white">{profileData?.tier?.name ?? activeAgent.tier}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Language</p>
                <p className="text-sm text-white">{profileData?.profile?.language_preference ?? activeAgent.language_preference ?? "—"}</p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
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
              {profileLoading ? <p className="text-slate-400">Loading profile data…</p> : null}
              {!profileLoading && activeTab === "Overview" && (
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
                    <span className="text-slate-400">Bonus rate</span>
                    <span className="text-white">{profileData?.tier?.bonus ?? 0}%</span>
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
