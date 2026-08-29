"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown, CircleHelp, PackageCheck, Upload } from "lucide-react";

type GiftTier = { id: string; name: string; level: number | null };

const fieldClass = "mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-sm text-[#111] outline-none transition-colors placeholder:text-neutral-400 focus:border-black focus:ring-2 focus:ring-black/10";
const labelClass = "block text-xs font-semibold text-neutral-700";

export function GiftCreateForm({ tiers }: { tiers: GiftTier[] }) {
  const [formError, setFormError] = useState<string | null>(null);

  const validateDates = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const status = String(data.get("lifecycle_state") ?? "draft");
    const startsAt = String(data.get("start_at") ?? "");
    const endsAt = String(data.get("end_at") ?? "");
    if (status === "scheduled" && !startsAt) return "Add a start date for a scheduled reward.";
    if ((startsAt && Number.isNaN(new Date(startsAt).getTime())) || (endsAt && Number.isNaN(new Date(endsAt).getTime()))) return "Use a valid date and time.";
    if (startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      return "The end date must be after the start date.";
    }
    const stock = String(data.get("quantity") ?? "").trim();
    if (stock && (!Number.isInteger(Number(stock)) || Number(stock) < 1)) return "Available stock must be a whole number of one or more.";
    const valueAmount = String(data.get("value_amount") ?? "").trim();
    if (valueAmount && (!Number.isFinite(Number(valueAmount)) || Number(valueAmount) < 0)) return "Value amount must be zero or more.";
    for (const field of ["max_concurrent_claims", "fulfillment_sla_hours", "max_total_claims", "claim_window_days"]) {
      const value = String(data.get(field) ?? "").trim();
      if (value && (!Number.isInteger(Number(value)) || Number(value) < 1)) return `${field.replaceAll("_", " ")} must be a whole number of one or more.`;
    }
    return null;
  };

  return (
    <section id="gift-catalog" className="rounded-3xl border border-black/10 bg-white shadow-[0_16px_44px_rgba(0,0,0,0.05)]" aria-labelledby="gift-create-title">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/5 px-5 py-5 sm:px-7">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">
            <PackageCheck aria-hidden="true" size={14} />
            Reward catalog
          </div>
          <h3 id="gift-create-title" className="mt-2 text-xl font-semibold text-[#111]">Add a reward</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-500">Keep the promise clear for the agent and the team that fulfils it.</p>
        </div>
        <span className="rounded-full border border-black/10 bg-[#faf9f6] px-3 py-1.5 text-xs font-semibold text-neutral-600">Catalog item</span>
      </div>

      <form
        action="/api/admin/gifts/create"
        method="post"
        encType="multipart/form-data"
        className="space-y-7 px-5 py-6 sm:px-7"
        onSubmit={(event) => {
          const message = validateDates(event.currentTarget);
          if (message) {
            event.preventDefault();
            setFormError(message);
            return;
          }
          setFormError(null);
        }}
      >
        <fieldset>
          <legend className="text-sm font-semibold text-[#111]">Basics</legend>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <label className={labelClass} htmlFor="gift-title">
              Reward name <span className="text-rose-600">*</span>
              <input id="gift-title" name="title" required className={fieldClass} placeholder="e.g. Summer retreat" />
            </label>
            <label className={labelClass} htmlFor="gift-title-ar">
              Arabic name
              <input id="gift-title-ar" name="title_ar" className={fieldClass} dir="rtl" placeholder="اسم الهدية" />
            </label>
            <label className={labelClass} htmlFor="gift-type">
              Reward type
              <select id="gift-type" name="gift_type" className={fieldClass} defaultValue="experience">
                <option value="experience">Experience</option>
                <option value="physical">Physical gift</option>
                <option value="digital">Digital reward</option>
                <option value="cash">Cash equivalent</option>
                <option value="discount">Discount</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className={labelClass} htmlFor="gift-icon">
              Cover image <span className="text-rose-600">*</span>
              <span className="relative mt-1.5 flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-black/20 bg-[#faf9f6] px-3.5 py-2.5 text-sm font-normal text-neutral-600">
                <Upload aria-hidden="true" size={15} />
                <span>Choose a square image</span>
                <input id="gift-icon" name="icon" type="file" accept="image/*" required className="absolute inset-0 cursor-pointer opacity-0" />
              </span>
            </label>
            <label className={`${labelClass} md:col-span-2`} htmlFor="gift-description">
              Short description
              <textarea id="gift-description" name="description" rows={3} className={`${fieldClass} py-3`} placeholder="What is the agent receiving, in one or two sentences?" />
            </label>
          </div>
        </fieldset>

        <fieldset className="border-t border-black/5 pt-6">
          <legend className="text-sm font-semibold text-[#111]">Value and fulfilment</legend>
          <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <label className={labelClass} htmlFor="gift-value">
              Value amount
              <input id="gift-value" name="value_amount" type="number" min="0" step="any" className={fieldClass} placeholder="e.g. 1200" />
            </label>
            <label className={labelClass} htmlFor="gift-cost">
              Internal cost
              <input id="gift-cost" name="cost" className={fieldClass} placeholder="Optional" />
            </label>
            <label className={labelClass} htmlFor="gift-stock">
              Available stock
              <input id="gift-stock" name="quantity" type="number" min="1" step="1" className={fieldClass} placeholder="Unlimited" />
            </label>
            <label className={labelClass} htmlFor="gift-vendor">
              Vendor or partner
              <input id="gift-vendor" name="vendor" className={fieldClass} placeholder="e.g. Palm Hills concierge" />
            </label>
            <label className={labelClass} htmlFor="gift-fulfillment-owner">
              Fulfilment owner
              <input id="gift-fulfillment-owner" name="fulfillment_owner" className={fieldClass} placeholder="e.g. Growth Ops" />
            </label>
            <label className={labelClass} htmlFor="gift-redemption-method">
              Redemption method
              <select id="gift-redemption-method" name="fulfillment_method" className={fieldClass} defaultValue="manual">
                <option value="manual">Team confirms manually</option>
                <option value="shipping">Ship to agent</option>
                <option value="wallet">Credit an agent wallet</option>
                <option value="coupon">Send a redemption code</option>
                <option value="external">External partner fulfilment</option>
                <option value="none">No fulfilment needed</option>
              </select>
            </label>
            <label className={labelClass} htmlFor="gift-cta">
              Mobile button label
              <input id="gift-cta" name="cta" className={fieldClass} defaultValue="View reward" />
            </label>
            <label className={`${labelClass} md:col-span-2`} htmlFor="gift-terms">
              Terms and redemption instructions
              <textarea id="gift-terms" name="terms" rows={2} className={`${fieldClass} py-3`} placeholder="Expiry, delivery area, or any conditions the agent should know." />
            </label>
            <label className={`${labelClass} md:col-span-2`} htmlFor="gift-terms-ar">
              Arabic terms and instructions
              <textarea id="gift-terms-ar" name="terms_ar" rows={2} dir="rtl" className={`${fieldClass} py-3`} placeholder="الشروط أو تعليمات الاسترداد" />
            </label>
            <label className={`${labelClass} md:col-span-2`} htmlFor="gift-fulfillment-instructions">
              Internal fulfilment instructions
              <textarea id="gift-fulfillment-instructions" name="fulfillment_instructions" rows={2} className={`${fieldClass} py-3`} placeholder="What should the fulfilment owner do after approval?" />
            </label>
            <label className={labelClass} htmlFor="gift-fulfillment-instructions-ar">
              Arabic fulfilment instructions
              <textarea id="gift-fulfillment-instructions-ar" name="fulfillment_instructions_ar" rows={2} dir="rtl" className={`${fieldClass} py-3`} placeholder="تعليمات التنفيذ الداخلية" />
            </label>
            <label className={labelClass} htmlFor="gift-sla">
              Fulfilment SLA (hours)
              <input id="gift-sla" name="fulfillment_sla_hours" type="number" min="1" step="1" className={fieldClass} placeholder="e.g. 48" />
            </label>
            <label className={labelClass} htmlFor="gift-max-total-claims">
              Total claim limit
              <input id="gift-max-total-claims" name="max_total_claims" type="number" min="1" step="1" className={fieldClass} placeholder="No limit" />
            </label>
            <label className={labelClass} htmlFor="gift-claim-window">
              Claim window (days)
              <input id="gift-claim-window" name="claim_window_days" type="number" min="1" step="1" className={fieldClass} placeholder="e.g. 30" />
            </label>
            <p className="rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-3 text-xs leading-5 text-sky-900 md:col-span-2">
              Approval is assigned by policy after save for high-value, partner-fulfilled, or broad rewards. A creator cannot approve their own reward.
            </p>
          </div>
        </fieldset>

        <fieldset className="border-t border-black/5 pt-6">
          <legend className="flex items-center gap-2 text-sm font-semibold text-[#111]">
            Availability and guardrails
            <span title="These settings are also included in the review step." className="text-neutral-400"><CircleHelp aria-hidden="true" size={14} /></span>
          </legend>
          <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <label className={labelClass} htmlFor="gift-status">
              Publish state
              <select id="gift-status" name="lifecycle_state" className={fieldClass} defaultValue="draft">
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label className={labelClass} htmlFor="gift-starts">
              Starts
              <span className="relative block">
                <CalendarDays aria-hidden="true" size={15} className="pointer-events-none absolute left-3 top-3.5 text-neutral-400" />
                <input id="gift-starts" name="start_at" type="datetime-local" className={`${fieldClass} pl-9`} />
              </span>
            </label>
            <label className={labelClass} htmlFor="gift-ends">
              Ends
              <span className="relative block">
                <CalendarDays aria-hidden="true" size={15} className="pointer-events-none absolute left-3 top-3.5 text-neutral-400" />
                <input id="gift-ends" name="end_at" type="datetime-local" className={`${fieldClass} pl-9`} />
              </span>
            </label>
            <label className={labelClass} htmlFor="gift-max-claims">
              Limit per agent
              <input id="gift-max-claims" name="max_concurrent_claims" type="number" min="1" step="1" className={fieldClass} placeholder="No limit" />
            </label>
            <label className={`${labelClass} md:col-span-2`} htmlFor="gift-tiers">
              Eligible tiers
              <select id="gift-tiers" name="tier_ids" multiple className={`${fieldClass} min-h-24 py-2`}>
                {tiers.map((tier) => (
                  <option key={tier.id} value={tier.id}>{`Tier ${tier.level ?? "—"} · ${tier.name}`}</option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] font-normal text-neutral-500">Leave empty to include every tier.</span>
            </label>
            <label className={labelClass} htmlFor="gift-exclusivity">
              Other reward conflicts
              <select id="gift-exclusivity" name="exclusivity_mode" className={fieldClass} defaultValue="none">
                <option value="none">Allow alongside other rewards</option>
                <option value="eligible">Pause other rewards when eligible</option>
                <option value="claimed">Pause other rewards after claim</option>
              </select>
            </label>
            <label className={labelClass} htmlFor="gift-alert-threshold">
              Low-stock alert at
              <input id="gift-alert-threshold" name="inventory_alert_threshold" type="number" min="0" step="1" className={fieldClass} placeholder="Optional" />
            </label>
          </div>
        </fieldset>

        {formError ? (
          <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{formError}</p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-5">
          <p className="text-xs leading-5 text-neutral-500">You can keep it in Draft and connect a rule from the studio above.</p>
          <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-black/10 transition-colors hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2">
            <ChevronDown aria-hidden="true" size={15} className="rotate-[-90deg]" />
            Save reward
          </button>
        </div>
      </form>
    </section>
  );
}
