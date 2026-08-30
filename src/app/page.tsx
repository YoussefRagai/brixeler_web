import Link from "next/link";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
import { supabaseServer } from "@/lib/supabaseServer";

type DataMode = "live" | "demo";

type MetricCard = {
  label: string;
  value: string | number;
  trend: string;
};

type RecentDeal = {
  id: string;
  property: string;
  agent: string;
  stage: string;
  status: string;
  amount: string;
  updated: string;
  isDemo: boolean;
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
  updatedAt: string;
};

type OperationRow = {
  id: string;
  agent_id: string;
  stage: string;
  property_name: string | null;
  status: string | null;
  sale_amount: string | null;
  updated_at: string | null;
  is_demo: boolean;
};

type MetricRow = {
  operation_count: number | null;
  active_agent_count: number | null;
  pending_verification_count: number | null;
  sales_claim_change_count: number | null;
  overdue_task_count: number | null;
};

const formatCurrency = (value?: number | string | null) => {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (numeric == null || Number.isNaN(numeric)) return "—";
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

const normalizeMode = (value?: string): DataMode => (value === "demo" ? "demo" : "live");

async function loadMissionControlData(mode: DataMode) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      mode,
      metrics: [
        { label: "Deals", value: "—", trend: "Unavailable" },
        { label: "Pipeline agents", value: "—", trend: "Unavailable" },
        { label: "Pending verification", value: "—", trend: "Unavailable" },
        { label: "Sales claim changes", value: "—", trend: "Unavailable" },
        { label: "Overdue tasks", value: "—", trend: "Unavailable" },
      ] as MetricCard[],
      recentDeals: [] as RecentDeal[],
      recentActivity: [] as ActivityItem[],
      agentQueue: [] as AgentQueueItem[],
    };
  }

  const modeFilter = mode === "demo";
  const [{ data: metricRows, error: metricsError }, { data: recentOperationsRaw }, { data: recentPropertiesRaw }] =
    await Promise.all([
      supabaseServer.rpc("workspace_operations_metrics", { p_mode: mode }),
      supabaseServer
        .from("workspace_operations")
        .select("id, agent_id, stage, property_name, status, sale_amount, updated_at, is_demo")
        .eq("is_demo", modeFilter)
        .order("updated_at", { ascending: false })
        .limit(8),
      (() => {
        const query = supabaseServer
          .from("properties")
          .select("id, property_name, approval_status, updated_at, is_demo")
          .eq("is_demo", modeFilter)
          .order("updated_at", { ascending: false })
          .limit(5);
        return query;
      })(),
    ]);

  const metric = (Array.isArray(metricRows) ? metricRows[0] : metricRows) as MetricRow | null;
  const operationRows = (recentOperationsRaw ?? []) as OperationRow[];
  const { data: agentQueueRaw } = await supabaseServer
    .from("users_profile")
    .select("id, display_name, phone, verification_status, account_status, updated_at")
    .eq("verification_status", "pending")
    .eq("account_status", "active")
    .order("updated_at", { ascending: false })
    .limit(6);

  if (metricsError) console.error("Failed to load workspace operation metrics", metricsError);
  const agentIds = [...new Set(operationRows.map((deal) => deal.agent_id).filter(Boolean))];
  const { data: agentNamesRaw } = agentIds.length
    ? await supabaseServer.from("users_profile").select("id, display_name").in("id", agentIds)
    : { data: [] };
  const agentNameMap = new Map((agentNamesRaw ?? []).map((row) => [row.id, row.display_name ?? "Agent"]));

  const recentDeals: RecentDeal[] = operationRows.map((operation) => ({
    id: operation.id,
    property: operation.property_name ?? "Deal stage",
    agent: agentNameMap.get(operation.agent_id) ?? operation.agent_id,
    stage: operation.stage,
    status: operation.status ?? "Submitted",
    amount: formatCurrency(operation.sale_amount),
    updated: formatTimestamp(operation.updated_at),
    isDemo: operation.is_demo,
  }));

  const recentActivity: ActivityItem[] = [
    ...operationRows.map((operation) => ({
      id: `operation-${operation.id}`,
      title: `${operation.property_name ?? "Deal stage"} · ${operation.stage} · ${operation.status ?? "updated"}`,
      meta: `Pipeline stage updated ${formatTimestamp(operation.updated_at)}`,
      updatedAt: new Date(operation.updated_at ?? 0).getTime() || 0,
    })),
    ...((recentPropertiesRaw ?? []).map((property) => ({
      id: `property-${property.id}`,
      title: `${property.property_name ?? "Property"} · ${property.approval_status ?? "pending"}`,
      meta: `Listing updated ${formatTimestamp(property.updated_at)}`,
      updatedAt: new Date(property.updated_at ?? 0).getTime() || 0,
    })) as ActivityItem[]),
  ]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8);

  const agentQueue: AgentQueueItem[] = ((agentQueueRaw ?? []) as Array<{
    id: string;
    display_name: string | null;
    phone: string | null;
    verification_status: string | null;
    updated_at: string | null;
  }>).map((agent) => ({
    id: agent.id,
    name: agent.display_name ?? "Agent",
    phone: agent.phone ?? "—",
    status: agent.verification_status ?? "pending",
    updatedAt: formatTimestamp(agent.updated_at),
  }));

  return {
    mode,
    metrics: [
      { label: "Deals", value: metric?.operation_count ?? "—", trend: mode === "demo" ? "Demo" : "Live" },
      { label: "Pipeline agents", value: metric?.active_agent_count ?? "—", trend: "Stage entries" },
      { label: "Pending verification", value: metric?.pending_verification_count ?? "—", trend: "Active only" },
      { label: "Sales claim changes", value: metric?.sales_claim_change_count ?? "—", trend: "Attention" },
      { label: "Overdue tasks", value: metric?.overdue_task_count ?? "—", trend: "SLA" },
    ] as MetricCard[],
    recentDeals,
    recentActivity,
    agentQueue,
  };
}

