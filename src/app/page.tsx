import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
import { supabaseServer } from "@/lib/supabaseServer";

type MetricCard = {
  label: string;
  value: string | number;
  trend: string;
};

type RecentDeal = {
  id: string;
  property: string;
  agent: string;
  status: string;
  amount: string;
  updated: string;
};

type ActivityItem = {
  id: string;
  title: string;
  meta: string;
  updatedAt: number;
};

type AgentQueueItem = {
  id: string;
  name: string;
  phone: string;
  status: string;
  submittedAt: string;
};

const formatCurrency = (value?: number | string | null) => {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (!numeric || Number.isNaN(numeric)) return "—";
  return numeric.toLocaleString("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  });
};

const formatTimestamp = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

async function loadMissionControlData() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      metrics: [
        { label: "Deals", value: "—", trend: "Unavailable" },
        { label: "Agents", value: "—", trend: "Unavailable" },
        { label: "Pending verification", value: "—", trend: "Unavailable" },
        { label: "Sales claim changes", value: "—", trend: "Unavailable" },
      ] as MetricCard[],
      recentDeals: [] as RecentDeal[],
      recentActivity: [] as ActivityItem[],
      agentQueue: [] as AgentQueueItem[],
    };
  }

  const [
    { count: dealsCount },
    { count: agentsCount },
    { count: pendingVerificationCount },
    { count: claimChangesCount },
    { data: recentDealsRaw },
    { data: recentPropertiesRaw },
    { data: agentQueueRaw },
  ] = await Promise.all([
    supabaseServer.from("deals").select("*", { count: "exact", head: true }),
    supabaseServer.from("users_profile").select("*", { count: "exact", head: true }),
    supabaseServer
      .from("users_profile")
      .select("*", { count: "exact", head: true })
      .eq("verification_status", "pending"),
    supabaseServer
      .from("deal_stage_entries")
      .select("*", { count: "exact", head: true })
      .eq("stage", "SalesClaim")
      .eq("status", "Change Requested"),
    supabaseServer
      .from("deals")
      .select("id, property_name, agent_id, status, sale_amount, updated_at")
      .order("updated_at", { ascending: false })
      .limit(5),
    supabaseServer
      .from("properties")
      .select("id, property_name, approval_status, updated_at")
      .order("updated_at", { ascending: false })
      .limit(5),
    supabaseServer
      .from("users_profile")
      .select("id, display_name, phone, verification_status, created_at")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const agentIds = Array.from(new Set((recentDealsRaw ?? []).map((deal) => deal.agent_id).filter(Boolean))) as string[];
  const { data: agentNamesRaw } = agentIds.length
    ? await supabaseServer.from("users_profile").select("id, display_name").in("id", agentIds)
    : { data: [] };
  const agentNameMap = new Map((agentNamesRaw ?? []).map((row) => [row.id, row.display_name ?? "Agent"]));

  const recentDeals: RecentDeal[] = (recentDealsRaw ?? []).map((deal) => ({
    id: deal.id,
    property: deal.property_name ?? "Deal",
    agent: deal.agent_id ? agentNameMap.get(deal.agent_id) ?? deal.agent_id : "—",
    status: deal.status ?? "submitted",
    amount: formatCurrency(deal.sale_amount),
    updated: formatTimestamp(deal.updated_at),
  }));

  const recentActivity: ActivityItem[] = [
    ...((recentDealsRaw ?? []).map((deal) => ({
      id: `deal-${deal.id}`,
      title: `${deal.property_name ?? "Deal"} · ${deal.status ?? "updated"}`,
      meta: `Deal updated ${formatTimestamp(deal.updated_at)}`,
      updatedAt: new Date(deal.updated_at ?? 0).getTime() || 0,
    })) as ActivityItem[]),
    ...((recentPropertiesRaw ?? []).map((property) => ({
      id: `property-${property.id}`,
      title: `${property.property_name ?? "Property"} · ${property.approval_status ?? "pending"}`,
      meta: `Listing updated ${formatTimestamp(property.updated_at)}`,
      updatedAt: new Date(property.updated_at ?? 0).getTime() || 0,
    })) as ActivityItem[]),
  ]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 6);

  const agentQueue: AgentQueueItem[] = (agentQueueRaw ?? []).map((agent) => ({
    id: agent.id,
    name: agent.display_name ?? "Agent",
    phone: agent.phone ?? "—",
    status: agent.verification_status ?? "pending",
    submittedAt: formatTimestamp(agent.created_at),
  }));

  return {
    metrics: [
      { label: "Deals", value: dealsCount ?? "—", trend: "Live" },
      { label: "Agents", value: agentsCount ?? "—", trend: "Live" },
      { label: "Pending verification", value: pendingVerificationCount ?? "—", trend: "Queue" },
      { label: "Sales claim changes", value: claimChangesCount ?? "—", trend: "Attention" },
    ] as MetricCard[],
    recentDeals,
    recentActivity,
    agentQueue,
  };
}

