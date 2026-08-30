"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { clsx } from "clsx";
import { useRouter } from "next/navigation";

export type PropertyApprovalEntry = {
  id: string;
  name: string;
  area: string;
  price: string;
  status: "pending" | "rejected" | "approved" | "expired" | string;
  rejectionReason?: string | null;
  submittedBy?: string | null;
  submittedAt?: string | null;
  description?: string | null;
  photos?: string[];
  bedrooms?: number | null;
  bathrooms?: number | null;
  unitArea?: number | null;
  propertyType?: string | null;
  amenities?: string[] | null;
  isDemo?: boolean;
  isActive?: boolean;
  expiresAt?: string | null;
  publishedAt?: string | null;
  developerName?: string | null;
  projectName?: string | null;
  projectApprovalStatus?: string | null;
  projectLifecycleState?: string | null;
  publicationChecklist?: PropertyChecklistItem[];
  qualityIssues?: string[];
};

export type PropertyChecklistItem = {
  key: string;
  label: string;
  ready: boolean;
};

const TABS = ["Proposed", "Requested Changes", "Rejected"] as const;

type Tab = (typeof TABS)[number];

type Props = {
  entries: PropertyApprovalEntry[];
  activeTab?: (typeof TABS)[number] | string;
  counts?: Partial<Record<(typeof TABS)[number] | string, number>>;
  page?: number;
  pageSize?: number;
  hasNext?: boolean;
  search?: string;
};

