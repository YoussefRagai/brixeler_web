"use client";

import { useState, type FormEvent } from "react";
import { BadgeCheck, CalendarClock, Eye, EyeOff, ImagePlus, RotateCcw, Sparkles } from "lucide-react";

type LifecycleStatus = "draft" | "scheduled" | "active" | "paused" | "archived";

const lifecycleOptions: Array<{ value: LifecycleStatus; label: string; helper: string }> = [
  { value: "draft", label: "Draft", helper: "Keep editing" },
  { value: "scheduled", label: "Scheduled", helper: "Start later" },
  { value: "active", label: "Active", helper: "Use now" },
  { value: "paused", label: "Paused", helper: "Hold awards" },
  { value: "archived", label: "Archived", helper: "Keep for history" },
];

const categories = [
  { value: "special", label: "Special", helper: "A one-off moment worth celebrating." },
  { value: "deal_milestone", label: "Deal milestone", helper: "Recognise a deal or sales goal." },
  { value: "earnings", label: "Earnings", helper: "Reward a revenue or commission milestone." },
  { value: "referrals", label: "Referrals", helper: "Celebrate helpful introductions." },
  { value: "speed", label: "Speed", helper: "Highlight fast, reliable follow-through." },
  { value: "contributions", label: "Contributions", helper: "Spotlight community or content impact." },
];

const inputClass = "mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-sm text-[#111] outline-none transition-colors placeholder:text-neutral-400 focus:border-[#7a8c26]";
const labelClass = "block text-xs font-semibold text-neutral-600";

