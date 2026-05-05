"use client";

import { useMemo, useState } from "react";

export function VariantOutdoorFields({
  defaultHasGarden = false,
  defaultGardenAreaSqm,
  defaultHasRoof = false,
  defaultRoofAreaSqm,
}: {
  defaultHasGarden?: boolean;
  defaultGardenAreaSqm?: number | null;
  defaultHasRoof?: boolean;
  defaultRoofAreaSqm?: number | null;
}) {
  const [hasGarden, setHasGarden] = useState(defaultHasGarden ? "yes" : "no");
  const [hasRoof, setHasRoof] = useState(defaultHasRoof ? "yes" : "no");

  const gardenVisible = useMemo(() => hasGarden === "yes", [hasGarden]);
  const roofVisible = useMemo(() => hasRoof === "yes", [hasRoof]);

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Garden</span>
          <select
            className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
            name="variantHasGarden"
            value={hasGarden}
            onChange={(event) => setHasGarden(event.target.value)}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Roof</span>
          <select
            className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
            name="variantHasRoof"
            value={hasRoof}
            onChange={(event) => setHasRoof(event.target.value)}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {gardenVisible ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Garden size (m²)</span>
            <input
              className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
              name="variantGardenAreaSqm"
              type="number"
              min="0"
              step="0.01"
              defaultValue={defaultGardenAreaSqm ?? undefined}
              placeholder="40"
            />
          </label>
        ) : (
          <input name="variantGardenAreaSqm" type="hidden" value="" />
        )}
        {roofVisible ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Roof size (m²)</span>
            <input
              className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
              name="variantRoofAreaSqm"
              type="number"
              min="0"
              step="0.01"
              defaultValue={defaultRoofAreaSqm ?? undefined}
              placeholder="25"
            />
          </label>
        ) : (
          <input name="variantRoofAreaSqm" type="hidden" value="" />
        )}
      </div>
    </>
  );
}
