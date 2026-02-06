import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/AdminLayout";
import { dealRows } from "@/data/mock";

export default function DealDetailPage({ params }: { params: { id: string } }) {
  const deal = dealRows.find((row) => row.id === params.id);
  if (!deal) return notFound();

  const timeline = [
    { label: "Submitted", meta: "Agent uploaded docs", done: true },
    { label: "Under review", meta: "Ops verifying KYC", done: deal.status !== "Submitted" },
    { label: "Negotiation", meta: "Developer feedback", done: deal.status === "Negotiating" || deal.status === "Awaiting payment" || deal.status === "Paid" },
    { label: "Approved", meta: "Deal confirmed", done: deal.status === "Awaiting payment" || deal.status === "Paid" },
    { label: "Paid", meta: "Commission released", done: deal.status === "Paid" },
  ];

  return (
    <AdminLayout
      title={`Deal ${deal.id}`}
      description={`Agent ${deal.agent} • ${deal.amount}`}
      actions={
        <Link
          href="/deals"
          className="rounded-full border border-white/10 px-5 py-2 text-sm text-white/80 hover:bg-white/10"
        >
          Back to queue
        </Link>
      }
    >
      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-3xl border border-white/5 bg-white/5 p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
            Deal summary
          </p>
          <p className="mt-2 text-2xl font-semibold text-white">{deal.property}</p>
          <p className="text-slate-400">{deal.agent}</p>
          <div className="mt-4 space-y-2 text-sm text-slate-300">
            <p>Status: <span className="text-emerald-300">{deal.status}</span></p>
            <p>Amount: {deal.amount}</p>
            <p>Last update: {deal.updated}</p>
          </div>
        </article>
        <article className="rounded-3xl border border-white/5 bg-white/5 p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
            Timeline
          </p>
          <div className="mt-4 space-y-3">
            {timeline.map((step) => (
              <div key={step.label} className="flex items-center gap-3">
                <span
                  className={`h-3 w-3 rounded-full border ${step.done ? "border-emerald-300 bg-emerald-300" : "border-white/20"}`}
                />
                <div>
                  <p className="text-sm text-white">{step.label}</p>
                  <p className="text-xs text-slate-500">{step.meta}</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </AdminLayout>
  );
}