export function BadgeCatalogForm() {
  const [status, setStatus] = useState<LifecycleStatus>("active");
  const [visibility, setVisibility] = useState<"public" | "hidden">("public");
  const [repeatability, setRepeatability] = useState<"once" | "renewable">("once");
  const [expiry, setExpiry] = useState<"permanent" | "days">("permanent");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("icon");
    const expiryDays = Number(data.get("expires_in_days"));
    if (!(file instanceof File) || file.size === 0) {
      event.preventDefault();
      setFormMessage("Add a badge icon so the achievement has a recognisable moment in the app.");
      return;
    }
    if (expiry === "days" && (!Number.isInteger(expiryDays) || expiryDays < 1)) {
      event.preventDefault();
      setFormMessage("Choose how many days the badge should remain active.");
      return;
    }
    setFormMessage(null);
    setIsSubmitting(true);
  };

  return (
    <form action="/api/admin/rewards/badges" method="post" encType="multipart/form-data" onSubmit={handleSubmit} className="space-y-5">
      <input type="hidden" name="lifecycle_state" value={status} />
      <input type="hidden" name="visibility" value={visibility} />
      <input type="hidden" name="repeatability" value={repeatability} />
      <input type="hidden" name="expiry_mode" value={expiry} />
      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-[#4d477f]"><BadgeCheck aria-hidden="true" size={16} /><p className="text-[10px] font-semibold uppercase tracking-[0.22em]">Badge identity</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label htmlFor="badge-name" className={`${labelClass} sm:col-span-2`}>Badge name <span className="text-[#8d482c]">*</span><input id="badge-name" name="name" required maxLength={100} className={inputClass} placeholder="e.g. Fast Starter" /></label>
            <label htmlFor="badge-name-ar" className={labelClass}>Arabic name<input id="badge-name-ar" name="name_ar" dir="rtl" maxLength={100} className={inputClass} placeholder="البداية السريعة" /></label>
            <label htmlFor="badge-type" className={labelClass}>Category <span className="text-[#8d482c]">*</span><select id="badge-type" name="badge_type" defaultValue="special" className={inputClass}>{categories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label htmlFor="badge-description" className={`${labelClass} sm:col-span-2`}>Story behind the badge<textarea id="badge-description" name="description" maxLength={240} rows={3} className={`${inputClass} resize-y`} placeholder="For agents who turn a first conversation into momentum." /><span className="mt-1 block font-normal text-neutral-400">This appears below the badge on a profile.</span></label>
          </div>
          <label htmlFor="badge-icon" className={`${labelClass} rounded-2xl border border-dashed border-black/15 bg-[#f7f7f2] p-3.5`}><span className="flex items-center gap-2"><ImagePlus aria-hidden="true" size={15} /> Badge icon <span className="text-[#8d482c]">*</span></span><input id="badge-icon" name="icon" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" required className="mt-2 block w-full text-xs font-normal text-neutral-600 file:mr-3 file:rounded-full file:border-0 file:bg-[#111] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-[#dff579]" /></label>
        </div>

        <div className="space-y-4 rounded-2xl bg-[#f7f7f2] p-4">
          <div className="flex items-center gap-2 text-[#4d477f]"><Sparkles aria-hidden="true" size={16} /><p className="text-[10px] font-semibold uppercase tracking-[0.22em]">Badge behaviour</p></div>
          <fieldset>
            <legend className={labelClass}>Who can see it?</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["public", "hidden"] as const).map((option) => (
                <button key={option} type="button" onClick={() => setVisibility(option)} aria-pressed={visibility === option} className={`rounded-xl border px-3 py-2.5 text-left ${visibility === option ? "border-[#4d477f] bg-[#f0effc] text-[#4d477f]" : "border-black/10 bg-white text-neutral-600 hover:border-black/25"}`}>
                  <span className="flex items-center gap-1.5 text-xs font-semibold">{option === "public" ? <Eye aria-hidden="true" size={14} /> : <EyeOff aria-hidden="true" size={14} />}{option === "public" ? "Public" : "Hidden"}</span>
                  <span className="mt-1 block text-[10px] font-normal text-neutral-500">{option === "public" ? "Visible on profiles" : "Secret until earned"}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className={labelClass}>Can it be earned again?</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["once", "renewable"] as const).map((option) => (
                <button key={option} type="button" onClick={() => setRepeatability(option)} aria-pressed={repeatability === option} className={`rounded-xl border px-3 py-2.5 text-left ${repeatability === option ? "border-[#4d477f] bg-[#f0effc] text-[#4d477f]" : "border-black/10 bg-white text-neutral-600 hover:border-black/25"}`}>
                  <span className="flex items-center gap-1.5 text-xs font-semibold">{option === "once" ? <BadgeCheck aria-hidden="true" size={14} /> : <RotateCcw aria-hidden="true" size={14} />}{option === "once" ? "Once" : "Repeatable"}</span>
                  <span className="mt-1 block text-[10px] font-normal text-neutral-500">{option === "once" ? "One lifetime moment" : "Can renew after expiry"}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <label htmlFor="badge-priority" className={labelClass}>Display priority<input id="badge-priority" name="display_order" type="number" min={0} step={1} defaultValue={0} className={inputClass} /><span className="mt-1 block font-normal text-neutral-400">Lower numbers appear first.</span></label>
          <label htmlFor="badge-benefit-type" className={labelClass}>Optional benefit<select id="badge-benefit-type" name="benefit_type" defaultValue="none" className={inputClass}><option value="none">No extra benefit</option><option value="commission_boost">Commission boost</option><option value="priority_support">Priority support</option><option value="custom">A custom benefit</option></select></label>
          <label htmlFor="badge-benefit-description" className={labelClass}>Benefit detail<textarea id="badge-benefit-description" name="benefit_description" rows={2} className={`${inputClass} resize-y`} placeholder="Featured in the monthly agent spotlight." /></label>
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <div className="flex items-center gap-2 text-[#4d477f]"><CalendarClock aria-hidden="true" size={15} /><p className="text-xs font-semibold">Expiry & availability</p></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label htmlFor="badge-expiry-mode" className={labelClass}>Expiry<select id="badge-expiry-mode" value={expiry} onChange={(event) => setExpiry(event.target.value as "permanent" | "days")} className={inputClass}><option value="permanent">Never expires</option><option value="days">Expires after a set time</option></select></label>
          <label htmlFor="badge-expires-days" className={labelClass}>Active for (days)<input id="badge-expires-days" name="expires_in_days" type="number" min={1} step={1} disabled={expiry !== "days"} required={expiry === "days"} className={`${inputClass} disabled:bg-neutral-100 disabled:text-neutral-400`} placeholder="30" /></label>
          <label htmlFor="badge-revocation" className={labelClass}>If the goal is reversed<select id="badge-revocation" name="revocation_policy" defaultValue="keep" className={inputClass}><option value="keep">Keep the earned badge</option><option value="revoke">Revoke when no longer qualified</option><option value="review">Send for admin review</option></select></label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><label htmlFor="badge-start-at" className={labelClass}>Starts (optional)<input id="badge-start-at" name="start_at" type="datetime-local" className={inputClass} /></label><label htmlFor="badge-end-at" className={labelClass}>Ends (optional)<input id="badge-end-at" name="end_at" type="datetime-local" className={inputClass} /></label></div>
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Badge lifecycle status">
          {lifecycleOptions.map((option) => <button key={option.value} type="button" onClick={() => setStatus(option.value)} aria-pressed={status === option.value} className={`rounded-xl border px-3 py-2 text-left transition-colors ${status === option.value ? "border-[#111] bg-[#111] text-[#dff579]" : "border-black/10 bg-[#f7f7f2] text-neutral-600 hover:border-black/25"}`}><span className="block text-xs font-semibold">{option.label}</span><span className={`mt-0.5 block text-[10px] ${status === option.value ? "text-white/60" : "text-neutral-400"}`}>{option.helper}</span></button>)}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-md text-[11px] leading-4 text-neutral-500">A badge stays understandable in English and Arabic, with clear rules for visibility, renewal, and revocation.</p><button type="submit" disabled={isSubmitting} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#111] px-5 py-2.5 text-sm font-semibold text-[#dff579] shadow-lg shadow-black/10 transition-colors hover:bg-black disabled:opacity-60"><BadgeCheck aria-hidden="true" size={16} />{isSubmitting ? "Saving…" : status === "active" ? "Create badge" : `Save ${status}`}</button></div>
      {formMessage ? <p role="alert" className="rounded-xl border border-[#efc5b1] bg-[#fff3ec] px-3 py-2 text-xs font-medium text-[#8d482c]">{formMessage}</p> : null}
      <p role="status" aria-live="polite" className="sr-only">{isSubmitting ? "Badge form is submitting" : ""}</p>
    </form>
  );
}