function ModeSwitch({ mode, href = "/" }: { mode: DataMode; href?: string }) {
  const query = (nextMode: DataMode) => `${href}${href.includes("?") ? "&" : "?"}mode=${nextMode}`;
  return (
    <div aria-label="Workspace data mode" className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Data</span>
      {(["live", "demo"] as const).map((option) => (
        <Link
          key={option}
          href={query(option)}
          aria-current={mode === option ? "page" : undefined}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
            mode === option
              ? option === "demo"
                ? "border-amber-700 bg-amber-700 text-white"
                : "border-neutral-900 bg-neutral-900 text-white"
              : "border-black/15 bg-white text-neutral-700 hover:bg-black/5"
          }`}
        >
          {option === "demo" ? "Demo" : "Live"}
        </Link>
      ))}
    </div>
  );
}

export default async function Home({ searchParams }: { searchParams?: Promise<{ mode?: string }> }) {
  const ui = await buildAdminUi([
    "super_admin",
    "user_auth_admin",
    "user_support_admin",
    "developers_admin",
    "listing_admin",
    "deals_admin",
    "marketing_admin",
  ]);
  const params = (await searchParams) ?? {};
  const mode = normalizeMode(params.mode);
  const { metrics, recentDeals, recentActivity, agentQueue } = await loadMissionControlData(mode);

  return (
    <AdminLayout
      title="Mission control"
      description="Operational pulse from the mobile deal-stage pipeline, agents, and listings."
      actions={
        <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
          <ModeSwitch mode={mode} />
          <a
            href={`/api/admin/exports/download?type=dashboard&format=xlsx&scope=${mode}`}
            className="rounded-full border border-black/15 bg-white px-5 py-2 text-sm font-medium text-neutral-700 transition hover:bg-black/5"
          >
            Export dashboard
          </a>
        </div>
      }
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <>
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3" aria-label="Selected workspace data mode">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{mode === "demo" ? "Demo workspace" : "Live workspace"}</p>
              <p className="mt-1 text-sm text-neutral-600">
                {mode === "demo" ? "Demo records are isolated from live operations." : "Live records only; demo records are excluded."}
              </p>
            </div>
            <ModeSwitch mode={mode} />
          </section>

          <section aria-label="Mission control metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {metrics.map((metric) => (
              <article key={metric.label} className="dashboard-kpi rounded-3xl border border-black/5 bg-white p-5 shadow-lg shadow-black/5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{metric.label}</p>
                  <span className="text-[11px] font-medium text-emerald-700">{metric.trend}</span>
                </div>
                <p className="dashboard-number mt-2 text-2xl font-semibold leading-none text-[#050505]">{metric.value}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,0.95fr)]">
            <article className="dashboard-panel rounded-3xl border border-black/5 bg-white p-6 shadow-lg shadow-black/5">
              <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Recent deal stages</p>
                  <p className="mt-1 text-sm text-neutral-600">Canonical mobile pipeline activity</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${mode === "demo" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>
                  {mode === "demo" ? "DEMO" : "LIVE"}
                </span>
              </header>
              <div className="mt-4 divide-y divide-black/5">
                {recentDeals.length ? (
                  recentDeals.map((deal) => (
                    <div key={deal.id} className="dashboard-list-row grid min-w-0 gap-2 py-3 sm:grid-cols-[minmax(0,1.3fr)_auto_auto] sm:items-center">
                      <div className="min-w-0">
                        <Link href={`/deals/${deal.id}?mode=${mode}`} className="block truncate text-sm font-semibold text-[#050505] underline-offset-4 hover:underline">
                          {deal.property}
                        </Link>
                        <p className="truncate text-xs text-neutral-500">{deal.agent} · {deal.stage}</p>
                      </div>
                      <p className="text-xs font-medium text-emerald-700 sm:text-right">{deal.status}</p>
                      <div className="text-xs text-neutral-500 sm:text-right">
                        <p>{deal.amount}</p>
                        <p>{deal.updated}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-black/10 px-4 py-6 text-sm text-neutral-500">No {mode} deal-stage activity to show.</div>
                )}
              </div>
            </article>

            <article className="dashboard-panel rounded-3xl border border-black/5 bg-white p-6 shadow-lg shadow-black/5">
              <header>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Activity feed</p>
                <p className="mt-1 text-sm text-neutral-600">Recent {mode} operational events</p>
              </header>
              <div className="mt-4 divide-y divide-black/5">
                {recentActivity.length ? (
                  recentActivity.map((activity) => (
                    <div key={activity.id} className="dashboard-list-row py-3">
                      <p className="truncate text-sm font-medium text-[#050505]">{activity.title}</p>
                      <p className="truncate text-xs text-neutral-500">{activity.meta}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-black/10 px-4 py-6 text-sm text-neutral-500">No {mode} activity.</div>
                )}
              </div>
            </article>
          </section>

          <section>
            <article className="dashboard-panel rounded-3xl border border-black/5 bg-white p-6 shadow-lg shadow-black/5">
              <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Pending agent queue</p>
        <p className="mt-1 text-sm text-neutral-600">Active agents with pending verification; suspended accounts are excluded</p>
                </div>
                <Link href="/verification" className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-neutral-700 underline-offset-4 hover:bg-black/5 hover:text-black hover:underline">Open queue</Link>
              </header>
              <div className="mt-3 divide-y divide-black/5 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:divide-y-0">
                {agentQueue.length ? (
                  agentQueue.map((agent) => (
                    <div key={agent.id} className="dashboard-list-row flex min-w-0 items-center justify-between gap-4 border-b border-black/5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#050505]">{agent.name}</p>
                        <p className="truncate text-xs text-neutral-500">{agent.phone}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-medium text-amber-800">{agent.status}</p>
                        <p className="text-xs text-neutral-500">Updated {agent.updatedAt}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-sm text-neutral-500">No pending active agents in this {mode} view.</div>
                )}
              </div>
            </article>
          </section>
        </>
      )}
    </AdminLayout>
  );
}
