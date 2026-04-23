import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
import { supabaseServer } from "@/lib/supabaseServer";

const formatCurrency = (value: number) =>
  value.toLocaleString("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  });

async function loadAnalytics() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  const [{ data: deals }, { count: approvedListings }, { count: pendingListings }, { data: profiles }] =
    await Promise.all([
      supabaseServer
        .from("deals")
        .select("status, sale_amount, submitted_at, paid_at")
        .order("submitted_at", { ascending: false })
        .limit(1000),
      supabaseServer
        .from("properties")
        .select("*", { count: "exact", head: true })
        .eq("approval_status", "approved"),
      supabaseServer
        .from("properties")
        .select("*", { count: "exact", head: true })
        .eq("approval_status", "pending"),
      supabaseServer.from("users_profile").select("total_referrals, verified_referrals, referrals_with_first_deal"),
    ]);

  const dealRows = deals ?? [];
  const totalDeals = dealRows.length;
  const paidDeals = dealRows.filter((deal) => deal.status === "paid").length;
  const submittedDeals = dealRows.filter((deal) => deal.status === "submitted").length;
  const totalRevenue = dealRows.reduce((sum, deal) => sum + Number(deal.sale_amount ?? 0), 0);
  const paidRevenue = dealRows
    .filter((deal) => deal.status === "paid")
    .reduce((sum, deal) => sum + Number(deal.sale_amount ?? 0), 0);

  const referralTotals = (profiles ?? []).reduce(
    (acc, profile) => {
      acc.total += Number(profile.total_referrals ?? 0);
      acc.verified += Number(profile.verified_referrals ?? 0);
      acc.converted += Number(profile.referrals_with_first_deal ?? 0);
      return acc;
    },
    { total: 0, verified: 0, converted: 0 },
  );

  return {
    cards: [
      {
        title: "Deal health",
        points: [
          `${totalDeals} total deals`,
          `${submittedDeals} still submitted`,
          `${paidDeals} fully paid`,
        ],
      },
      {
        title: "Revenue",
        points: [
          `${formatCurrency(totalRevenue)} total pipeline`,
          `${formatCurrency(paidRevenue)} fully paid`,
          `${totalDeals ? Math.round((paidDeals / totalDeals) * 100) : 0}% paid completion`,
        ],
      },
      {
        title: "Listings",
        points: [
          `${approvedListings ?? 0} approved listings`,
          `${pendingListings ?? 0} pending review`,
          `${(approvedListings ?? 0) + (pendingListings ?? 0)} visible pipeline`,
        ],
      },
    ],
    forecast: {
      dealRunRate: totalDeals,
      revenueRunRate: totalRevenue,
      referrals: referralTotals,
    },
  };
}

export default async function AnalyticsPage() {
  const ui = await buildAdminUi(["super_admin"]);
  const analytics = await loadAnalytics();

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
            {(analytics?.cards ?? []).length ? (
              analytics?.cards.map((panel) => (
                <article
                  key={panel.title}
                  className="rounded-3xl border border-white/5 bg-gradient-to-br from-slate-900/60 to-slate-900/10 p-6"
                >
                  <p className="text-sm uppercase tracking-[0.3em] text-slate-500">{panel.title}</p>
                  <ul className="mt-4 space-y-2 text-sm text-slate-300">
                    {panel.points.map((point) => (
                      <li key={point} className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </article>
              ))
            ) : (
              <article className="rounded-3xl border border-white/5 bg-white/5 p-6 text-sm text-slate-300 lg:col-span-3">
                Analytics are unavailable until the live database is configured.
              </article>
            )}
          </section>

          <section className="rounded-3xl border border-white/5 bg-white/5 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Forecast</p>
                <p className="text-lg text-slate-300">Current live run-rate snapshot</p>
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Deal run rate</p>
                <p className="mt-3 text-3xl font-semibold text-white">
                  {analytics ? analytics.forecast.dealRunRate.toLocaleString("en-EG") : "—"}
                </p>
                <p className="text-sm text-slate-400">Live deals currently tracked</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Revenue run rate</p>
                <p className="mt-3 text-3xl font-semibold text-white">
                  {analytics ? formatCurrency(analytics.forecast.revenueRunRate) : "—"}
                </p>
                <p className="text-sm text-slate-400">Live total pipeline value</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 md:col-span-2">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Referral funnel</p>
                <p className="mt-3 text-lg font-semibold text-white">
                  {analytics
                    ? `${analytics.forecast.referrals.total} total · ${analytics.forecast.referrals.verified} verified · ${analytics.forecast.referrals.converted} with first deal`
                    : "—"}
                </p>
              </div>
            </div>
          </section>
        </>
      )}
    </AdminLayout>
  );
}
