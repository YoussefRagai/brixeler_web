"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SalesClaimEntry } from "@/lib/adminDeals";

const BASE_TABS = ["Sales Claim", "Requested Change", "Rejected", "Awaiting Payment", "Archive"] as const;

type Tab = (typeof BASE_TABS)[number] | "History";

type FeedbackMode = "request_change" | "reject" | null;

const ARCHIVE_CUTOFF = Date.now() - 30 * 24 * 60 * 60 * 1000;

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

export function DealsClaimsTable({ claims, isSuperAdmin = false }: { claims: SalesClaimEntry[]; isSuperAdmin?: boolean }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("Sales Claim");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
    return claims.filter((claim) => claim.status === "Paid" && new Date(claim.updatedAt).getTime() >= ARCHIVE_CUTOFF);
  }, [activeTab, claims]);

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
      router.refresh();
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
      router.refresh();
    });
  };

  return (
    <div className="rounded-3xl border border-black/5 bg-white p-6 shadow-xl shadow-black/5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Deal review</p>
          <p className="text-lg text-neutral-700">Review sales claims and payout readiness.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[...BASE_TABS, ...(isSuperAdmin ? (["History"] as const) : [])].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-full border px-4 py-2 text-xs ${
                activeTab === tab
                  ? "border-black bg-black text-white"
                  : "border-black/20 bg-white text-neutral-700 hover:bg-black/5"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      {errorMessage && (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {errorMessage}
        </div>
      )}

      <div className="space-y-3 lg:hidden">
        {filteredClaims.map((claim) => (
          <article key={`card-${claim.id}`} className="rounded-2xl border border-black/10 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-neutral-900">{claim.propertyName}</p>
                <p className="text-xs text-neutral-500">{claim.developerName ?? formatIdentifier(claim.id)}</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusChipClass(claim.status)}`}>
                {claim.status}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-600">
              <div>
                <p className="text-neutral-500">Agent</p>
                <p>{claim.agentName}</p>
              </div>
              <div>
                <p className="text-neutral-500">Client</p>
                <p>{claim.clientName ?? "—"}</p>
              </div>
              <div>
                <p className="text-neutral-500">Amount</p>
                <p>{formatCurrency(claim.saleAmount)}</p>
              </div>
              <div>
                <p className="text-neutral-500">Updated</p>
                <p>{formatTimestamp(claim.updatedAt)}</p>
              </div>
            </div>
            {claim.feedbackType && claim.feedbackReason ? (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {claim.feedbackReason}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {claim.reservationDocument ? (
                <a href={claim.reservationDocument} target="_blank" rel="noreferrer" className="rounded-full border border-black/10 px-3 py-1">
                  Reservation
                </a>
              ) : null}
              {claim.salesClaimDocument ? (
                <a href={claim.salesClaimDocument} target="_blank" rel="noreferrer" className="rounded-full border border-black/10 px-3 py-1">
                  Sales claim
                </a>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {activeTab === "Sales Claim" || activeTab === "Requested Change" ? (
                <>
                  <button
                    disabled={pendingId === claim.id || isPending}
                    onClick={() => setStatus(claim.id, "Accepted - Processing")}
                    className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white"
                  >
                    Approve
                  </button>
                  <button
                    disabled={pendingId === claim.id || isPending}
                    onClick={() => {
                      setFeedbackId(claim.id);
                      setFeedbackMode("request_change");
                    }}
                    className="rounded-full border border-black/20 px-3 py-1 text-xs text-neutral-800"
                  >
                    Request change
                  </button>
                  <button
                    disabled={pendingId === claim.id || isPending}
                    onClick={() => {
                      setFeedbackId(claim.id);
                      setFeedbackMode("reject");
                    }}
                    className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs text-rose-900"
                  >
                    Reject
                  </button>
                </>
              ) : activeTab === "Awaiting Payment" ? (
                <button
                  disabled={pendingId === claim.id || isPending}
                  onClick={() => setStatus(claim.id, "Paid")}
                  className="rounded-full bg-black px-3 py-1 text-xs font-semibold text-white"
                >
                  Mark paid
                </button>
              ) : (
                <span className="text-xs text-neutral-500">Archived</span>
              )}
            </div>
          </article>
        ))}
        {!filteredClaims.length ? (
          <div className="rounded-2xl border border-black/10 bg-white px-4 py-6 text-center text-sm text-neutral-500">
            No entries in this tab.
          </div>
        ) : null}
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-black/10 lg:block">
        <table className="w-full min-w-[980px] text-left text-sm text-neutral-800">
          <thead className="bg-black/5 text-xs uppercase tracking-[0.2em] text-neutral-500">
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
              <tr key={claim.id} className="border-b border-black/5 align-top">
                <td className="px-4 py-4">
                  <div className="font-semibold text-neutral-900">{claim.propertyName}</div>
                  <div className="text-xs text-neutral-500">{claim.developerName ?? formatIdentifier(claim.id)}</div>
                </td>
                <td className="px-4 py-4 text-neutral-700">
                  <div>{claim.agentName}</div>
                  {claim.agentPhone && <div className="text-xs text-neutral-500">{claim.agentPhone}</div>}
                </td>
                <td className="px-4 py-4">
                  <div>{formatCurrency(claim.saleAmount)}</div>
                  {claim.commissionRate && (
                    <div className="text-xs text-neutral-500">Commission {claim.commissionRate}%</div>
                  )}
                </td>
                <td className="px-4 py-4">
                  <div className="text-neutral-700">{claim.clientName ?? "—"}</div>
                </td>
                <td className="px-4 py-4">
                  <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusChipClass(claim.status)}`}>
                    {claim.status}
                  </span>
                  {claim.feedbackType && claim.feedbackReason && (
                    <p className="mt-2 text-xs text-neutral-600">{claim.feedbackReason}</p>
                  )}
                </td>
                <td className="px-4 py-4 text-neutral-500">{formatTimestamp(claim.updatedAt)}</td>
                <td className="px-4 py-4">
                  <div className="flex flex-col gap-2 text-xs">
                    {claim.reservationDocument ? (
                      <a
                        href={claim.reservationDocument}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-black/10 px-3 py-1 text-neutral-700 hover:bg-black/5"
                      >
                        Reservation
                      </a>
                    ) : (
                      <span className="rounded-full border border-black/10 px-3 py-1 text-neutral-500">Reservation</span>
                    )}
                    {claim.salesClaimDocument ? (
                      <a
                        href={claim.salesClaimDocument}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-black/10 px-3 py-1 text-neutral-700 hover:bg-black/5"
                      >
                        Sales claim
                      </a>
                    ) : (
                      <span className="rounded-full border border-black/10 px-3 py-1 text-neutral-500">Sales claim</span>
                    )}
                    {claim.eoiDocument ? (
                      <a
                        href={claim.eoiDocument}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-black/10 px-3 py-1 text-neutral-700 hover:bg-black/5"
                      >
                        EOI
                      </a>
                    ) : null}
                    {claim.cilDocument ? (
                      <a
                        href={claim.cilDocument}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-black/10 px-3 py-1 text-neutral-700 hover:bg-black/5"
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
                        className="rounded-full border border-black/10 px-3 py-1 text-xs text-neutral-700 hover:bg-black/5"
                      >
                        Request change
                      </button>
                      <button
                        disabled={pendingId === claim.id || isPending}
                        onClick={() => {
                          setFeedbackId(claim.id);
                          setFeedbackMode("reject");
                        }}
                        className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs text-rose-900 hover:bg-rose-100"
                      >
                        Reject
                      </button>
                    </div>
                  ) : activeTab === "Awaiting Payment" ? (
                      <button
                        disabled={pendingId === claim.id || isPending}
                        onClick={() => setStatus(claim.id, "Paid")}
                        className="rounded-full bg-black px-3 py-1 text-xs font-semibold text-white"
                      >
                        Mark paid
                      </button>
                  ) : (
                    <span className="text-xs text-neutral-500">Archived</span>
                  )}
                </td>
              </tr>
            ))}
            {!filteredClaims.length && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-neutral-500">
                  No entries in this tab.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {feedbackId && feedbackMode ? (
        <div className="mt-4 rounded-2xl border border-black/10 bg-black/5 p-4 text-sm text-neutral-700">
          <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">{feedbackMode === "reject" ? "Reject reason" : "Change request"}</p>
          <textarea
            value={feedbackText}
            onChange={(event) => setFeedbackText(event.target.value)}
            rows={3}
            placeholder={feedbackMode === "reject" ? "Explain why this claim is rejected" : "Describe the changes needed"}
            className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              disabled={pendingId === feedbackId || isPending}
              onClick={submitFeedback}
              className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white"
            >
              Submit
            </button>
            <button
              onClick={() => {
                setFeedbackId(null);
                setFeedbackMode(null);
                setFeedbackText("");
              }}
              className="rounded-full border border-black/10 px-4 py-2 text-xs text-neutral-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
