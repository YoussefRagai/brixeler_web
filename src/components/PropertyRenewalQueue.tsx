"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";

export type PropertyRenewalEntry = {
  id: string;
  requestId: string;
  name: string;
  area: string;
  price: string;
  status: "pending" | "approved" | "rejected" | string;
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

type Tab = "Proposed" | "Rejected";

type Props = {
  entries: PropertyRenewalEntry[];
};

export function PropertyRenewalQueue({ entries }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("Proposed");
  const [activePropertyId, setActivePropertyId] = useState<string | null>(null);

  const activeProperty = useMemo(
    () => entries.find((entry) => entry.id === activePropertyId) ?? null,
    [activePropertyId, entries],
  );

  const filtered = useMemo(() => {
    if (activeTab === "Proposed") {
      return entries.filter((entry) => entry.status === "pending");
    }
    return entries.filter((entry) => entry.status === "rejected");
  }, [activeTab, entries]);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveTab(activeTab === "Proposed" ? "Rejected" : "Proposed")}
          className={clsx(
            "rounded-full border px-4 py-2 text-xs",
            activeTab === "Rejected"
              ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-200"
              : "border-white/10 text-slate-300 hover:bg-white/10",
          )}
        >
          {activeTab === "Proposed" ? "View rejected" : "Back to proposed"}
        </button>
      </div>

      <div className="mt-6 space-y-4">
        {filtered.map((property) => (
          <article key={property.id} className="rounded-2xl border border-white/5 bg-black/20 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-white">{property.name}</p>
                <p className="text-slate-400">
                  {property.area} · {property.price}
                </p>
              </div>
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs">{activeTab}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-slate-400">
              <p>Submitted by: {property.submittedBy ?? "—"}</p>
              <p>Received: {property.submittedAt ?? "—"}</p>
            </div>
            {property.rejectionReason && activeTab === "Rejected" ? (
              <p className="mt-2 text-xs text-slate-400">{property.rejectionReason}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
                onClick={() => setActivePropertyId(property.id)}
              >
                Review details
              </button>
              {activeTab === "Proposed" ? (
                <>
                  <button
                    className="rounded-full bg-emerald-400 px-3 py-1 text-xs font-semibold text-emerald-950"
                    onClick={async () => {
                      await fetch("/api/properties/renewals/approve", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ requestId: property.requestId }),
                      });
                      window.location.reload();
                    }}
                  >
                    Approve renewal
                  </button>
                  <button
                    className="rounded-full border border-rose-300/50 px-3 py-1 text-xs text-rose-200 hover:bg-rose-500/10"
                    onClick={async () => {
                      await fetch("/api/properties/renewals/reject", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ requestId: property.requestId }),
                      });
                      window.location.reload();
                    }}
                  >
                    Reject renewal
                  </button>
                </>
              ) : null}
            </div>
          </article>
        ))}
        {!filtered.length && <p className="text-sm text-slate-400">No renewals in this tab.</p>}
      </div>

      {activeProperty ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-[#0f1115] p-6 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Property</p>
                <p className="text-2xl font-semibold text-white">{activeProperty.name}</p>
                <p className="text-xs text-slate-400">{activeProperty.area} · {activeProperty.price}</p>
              </div>
              <button
                className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/80"
                onClick={() => setActivePropertyId(null)}
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Type</p>
                <p className="text-sm text-white">{activeProperty.propertyType ?? "—"}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Bedrooms</p>
                <p className="text-sm text-white">{activeProperty.bedrooms ?? "—"}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Bathrooms</p>
                <p className="text-sm text-white">{activeProperty.bathrooms ?? "—"}</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Description</p>
              <p className="mt-2 text-sm text-slate-200">{activeProperty.description ?? "—"}</p>
            </div>

            {activeProperty.photos?.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {activeProperty.photos.slice(0, 4).map((photo) => (
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
                  <span key={amenity} className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-200">
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
