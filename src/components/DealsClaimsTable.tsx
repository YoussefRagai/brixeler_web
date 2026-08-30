"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SalesClaimEntry } from "@/lib/adminDeals";

const BASE_TABS = ["Sales Claim", "Requested Change", "Rejected", "Awaiting Payment", "Archive"] as const;
type Tab = (typeof BASE_TABS)[number] | "History";
type FeedbackMode = "request_change" | "reject" | null;
type PaymentMode = "record" | "approve" | null;

const ARCHIVE_CUTOFF = Date.now() - 30 * 24 * 60 * 60 * 1000;

const formatCurrency = (amount?: string | number | null) => {
  if (amount == null || amount === "") return "—";
  const numeric = typeof amount === "string" ? Number(amount.replace(/,/g, "")) : amount;
  if (Number.isNaN(numeric)) return String(amount);
  return numeric.toLocaleString("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 });
};

const formatTimestamp = (iso?: string | null) => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
};

const formatIdentifier = (value?: string | null) => {
  if (!value) return "—";
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
};

const statusChipClass = (status?: string | null) => {
  if (status === "Change Requested") return "border-amber-300 bg-amber-100 text-amber-900";
  if (status === "Rejected") return "border-rose-300 bg-rose-100 text-rose-900";
  if (status === "Accepted - Processing") return "border-blue-300 bg-blue-100 text-blue-900";
  if (status === "Paid") return "border-emerald-300 bg-emerald-100 text-emerald-900";
  return "border-black/10 bg-white text-neutral-700";
};

type Props = {
  claims: SalesClaimEntry[];
  isSuperAdmin?: boolean;
};

