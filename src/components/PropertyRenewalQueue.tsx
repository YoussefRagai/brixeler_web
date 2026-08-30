"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";

export type RenewalStatus = "pending" | "approved" | "rejected" | "auto_expired";

export type PropertyRenewalEntry = {
  id: string;
  requestId: string;
  name: string;
  area: string;
  price: string;
  status: RenewalStatus | string;
  rejectionReason?: string | null;
  submittedBy?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  source?: string | null;
  currentExpiresAt?: string | null;
  proposedExpiresAt?: string | null;
  projectName?: string | null;
  description?: string | null;
  photos?: string[];
  bedrooms?: number | null;
  bathrooms?: number | null;
  unitArea?: number | null;
  propertyType?: string | null;
  amenities?: string[] | null;
};

type Props = {
  entries: PropertyRenewalEntry[];
  activeStatus?: RenewalStatus;
  counts?: Partial<Record<RenewalStatus, number>>;
  search?: string;
};

const tabs: Array<{ key: RenewalStatus; label: string }> = [
  { key: "pending", label: "Proposed" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "auto_expired", label: "Auto-expired" },
];

function statusLabel(status: RenewalStatus) {
  return tabs.find((tab) => tab.key === status)?.label ?? status;
}

async function responseError(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export function PropertyRenewalQueue({ entries, activeStatus = "pending", counts = {}, search = "" }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeProperty = useMemo(
    () => entries.find((entry) => entry.requestId === activeRequestId) ?? null,
    [activeRequestId, entries],
  );

  const navigateToStatus = (status: RenewalStatus) => {
    const query = new URLSearchParams();
    if (search) query.set("q", search);
    query.set("status", status);
    query.set("page", "1");
    router.push(`${pathname}?${query.toString()}`);
  };

  const performAction = async (entry: PropertyRenewalEntry, approve: boolean, reason?: string) => {
    setError(null);
    setSuccess(null);
    setBusyRequestId(entry.requestId);
    try {
      const response = await fetch(
        approve ? "/api/properties/renewals/approve" : "/api/properties/renewals/reject",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(approve
            ? { requestId: entry.requestId }
            : { requestId: entry.requestId, reason }),
        },
      );
      if (!response.ok) throw new Error(await responseError(response));
      setRejectingRequestId(null);
      setRejectionReason("");
      setSuccess(approve ? "Renewal approved and notifications sent." : "Renewal rejected with the recorded reason.");
      startTransition(() => router.refresh());
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to complete renewal review");
    } finally {
      setBusyRequestId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Renewal history">
        {tabs.map((tab) => {
          const isActive = activeStatus === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => navigateToStatus(tab.key)}
              className={clsx(
                "min-h-11 rounded-full border px-4 py-2 text-xs font-semibold transition-colors",
                isActive
                  ? "border-black bg-black text-white"
                  : "border-white/20 bg-white/5 text-slate-300 hover:bg-white/10",
              )}
            >
              {tab.label} <span className="ml-1 opacity-70">{counts[tab.key] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {error ? (
        <div role="alert" className="mt-4 rounded-2xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}
      {success ? (
        <div role="status" className="mt-4 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {success}
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {entries.map((property) => (
          <article key={property.requestId} className="rounded-2xl border border-white/5 bg-black/20 p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-white">{property.name}</p>
                <p className="text-slate-400">{property.area} · {property.price}</p>
              </div>
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs">
                {statusLabel((property.status as RenewalStatus) || activeStatus)}
              </span>
            </div>
            <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-4">
              <p><span className="text-slate-500">Requester:</span> {property.submittedBy ?? "—"}</p>
              <p><span className="text-slate-500">Source:</span> {property.source ?? "—"}</p>
              <p><span className="text-slate-500">Requested:</span> {property.submittedAt ?? "—"}</p>
              <p><span className="text-slate-500">Reviewed:</span> {property.reviewedAt ?? "—"}</p>
              <p><span className="text-slate-500">Current expiry:</span> {property.currentExpiresAt ?? "—"}</p>
              <p><span className="text-slate-500">Requested expiry:</span> {property.proposedExpiresAt ?? "—"}</p>
              <p><span className="text-slate-500">Project/developer:</span> {property.projectName ?? "—"}</p>
            </div>
            {property.rejectionReason && property.status === "rejected" ? (
              <p className="mt-3 rounded-xl border border-rose-300/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-100">
                Rejection reason: {property.rejectionReason}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="min-h-11 rounded-full border border-white/10 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
                onClick={() => setActiveRequestId(property.requestId)}
              >
                Review details
              </button>
              {activeStatus === "pending" ? (
                <>
                  <button
                    type="button"
                    disabled={busyRequestId === property.requestId || isPending}
                    className="min-h-11 rounded-full bg-emerald-400 px-3 py-2 text-xs font-semibold text-emerald-950 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => performAction(property, true)}
                  >
                    {busyRequestId === property.requestId ? "Saving…" : "Approve renewal"}
                  </button>
                  <button
                    type="button"
                    disabled={busyRequestId === property.requestId || isPending}
                    className="min-h-11 rounded-full border border-rose-300/50 px-3 py-2 text-xs text-rose-200 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                      setError(null);
                      setRejectingRequestId(property.requestId);
                      setRejectionReason("");
                    }}
                  >
                    Reject renewal
                  </button>
                </>
              ) : null}
            </div>
            {rejectingRequestId === property.requestId ? (
              <form
                className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-500/5 p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (rejectionReason.trim().length < 5) {
                    setError("Enter a rejection reason of at least 5 characters.");
                    return;
                  }
                  void performAction(property, false, rejectionReason.trim());
                }}
              >
                <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-rose-100" htmlFor={`renewal-reason-${property.requestId}`}>
                  Rejection reason
                </label>
                <textarea
                  id={`renewal-reason-${property.requestId}`}
                  value={rejectionReason}
                  onChange={(event) => setRejectionReason(event.target.value)}
                  minLength={5}
                  required
                  rows={3}
                  placeholder="Explain what must change before requesting renewal again"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="submit" disabled={busyRequestId === property.requestId} className="min-h-11 rounded-full bg-rose-400 px-4 py-2 text-xs font-semibold text-rose-950 disabled:opacity-50">
                    {busyRequestId === property.requestId ? "Saving…" : "Confirm rejection"}
                  </button>
                  <button type="button" className="min-h-11 rounded-full border border-white/10 px-4 py-2 text-xs text-white/80" onClick={() => setRejectingRequestId(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}
          </article>
        ))}
        {!entries.length ? <p className="text-sm text-slate-400">No {statusLabel(activeStatus).toLowerCase()} renewals in this tab.</p> : null}
      </div>

      {activeProperty ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6"
          onClick={() => setActiveRequestId(null)}
        >
          <div
            className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/10 bg-[#0f1115] p-5 text-white shadow-2xl sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Renewal request</p>
                <p className="text-2xl font-semibold text-white">{activeProperty.name}</p>
                <p className="text-xs text-slate-400">{activeProperty.area} · {activeProperty.price}</p>
              </div>
              <button type="button" className="min-h-11 rounded-full border border-white/10 px-3 py-2 text-xs text-white/80" onClick={() => setActiveRequestId(null)}>
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Source", activeProperty.source],
                ["Requester", activeProperty.submittedBy],
                ["Current expiry", activeProperty.currentExpiresAt],
                ["New expiry", activeProperty.proposedExpiresAt],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
                  <p className="mt-1 text-sm text-white">{value ?? "—"}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Description</p>
              <p className="mt-2 text-sm text-slate-200">{activeProperty.description ?? "—"}</p>
            </div>

            {activeProperty.photos?.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {activeProperty.photos.slice(0, 4).map((photo) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${activeProperty.requestId}-${photo}`}
                    src={photo}
                    alt={activeProperty.name}
                    className="h-40 w-full rounded-2xl object-cover"
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
