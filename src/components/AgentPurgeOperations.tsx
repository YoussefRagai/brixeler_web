"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ArchivedAgent = {
  id: string;
  displayName: string;
  phone: string;
  archivedAt: string | null;
  snapshot: { id: string; generatedAt: string } | null;
};

type PendingRequest = {
  id: string;
  agentId: string;
  agentName: string;
  requestedBy: string;
  requestReason: string;
  requestedAt: string;
  snapshotId: string | null;
};

type Props = {
  archivedAgents: ArchivedAgent[];
  pendingRequests: PendingRequest[];
  currentAdminId: string;
  isSuperAdmin: boolean;
};

type Snapshot = { id: string; generatedAt: string; downloadUrl: string };

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function formatDate(value: string | null) {
  if (!value) return "Unknown date";
  return new Date(value).toLocaleString();
}

export function AgentPurgeOperations({ archivedAgents, pendingRequests, currentAdminId, isSuperAdmin }: Props) {
  const router = useRouter();
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>(() => Object.fromEntries(
    archivedAgents.flatMap((agent) => agent.snapshot
      ? [[agent.id, {
          id: agent.snapshot.id,
          generatedAt: agent.snapshot.generatedAt,
          downloadUrl: `/api/admin/agents/retained-snapshot?snapshotId=${encodeURIComponent(agent.snapshot.id)}`,
        }]]
      : []),
  ));
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function generateSnapshot(agent: ArchivedAgent) {
    setBusy(`snapshot:${agent.id}`);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/agents/retained-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id }),
      });
      const payload = await response.json().catch(() => ({})) as { snapshotId?: string; downloadUrl?: string; error?: string };
      if (!response.ok || !payload.snapshotId || !payload.downloadUrl) {
        setFeedback(payload.error ?? "Unable to prepare the retained-data snapshot.");
        return;
      }
      setSnapshots((current) => ({
        ...current,
        [agent.id]: { id: payload.snapshotId!, generatedAt: new Date().toISOString(), downloadUrl: payload.downloadUrl! },
      }));
      setFeedback(`Snapshot ready for ${agent.displayName}. Download and review it before requesting purge.`);
    } catch {
      setFeedback("The snapshot request failed. Check the connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function requestPurge(event: React.FormEvent<HTMLFormElement>, agent: ArchivedAgent) {
    event.preventDefault();
    const snapshot = snapshots[agent.id];
    if (!snapshot) {
      setFeedback("Generate a retained-data snapshot before requesting purge.");
      return;
    }
    const form = new FormData(event.currentTarget);
    if (form.get("snapshotConfirmed") !== "on") {
      setFeedback("Confirm that you downloaded and reviewed the retained-data snapshot first.");
      return;
    }
    const reason = form.get("reason")?.toString().trim() ?? "";
    if (reason.length < 3) {
      setFeedback("A reason of at least 3 characters is required.");
      return;
    }
    setBusy(`request:${agent.id}`);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/agents/purge/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id, reason, snapshotId: snapshot.id }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setFeedback(payload.error ?? "Unable to create the purge request.");
        return;
      }
      setFeedback(`Purge request created for ${agent.displayName}. An independent super admin must approve it.`);
      router.refresh();
    } catch {
      setFeedback("The purge request failed. Refresh the page and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function approvePurge(event: React.FormEvent<HTMLFormElement>, request: PendingRequest) {
    event.preventDefault();
    if (request.requestedBy === currentAdminId) {
      setFeedback("You cannot approve a purge request that you created.");
      return;
    }
    if (!window.confirm("This permanently anonymizes direct identifiers and removes documents/device reachability. Required business records remain. Continue?")) return;
    const reason = new FormData(event.currentTarget).get("reason")?.toString().trim() ?? "";
    if (reason.length < 3) {
      setFeedback("An approval reason of at least 3 characters is required.");
      return;
    }
    setBusy(`approve:${request.id}`);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/agents/purge/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: request.id, reason }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setFeedback(payload.error ?? "Unable to approve the purge request. A fresh session may be required.");
        return;
      }
      setFeedback(`Purge completed for ${request.agentName}.`);
      router.refresh();
    } catch {
      setFeedback("The approval request failed. A fresh session may be required.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-8 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-neutral-900 sm:p-6" aria-labelledby="purge-operations-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-700">Controlled lifecycle</p>
          <h2 id="purge-operations-heading" className="mt-1 text-xl font-semibold">Archived account purge review</h2>
          <p className="mt-2 max-w-3xl text-sm text-rose-950/75">
            Purge is irreversible. It removes direct identifiers, verification documents, financial secrets, and device reachability while retaining the profile identity needed by deals, commissions, referrals, support, and audit records. Generate and download the retained-data snapshot before requesting review.
          </p>
        </div>
        {isSuperAdmin ? <span className="rounded-full border border-rose-300 bg-white px-3 py-1 text-xs font-semibold text-rose-800">Independent approval enabled</span> : null}
      </div>
      {feedback ? <p className="mt-4 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm" role="status" aria-live="polite">{feedback}</p> : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-rose-200 bg-white p-4" aria-labelledby="archived-accounts-heading">
          <div className="flex items-center justify-between gap-3">
            <h3 id="archived-accounts-heading" className="font-semibold">Archived accounts</h3>
            <span className="text-xs text-neutral-500">{archivedAgents.length}</span>
          </div>
          <div className="mt-3 space-y-3">
            {archivedAgents.map((agent) => {
              const snapshot = snapshots[agent.id];
              const snapshotBusy = busy === `snapshot:${agent.id}`;
              return (
                <article key={agent.id} className="rounded-2xl border border-black/10 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="font-semibold">{agent.displayName}</h4>
                      <p className="text-xs text-neutral-500">{agent.phone} · archived {formatDate(agent.archivedAt)}</p>
                    </div>
                    <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-800">Recoverable until purge</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => generateSnapshot(agent)} disabled={snapshotBusy} className="min-h-10 rounded-full border border-black/15 px-3 py-2 text-xs font-semibold text-neutral-800 disabled:opacity-50">
                      {snapshotBusy ? "Preparing…" : snapshot ? "Refresh snapshot" : "Generate snapshot"}
                    </button>
                    {snapshot ? <a href={snapshot.downloadUrl} className="min-h-10 rounded-full bg-black px-3 py-2 text-xs font-semibold text-white" download>Download snapshot</a> : null}
                  </div>
                  {snapshot ? <p className="mt-2 text-[11px] text-neutral-500">Snapshot generated {formatDate(snapshot.generatedAt)}. A snapshot remains valid for 24 hours.</p> : <p className="mt-2 text-[11px] text-neutral-500">A recent snapshot is required by the server before a request can be submitted.</p>}
                  <form className="mt-4 space-y-3 border-t border-black/10 pt-4" onSubmit={(event) => requestPurge(event, agent)}>
                    <label className="flex items-start gap-2 text-xs text-neutral-700"><input type="checkbox" name="snapshotConfirmed" value="on" required className="mt-0.5 h-4 w-4 accent-black" />I downloaded and reviewed the retained-data snapshot and understand purge cannot be undone.</label>
                    <label className="block text-xs font-semibold text-neutral-600">Request reason<input name="reason" required minLength={3} maxLength={1000} placeholder="Why should this archived account be purged?" className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-neutral-50 px-3 py-2 text-sm font-normal text-neutral-900" /></label>
                    <button type="submit" disabled={!snapshot || busy === `request:${agent.id}`} className="min-h-10 rounded-full bg-rose-700 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy === `request:${agent.id}` ? "Submitting…" : "Request independent purge review"}</button>
                  </form>
                </article>
              );
            })}
            {!archivedAgents.length ? <p className="rounded-2xl border border-dashed border-black/15 p-4 text-center text-sm text-neutral-500">No archived accounts are waiting for purge review.</p> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-rose-200 bg-white p-4" aria-labelledby="pending-purge-heading">
          <div className="flex items-center justify-between gap-3">
            <h3 id="pending-purge-heading" className="font-semibold">Pending independent approvals</h3>
            <span className="text-xs text-neutral-500">{pendingRequests.length}</span>
          </div>
          <p className="mt-2 text-xs text-neutral-500">Approvals require a different administrator and a fresh signed admin session (15 minutes or less).</p>
          <div className="mt-3 space-y-3">
            {pendingRequests.map((request) => {
              const selfRequested = request.requestedBy === currentAdminId;
              return (
                <article key={request.id} className="rounded-2xl border border-black/10 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="font-semibold">{request.agentName}</h4>
                      <p className="text-xs text-neutral-500">Requested {formatDate(request.requestedAt)} by {shortId(request.requestedBy)}</p>
                    </div>
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">Pending</span>
                  </div>
                  <p className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">{request.requestReason}</p>
                  {request.snapshotId ? <a href={`/api/admin/agents/retained-snapshot?snapshotId=${encodeURIComponent(request.snapshotId)}`} className="mt-3 inline-flex min-h-10 items-center rounded-full border border-black/15 px-3 py-2 text-xs font-semibold text-neutral-800" download>Download retained snapshot</a> : <p className="mt-3 text-xs text-rose-700">This request has no usable snapshot and cannot be approved.</p>}
                  {selfRequested ? (
                    <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">You requested this purge. Self-approval is disabled; an independent super admin must approve it.</p>
                  ) : isSuperAdmin ? (
                    <form className="mt-4 space-y-3 border-t border-black/10 pt-4" onSubmit={(event) => approvePurge(event, request)}>
                      <p className="text-xs text-rose-800">Approval anonymizes direct identifiers and deletes documents from the profile. Required business records remain addressable.</p>
                      <label className="block text-xs font-semibold text-neutral-600">Approval reason<input name="reason" required minLength={3} maxLength={1000} placeholder="Why is this irreversible action approved?" className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-neutral-50 px-3 py-2 text-sm font-normal text-neutral-900" /></label>
                      <button type="submit" disabled={busy === `approve:${request.id}`} className="min-h-10 rounded-full bg-rose-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy === `approve:${request.id}` ? "Approving…" : "Approve and purge"}</button>
                    </form>
                  ) : <p className="mt-3 rounded-xl border border-black/10 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">Waiting for an independent super admin approval.</p>}
                </article>
              );
            })}
            {!pendingRequests.length ? <p className="rounded-2xl border border-dashed border-black/15 p-4 text-center text-sm text-neutral-500">No pending purge requests.</p> : null}
          </div>
        </section>
      </div>
    </section>
  );
}