export default async function Home() {
  const ui = await buildAdminUi([
    "super_admin",
    "user_auth_admin",
    "user_support_admin",
    "developers_admin",
    "listing_admin",
    "deals_admin",
    "marketing_admin",
  ]);
  const { metrics, recentDeals, recentActivity, agentQueue } = await loadMissionControlData();

  return (
    <AdminLayout
      title="Mission control"
      description="Live telemetry covering onboarding, deals, payouts, and sentiment."
      actions={
        <button className="rounded-full border border-black/15 bg-white px-5 py-2 text-sm text-neutral-700 transition hover:bg-black/5">
          Export dashboard
        </button>
      }
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <article
                key={metric.label}
                className="rounded-3xl border border-black/5 bg-white p-5 shadow-lg shadow-black/5"
              >
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">{metric.label}</p>
                <p className="mt-3 text-2xl font-semibold text-[#050505]">{metric.value}</p>
                <p className="text-sm text-emerald-700">{metric.trend}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
            <article className="rounded-3xl border border-black/5 bg-white p-6 shadow-lg shadow-black/5">
              <header className="flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-neutral-500">Recent deals</p>
                  <p className="text-lg text-neutral-700">Latest backend deal activity</p>
                </div>
                <span className="rounded-full border border-black/10 px-3 py-1 text-xs text-neutral-600">
                  Live
                </span>
              </header>
              <div className="mt-6 flex flex-col gap-4">
                {recentDeals.length ? (
                  recentDeals.map((deal) => (
                    <div key={deal.id} className="rounded-2xl border border-black/5 bg-black/[0.02] p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-[#050505]">{deal.property}</p>
                          <p className="text-sm text-neutral-500">
                            {deal.agent} · {deal.id}
                          </p>
                        </div>
                        <p className="text-emerald-700">{deal.status}</p>
                      </div>
                      <p className="mt-2 text-sm text-neutral-500">
                        {deal.amount} • Last activity {deal.updated}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-black/10 px-4 py-8 text-sm text-neutral-500">
                    No live deals to show.
                  </div>
                )}
              </div>
            </article>

            <article className="rounded-3xl border border-black/5 bg-white p-6 shadow-lg shadow-black/5">
              <header className="flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-neutral-500">Activity feed</p>
                  <p className="text-lg text-neutral-700">Recent operational events</p>
                </div>
              </header>
              <div className="mt-6 space-y-4">
                {recentActivity.length ? (
                  recentActivity.map((activity) => (
                    <div key={activity.id} className="rounded-2xl border border-black/5 bg-black/[0.02] p-4">
                      <p className="text-sm font-medium text-[#050505]">{activity.title}</p>
                      <p className="text-sm text-neutral-500">{activity.meta}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-black/10 px-4 py-8 text-sm text-neutral-500">
                    No recent live activity.
                  </div>
                )}
              </div>
            </article>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-3xl border border-black/5 bg-white p-6 shadow-lg shadow-black/5">
              <header className="flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-neutral-500">Agent queue</p>
                  <p className="text-lg text-neutral-700">Recent verification records</p>
                </div>
              </header>
              <div className="mt-4 divide-y divide-black/5">
                {agentQueue.length ? (
                  agentQueue.map((agent) => (
                    <div key={agent.id} className="flex items-center justify-between gap-4 py-4">
                      <div>
                        <p className="font-semibold text-[#050505]">{agent.name}</p>
                        <p className="text-sm text-neutral-500">{agent.phone}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-neutral-700">{agent.status}</p>
                        <p className="text-xs text-neutral-500">{agent.submittedAt}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-sm text-neutral-500">No live agent records to show.</div>
                )}
              </div>
            </article>
          </section>
        </>
      )}
    </AdminLayout>
  );
}
