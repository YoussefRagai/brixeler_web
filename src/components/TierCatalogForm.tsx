"use client";

import { useState, type FormEvent } from "react";
import { ArrowUp, CalendarClock, Check, ImagePlus, Layers3, ShieldCheck } from "lucide-react";

type LifecycleStatus = "draft" | "scheduled" | "active" | "paused" | "archived";

const lifecycleOptions: Array<{ value: LifecycleStatus; label: string; helper: string }> = [
  { value: "draft", label: "Draft", helper: "Keep editing" },
  { value: "scheduled", label: "Scheduled", helper: "Start later" },
  { value: "active", label: "Active", helper: "Use now" },
  { value: "paused", label: "Paused", helper: "Hold movement" },
  { value: "archived", label: "Archived", helper: "Keep for history" },
];

const inputClass = "mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-sm text-[#111] outline-none transition-colors placeholder:text-neutral-400 focus:border-[#7a8c26]";
const labelClass = "block text-xs font-semibold text-neutral-600";
const promotionMetrics = [
  { value: "deals_count", label: "Closed deals" },
  { value: "revenue", label: "Revenue earned" },
  { value: "referrals", label: "Successful referrals" },
] as const;

export function TierCatalogForm({ existingLevels = [] }: { existingLevels?: number[] }) {
  const [status, setStatus] = useState<LifecycleStatus>("active");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    const data = new FormData(form);
    const level = Number(data.get("level"));
    const promotionThreshold = Number(data.get("promotion_threshold"));
    const file = data.get("icon");
    if (!Number.isInteger(level) || level < 1) {
      event.preventDefault();
      setFormMessage("Choose a whole-number level from 1 upwards.");
      return;
    }
    if (existingLevels.includes(level)) {
      event.preventDefault();
      setFormMessage(`Level ${level} already exists. Choose the next open level so the ladder stays ordered.`);
      return;
    }
    if (!Number.isFinite(promotionThreshold) || promotionThreshold < 1) {
      event.preventDefault();
      setFormMessage("Add a positive numeric promotion threshold.");
      return;
    }
    if (!(file instanceof File) || file.size === 0) {
      event.preventDefault();
      setFormMessage("Add a tier icon so agents can recognise this level in the app.");
      return;
    }
    setFormMessage(null);
    setIsSubmitting(true);
  };

  return (
    <form action="/api/admin/rewards/tiers" method="post" encType="multipart/form-data" onSubmit={handleSubmit} className="space-y-5">
      <input type="hidden" name="lifecycle_state" value={status} />
      <input type="hidden" name="promotion_policy" value="automatic" />
      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-[#4c5d11]">
            <Layers3 aria-hidden="true" size={16} />
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em]">Tier identity</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label htmlFor="tier-name" className={`${labelClass} sm:col-span-2`}>
              Tier name <span className="text-[#8d482c]">*</span>
              <input id="tier-name" name="name" required maxLength={100} className={inputClass} placeholder="e.g. Momentum" />
            </label>
            <label htmlFor="tier-name-ar" className={labelClass}>
              Arabic name
              <input id="tier-name-ar" name="name_ar" dir="rtl" maxLength={100} className={inputClass} placeholder="الزخم" />
            </label>
            <label htmlFor="tier-level" className={labelClass}>
              Ladder level <span className="text-[#8d482c]">*</span>
              <input id="tier-level" name="level" required min={1} step={1} type="number" className={inputClass} placeholder="2" />
            </label>
            <label htmlFor="tier-description" className={`${labelClass} sm:col-span-2`}>
              Promise to the agent
              <textarea id="tier-description" name="description" maxLength={240} rows={3} className={`${inputClass} resize-y`} placeholder="The level that recognises a consistent pipeline." />
              <span className="mt-1 block font-normal text-neutral-400">Keep it short; this copy appears on the agent profile.</span>
            </label>
          </div>
          <label htmlFor="tier-icon" className={`${labelClass} rounded-2xl border border-dashed border-black/15 bg-[#f7f7f2] p-3.5`}>
            <span className="flex items-center gap-2"><ImagePlus aria-hidden="true" size={15} /> Tier icon <span className="text-[#8d482c]">*</span></span>
            <input id="tier-icon" name="icon" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" required className="mt-2 block w-full text-xs font-normal text-neutral-600 file:mr-3 file:rounded-full file:border-0 file:bg-[#111] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-[#dff579]" />
          </label>
        </div>

        <div className="space-y-4 rounded-2xl bg-[#f7f7f2] p-4">
          <div className="flex items-center gap-2 text-[#4c5d11]">
            <ShieldCheck aria-hidden="true" size={16} />
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em]">Benefit & movement</p>
          </div>
          <label htmlFor="tier-benefit-type" className={labelClass}>
            What does this level unlock?
            <select id="tier-benefit-type" name="benefitType" defaultValue="commission_boost" className={inputClass}>
              <option value="none">No extra benefit</option>
              <option value="commission_boost">Commission boost</option>
              <option value="priority_support">Priority support</option>
              <option value="custom">A custom benefit</option>
            </select>
          </label>
          <label htmlFor="tier-benefit-value" className={labelClass}>
            Boost amount (optional)
            <div className="relative">
              <input id="tier-benefit-value" name="benefitValue" type="number" min={0} step="0.01" className={`${inputClass} pr-10`} placeholder="0.25" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400">%</span>
            </div>
          </label>
          <label htmlFor="tier-benefit-description" className={labelClass}>
            Explain the benefit
            <textarea id="tier-benefit-description" name="benefitDescription" rows={2} maxLength={180} className={`${inputClass} resize-y`} placeholder="Adds +0.25% on top of project commission." />
          </label>
          <label htmlFor="tier-demotion" className={labelClass}>
            If an agent misses the goal
            <select id="tier-demotion" name="demotion_policy" defaultValue="hold" className={inputClass}>
              <option value="hold">Keep their current level</option>
              <option value="demote">Move them down after the review period</option>
              <option value="reset">Reset them at the start of each period</option>
            </select>
          </label>
          <div className="rounded-xl border border-[#d9dfbf] bg-[#f1f5d9] px-3 py-2.5 text-[11px] leading-4 text-[#4c5d11]">
            <ArrowUp aria-hidden="true" size={14} className="mb-1" />
            Higher levels replace lower levels. The builder will show the expected movement before activation.
          </div>
        </div>
      </div>

      <div className="grid gap-4 border-t border-black/10 pt-5 sm:grid-cols-2">
        <label htmlFor="tier-promotion-metric" className={labelClass}>
          Promotion signal <span className="text-[#8d482c]">*</span>
          <select id="tier-promotion-metric" name="promotion_metric" defaultValue="deals_count" required className={inputClass}>
            {promotionMetrics.map((metric) => <option key={metric.value} value={metric.value}>{metric.label}</option>)}
          </select>
          <span className="mt-1 block font-normal text-neutral-400">These signals are available to mobile tier progress.</span>
        </label>
        <label htmlFor="tier-promotion-threshold" className={labelClass}>
          Promotion threshold <span className="text-[#8d482c]">*</span>
          <input id="tier-promotion-threshold" name="promotion_threshold" required min={1} step="any" type="number" className={inputClass} placeholder="10" />
          <span className="mt-1 block font-normal text-neutral-400">The numeric target for the next level.</span>
        </label>
        <label htmlFor="tier-review-window" className={labelClass}>
          Review cadence
          <select id="tier-review-window" name="review_window" defaultValue="quarter" className={inputClass}>
            <option value="all_time">All-time progress</option>
            <option value="last_30d">Every 30 days</option>
            <option value="last_90d">Every 90 days</option>
            <option value="quarter">Each quarter</option>
            <option value="year">Each year</option>
          </select>
        </label>
        <label htmlFor="tier-stacking" className={labelClass}>
          Benefit stacking
          <select id="tier-stacking" name="benefit_stacking" defaultValue="highest_only" className={inputClass}>
            <option value="highest_only">Highest tier benefit only</option>
            <option value="stack">Stack with other rewards</option>
              <option value="review">Ask an admin to review conflicts</option>
          </select>
        </label>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="flex items-center gap-2 text-[#4c5d11]"><CalendarClock aria-hidden="true" size={15} /><p className="text-xs font-semibold">When should this level be available?</p></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label htmlFor="tier-start-at" className={labelClass}>Starts (optional)<input id="tier-start-at" name="start_at" type="datetime-local" className={inputClass} /></label>
          <label htmlFor="tier-end-at" className={labelClass}>Ends (optional)<input id="tier-end-at" name="end_at" type="datetime-local" className={inputClass} /></label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Tier lifecycle status">
          {lifecycleOptions.map((option) => (
            <button key={option.value} type="button" onClick={() => setStatus(option.value)} aria-pressed={status === option.value} className={`rounded-xl border px-3 py-2 text-left transition-colors ${status === option.value ? "border-[#111] bg-[#111] text-[#dff579]" : "border-black/10 bg-[#f7f7f2] text-neutral-600 hover:border-black/25"}`}>
              <span className="block text-xs font-semibold">{option.label}</span>
              <span className={`mt-0.5 block text-[10px] ${status === option.value ? "text-white/60" : "text-neutral-400"}`}>{option.helper}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-[11px] leading-4 text-neutral-500">A tier can be previewed before it changes any agent profile. Required fields are marked with an asterisk.</p>
        <button type="submit" disabled={isSubmitting} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#111] px-5 py-2.5 text-sm font-semibold text-[#dff579] shadow-lg shadow-black/10 transition-colors hover:bg-black disabled:opacity-60">
          <Check aria-hidden="true" size={16} />
          {isSubmitting ? "Saving…" : status === "active" ? "Create tier" : `Save ${status}`}
        </button>
      </div>
      {formMessage ? <p role="alert" className="rounded-xl border border-[#efc5b1] bg-[#fff3ec] px-3 py-2 text-xs font-medium text-[#8d482c]">{formMessage}</p> : null}
      <p role="status" aria-live="polite" className="sr-only">{isSubmitting ? "Tier form is submitting" : ""}</p>
    </form>
  );
}
