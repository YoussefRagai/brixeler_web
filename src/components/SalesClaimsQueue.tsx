"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SalesClaimEntry } from "@/lib/adminDeals";

const STATUS_OPTIONS = ["Under Review", "Accepted - Processing", "Paid"] as const;

const statusTone: Record<string, string> = {
  "Under Review": "text-amber-300",
  "Accepted - Processing": "text-sky-300",
  Paid: "text-emerald-300",
};

const formatCurrency = (amount?: string | null) => {
  if (!amount) return "—";
  const numeric = Number(amount.replace(/,/g, ""));
  if (Number.isNaN(numeric)) return amount;
  return numeric.toLocaleString("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 });
};

const formatTimestamp = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
};

type Props = {
  claims: SalesClaimEntry[];
};

export function SalesClaimsQueue({ claims }: Props) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleStatusChange = async (id: string, nextStatus: string) => {
    setPendingId(id);
    setErrorMessage(null);
    const response = await fetch(`/api/sales-claims/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Unable to update status." }));
      setErrorMessage(payload.error ?? "Unable to update status.");
      setPendingId(null);
      return;
    }
    startTransition(() => {
      router.refresh();
      setPendingId(null);
    });
  };

  if (!claims.length) {
    return (
      <div className="rounded-2xl border border-white/10 p-6 text-center text-slate-400">
        No sales claims have been submitted yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10">
      {errorMessage && (
        <div className="bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
          {errorMessage}
        </div>
      )}
      <table className="w-full text-left text-sm text-slate-200">
        <thead className="bg-white/5 text-xs uppercase tracking-[0.2em] text-slate-500">
          <tr>
            <th className="px-4 py-3">Deal</th>
            <th className="px-4 py-3">Agent</th>
            <th className="px-4 py-3">Amount</th>
            <th className="px-4 py-3">Client</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Last update</th>
            <th className="px-4 py-3 text-right">Documents</th>
          </tr>
        </thead>
        <tbody>
          {claims.map((claim) => (
            <tr key={claim.id} className="border-b border-white/5">
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
                <select
                  className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/80"
                  value={claim.status}
                  disabled={pendingId === claim.id || isPending}
                  onChange={(event) => handleStatusChange(claim.id, event.target.value)}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <p className={`mt-1 text-xs ${statusTone[claim.status] ?? "text-slate-400"}`}>{claim.status}</p>
              </td>
              <td className="px-4 py-4 text-slate-400">{formatTimestamp(claim.updatedAt)}</td>
              <td className="px-4 py-4 text-right">
                <div className="flex flex-col items-end gap-2 text-xs">
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
                    <span className="rounded-full border border-white/5 px-3 py-1 text-slate-500">
                      No claim doc
                    </span>
                  )}
                  {claim.attachments.slice(0, 2).map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-white/10 px-3 py-1 text-white/80 hover:bg-white/10"
                    >
                      Attachment
                    </a>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
