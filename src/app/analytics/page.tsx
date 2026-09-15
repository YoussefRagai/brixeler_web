import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
import { supabaseServer } from "@/lib/supabaseServer";
import { PrintButton } from "@/components/PrintButton";
import { summarizeGiftGrowthMetrics } from "@/lib/growthAnalytics";
import { readReportRows } from "@/lib/reportRows";

const formatCurrency = (value: number) =>
  value.toLocaleString("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  });

async function loadAnalytics(dateFrom?: string, dateTo?: string) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  let dealsQuery = supabaseServer
    .from("workspace_operations")
    .select("status, sale_amount, created_at, payment_approved_at")
    .eq("stage", "SalesClaim")
    .order("created_at", { ascending: false }).order("id");
  if (dateFrom) dealsQuery = dealsQuery.gte("created_at", new Date(`${dateFrom}T00:00:00Z`).toISOString());
  if (dateTo) dealsQuery = dealsQuery.lte("created_at", new Date(`${dateTo}T23:59:59.999Z`).toISOString());
  const eligibilityQuery = supabaseServer
    .from("gift_eligibilities")
    .select("status, eligible_at")
    .in("status", ["eligible", "claimed"]);
  const claimsQuery = supabaseServer
    .from("gift_claims")
    .select("status, claimed_at, updated_at")
    .in("status", ["pending", "approved", "fulfilled"]);
  const badgesQuery = supabaseServer
    .from("agent_badges")
    .select("unlocked_at");
  const tiersQuery = supabaseServer
    .from("user_tiers")
    .select("awarded_at");
  const notificationsQuery = supabaseServer
    .from("notifications")
    .select("is_read, created_at")
    .eq("type", "admin_message");
  if (dateFrom) {
    const from = new Date(`${dateFrom}T00:00:00`).toISOString();
    eligibilityQuery.gte("eligible_at", from);
    claimsQuery.gte("claimed_at", from);
    badgesQuery.gte("unlocked_at", from);
    tiersQuery.gte("awarded_at", from);
    notificationsQuery.gte("created_at", from);
  }
  if (dateTo) {
    const to = new Date(`${dateTo}T23:59:59`).toISOString();
    eligibilityQuery.lte("eligible_at", to);
    claimsQuery.lte("claimed_at", to);
    badgesQuery.lte("unlocked_at", to);
    tiersQuery.lte("awarded_at", to);
    notificationsQuery.lte("created_at", to);
  }
  const [
    { data: deals, error: dealsError },
    { count: approvedListings },
    { count: pendingListings },
    { data: profiles },
    { data: giftEligibilities },
    { data: giftClaims },
    { data: badgeAwards },
    { data: tierAwards },
    { data: growthNotifications },
  ] =
    await Promise.all([
      readReportRows(dealsQuery).then(data => ({ data, error: null })),
      supabaseServer
        .from("properties")
        .select("*", { count: "exact", head: true })
        .eq("approval_status", "approved"),
      supabaseServer
        .from("properties")
        .select("*", { count: "exact", head: true })
        .eq("approval_status", "pending"),
      supabaseServer.from("users_profile").select("total_referrals, verified_referrals, referrals_with_first_deal"),
      eligibilityQuery,
      claimsQuery,
      badgesQuery,
      tiersQuery,
      notificationsQuery,
    ]);

  if (dealsError) throw dealsError;
  const dealRows = deals ?? [];
  const totalDeals = dealRows.length;
  const paidDeals = dealRows.filter((deal) => deal.status === "Paid").length;
  const submittedDeals = dealRows.filter((deal) => deal.status === "Submitted").length;
  const totalRevenue = dealRows.filter((deal) => !["Paid", "Rejected"].includes(deal.status)).reduce((sum, deal) => sum + (Number.isFinite(Number(deal.sale_amount)) ? Number(deal.sale_amount) : 0), 0);
  const paidRevenue = dealRows
    .filter((deal) => deal.status === "Paid")
    .reduce((sum, deal) => sum + (Number.isFinite(Number(deal.sale_amount)) ? Number(deal.sale_amount) : 0), 0);

  const referralTotals = (profiles ?? []).reduce(
    (acc, profile) => {
      acc.total += Number(profile.total_referrals ?? 0);
      acc.verified += Number(profile.verified_referrals ?? 0);
      acc.converted += Number(profile.referrals_with_first_deal ?? 0);
      return acc;
    },
    { total: 0, verified: 0, converted: 0 },
  );

  const { eligibleCount, claimedCount, approvedCount, fulfilledCount, claimRate, fulfillmentRate } = summarizeGiftGrowthMetrics(
    giftEligibilities ?? [],
    giftClaims ?? [],
  );
  const notificationRows = growthNotifications ?? [];
  const readNotifications = notificationRows.filter((notification) => notification.is_read).length;

  return {
    cards: [
      {
        title: "Sales claim health",
        points: [
          `${totalDeals} sales claim entries`,
          `${submittedDeals} still submitted`,
          `${paidDeals} fully paid`,
        ],
      },
      {
        title: "Sales claim value",
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
    rates: {
      paidDealRate: totalDeals ? Math.round((paidDeals / totalDeals) * 100) : 0,
      pendingListingRate:
        (approvedListings ?? 0) + (pendingListings ?? 0)
          ? Math.round(((pendingListings ?? 0) / ((approvedListings ?? 0) + (pendingListings ?? 0))) * 100)
          : 0,
      verifiedReferralRate: referralTotals.total
        ? Math.round((referralTotals.verified / referralTotals.total) * 100)
        : 0,
      referralConversionRate: referralTotals.verified
        ? Math.round((referralTotals.converted / referralTotals.verified) * 100)
        : 0,
    },
    growth: {
      eligible: eligibleCount,
      claimed: claimedCount,
      approved: approvedCount,
      fulfilled: fulfilledCount,
      badgesAwarded: (badgeAwards ?? []).length,
      tierMoves: (tierAwards ?? []).length,
      notificationsSent: notificationRows.length,
      notificationsRead: readNotifications,
      claimRate,
      fulfillmentRate,
      notificationReadRate: notificationRows.length
        ? Math.round((readNotifications / notificationRows.length) * 100)
        : 0,
    },
  };
}

export default async function AnalyticsPage({ searchParams }: { searchParams?: Promise<{ from?: string; to?: string }> }) {
  const ui = await buildAdminUi(["super_admin"]);
  const params = (await searchParams) ?? {};
  const analytics = await loadAnalytics(params.from, params.to);

  return (
    <AdminLayout
      title="Performance intelligence"
      description="Funnel, revenue, and activation KPIs with export-ready decks."
      actions={
        <div className="flex gap-2">
          <a href="/api/admin/exports/download?type=dashboard&format=xlsx" className="rounded-full border border-black/15 bg-white px-5 py-2 text-sm font-semibold text-neutral-800 transition-colors hover:border-black/35 hover:bg-neutral-50">Export XLSX</a>
          <PrintButton className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800" />
        </div>
      }
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <>
          <form className="flex flex-wrap items-end gap-3 rounded-3xl border border-black/5 bg-white p-4 shadow-sm">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">From<input name="from" type="date" defaultValue={params.from} className="mt-1 block min-h-11 rounded-xl border border-black/10 bg-neutral-50 px-3 py-2 text-sm text-neutral-900"/></label>
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">To<input name="to" type="date" defaultValue={params.to} className="mt-1 block min-h-11 rounded-xl border border-black/10 bg-neutral-50 px-3 py-2 text-sm text-neutral-900"/></label>
            <button className="min-h-11 rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800" type="submit">Apply range</button>
            <a href="/analytics" className="min-h-11 rounded-full border border-black/10 px-4 py-2 text-sm leading-7 text-neutral-700 transition-colors hover:border-black/30 hover:text-black">Clear</a>
          </form>
          <section className="grid gap-6 lg:grid-cols-3">
            {(analytics?.cards ?? []).length ? (
              analytics?.cards.map((panel) => (
                <article
                  key={panel.title}
                  className="rounded-3xl border border-black/5 bg-white p-6 shadow-sm"
                >
                  <p className="text-sm font-semibold uppercase tracking-[0.3em] text-neutral-500">{panel.title}</p>
                  <ul className="mt-4 space-y-3 text-sm text-neutral-700">
                    {panel.points.map((point) => (
                      <li key={point} className="flex items-center gap-2">
                        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </article>
              ))
            ) : (
              <article className="rounded-3xl border border-black/5 bg-white p-6 text-sm text-neutral-600 shadow-sm lg:col-span-3">
                Analytics are unavailable until the live database is configured.
              </article>
            )}
          </section>

          <section className="rounded-3xl border border-black/5 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-neutral-500">Forecast</p>
                <p className="text-lg text-neutral-800">Current filtered performance snapshot</p>
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-black/5 bg-neutral-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">Deal run rate</p>
                <p className="dashboard-number mt-3 text-3xl font-semibold text-neutral-950">
                  {analytics ? analytics.forecast.dealRunRate.toLocaleString("en-EG") : "—"}
                </p>
                <p className="text-sm text-neutral-600">Deals submitted in the selected period</p>
              </div>
              <div className="rounded-2xl border border-black/5 bg-neutral-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">Revenue run rate</p>
                <p className="dashboard-number mt-3 text-3xl font-semibold text-neutral-950">
                  {analytics ? formatCurrency(analytics.forecast.revenueRunRate) : "—"}
                </p>
                <p className="text-sm text-neutral-600">Pipeline value submitted in the selected period</p>
              </div>
              <div className="rounded-2xl border border-black/5 bg-neutral-50 p-4 md:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">Referral funnel</p>
                <p className="mt-3 text-lg font-semibold text-neutral-950">
                  {analytics
                    ? `${analytics.forecast.referrals.total} total · ${analytics.forecast.referrals.verified} verified · ${analytics.forecast.referrals.converted} with first deal`
                    : "—"}
                </p>
                {analytics ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <RateBar label="Paid deal completion" value={analytics.rates.paidDealRate} />
                    <RateBar label="Verified referrals" value={analytics.rates.verifiedReferralRate} />
                    <RateBar label="Referral → first deal" value={analytics.rates.referralConversionRate} />
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-black/5 bg-white p-6 shadow-sm" aria-labelledby="growth-funnel-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">Growth impact</p>
                <h2 id="growth-funnel-title" className="mt-1 text-xl font-semibold text-neutral-950">Rewards and communication funnel</h2>
                <p className="mt-1 text-sm text-neutral-500">The same date range is applied to eligibility, claims, awards, and admin messages.</p>
              </div>
              <a href="/gifts/claims" className="min-h-11 rounded-full border border-black/10 px-4 py-2 text-sm font-semibold leading-7 text-neutral-700 hover:border-black/30 hover:text-black">Review fulfillment</a>
            </div>
            {analytics ? (
              <>
                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Eligible", analytics.growth.eligible],
                    ["Claimed", analytics.growth.claimed],
                    ["Approved", analytics.growth.approved],
                    ["Fulfilled", analytics.growth.fulfilled],
                  ].map(([label, value]) => (
                    <article key={String(label)} className="rounded-2xl border border-black/5 bg-neutral-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">{label}</p>
                      <p className="dashboard-number mt-2 text-3xl font-semibold text-neutral-950">{Number(value).toLocaleString("en-EG")}</p>
                    </article>
                  ))}
                </div>
                <div className="mt-6 grid gap-5 lg:grid-cols-2">
                  <div className="rounded-2xl border border-black/5 p-4">
                    <p className="text-sm font-semibold text-neutral-900">Conversion</p>
                    <div className="mt-4 space-y-4">
                      <RateBar label="Eligible → claimed" value={analytics.growth.claimRate} />
                      <RateBar label="Claimed → fulfilled" value={analytics.growth.fulfillmentRate} />
                      <RateBar label="Admin messages read" value={analytics.growth.notificationReadRate} />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <GrowthCount label="Badges awarded" value={analytics.growth.badgesAwarded} />
                    <GrowthCount label="Tier movements" value={analytics.growth.tierMoves} />
                    <GrowthCount label="Messages sent" value={analytics.growth.notificationsSent} />
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-6 text-sm text-neutral-500">Growth analytics are unavailable until the live database is configured.</p>
            )}
          </section>
        </>
      )}
    </AdminLayout>
  );
}

function GrowthCount({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-2xl border border-black/5 bg-neutral-50 p-4">
      <p className="dashboard-number text-2xl font-semibold text-neutral-950">{value.toLocaleString("en-EG")}</p>
      <p className="mt-1 text-xs text-neutral-600">{label}</p>
    </article>
  );
}

function RateBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs text-neutral-600">
        <span>{label}</span>
        <span className="dashboard-number font-semibold text-neutral-900">{value}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-200" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <div className="h-full rounded-full bg-black transition-[width] duration-300" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
