"use client";

import { useMemo, useState, useTransition } from "react";
import type { SalesClaimEntry } from "@/lib/adminDeals";

const BASE_TABS = ["Sales Claim", "Requested Change", "Rejected", "Awaiting Payment", "Archive"] as const;

type Tab = (typeof BASE_TABS)[number] | "History";

type FeedbackMode = "request_change" | "reject" | null;

const formatCurrency = (amount?: string | null) => {
  if (!amount) return "—";
  const numeric = Number(amount.replace(/,/g, ""));
  if (Number.isNaN(numeric)) return amount;
  return numeric.toLocaleString("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 });
};

const formatTimestamp = (iso?: string | null) => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
};

export function DealsClaimsTable({ claims, isSuperAdmin = false }: { claims: SalesClaimEntry[]; isSuperAdmin?: boolean }) {
  const [activeTab, setActiveTab] = useState<Tab>("Sales Claim");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const now = Date.now();
  const archiveCutoff = now - 30 * 24 * 60 * 60 * 1000;

  const filteredClaims = useMemo(() => {
    if (activeTab === "Sales Claim") {
      return claims.filter(
        (claim) =>
          claim.status !== "Paid" &&
          claim.status !== "Accepted - Processing" &&
          claim.status !== "Change Requested" &&
          claim.status !== "Rejected",
      );
    }
    if (activeTab === "Requested Change") {
      return claims.filter((claim) => claim.status === "Change Requested");
    }
    if (activeTab === "Rejected") {
      return claims.filter((claim) => claim.status === "Rejected");
    }
    if (activeTab === "Awaiting Payment") {
      return claims.filter((claim) => claim.status === "Accepted - Processing");
    }
    if (activeTab === "History") {
      return claims;
    }
    return claims.filter((claim) => claim.status === "Paid" && new Date(claim.updatedAt).getTime() >= archiveCutoff);
  }, [activeTab, claims, archiveCutoff]);

  const setStatus = async (id: string, status: string) => {
    setPendingId(id);
    setErrorMessage(null);
    const response = await fetch(`/api/sales-claims/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Unable to update status." }));
      setErrorMessage(payload.error ?? "Unable to update status.");
      setPendingId(null);
      return;
    }
    startTransition(() => {
      setPendingId(null);
      window.location.reload();
    });
  };

  const submitFeedback = async () => {
    if (!feedbackId || !feedbackMode || !feedbackText.trim()) return;
    setPendingId(feedbackId);
    setErrorMessage(null);
    const response = await fetch(`/api/sales-claims/${feedbackId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: feedbackMode, reason: feedbackText.trim() }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Unable to submit feedback." }));
      setErrorMessage(payload.error ?? "Unable to submit feedback.");
      setPendingId(null);
      return;
    }
    setFeedbackId(null);
    setFeedbackMode(null);
    setFeedbackText("");
    startTransition(() => {
      setPendingId(null);
      window.location.reload();
    });
  };

  return (
    <div className="rounded-3xl border border-white/5 bg-white/5 p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Deal review</p>
          <p className="text-lg text-slate-300">Review sales claims and payout readiness.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[...BASE_TABS, ...(isSuperAdmin ? (["History"] as const) : [])].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-full border px-4 py-2 text-xs ${
                activeTab === tab
                  ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-200"
                  : "border-white/10 text-slate-300 hover:bg-white/10"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      {errorMessage && (
        <div className="mb-4 rounded-2xl border border-rose-200/20 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
          {errorMessage}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-left text-sm text-slate-200">
          <thead className="bg-white/5 text-xs uppercase tracking-[0.2em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Deal</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3">Documents</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredClaims.map((claim) => (
              <tr key={claim.id} className="border-b border-white/5 align-top">
                <td className="px-4 py-4">
                  <div className="font-semibold text-white">{claim.propertyName}</div>
                  <div className="text-xs text-slate-400">{claim.developerName ?? claim.id}</div>
                </td>
                <td className="px-4 py-4 text-slate-300">
                  <div>{claim.agentName}</div>
                  {claim.agentPhone && <div className="text-xs text-slate-500">{claim.agentPhone}</div>}
                </td>
                <td className="px-4 py-4">
                  <div>{formatCurrency(claim.saleAmount)}</div>
                  {claim.commissionRate && (
                    <div className="text-xs text-slate-400">Commission {claim.commissionRate}%</div>
                  )}
                </td>
                <td className="px-4 py-4">
                  <div className="text-slate-200">{claim.clientName ?? "—"}</div>
                </td>
                <td className="px-4 py-4">
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs">{claim.status}</span>
                  {claim.feedbackType && claim.feedbackReason && (
                    <p className="mt-2 text-xs text-slate-400">{claim.feedbackReason}</p>
                  )}
                </td>
                <td className="px-4 py-4 text-slate-400">{formatTimestamp(claim.updatedAt)}</td>
                <td className="px-4 py-4">
                  <div className="flex flex-col gap-2 text-xs">
                    {claim.reservationDocument ? (
                      <a
                        href={claim.reservationDocument}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-white/10 px-3 py-1 text-white/80 hover:bg-white/10"
                      >
                        Reservation
                      </a>
                    ) : (
                      <span className="rounded-full border border-white/5 px-3 py-1 text-slate-500">Reservation</span>
                    )}
                    {claim.salesClaimDocument ? (
                      <a
                        href={claim.salesClaimDocument}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-white/10 px-3 py-1 text-white/80 hover:bg-white/10"
                      >
                        Sales claim
                      </a>
                    ) : (
                      <span className="rounded-full border border-white/5 px-3 py-1 text-slate-500">Sales claim</span>
                    )}
                    {claim.eoiDocument ? (
                      <a
                        href={claim.eoiDocument}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-white/10 px-3 py-1 text-white/80 hover:bg-white/10"
                      >
                        EOI
                      </a>
                    ) : null}
                    {claim.cilDocument ? (
                      <a
                        href={claim.cilDocument}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-white/10 px-3 py-1 text-white/80 hover:bg-white/10"
                      >
                        CIL
                      </a>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-4 text-right">
                  {activeTab === "Sales Claim" || activeTab === "Requested Change" ? (
                    <div className="flex flex-col items-end gap-2">
                      <button
                        disabled={pendingId === claim.id || isPending}
                        onClick={() => setStatus(claim.id, "Accepted - Processing")}
                        className="rounded-full bg-emerald-400 px-3 py-1 text-xs font-semibold text-emerald-950"
                      >
                        Approve
                      </button>
                      <button
                        disabled={pendingId === claim.id || isPending}
                        onClick={() => {
                          setFeedbackId(claim.id);
                          setFeedbackMode("request_change");
                        }}
                        className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
                      >
                        Request change
                      </button>
                      <button
                        disabled={pendingId === claim.id || isPending}
                        onClick={() => {
                          setFeedbackId(claim.id);
                          setFeedbackMode("reject");
                        }}
                        className="rounded-full border border-rose-300/50 px-3 py-1 text-xs text-rose-200 hover:bg-rose-500/10"
                      >
                        Reject
                      </button>
                    </div>
                  ) : activeTab === "Awaiting Payment" ? (
                    <button
                      disabled={pendingId === claim.id || isPending}
                      onClick={() => setStatus(claim.id, "Paid")}
                      className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-900"
                    >
                      Mark paid
                    </button>
                  ) : (
                    <span className="text-xs text-slate-500">Archived</span>
                  )}
                </td>
              </tr>
            ))}
            {!filteredClaims.length && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-400">
                  No entries in this tab.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {feedbackId && feedbackMode ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-slate-200">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{feedbackMode === "reject" ? "Reject reason" : "Change request"}</p>
          <textarea
            value={feedbackText}
            onChange={(event) => setFeedbackText(event.target.value)}
            rows={3}
            placeholder={feedbackMode === "reject" ? "Explain why this claim is rejected" : "Describe the changes needed"}
            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              disabled={pendingId === feedbackId || isPending}
              onClick={submitFeedback}
              className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-900"
            >
              Submit
            </button>
            <button
              onClick={() => {
                setFeedbackId(null);
                setFeedbackMode(null);
                setFeedbackText("");
              }}
              className="rounded-full border border-white/10 px-4 py-2 text-xs text-white/80"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
