"use client";

import Link from "next/link";
import { Check, Plus, UsersRound } from "lucide-react";

export type RewardAudienceOption = {
  id: string;
  name: string;
  description?: string | null;
  estimatedCount?: number | null;
};

export function RewardAudienceBuilder({
  audiences,
  value,
  onChange,
}: {
  audiences: RewardAudienceOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = audiences.find((audience) => audience.id === value);

  return (
    <section className="rounded-[1.4rem] border border-black/10 bg-[#f7f7f2] p-4 sm:p-5" aria-labelledby="reward-audience-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <UsersRound aria-hidden="true" size={16} className="text-[#4c5d11]" />
            <p id="reward-audience-title" className="text-sm font-semibold text-[#111]">Who can qualify?</p>
          </div>
          <p className="mt-1 text-xs leading-5 text-neutral-600">Use everyone, or reuse a saved audience whose rules are shared across Growth.</p>
        </div>
        <span className="rounded-full border border-[#d9dfbf] bg-[#f1f5d9] px-3 py-1 text-[11px] font-semibold text-[#4c5d11]">
          {selected?.estimatedCount != null ? `${selected.estimatedCount} estimated` : selected ? "Saved audience" : "Everyone"}
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChange("")}
          aria-pressed={!value}
          className={`rounded-2xl border p-3 text-left transition-colors ${!value ? "border-[#718327] bg-[#f1f5d9]" : "border-black/10 bg-white hover:border-black/25"}`}
        >
          <span className="flex items-center justify-between gap-2 text-xs font-semibold text-[#111]">Every eligible agent {!value ? <Check aria-hidden="true" size={15} /> : null}</span>
          <span className="mt-1 block text-[10px] leading-4 text-neutral-500">The reward metric remains the only qualification rule.</span>
        </button>
        {audiences.map((audience) => (
          <button
            key={audience.id}
            type="button"
            onClick={() => onChange(audience.id)}
            aria-pressed={value === audience.id}
            className={`rounded-2xl border p-3 text-left transition-colors ${value === audience.id ? "border-[#718327] bg-[#f1f5d9]" : "border-black/10 bg-white hover:border-black/25"}`}
          >
            <span className="flex items-center justify-between gap-2 text-xs font-semibold text-[#111]">{audience.name} {value === audience.id ? <Check aria-hidden="true" size={15} /> : null}</span>
            <span className="mt-1 block line-clamp-2 text-[10px] leading-4 text-neutral-500">{audience.description || "Reusable saved audience"}</span>
          </button>
        ))}
      </div>

      <Link href="/growth/audiences" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-black/15 bg-white px-4 py-2 text-xs font-semibold text-[#111] transition-colors hover:border-black/35">
        <Plus aria-hidden="true" size={14} />
        Create or manage audiences
      </Link>
    </section>
  );
}
