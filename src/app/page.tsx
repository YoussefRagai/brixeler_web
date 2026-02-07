import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import {
  agentRows,
  dealRows,
  overviewMetrics,
  recentActivity,
} from "@/data/mock";
import { buildAdminUi } from "@/lib/adminUi";
import { supabaseServer } from "@/lib/supabaseServer";

async function loadMetrics() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return overviewMetrics;
  }

  try {
    const [{ count: dealsCount }, { count: agentsCount }] = await Promise.all([
      supabaseServer.from("deals").select("*", { count: "exact", head: true }),
      supabaseServer.from("users_profile").select("*", { count: "exact", head: true }),
    ]);

    return [
      { label: "Deals", value: dealsCount ?? "—", trend: "Live" },
      { label: "Agents", value: agentsCount ?? "—", trend: "Verified" },
      overviewMetrics[2],
      overviewMetrics[3],
    ];
  } catch (error) {
    console.warn("Failed to load Supabase metrics", error);
    return overviewMetrics;
  }
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
  const metrics = await loadMetrics();
  return (
    <AdminLayout
      title="Mission control"
      description="Live telemetry covering onboarding, deals, payouts, and sentiment."
      actions={
        <button className="rounded-full border border-white/10 px-5 py-2 text-sm text-white transition hover:bg-white/10">
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
            className="rounded-3xl border border-white/5 bg-white/5 p-5 backdrop-blur"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              {metric.label}
            </p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {metric.value}
            </p>
            <p className="text-sm text-emerald-400">{metric.trend}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <article className="rounded-3xl border border-white/5 bg-gradient-to-br from-slate-900/60 to-slate-900/20 p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
                Deal velocity
              </p>
              <p className="text-lg text-slate-300">
                Submitted → Paid conversion
              </p>
            </div>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">
              Rolling 30d
            </span>
          </header>
          <div className="mt-6 flex flex-col gap-4">
            {dealRows.map((deal) => (
              <div
                key={deal.id}
                className="rounded-2xl border border-white/5 bg-white/5 p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-white">{deal.property}</p>
                    <p className="text-sm text-slate-400">
                      {deal.agent} · {deal.id}
                    </p>
                  </div>
                  <p className="text-emerald-300">{deal.status}</p>
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  {deal.amount} • Last activity {deal.updated}
                </p>
              </div>
            ))}
          </div>
        </article>
        <article className="rounded-3xl border border-white/5 bg-white/5 p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
                Activity feed
              </p>
              <p className="text-lg text-slate-300">Live operational log</p>
            </div>
            <button className="text-sm text-slate-300 underline-offset-4 hover:underline">
              View log
            </button>
          </header>
          <div className="mt-6 space-y-4">
            {recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="rounded-2xl border border-white/5 bg-black/20 p-4"
              >
                <p className="text-sm font-medium text-white">
                  {activity.title}
                </p>
                <p className="text-xs text-slate-400">{activity.meta}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-white/5 bg-white/5 p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
                Agent queue
              </p>
              <p className="text-lg text-slate-300">
                Verification + health signals
              </p>
            </div>
            <button className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/10">
              View queue
            </button>
          </header>
          <div className="mt-4 divide-y divide-white/5">
            {agentRows.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center justify-between py-4 text-sm"
              >
                <div>
                  <p className="font-medium text-white">{agent.name}</p>
                  <p className="text-slate-400">{agent.phone}</p>
                </div>
                <div className="text-right">
                  <p>{agent.deals} deals</p>
                  <p className="text-slate-400">{agent.status}</p>
                </div>
              </div>
            ))}
          </div>
        </article>
        <article className="rounded-3xl border border-white/5 bg-white/5 p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
                Support signals
              </p>
              <p className="text-lg text-slate-300">Tickets & escalations</p>
            </div>
            <span className="rounded-full bg-rose-500/20 px-3 py-1 text-xs text-rose-200">
              7 urgent
            </span>
          </header>
          <ul className="mt-4 space-y-3 text-sm text-slate-300">
            <li className="rounded-2xl border border-white/5 bg-black/20 p-4">
              <p className="font-medium text-white">
                Payout delay - Batch 188 escalation
              </p>
              <p className="text-xs text-slate-400">Finance • 17m waiting</p>
            </li>
            <li className="rounded-2xl border border-white/5 bg-black/20 p-4">
              <p className="font-medium text-white">
                OCR mismatch on Palm Gardens contract
              </p>
              <p className="text-xs text-slate-400">Ops • assigned to Laila</p>
            </li>
          </ul>
        </article>
      </section>
        </>
      )}
    </AdminLayout>
  );
}
