"use client";

import Link from "next/link";
import { Check, Plus, UsersRound } from "lucide-react";

export type GiftAudienceValue = {
  preset: "everyone" | "saved";
  filters: Record<string, string>;
  audienceId?: string | null;
  audienceName?: string | null;
};

export type GiftSavedAudience = {
  id: string;
  name: string;
  description?: string | null;
  lifecycleState?: string | null;
};

export function GiftAudienceBuilder({
  value,
  onChange,
  savedAudiences = [],
}: {
  value: GiftAudienceValue;
  onChange: (value: GiftAudienceValue) => void;
  savedAudiences?: GiftSavedAudience[];
}) {
  return (
    <section className="rounded-3xl border border-black/10 bg-[#faf9f6] p-5 sm:p-6" aria-labelledby="gift-audience-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[#111] text-white">2</span>
            Audience
          </div>
          <h4 id="gift-audience-title" className="mt-3 text-lg font-semibold text-[#111]">Who can qualify?</h4>
          <p className="mt-1 text-sm leading-6 text-neutral-500">Use everyone, or reuse one centrally managed audience across Growth.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
          <UsersRound aria-hidden="true" size={13} />
          Shared rules
        </span>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          aria-pressed={!value.audienceId}
          onClick={() => onChange({ preset: "everyone", audienceId: null, audienceName: null, filters: {} })}
          className={`rounded-2xl border px-4 py-3 text-left transition-colors ${!value.audienceId ? "border-black bg-black text-white" : "border-black/10 bg-white text-neutral-800 hover:border-black/30"}`}
        >
          <span className="flex items-center justify-between gap-2 text-sm font-semibold">Every eligible agent {!value.audienceId ? <Check aria-hidden="true" size={15} /> : null}</span>
          <span className={`mt-1 block text-xs ${!value.audienceId ? "text-white/70" : "text-neutral-500"}`}>The reward rule is the only qualification gate.</span>
        </button>
        {savedAudiences.map((savedAudience) => {
          const selected = value.audienceId === savedAudience.id;
          return (
            <button
              key={savedAudience.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange({ preset: "saved", audienceId: savedAudience.id, audienceName: savedAudience.name, filters: {} })}
              className={`rounded-2xl border px-4 py-3 text-left transition-colors ${selected ? "border-black bg-black text-white" : "border-black/10 bg-white text-neutral-800 hover:border-black/30"}`}
            >
              <span className="flex items-center justify-between gap-2 text-sm font-semibold">{savedAudience.name} {selected ? <Check aria-hidden="true" size={15} /> : null}</span>
              <span className={`mt-1 block line-clamp-2 text-xs leading-5 ${selected ? "text-white/70" : "text-neutral-500"}`}>{savedAudience.description || "Reusable saved audience"}</span>
            </button>
          );
        })}
      </div>

      <Link href="/growth/audiences" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full border border-black/15 bg-white px-4 py-2 text-xs font-semibold text-neutral-800 transition-colors hover:border-black/35">
        <Plus aria-hidden="true" size={14} />
        Create or manage audiences
      </Link>
    </section>
  );
}
