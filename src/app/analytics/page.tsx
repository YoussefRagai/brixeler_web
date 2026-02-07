import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { analyticsSummary } from "@/data/mock";
import { buildAdminUi } from "@/lib/adminUi";

export default async function AnalyticsPage() {
  const ui = await buildAdminUi(["super_admin"]);
  return (
    <AdminLayout
      title="Performance intelligence"
      description="Funnel, revenue, and activation KPIs with export-ready decks."
      actions={
        <button className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900">
          Download PDF
        </button>
      }
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <>
          <section className="grid gap-6 lg:grid-cols-3">
        {analyticsSummary.map((panel) => (
          <article
            key={panel.title}
            className="rounded-3xl border border-white/5 bg-gradient-to-br from-slate-900/60 to-slate-900/10 p-6"
          >
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
              {panel.title}
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-300">
              {panel.points.map((point) => (
                <li key={point} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  {point}
                </li>
              ))}
            </ul>
          </article>
        ))}
          </section>

          <section className="rounded-3xl border border-white/5 bg-white/5 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
              Forecast
            </p>
            <p className="text-lg text-slate-300">
              Projected deal + revenue trajectory
            </p>
          </div>
          <div className="flex gap-3 text-sm">
            <button className="rounded-full border border-white/10 px-4 py-2 text-white/80">
              30d
            </button>
            <button className="rounded-full border border-emerald-400 px-4 py-2 text-emerald-200">
              12m
            </button>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Deal run rate
            </p>
            <p className="mt-3 text-3xl font-semibold text-white">
              +32% YoY
            </p>
            <p className="text-sm text-slate-400">Enroute to 2,000 deals</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Revenue run rate
            </p>
            <p className="mt-3 text-3xl font-semibold text-white">11.2M EGP</p>
            <p className="text-sm text-slate-400">+18% vs target</p>
          </div>
        </div>
          </section>
        </>
      )}
    </AdminLayout>
  );
}
