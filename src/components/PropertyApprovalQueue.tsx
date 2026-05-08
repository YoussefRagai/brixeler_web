"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
};

const TABS = ["Proposed", "Requested Changes", "Rejected"] as const;

type Tab = (typeof TABS)[number];

export function PropertyApprovalQueue({ entries }: { entries: PropertyApprovalEntry[] }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("Proposed");
  const [activePropertyId, setActivePropertyId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"request" | "reject" | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const activeProperty = useMemo(
    () => entries.find((entry) => entry.id === activePropertyId) ?? null,
    [activePropertyId, entries],
  );

  const filtered = useMemo(() => {
    if (activeTab === "Proposed") {
      return entries.filter((entry) => entry.status === "pending" && !entry.rejectionReason);
    }
    if (activeTab === "Requested Changes") {
      return entries.filter((entry) => entry.status === "pending" && !!entry.rejectionReason);
    }
    return entries.filter((entry) => entry.status === "rejected");
  }, [activeTab, entries]);

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
    await fetch("/api/properties/update-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, status, reason: reasonText ?? null }),
    });
    router.refresh();
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={clsx(
              "rounded-full border px-4 py-2 text-xs",
              activeTab === tab
                ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-200"
                : "border-black/10 text-neutral-600 hover:bg-black/5",
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        {filtered.map((property) => (
          <article key={property.id} className="rounded-2xl border border-black/5 bg-black/5 p-4 text-sm text-neutral-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-neutral-900">{property.name}</p>
                <p className="text-neutral-600">
                  {property.area} · {property.price}
                </p>
              </div>
              <span className="rounded-full border border-black/10 px-3 py-1 text-xs">{activeTab}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-neutral-500">
              <p>Submitted by: {property.submittedBy ?? "—"}</p>
              <p>Received: {property.submittedAt ?? "—"}</p>
            </div>
            {property.rejectionReason && activeTab !== "Proposed" ? (
              <p className="mt-2 text-xs text-neutral-500">{property.rejectionReason}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="rounded-full border border-black/10 px-3 py-1 text-xs text-neutral-700 hover:bg-black/5"
                onClick={() => setActivePropertyId(property.id)}
              >
                Review details
              </button>
              {activeTab === "Proposed" ? (
                <>
                  <button
                    className="rounded-full bg-emerald-400 px-3 py-1 text-xs font-semibold text-emerald-950"
                    onClick={() => updateStatus(property.id, "approved")}
                  >
                    Approve
                  </button>
                  <button
                    className="rounded-full border border-black/10 px-3 py-1 text-xs text-neutral-700 hover:bg-black/5"
                    onClick={() => {
                      setActionId(property.id);
                      setActionType("request");
                    }}
                  >
                    Request changes
                  </button>
                  <button
                    className="rounded-full border border-rose-300/50 px-3 py-1 text-xs text-rose-200 hover:bg-rose-500/10"
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
              className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-900"
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
