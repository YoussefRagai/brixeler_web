import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
import { supabaseServer } from "@/lib/supabaseServer";

type DataMode = "live" | "demo";

type OperationRow = {
  id: string;
  agent_id: string;
  stage: string;
  property_name: string | null;
  developer_name: string | null;
  status: string | null;
  sale_amount: string | null;
  client_name: string | null;
  client_phone: string | null;
  unit_code: string | null;
  created_at: string;
  updated_at: string;
  payment_reference: string | null;
  payment_proof_url: string | null;
  payment_amount: string | null;
  payment_amount_confirmed: boolean | null;
  payment_recorded_by: string | null;
  payment_recorded_at: string | null;
  payment_approved_by: string | null;
  payment_approved_at: string | null;
  is_demo: boolean;
  demo_batch: string | null;
  source_of_truth: string;
};

type OperationEvent = {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string;
  created_at: string;
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

const isSafePaymentProofReference = (value: string) =>
  /^https:\/\//i.test(value) || (value.startsWith("/") && !value.startsWith("//"));

const eventLabel = (eventType: string, status: string) => {
  if (eventType.endsWith("payment_evidence_recorded")) return "Payment evidence recorded";
  if (eventType.endsWith("paid")) return "Payment approved and marked paid";
  if (eventType.endsWith("change_requested")) return "Changes requested";
  if (eventType.endsWith("rejected")) return "Claim rejected";
  if (eventType.endsWith("accepted")) return "Claim accepted for processing";
  if (eventType.endsWith("reviewed")) return "Claim placed under review";
  return status;
};

async function loadDeal(id: string, mode: DataMode) {
  const { data: operation, error } = await supabaseServer
    .from("workspace_operations")
    .select(
      "id, agent_id, stage, property_name, developer_name, status, sale_amount, client_name, client_phone, unit_code, created_at, updated_at, payment_reference, payment_proof_url, payment_amount, payment_amount_confirmed, payment_recorded_by, payment_recorded_at, payment_approved_by, payment_approved_at, is_demo, demo_batch, source_of_truth",
    )
    .eq("id", id)
    .eq("is_demo", mode === "demo")
    .maybeSingle();

  if (error || !operation) return null;
  const row = operation as OperationRow;
  const [{ data: agent }, { data: events }] = await Promise.all([
    row.agent_id
      ? supabaseServer.from("users_profile").select("display_name").eq("id", row.agent_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseServer
      .from("deal_operation_outbox")
      .select("id, event_type, from_status, to_status, created_at")
      .eq("deal_stage_entry_id", row.id)
      .order("created_at", { ascending: true }),
  ]);

  const timeline = [
    { label: "Submitted", meta: formatTimestamp(row.created_at), done: true },
    ...((events ?? []) as OperationEvent[]).map((event) => ({
      label: eventLabel(event.event_type, event.to_status),
      meta: `${formatTimestamp(event.created_at)}${event.from_status ? ` · ${event.from_status} → ${event.to_status}` : ` · ${event.to_status}`}`,
      done: true,
    })),
  ];

  return {
    id: row.id,
    property: row.property_name ?? "Deal stage",
    developer: row.developer_name ?? "—",
    agent: agent?.display_name ?? row.agent_id ?? "—",
    stage: row.stage,
    status: row.status ?? "Submitted",
    amount: formatCurrency(row.sale_amount),
    clientName: row.client_name ?? "—",
    clientPhone: row.client_phone ?? "—",
    unitCode: row.unit_code ?? "—",
    updated: formatTimestamp(row.updated_at),
    isDemo: row.is_demo,
    demoBatch: row.demo_batch,
    sourceOfTruth: row.source_of_truth,
    paymentReference: row.payment_reference,
    paymentProofUrl: row.payment_proof_url,
    paymentAmount: row.payment_amount,
    paymentAmountConfirmed: Boolean(row.payment_amount_confirmed),
    paymentRecordedAt: row.payment_recorded_at,
    paymentApprovedAt: row.payment_approved_at,
    timeline,
  };
}

export default async function DealDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Promise<{ mode?: string }>;
}) {
  const ui = await buildAdminUi(["deals_admin"]);
  const mode = normalizeMode((await searchParams)?.mode);
  const deal = await loadDeal(params.id, mode);
  if (!deal) return notFound();

  return (
    <AdminLayout
      title={`Deal ${deal.id}`}
      description={`${deal.stage} · ${deal.agent} · ${deal.amount}`}
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div aria-label="Deal detail data mode" className="flex flex-wrap gap-2">
            {(["live", "demo"] as const).map((option) => (
              <Link
                key={option}
                href={`/deals/${deal.id}?mode=${option}`}
                aria-current={mode === option ? "page" : undefined}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
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
          <Link
            href={`/deals?mode=${mode}`}
            className="rounded-full border border-black/10 bg-white px-5 py-2 text-sm text-neutral-700 hover:bg-black/5"
          >
            Back to queue
          </Link>
        </div>
      }
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <>
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3" aria-label="Selected deal detail data mode">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{deal.isDemo ? "Demo deal operation" : "Live deal operation"}</p>
              <p className="mt-1 text-sm text-neutral-600">Source of truth: {deal.sourceOfTruth}{deal.demoBatch ? ` · batch ${deal.demoBatch}` : ""}</p>
            </div>
            <Link href={`/deals?mode=${mode}`} className="text-sm font-semibold text-neutral-900 underline-offset-4 hover:underline">Return to deal room</Link>
          </section>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <article className="rounded-3xl border border-black/5 bg-white p-6 shadow-lg shadow-black/5">
              <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Deal summary</p>
              <p className="mt-2 text-2xl font-semibold text-[#050505]">{deal.property}</p>
              <p className="text-neutral-500">{deal.developer}</p>
              <dl className="mt-5 grid gap-3 text-sm text-neutral-700 sm:grid-cols-2">
                <div><dt className="text-xs text-neutral-500">Agent</dt><dd>{deal.agent}</dd></div>
                <div><dt className="text-xs text-neutral-500">Status</dt><dd className="font-semibold text-emerald-700">{deal.status}</dd></div>
                <div><dt className="text-xs text-neutral-500">Amount</dt><dd>{deal.amount}</dd></div>
                <div><dt className="text-xs text-neutral-500">Unit</dt><dd>{deal.unitCode}</dd></div>
                <div><dt className="text-xs text-neutral-500">Client</dt><dd>{deal.clientName}</dd></div>
                <div><dt className="text-xs text-neutral-500">Client phone</dt><dd>{deal.clientPhone}</dd></div>
                <div><dt className="text-xs text-neutral-500">Last update</dt><dd>{deal.updated}</dd></div>
              </dl>
            </article>

            <article className="rounded-3xl border border-black/5 bg-white p-6 shadow-lg shadow-black/5">
              <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Timeline</p>
              <div className="mt-4 space-y-3">
                {deal.timeline.map((step, index) => (
                  <div key={`${step.label}-${index}`} className="flex items-start gap-3">
                    <span className={`mt-1 h-3 w-3 shrink-0 rounded-full border ${step.done ? "border-emerald-600 bg-emerald-600" : "border-black/20"}`} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900">{step.label}</p>
                      <p className="text-xs text-neutral-500">{step.meta}</p>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>

          {deal.paymentReference || deal.paymentProofUrl ? (
            <section className="rounded-3xl border border-blue-200 bg-blue-50 p-6 text-blue-950" aria-label="Payment evidence">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-900">Payment evidence</p>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><dt className="text-xs text-blue-800">Reference</dt><dd>{deal.paymentReference ?? "—"}</dd></div>
                <div><dt className="text-xs text-blue-800">Amount</dt><dd>{formatCurrency(deal.paymentAmount)}</dd></div>
                <div><dt className="text-xs text-blue-800">Recorded</dt><dd>{formatTimestamp(deal.paymentRecordedAt)}</dd></div>
                <div><dt className="text-xs text-blue-800">Independent approval</dt><dd>{formatTimestamp(deal.paymentApprovedAt)}</dd></div>
              </dl>
              {deal.paymentProofUrl && isSafePaymentProofReference(deal.paymentProofUrl) ? <a href={deal.paymentProofUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-full border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-100">Open proof reference</a> : deal.paymentProofUrl ? <p className="mt-4 text-sm">Proof reference: <span className="break-all">{deal.paymentProofUrl}</span></p> : null}
              <p className="mt-3 text-xs text-blue-800">Amount confirmation: {deal.paymentAmountConfirmed ? "confirmed" : "not confirmed"}. Payment cannot be marked Paid until a different active administrator approves it.</p>
            </section>
          ) : null}
        </>
      )}
    </AdminLayout>
  );
}
