import { AdminLayout } from "@/components/AdminLayout";
import { SalesClaimsQueue } from "@/components/SalesClaimsQueue";
import { fetchSalesClaims } from "@/lib/adminDeals";

export default async function DealsPage() {
  const salesClaims = await fetchSalesClaims();
  const statusBuckets = [
    { label: "Under Review", count: salesClaims.filter((claim) => claim.status === "Under Review").length },
    {
      label: "Accepted - Processing",
      count: salesClaims.filter((claim) => claim.status === "Accepted - Processing").length,
    },
    { label: "Paid", count: salesClaims.filter((claim) => claim.status === "Paid").length },
  ];
  return (
    <AdminLayout
      title="Deal room"
      description="Realtime snapshot from submission to payout with SLA tracking."
      actions={
        <button className="rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-emerald-950">
          New admin task
        </button>
      }
    >
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {statusBuckets.map((status) => (
          <article
            key={status.label}
            className="rounded-2xl border border-white/5 bg-white/5 p-4 text-center"
          >
            <p className="text-sm text-slate-400">{status.label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {status.count}
            </p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        {["Negotiation queue", "Awaiting payment"].map((column, idx) => (
          <article
            key={column}
            className="rounded-3xl border border-white/5 bg-white/5 p-6"
          >
            <header className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  {column}
                </p>
                <p className="text-lg text-slate-300">
                  {idx === 0
                    ? "Deals waiting for developer decisions"
                    : "Approved deals clearing payouts"}
                </p>
              </div>
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">
                {idx === 0 ? "SLA 24h" : "SLA 72h"}
              </span>
            </header>
            <div className="space-y-4">
              {salesClaims.slice(0, 4).map((claim) => (
                <div
                  key={`${column}-${claim.id}`}
                  className="rounded-2xl border border-white/5 bg-black/20 p-4 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-white">{claim.propertyName}</p>
                    <p className="text-xs text-slate-400">{claim.id}</p>
                  </div>
                  <p className="text-slate-400">
                    {claim.agentName} · {claim.saleAmount ?? "—"}
                  </p>
                  <p className="text-xs text-emerald-300">{claim.status}</p>
                </div>
              ))}
              {!salesClaims.length && (
                <p className="text-sm text-slate-400">No sales claims yet.</p>
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-white/5 bg-white/5 p-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Sales claim queue
            </p>
            <p className="text-lg text-slate-300">
              Full queue with quick actions
            </p>
          </div>
          <div className="flex gap-3 text-sm">
            <button className="rounded-full border border-white/10 px-4 py-2 text-white/80">
              Filters
            </button>
            <button className="rounded-full border border-emerald-400 px-4 py-2 text-emerald-200">
              Assign reviewer
            </button>
          </div>
        </header>
        <SalesClaimsQueue claims={salesClaims} />
      </section>
    </AdminLayout>
  );
}
