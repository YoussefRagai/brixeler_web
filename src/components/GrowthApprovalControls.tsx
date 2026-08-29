"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function GrowthApprovalControls({ entityType, entityId, status, canApprove }: { entityType: string; entityId: string; status: string; canApprove: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  if (status === "not_required") return null;
  if (status !== "pending") return <span className={`text-[10px] font-semibold uppercase ${status === "approved" ? "text-emerald-700" : "text-rose-700"}`}>{status}</span>;
  if (!canApprove) return <span className="text-[10px] font-semibold uppercase text-amber-700">Awaiting super-admin approval</span>;

  const decide = async (decision: "approve" | "reject") => {
    if (decision === "reject" && !reason.trim()) {
      setMessage("Add a rejection reason.");
      return;
    }
    setMessage(null);
    const response = await fetch("/api/admin/growth/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId, decision, reason: reason.trim() || null }),
    });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) {
      setMessage(body?.error ?? "Approval could not be updated.");
      return;
    }
    setRejecting(false);
    startTransition(() => router.refresh());
  };

  return (
    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2">
      <p className="text-[10px] font-semibold uppercase text-amber-800">Approval required</p>
      {rejecting ? <label className="mt-2 block text-[10px] font-semibold text-amber-900">Reason<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className="mt-1 min-h-9 w-full rounded-lg border border-amber-200 bg-white px-2 text-xs font-normal text-neutral-900" /></label> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => decide("approve")} className="rounded-full bg-black px-3 py-1.5 text-[10px] font-semibold text-white disabled:opacity-50">Approve</button>
        <button type="button" disabled={pending} onClick={() => rejecting ? decide("reject") : setRejecting(true)} className="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-rose-700 disabled:opacity-50">{rejecting ? "Confirm rejection" : "Reject"}</button>
        {rejecting ? <button type="button" onClick={() => { setRejecting(false); setReason(""); }} className="px-2 text-[10px] text-neutral-600">Cancel</button> : null}
      </div>
      {message ? <p aria-live="polite" className="mt-2 text-[10px] text-rose-700">{message}</p> : null}
    </div>
  );
}