export function PropertyApprovalQueue({ entries, activeTab: initialTab = "Proposed", counts = {}, page = 1, pageSize = 25, hasNext = false, search = "" }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>((TABS.includes(initialTab as Tab) ? initialTab : "Proposed") as Tab);
  const [activePropertyId, setActivePropertyId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"request" | "reject" | null>(null);
  const [busyPropertyId, setBusyPropertyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const activeProperty = useMemo(
    () => entries.find((entry) => entry.id === activePropertyId) ?? null,
    [activePropertyId, entries],
  );

  const filtered = useMemo(() => entries, [entries]);

  useEffect(() => {
    const nextTab = TABS.includes(initialTab as Tab) ? initialTab as Tab : "Proposed";
    setActiveTab(nextTab);
  }, [initialTab]);

  const navigateToTab = (tab: Tab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    params.set("propertyStatus", tab === "Proposed" ? "proposed" : tab === "Requested Changes" ? "requested" : "rejected");
    params.set("propertyPage", "1");
    if (search) params.set("propertySearch", search);
    else params.delete("propertySearch");
    startTransition(() => router.push(`/properties?${params.toString()}`));
  };

  const navigateToPage = (nextPage: number) => {
    const params = new URLSearchParams(window.location.search);
    params.set("propertyPage", String(nextPage));
    startTransition(() => router.push(`/properties?${params.toString()}`));
  };

  useEffect(() => {
    if (!activeProperty) return;
    closeButtonRef.current?.focus();
  }, [activeProperty]);

  useEffect(() => {
    if (!activeProperty) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActivePropertyId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeProperty]);

  const updateStatus = async (propertyId: string, status: string, reasonText?: string) => {
    setBusyPropertyId(propertyId);
    setFeedback(null);
    try {
      const response = await fetch("/api/properties/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, status, reason: reasonText ?? null }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Unable to update this listing.");
      setFeedback(status === "approved" ? "Listing approved and published to the mobile catalog." : "Listing review updated.");
      router.refresh();
    } catch (error) {
      setFeedback((error as Error).message);
    } finally {
      setBusyPropertyId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            aria-pressed={activeTab === tab}
            onClick={() => navigateToTab(tab)}
            className={clsx(
              "min-h-11 rounded-full border px-4 py-2 text-xs font-semibold transition",
              activeTab === tab
                ? "border-black bg-black text-white"
                : "border-black/20 bg-white text-neutral-700 hover:bg-black/5",
            )}
          >
            {tab} <span className="ml-1 opacity-70">{counts[tab === "Proposed" ? "proposed" : tab === "Requested Changes" ? "requested" : "rejected"] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        {feedback ? <p role="status" className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-neutral-700">{feedback}</p> : null}
        {filtered.map((property) => (
          <article key={property.id} className="rounded-2xl border border-black/5 bg-black/5 p-4 text-sm text-neutral-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="flex items-center gap-2 font-semibold text-neutral-900">{property.name}{property.isDemo ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-800">DEMO</span> : null}</p>
                <p className="text-neutral-600">
                  {property.area} · {property.price}
                </p>
              </div>
              <span className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold text-neutral-700">{activeTab}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-neutral-500">
              <p>Submitted by: {property.submittedBy ?? "—"}</p>
              <p>Received: {property.submittedAt ?? "—"}</p>
            </div>
            {property.rejectionReason && activeTab !== "Proposed" ? (
              <p className="mt-2 text-xs text-neutral-500">{property.rejectionReason}</p>
            ) : null}
            <div className="mt-3 rounded-xl border border-black/10 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Publication checklist</p><span className={property.qualityIssues?.length ? "text-xs font-semibold text-rose-700" : "text-xs font-semibold text-emerald-700"}>{property.qualityIssues?.length ? `${property.qualityIssues.length} blocker${property.qualityIssues.length === 1 ? "" : "s"}` : "Ready"}</span></div>
              <div className="mt-2 grid gap-1 sm:grid-cols-2">{(property.publicationChecklist ?? []).map((item) => <span key={item.key} className={`text-xs ${item.ready ? "text-emerald-700" : "text-rose-700"}`}>{item.ready ? "✓" : "!"} {item.label}</span>)}</div>
            </div>
            <p className="mt-2 text-xs text-neutral-500">Source: {property.developerName ?? property.submittedBy ?? "—"}{property.projectName ? ` · Project: ${property.projectName}` : ""}{property.projectApprovalStatus ? ` · Project ${property.projectApprovalStatus}` : ""}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="rounded-full border border-black/10 px-3 py-1 text-xs text-neutral-700 hover:bg-black/5"
                type="button"
                onClick={() => setActivePropertyId(property.id)}
              >
                Review details
              </button>
              {activeTab === "Proposed" ? (
                <>
                  <button
                    className="rounded-full bg-emerald-400 px-3 py-1 text-xs font-semibold text-emerald-950"
                    type="button"
                    disabled={busyPropertyId === property.id || isPending || Boolean(property.qualityIssues?.length)}
                    onClick={() => {
                      if (window.confirm(`Approve ${property.name} and publish it to agents?`)) updateStatus(property.id, "approved");
                    }}
                  >
                    {busyPropertyId === property.id ? "Updating…" : "Approve"}
                  </button>
                  <button
                    className="rounded-full border border-black/10 px-3 py-1 text-xs text-neutral-700 hover:bg-black/5"
                    type="button"
                    onClick={() => {
                      setActionId(property.id);
                      setActionType("request");
                    }}
                  >
                    Request changes
                  </button>
                  <button
                    className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                    type="button"
                    onClick={() => {
                      setActionId(property.id);
                      setActionType("reject");
                    }}
                  >
                    Reject
                  </button>
                </>
              ) : null}
            </div>
          </article>
        ))}
        {!filtered.length && <p className="text-sm text-neutral-500">No listings in this tab.</p>}
      </div>

      {actionId && actionType ? (
        <div className="mt-4 rounded-2xl border border-black/10 bg-black/5 p-4 text-sm text-neutral-700">
          <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">
            {actionType === "reject" ? "Rejection reason" : "Change request"}
          </p>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            placeholder={actionType === "reject" ? "Explain why this listing is rejected" : "Describe the changes needed"}
            className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
              disabled={busyPropertyId !== null || !reason.trim()}
              onClick={() => {
                if (!reason.trim()) return;
                updateStatus(actionId, actionType === "reject" ? "rejected" : "pending", reason.trim());
                setActionId(null);
                setActionType(null);
                setReason("");
              }}
            >
              Submit
            </button>
            <button
              type="button"
              className="rounded-full border border-black/10 px-4 py-2 text-xs text-neutral-700"
              onClick={() => {
                setActionId(null);
                setActionType(null);
                setReason("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-500">
        <span>Page {page} · Showing {filtered.length} of {counts[activeTab === "Proposed" ? "proposed" : activeTab === "Requested Changes" ? "requested" : "rejected"] ?? filtered.length} · {pageSize} per page</span>
        <div className="flex gap-2">
          {page > 1 ? <button type="button" onClick={() => navigateToPage(page - 1)} disabled={isPending} className="rounded-full border border-black/10 px-3 py-2 text-neutral-700 disabled:opacity-50">Previous</button> : null}
          {hasNext ? <button type="button" onClick={() => navigateToPage(page + 1)} disabled={isPending} className="rounded-full border border-black/10 px-3 py-2 text-neutral-700 disabled:opacity-50">Next</button> : null}
        </div>
      </div>

      {activeProperty ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          onClick={() => setActivePropertyId(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Property details"
            className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-black/10 bg-white p-6 text-neutral-900 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Property</p>
                <p className="text-2xl font-semibold text-neutral-900">{activeProperty.name}</p>
                <p className="text-xs text-neutral-500">{activeProperty.area} · {activeProperty.price}</p>
              </div>
              <button
                ref={closeButtonRef}
                className="rounded-full border border-black/10 px-3 py-1 text-xs text-neutral-700"
                onClick={() => setActivePropertyId(null)}
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-black/10 bg-black/5 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Type</p>
                <p className="text-sm text-neutral-900">{activeProperty.propertyType ?? "—"}</p>
              </div>
              <div className="rounded-2xl border border-black/10 bg-black/5 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Bedrooms</p>
                <p className="text-sm text-neutral-900">{activeProperty.bedrooms ?? "—"}</p>
              </div>
              <div className="rounded-2xl border border-black/10 bg-black/5 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Bathrooms</p>
                <p className="text-sm text-neutral-900">{activeProperty.bathrooms ?? "—"}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-black/10 bg-black/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Publication checklist</p>
                  <span className={activeProperty.qualityIssues?.length ? "text-xs font-semibold text-rose-700" : "text-xs font-semibold text-emerald-700"}>
                    {activeProperty.qualityIssues?.length ? `${activeProperty.qualityIssues.length} blocker${activeProperty.qualityIssues.length === 1 ? "" : "s"}` : "Ready"}
                  </span>
                </div>
                <div className="mt-2 space-y-1">
                  {(activeProperty.publicationChecklist ?? []).map((item) => (
                    <p key={item.key} className={`text-xs ${item.ready ? "text-emerald-700" : "text-rose-700"}`}>
                      {item.ready ? "✓" : "!"} {item.label}
                    </p>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-black/10 bg-black/5 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Mobile visibility</p>
                <p className="mt-2 text-sm text-neutral-900">{activeProperty.isActive ? "Visible to agents" : "Hidden until approved"}</p>
                <p className="mt-1 text-xs text-neutral-500">Project: {activeProperty.projectName ?? "Direct listing"} · {activeProperty.projectApprovalStatus ?? "No linked project"}</p>
                <p className="mt-1 text-xs text-neutral-500">Published: {activeProperty.publishedAt ? new Date(activeProperty.publishedAt).toLocaleString() : "Not published"} · Expires: {activeProperty.expiresAt ? new Date(activeProperty.expiresAt).toLocaleDateString() : "—"}</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-black/10 bg-black/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Description</p>
              <p className="mt-2 text-sm text-neutral-700">{activeProperty.description ?? "—"}</p>
            </div>

            {activeProperty.photos?.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {activeProperty.photos.slice(0, 4).map((photo) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={photo}
                    src={photo}
                    alt={activeProperty.name}
                    className="h-40 w-full rounded-2xl object-cover"
                  />
                ))}
              </div>
            ) : null}

            {activeProperty.amenities?.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {activeProperty.amenities.map((amenity) => (
                  <span key={amenity} className="rounded-full border border-black/10 px-3 py-1 text-xs text-neutral-700">
                    {amenity}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
