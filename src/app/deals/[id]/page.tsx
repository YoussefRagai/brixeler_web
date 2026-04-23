import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
import { supabaseServer } from "@/lib/supabaseServer";

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

async function loadDeal(id: string) {
  const { data: deal } = await supabaseServer
    .from("deals")
    .select("id, property_name, agent_id, status, sale_amount, submitted_at, reviewed_at, approved_at, paid_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (!deal) return null;

  const { data: agent } = deal.agent_id
    ? await supabaseServer.from("users_profile").select("display_name").eq("id", deal.agent_id).maybeSingle()
    : { data: null };

  const status = deal.status ?? "submitted";
  const timeline = [
    { label: "Submitted", meta: formatTimestamp(deal.submitted_at), done: true },
    { label: "Reviewed", meta: formatTimestamp(deal.reviewed_at), done: Boolean(deal.reviewed_at) || status !== "submitted" },
    { label: "Approved", meta: formatTimestamp(deal.approved_at), done: Boolean(deal.approved_at) || ["approved", "confirmed", "paid"].includes(status) },
    { label: "Paid", meta: formatTimestamp(deal.paid_at), done: Boolean(deal.paid_at) || status === "paid" },
  ];

  return {
    id: deal.id,
    property: deal.property_name ?? "Deal",
    agent: agent?.display_name ?? deal.agent_id ?? "—",
    status,
    amount: formatCurrency(deal.sale_amount),
    updated: formatTimestamp(deal.updated_at),
    timeline,
  };
}

export default async function DealDetailPage({ params }: { params: { id: string } }) {
  const ui = await buildAdminUi(["deals_admin"]);
  const deal = await loadDeal(params.id);
  if (!deal) return notFound();

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
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/5 bg-white/5 p-6">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Deal summary</p>
            <p className="mt-2 text-2xl font-semibold text-white">{deal.property}</p>
            <p className="text-slate-400">{deal.agent}</p>
            <div className="mt-4 space-y-2 text-sm text-slate-300">
              <p>
                Status: <span className="text-emerald-300">{deal.status}</span>
              </p>
              <p>Amount: {deal.amount}</p>
              <p>Last update: {deal.updated}</p>
            </div>
          </article>
          <article className="rounded-3xl border border-white/5 bg-white/5 p-6">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Timeline</p>
            <div className="mt-4 space-y-3">
              {deal.timeline.map((step) => (
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
      )}
    </AdminLayout>
  );
}