export function DealsClaimsTable({ claims, isSuperAdmin = false }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("Sales Claim");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [slaFilter, setSlaFilter] = useState<"all" | "overdue">("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(null);
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentProofUrl, setPaymentProofUrl] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentAmountConfirmed, setPaymentAmountConfirmed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const owners = useMemo(() => {
    const byId = new Map<string, string>();
    claims.forEach((claim) => byId.set(claim.agentId, claim.agentName));
    return [...byId.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [claims]);

  const filteredClaims = useMemo(() => {
    const byTab = claims.filter((claim) => {
      if (activeTab === "Sales Claim") return !["Paid", "Accepted - Processing", "Change Requested", "Rejected"].includes(claim.status);
      if (activeTab === "Requested Change") return claim.status === "Change Requested";
      if (activeTab === "Rejected") return claim.status === "Rejected";
      if (activeTab === "Awaiting Payment") return claim.status === "Accepted - Processing";
      if (activeTab === "History") return true;
      return claim.status === "Paid" && new Date(claim.updatedAt).getTime() >= ARCHIVE_CUTOFF;
    });
    return byTab.filter((claim) => (ownerFilter === "all" || claim.agentId === ownerFilter) && (slaFilter === "all" || claim.isOverdue));
  }, [activeTab, claims, ownerFilter, slaFilter]);

  const closeFeedback = () => {
    setFeedbackId(null);
    setFeedbackMode(null);
    setFeedbackText("");
  };

  const closePayment = () => {
    setPaymentId(null);
    setPaymentMode(null);
    setPaymentReference("");
    setPaymentProofUrl("");
    setPaymentAmount("");
    setPaymentAmountConfirmed(false);
  };

  const setStatus = async (id: string, status: string) => {
    setPendingId(id);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/sales-claims/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Unable to update status." }));
        setErrorMessage(payload.error ?? "Unable to update status.");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setErrorMessage("Network error. Check your connection and try again.");
    } finally {
      setPendingId(null);
    }
  };

  const submitFeedback = async () => {
    if (!feedbackId || !feedbackMode || !feedbackText.trim()) return;
    setPendingId(feedbackId);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/sales-claims/${feedbackId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: feedbackMode, reason: feedbackText.trim() }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Unable to submit feedback." }));
        setErrorMessage(payload.error ?? "Unable to submit feedback.");
        return;
      }
      closeFeedback();
      startTransition(() => router.refresh());
    } catch {
      setErrorMessage("Network error. Check your connection and try again.");
    } finally {
      setPendingId(null);
    }
  };

  // Keep fetch's JSON body explicit for the record path while preserving a
  // compact approval request. This makes the UI's two-person payment workflow
  // obvious to keyboard and screen-reader users.
  const submitPaymentDecision = async () => {
    if (!paymentId || !paymentMode) return;
    if (paymentMode === "record" && (!paymentReference.trim() || !paymentProofUrl.trim() || !paymentAmount.trim() || Number(paymentAmount) <= 0 || !paymentAmountConfirmed)) {
      setErrorMessage("Payment reference, proof, a positive amount, and amount confirmation are required.");
      return;
    }
    setPendingId(paymentId);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/sales-claims/${paymentId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          paymentMode === "record"
            ? {
                status: "Accepted - Processing",
                paymentReference: paymentReference.trim(),
                paymentProofUrl: paymentProofUrl.trim(),
                paymentAmount: Number(paymentAmount),
                paymentAmountConfirmed: true,
              }
            : { status: "Paid" },
        ),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Unable to update payment." }));
        setErrorMessage(payload.error ?? "Unable to update payment.");
        return;
      }
      closePayment();
      startTransition(() => router.refresh());
    } catch {
      setErrorMessage("Network error. Check your connection and try again.");
    } finally {
      setPendingId(null);
    }
  };

  const openPayment = (claim: SalesClaimEntry, nextMode: Exclude<PaymentMode, null>) => {
    setErrorMessage(null);
    setPaymentId(claim.id);
    setPaymentMode(nextMode);
    if (nextMode === "record") {
      setPaymentReference(claim.paymentReference ?? "");
      setPaymentProofUrl(claim.paymentProofUrl ?? "");
      setPaymentAmount(claim.paymentAmount ?? "");
      setPaymentAmountConfirmed(Boolean(claim.paymentAmountConfirmed));
    }
  };

  const renderActions = (claim: SalesClaimEntry) => {
    if (activeTab === "Sales Claim" || activeTab === "Requested Change") {
      return (
        <>
          <button type="button" disabled={pendingId === claim.id || isPending} onClick={() => setStatus(claim.id, "Accepted - Processing")} className="rounded-full bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white keep-white hover:bg-emerald-800 disabled:opacity-50">Approve</button>
          <button type="button" disabled={pendingId === claim.id || isPending} onClick={() => { setFeedbackId(claim.id); setFeedbackMode("request_change"); }} className="rounded-full border border-black/20 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-black/5 disabled:opacity-50">Request change</button>
          <button type="button" disabled={pendingId === claim.id || isPending} onClick={() => { setFeedbackId(claim.id); setFeedbackMode("reject"); }} className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-900 hover:bg-rose-100 disabled:opacity-50">Reject</button>
        </>
      );
    }
    if (activeTab === "Awaiting Payment") {
      return claim.paymentRecordedBy ? (
        <>
          <span className="w-full text-xs text-neutral-600">Evidence recorded; independent approval required.</span>
          <button type="button" disabled={pendingId === claim.id || isPending} onClick={() => openPayment(claim, "approve")} className="rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50">Approve payment</button>
        </>
      ) : (
        <button type="button" disabled={pendingId === claim.id || isPending} onClick={() => openPayment(claim, "record")} className="rounded-full border border-blue-700 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-100 disabled:opacity-50">Record payment evidence</button>
      );
    }
    return <span className="text-xs text-neutral-500">Archived</span>;
  };

  return (
    <div className="rounded-3xl border border-black/5 bg-white p-6 shadow-xl shadow-black/5">
      <header className="mb-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Deal review</p>
            <p className="text-lg text-neutral-700">Review sales claims and payout readiness.</p>
          </div>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Sales claim queues">
            {[...BASE_TABS, ...(isSuperAdmin ? (["History"] as const) : [])].map((tab) => (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-full border px-4 py-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black ${
                  activeTab === tab ? "border-black bg-black text-white keep-white" : "border-black/20 bg-white text-neutral-700 hover:bg-black/5"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3" aria-label="Deal queue filters">
          <label className="text-xs font-medium text-neutral-600">Agent
            <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} className="ml-2 rounded-full border border-black/15 bg-white px-3 py-1.5 text-xs text-neutral-800">
              <option value="all">All agents</option>
              {owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-neutral-600">SLA
            <select value={slaFilter} onChange={(event) => setSlaFilter(event.target.value as "all" | "overdue")} className="ml-2 rounded-full border border-black/15 bg-white px-3 py-1.5 text-xs text-neutral-800">
              <option value="all">All timing</option>
              <option value="overdue">Overdue only</option>
            </select>
          </label>
          <span className="text-xs text-neutral-500">{filteredClaims.length} visible · updates older than 48 hours are overdue</span>
        </div>
      </header>

      {errorMessage ? <div role="alert" aria-live="assertive" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{errorMessage}</div> : null}

      <div className="space-y-3 lg:hidden">
        {filteredClaims.map((claim) => (
          <article key={`card-${claim.id}`} className="rounded-2xl border border-black/10 bg-white p-4">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-neutral-900">{claim.propertyName}</p>
                <p className="truncate text-xs text-neutral-500">{claim.developerName ?? formatIdentifier(claim.id)}{claim.isDemo ? " · DEMO" : ""}</p>
              </div>
              <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${statusChipClass(claim.status)}`}>{claim.status}</span>
            </div>
            {claim.isOverdue ? <p className="mt-2 text-xs font-semibold text-rose-800">Overdue SLA</p> : null}
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-700">
              <div><p className="text-neutral-500">Agent</p><p className="truncate">{claim.agentName}</p></div>
              <div><p className="text-neutral-500">Client</p><p className="truncate">{claim.clientName ?? "—"}</p></div>
              <div><p className="text-neutral-500">Amount</p><p>{formatCurrency(claim.saleAmount)}</p></div>
              <div><p className="text-neutral-500">Updated</p><p>{formatTimestamp(claim.updatedAt)}</p></div>
            </div>
            {claim.paymentRecordedBy ? <p className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">Payment evidence recorded{claim.paymentReference ? ` · ${claim.paymentReference}` : ""}; awaiting an independent approval.</p> : null}
            {claim.feedbackType && claim.feedbackReason ? <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{claim.feedbackReason}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {claim.reservationDocument ? <a href={claim.reservationDocument} target="_blank" rel="noreferrer" className="rounded-full border border-black/10 px-3 py-1 text-neutral-700 hover:bg-black/5">Reservation</a> : null}
              {claim.salesClaimDocument ? <a href={claim.salesClaimDocument} target="_blank" rel="noreferrer" className="rounded-full border border-black/10 px-3 py-1 text-neutral-700 hover:bg-black/5">Sales claim</a> : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">{renderActions(claim)}</div>
          </article>
        ))}
        {!filteredClaims.length ? <div className="rounded-2xl border border-black/10 bg-white px-4 py-6 text-center text-sm text-neutral-500">No entries in this tab.</div> : null}
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-black/10 lg:block">
        <table className="w-full min-w-[980px] text-left text-sm text-neutral-800">
          <caption className="sr-only">Sales claims and payment review queue</caption>
          <thead className="bg-black/5 text-xs uppercase tracking-[0.2em] text-neutral-600">
            <tr><th scope="col" className="px-4 py-3">Deal</th><th scope="col" className="px-4 py-3">Agent</th><th scope="col" className="px-4 py-3">Amount</th><th scope="col" className="px-4 py-3">Client</th><th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-4 py-3">Updated</th><th scope="col" className="px-4 py-3">Documents</th><th scope="col" className="px-4 py-3 text-right">Actions</th></tr>
          </thead>
          <tbody>
            {filteredClaims.map((claim) => (
              <tr key={claim.id} className="border-b border-black/5 align-top">
                <td className="px-4 py-4"><div className="font-semibold text-neutral-900">{claim.propertyName}</div><div className="text-xs text-neutral-500">{claim.developerName ?? formatIdentifier(claim.id)}{claim.isDemo ? " · DEMO" : ""}</div></td>
                <td className="px-4 py-4 text-neutral-700"><div>{claim.agentName}</div>{claim.agentPhone ? <div className="text-xs text-neutral-500">{claim.agentPhone}</div> : null}</td>
                <td className="px-4 py-4"><div>{formatCurrency(claim.saleAmount)}</div>{claim.commissionRate ? <div className="text-xs text-neutral-500">Commission {claim.commissionRate}%</div> : null}</td>
                <td className="px-4 py-4 text-neutral-700">{claim.clientName ?? "—"}</td>
                <td className="px-4 py-4"><span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusChipClass(claim.status)}`}>{claim.status}</span>{claim.isOverdue ? <p className="mt-2 text-xs font-semibold text-rose-800">Overdue SLA</p> : null}{claim.paymentRecordedBy ? <p className="mt-2 text-xs text-blue-800">Evidence recorded; second approval pending</p> : null}{claim.feedbackType && claim.feedbackReason ? <p className="mt-2 text-xs text-neutral-600">{claim.feedbackReason}</p> : null}</td>
                <td className="px-4 py-4 text-neutral-500">{formatTimestamp(claim.updatedAt)}</td>
                <td className="px-4 py-4"><div className="flex flex-col gap-2 text-xs">{claim.reservationDocument ? <a href={claim.reservationDocument} target="_blank" rel="noreferrer" className="rounded-full border border-black/10 px-3 py-1 text-neutral-700 hover:bg-black/5">Reservation</a> : <span className="rounded-full border border-black/10 px-3 py-1 text-neutral-500">Reservation</span>}{claim.salesClaimDocument ? <a href={claim.salesClaimDocument} target="_blank" rel="noreferrer" className="rounded-full border border-black/10 px-3 py-1 text-neutral-700 hover:bg-black/5">Sales claim</a> : <span className="rounded-full border border-black/10 px-3 py-1 text-neutral-500">Sales claim</span>}{claim.eoiDocument ? <a href={claim.eoiDocument} target="_blank" rel="noreferrer" className="rounded-full border border-black/10 px-3 py-1 text-neutral-700 hover:bg-black/5">EOI</a> : null}{claim.cilDocument ? <a href={claim.cilDocument} target="_blank" rel="noreferrer" className="rounded-full border border-black/10 px-3 py-1 text-neutral-700 hover:bg-black/5">CIL</a> : null}</div></td>
                <td className="px-4 py-4 text-right"><div className="flex flex-col items-end gap-2">{renderActions(claim)}</div></td>
              </tr>
            ))}
            {!filteredClaims.length ? <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-neutral-500">No entries in this tab.</td></tr> : null}
          </tbody>
        </table>
      </div>

      {feedbackId && feedbackMode ? (
        <div role="dialog" aria-modal="true" aria-labelledby="sales-claim-feedback-title" className="mt-4 rounded-2xl border border-black/10 bg-neutral-50 p-4 text-sm text-neutral-800">
          <p id="sales-claim-feedback-title" className="text-xs uppercase tracking-[0.3em] text-neutral-600">{feedbackMode === "reject" ? "Reject reason" : "Change request"}</p>
          <label className="mt-2 block text-sm font-medium text-neutral-700" htmlFor="sales-claim-feedback">Reason</label>
          <textarea id="sales-claim-feedback" value={feedbackText} onChange={(event) => setFeedbackText(event.target.value)} rows={3} maxLength={4000} placeholder={feedbackMode === "reject" ? "Explain why this claim is rejected" : "Describe the changes needed"} className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900" />
          <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={pendingId === feedbackId || isPending || !feedbackText.trim()} onClick={submitFeedback} className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white keep-white disabled:opacity-50">Submit decision</button><button type="button" onClick={closeFeedback} className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-medium text-neutral-700">Cancel</button></div>
        </div>
      ) : null}

      {paymentId && paymentMode ? (
        <div role="dialog" aria-modal="true" aria-labelledby="sales-claim-payment-title" className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
          <p id="sales-claim-payment-title" className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-900">{paymentMode === "record" ? "Record payment evidence" : "Independent payment approval"}</p>
          {paymentMode === "record" ? <div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-xs font-medium">Payment reference<input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} maxLength={200} className="mt-1 w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-neutral-900" /></label><label className="text-xs font-medium">Proof URL or storage reference<input value={paymentProofUrl} onChange={(event) => setPaymentProofUrl(event.target.value)} maxLength={2048} className="mt-1 w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-neutral-900" /></label><label className="text-xs font-medium">Confirmed payment amount<input value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} inputMode="decimal" min="0.01" type="number" step="0.01" className="mt-1 w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-neutral-900" /></label><label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={paymentAmountConfirmed} onChange={(event) => setPaymentAmountConfirmed(event.target.checked)} /> I confirm the amount against the payment proof.</label></div> : <p className="mt-3">This action marks the claim Paid. It can only succeed when payment evidence was recorded by a different active administrator.</p>}
          <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={pendingId === paymentId || isPending} onClick={submitPaymentDecision} className="rounded-full bg-blue-800 px-4 py-2 text-xs font-semibold text-white keep-white disabled:opacity-50">{paymentMode === "record" ? "Save evidence" : "Mark paid"}</button><button type="button" onClick={closePayment} className="rounded-full border border-blue-300 bg-white px-4 py-2 text-xs font-medium text-blue-900">Cancel</button></div>
        </div>
      ) : null}
    </div>
  );
}
