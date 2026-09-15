"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Eye,
  Gift,
  Layers3,
  PackageCheck,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { GiftAudienceBuilder, type GiftAudienceValue, type GiftSavedAudience } from "@/components/GiftAudienceBuilder";
import { GiftMobilePreview } from "@/components/GiftMobilePreview";
import { normalizePreviewConflictMessages, stablePreviewFingerprint } from "@/lib/growthPreview";

export type GiftOption = {
  id: string;
  title: string;
  titleAr?: string | null;
  description?: string | null;
  iconUrl?: string | null;
  isActive?: boolean | null;
};

export type GiftAgentDirectoryEntry = {
  id: string;
  name: string;
  avatarUrl?: string | null;
};

export type GiftRuleSummary = {
  id: string;
  giftId?: string | null;
  lifecycleState?: string | null;
  approvalStatus?: string | null;
  version?: number | null;
  metric?: string | null;
  timeWindow?: string | null;
  operator?: string | null;
  valueSingle?: number | string | null;
  valueMin?: number | string | null;
  valueMax?: number | string | null;
  filters?: Record<string, unknown> | null;
  isActive?: boolean | null;
  createdAt?: string | null;
};

type BuilderStatus = "draft" | "scheduled" | "active" | "paused" | "archived";
type StepIndex = 0 | 1 | 2 | 3;

const steps = [
  { label: "Basics", detail: "Choose a reward", icon: Gift },
  { label: "Audience & trigger", detail: "Set the moment", icon: UsersRound },
  { label: "Availability", detail: "Protect supply", icon: PackageCheck },
  { label: "Review & publish", detail: "Check impact", icon: ShieldCheck },
] as const;

const metrics = [
  { value: "deals_count", label: "closed deals", verb: "closed" },
  { value: "deals_volume", label: "deal volume", verb: "generated" },
  { value: "revenue", label: "revenue", verb: "generated" },
  { value: "referrals", label: "referrals", verb: "made" },
  { value: "claim_acceptance", label: "claim acceptance", verb: "maintained" },
  { value: "listings_count", label: "active listings", verb: "published" },
] as const;

const timeWindows = [
  { value: "all_time", label: "all time" },
  { value: "last_30d", label: "in the last 30 days" },
  { value: "last_90d", label: "in the last 90 days" },
  { value: "quarter", label: "this quarter" },
  { value: "year", label: "this year" },
] as const;

const operators = [
  { value: ">=", label: "at least" },
  { value: "<=", label: "at most" },
  { value: "between", label: "between" },
  { value: "top_n", label: "in the top" },
  { value: "top_percent", label: "in the top" },
] as const;

const statuses: Array<{ value: BuilderStatus; label: string; detail: string }> = [
  { value: "draft", label: "Draft", detail: "Keep working without changing the app." },
  { value: "scheduled", label: "Scheduled", detail: "Start and end on a defined date." },
  { value: "active", label: "Active", detail: "Make the reward available now." },
  { value: "paused", label: "Paused", detail: "Keep the setup, stop new eligibility." },
  { value: "archived", label: "Archived", detail: "Retain history and stop the reward." },
];

type PreviewRecipient = {
  key: string;
  name: string;
  detail: string;
  reason: string;
  currentTier?: string;
  status?: string;
  conflict?: string;
  avatarUrl?: string;
};

type PreviewModel = {
  count: number;
  excludedCount: number | null;
  recipients: PreviewRecipient[];
  conflicts: string[];
  source: "rich" | "legacy";
};

const fieldClass = "mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-sm text-[#111] outline-none transition-colors placeholder:text-neutral-400 focus:border-black focus:ring-2 focus:ring-black/10";
const labelClass = "block text-xs font-semibold text-neutral-700";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function numericValue(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDateValue(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizePreview(input: unknown, agentDirectory: GiftAgentDirectoryEntry[], fallbackReason: string): PreviewModel {
  const record = asRecord(input);
  const rawRecipients = ["recipients", "affected", "eligible", "sample"]
    .map((key) => record[key])
    .find((value) => Array.isArray(value)) as unknown[] | undefined;
  const recipients = (rawRecipients ?? []).slice(0, 8).map((entry, index) => {
    if (typeof entry === "string" || typeof entry === "number") {
      const directoryEntry = agentDirectory.find((agent) => agent.id === String(entry));
      return {
        key: String(entry),
        name: directoryEntry?.name || `Recipient ${index + 1}`,
        detail: directoryEntry ? "Matched sample · current agent profile" : "Matched sample · identity returned in evaluator detail",
        reason: fallbackReason,
        avatarUrl: directoryEntry?.avatarUrl ?? undefined,
      } satisfies PreviewRecipient;
    }
    const candidate = asRecord(entry);
    const conflictValue = candidate.conflict ?? candidate.conflicts ?? candidate.conflict_reason;
    const conflict = normalizePreviewConflictMessages(conflictValue).join(", ") || undefined;
    return {
      key: firstString(candidate, ["id", "agent_id", "agentId", "key"]) ?? `recipient-${index}`,
      name: firstString(candidate, ["display_name", "displayName", "name", "agent_name", "agentName", "recipient_name"]) ?? `Recipient ${index + 1}`,
      detail: firstString(candidate, ["phone", "email", "detail", "label"]) ?? "Matched the selected audience",
      reason: firstString(candidate, ["reason", "eligibility_reason", "eligibilityReason", "explanation"]) ?? "Matches the selected audience and trigger.",
      currentTier: firstString(candidate, ["current_tier", "currentTier", "tier", "tier_name"]),
      status: firstString(candidate, ["status", "account_status", "verification_status"]),
      conflict,
      avatarUrl: firstString(candidate, ["avatar_url", "avatarUrl", "profile_picture_url"]),
    } satisfies PreviewRecipient;
  });
  const rawConflicts = record.conflicts ?? record.conflict_warnings ?? record.warnings;
  const conflicts = [...normalizePreviewConflictMessages(rawConflicts), ...recipients.flatMap((recipient) => recipient.conflict ? [recipient.conflict] : [])].filter((item, index, all) => all.indexOf(item) === index);
  const count = Number(record.eligible_count ?? record.affected_count ?? record.count ?? record.total ?? recipients.length);
  const excludedRaw = record.excluded_count ?? record.excludedCount ?? record.conflict_count ?? record.blocked_count;
  const excludedCount = excludedRaw === undefined || excludedRaw === null ? null : Number(excludedRaw);
  const rich = ["recipients", "affected", "eligible", "conflicts", "excluded_count"].some((key) => key in record);
  return {
    count: Number.isFinite(count) ? count : 0,
    excludedCount: excludedCount !== null && Number.isFinite(excludedCount) ? excludedCount : null,
    recipients,
    conflicts,
    source: rich ? "rich" : "legacy",
  };
}

function formatRuleSentence({
  selectedGift,
  audience,
  metric,
  timeWindow,
  operator,
  valueSingle,
  valueMin,
  valueMax,
}: {
  selectedGift?: GiftOption;
  audience: GiftAudienceValue;
  metric: string;
  timeWindow: string;
  operator: string;
  valueSingle: string;
  valueMin: string;
  valueMax: string;
}) {
  const metricOption = metrics.find((item) => item.value === metric) ?? metrics[0];
  const windowLabel = timeWindows.find((item) => item.value === timeWindow)?.label ?? "in the selected period";
  const operatorLabel = operators.find((item) => item.value === operator)?.label ?? "at least";
  const threshold = operator === "between" ? `${valueMin || "…"} and ${valueMax || "…"}` : valueSingle || "…";
  const audienceLabel = audience.preset === "saved" ? audience.audienceName || "the saved audience" : "eligible agents";
  return `Give ${selectedGift?.title || "this reward"} to ${audienceLabel} who ${metricOption.verb} ${operatorLabel} ${threshold} ${metricOption.label} ${windowLabel}.`;
}

function statusTone(status: BuilderStatus) {
  if (status === "active") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "scheduled") return "border-sky-200 bg-sky-50 text-sky-800";
  if (status === "paused") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "archived") return "border-neutral-300 bg-neutral-100 text-neutral-600";
  return "border-black/10 bg-white text-neutral-600";
}

export function GiftRuleBuilder({ gifts, rules = [], agentDirectory = [], savedAudiences = [] }: { gifts: GiftOption[]; rules?: GiftRuleSummary[]; agentDirectory?: GiftAgentDirectoryEntry[]; savedAudiences?: GiftSavedAudience[] }) {
  const [step, setStep] = useState<StepIndex>(0);
  const [giftId, setGiftId] = useState(gifts[0]?.id ?? "");
  const [metric, setMetric] = useState<string>(metrics[0].value);
  const [timeWindow, setTimeWindow] = useState<string>("last_90d");
  const [operator, setOperator] = useState<string>(operators[0].value);
  const [valueSingle, setValueSingle] = useState("");
  const [valueMin, setValueMin] = useState("");
  const [valueMax, setValueMax] = useState("");
  const [audience, setAudience] = useState<GiftAudienceValue>({ preset: "everyone", filters: {} });
  const [status, setStatus] = useState<BuilderStatus>("draft");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [stock, setStock] = useState("");
  const [claimLimit, setClaimLimit] = useState("");
  const [vendor, setVendor] = useState("");
  const [fulfillmentOwner, setFulfillmentOwner] = useState("");
  const [redemptionMethod, setRedemptionMethod] = useState("manual");
  const [rewardValue, setRewardValue] = useState("");
  const [cta, setCta] = useState("View reward");
  const [terms, setTerms] = useState("");
  const [previewResult, setPreviewResult] = useState<PreviewModel | null>(null);
  const [previewFingerprint, setPreviewFingerprint] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedGift = useMemo(() => gifts.find((gift) => gift.id === giftId), [giftId, gifts]);
  const sentence = useMemo(
    () => formatRuleSentence({ selectedGift, audience, metric, timeWindow, operator, valueSingle, valueMin, valueMax }),
    [audience, metric, operator, selectedGift, timeWindow, valueMax, valueMin, valueSingle],
  );

  const validateStep = (stepToValidate: StepIndex): string | null => {
    if (stepToValidate === 0 && !giftId) return "Choose a reward before continuing.";
    if (stepToValidate === 1) {
      if (operator === "between") {
        const min = numericValue(valueMin);
        const max = numericValue(valueMax);
        if (min === null || max === null) return "Add both ends of the trigger range.";
        if (min < 0 || max < 0) return "The trigger range cannot be negative.";
        if (min > max) return "The minimum must be smaller than the maximum.";
      } else {
        const single = numericValue(valueSingle);
        if (single === null) return "Add the threshold that makes an agent eligible.";
        if (single < 0) return "The threshold cannot be negative.";
        if (operator === ">=" && single === 0) return "Use a target above zero so this reward is not shown to everyone.";
        if (operator === "top_percent" && (single < 1 || single > 100)) return "Top percentage must be between 1 and 100.";
        if (operator === "top_n" && (!Number.isInteger(single) || single < 1)) return "Top N must be a whole number of one or more.";
      }
    }
    if (stepToValidate === 2) {
      if ((startsAt && !isoDateValue(startsAt)) || (endsAt && !isoDateValue(endsAt))) return "Use a valid date and time.";
      if (startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) return "The end date must be after the start date.";
      if (status === "scheduled" && !startsAt) return "Scheduled rewards need a start date.";
      if (stock && (numericValue(stock) === null || !Number.isInteger(Number(stock)) || Number(stock) < 1)) return "Stock must be a whole number of one or more.";
      if (claimLimit && (numericValue(claimLimit) === null || Number(claimLimit) < 1)) return "The claim limit must be one or more.";
    }
    return null;
  };

  const goToStep = (nextStep: StepIndex) => {
    if (nextStep > step) {
      for (let current = step; current < nextStep; current += 1) {
        const validationError = validateStep(current as StepIndex);
        if (validationError) {
          setError(validationError);
          setMessage(null);
          return;
        }
      }
    }
    setError(null);
    setMessage(null);
    setStep(nextStep);
  };

  const canonicalFulfillmentMethod = redemptionMethod === "pickup" ? "shipping" : redemptionMethod === "code" ? "coupon" : redemptionMethod;

  const buildPayload = (statusOverride: BuilderStatus = status) => ({
    gift_id: giftId,
    metric,
    time_window: timeWindow,
    operator,
    value_single: operator === "between" ? null : numericValue(valueSingle),
    value_min: operator === "between" ? numericValue(valueMin) : null,
    value_max: operator === "between" ? numericValue(valueMax) : null,
    filters: audience.filters,
    audience: "all",
    audience_id: audience.audienceId ?? null,
    status: statusOverride,
    is_active: statusOverride === "active" || statusOverride === "scheduled",
    lifecycle_state: statusOverride,
    start_at: isoDateValue(startsAt),
    end_at: isoDateValue(endsAt),
    starts_at: isoDateValue(startsAt),
    ends_at: isoDateValue(endsAt),
    inventory: stock ? Number(stock) : null,
    stock: stock ? Number(stock) : null,
    max_claims_per_agent: claimLimit ? Number(claimLimit) : null,
    max_concurrent_claims: claimLimit ? Number(claimLimit) : null,
    vendor: vendor || null,
    fulfillment_owner: fulfillmentOwner || null,
    fulfillment_method: canonicalFulfillmentMethod,
    redemption_method: canonicalFulfillmentMethod,
    value_amount: numericValue(rewardValue),
    value: rewardValue || null,
    cta: cta || null,
    terms: terms || null,
  });
  const currentPreviewFingerprint = stablePreviewFingerprint(buildPayload());
  const draftPreviewFingerprint = stablePreviewFingerprint(buildPayload("draft"));
  const publishPreviewFingerprint = stablePreviewFingerprint(buildPayload(status));

  useEffect(() => {
    if (previewResult && previewFingerprint !== currentPreviewFingerprint) {
      setPreviewResult(null);
      setPreviewFingerprint(null);
    }
  }, [currentPreviewFingerprint, previewFingerprint, previewResult]);

  const handlePreview = async () => {
    const validationError = validateStep(1);
    if (validationError) {
      setError(validationError);
      setMessage(null);
      setStep(1);
      return;
    }
    setIsPreviewing(true);
    setError(null);
    setMessage(null);
    try {
      const previewPayload = buildPayload();
      const nextPreviewFingerprint = stablePreviewFingerprint(previewPayload);
      const response = await fetch("/api/admin/gifts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(previewPayload),
      });
      const data = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) throw new Error(asRecord(data).error ? String(asRecord(data).error) : "The preview could not be loaded.");
      if (stablePreviewFingerprint(buildPayload()) !== nextPreviewFingerprint) return;
      setPreviewResult(normalizePreview(data, agentDirectory, sentence));
      setPreviewFingerprint(nextPreviewFingerprint);
      setMessage("Preview refreshed. Review names, reasons, and conflicts before publishing.");
    } catch (previewError) {
      setPreviewResult(null);
      setPreviewFingerprint(null);
      setError(previewError instanceof Error ? previewError.message : "The preview could not be loaded.");
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleSave = async (publish: boolean) => {
    const validationError = [0, 1, 2].map((item) => validateStep(item as StepIndex)).find(Boolean);
    if (validationError) {
      setError(validationError);
      setMessage(null);
      return;
    }
    const payload = buildPayload(publish ? status : "draft");
    const expectedPreviewFingerprint = stablePreviewFingerprint(payload);
    if (!previewResult || previewFingerprint !== expectedPreviewFingerprint) {
      setPreviewResult(null);
      setPreviewFingerprint(null);
      setError("Refresh the affected-agent preview before saving this reward.");
      return;
    }
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/gifts/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) throw new Error(asRecord(data).error ? String(asRecord(data).error) : "The rule could not be saved.");
      setMessage(publish ? `${statuses.find((item) => item.value === status)?.label ?? "Rule"} rule saved.` : "Draft saved. It will not change eligibility yet.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The rule could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section id="gift-rule-builder" tabIndex={-1} className="rounded-3xl border border-black/10 bg-white shadow-[0_16px_44px_rgba(0,0,0,0.05)] outline-none" aria-labelledby="gift-rule-builder-title">
      <div className="border-b border-black/5 px-5 py-6 sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-neutral-500"><Layers3 aria-hidden="true" size={14} />Growth studio · four steps</div>
            <h3 id="gift-rule-builder-title" className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#111]">Build a safe gift moment</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">Translate a business goal into one clear rule, preview its impact, and publish with guardrails.</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-[#faf9f6] px-4 py-3 text-right"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Current state</p><span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(status)}`}>{statuses.find((item) => item.value === status)?.label}</span></div>
        </div>

        <ol className="mt-6 grid gap-2 sm:grid-cols-4" aria-label="Gift rule steps">
          {steps.map((item, index) => {
            const Icon = item.icon;
            const active = step === index;
            const complete = step > index;
            return <li key={item.label}><button type="button" onClick={() => goToStep(index as StepIndex)} aria-current={active ? "step" : undefined} className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${active ? "border-black bg-black text-white" : complete ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-black/10 bg-white text-neutral-500 hover:border-black/30"}`}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${active ? "bg-white text-black" : complete ? "bg-emerald-700 text-white" : "bg-neutral-100 text-neutral-500"}`}>{complete ? <Check aria-hidden="true" size={15} /> : <Icon aria-hidden="true" size={15} />}</span><span className="min-w-0"><span className="block truncate text-xs font-semibold">{item.label}</span><span className={`mt-0.5 block truncate text-[11px] ${active ? "text-white/65" : "text-neutral-400"}`}>{item.detail}</span></span></button></li>;
          })}
        </ol>
      </div>

      <div className="space-y-6 px-5 py-6 sm:px-7">
        {step === 0 ? <div className="space-y-5"><div><p className="text-sm font-semibold text-[#111]">Start with the reward</p><p className="mt-1 text-sm leading-6 text-neutral-500">Rules attach to a catalog reward so agents always know what they are earning.</p></div>{gifts.length ? <div className="grid gap-3 sm:grid-cols-2">{gifts.map((gift) => { const selected = gift.id === giftId; return <button key={gift.id} type="button" aria-pressed={selected} onClick={() => setGiftId(gift.id)} className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${selected ? "border-black bg-[#111] text-white" : "border-black/10 bg-[#faf9f6] text-neutral-800 hover:border-black/30"}`}>{gift.iconUrl ? <img src={gift.iconUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" /> : <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${selected ? "bg-white/10" : "bg-white"}`}><Gift aria-hidden="true" size={19} /></span>}<span className="min-w-0"><span className="block truncate text-sm font-semibold">{gift.title}</span><span className={`mt-0.5 block truncate text-xs ${selected ? "text-white/65" : "text-neutral-500"}`}>{gift.titleAr || gift.description || "Catalog reward"}</span></span>{selected ? <Check aria-hidden="true" size={17} className="ml-auto shrink-0" /> : null}</button>; })}</div> : <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">Add a reward to the catalog before creating a rule. The next step will use its live title and mobile copy.<Link href="#gift-catalog" className="mt-3 inline-flex rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:border-amber-500">Add a reward</Link></div>}<div className="rounded-2xl border border-black/10 bg-[#faf9f6] px-4 py-4"><div className="flex items-start gap-3"><Sparkles aria-hidden="true" size={17} className="mt-0.5 text-[#a36d16]" /><div><p className="text-sm font-semibold text-[#111]">The rule will read like this</p><p className="mt-1 text-sm leading-6 text-neutral-600">{sentence}</p></div></div></div></div> : null}

        {step === 1 ? <div className="space-y-5"><GiftAudienceBuilder value={audience} onChange={setAudience} savedAudiences={savedAudiences} /><section className="rounded-3xl border border-black/10 bg-[#faf9f6] p-5 sm:p-6" aria-labelledby="gift-trigger-title"><div className="flex items-start gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#111] text-white"><Sparkles aria-hidden="true" size={16} /></div><div><h4 id="gift-trigger-title" className="text-lg font-semibold text-[#111]">What should make someone eligible?</h4><p className="mt-1 text-sm leading-6 text-neutral-500">Use familiar language. We will turn the values into a readable rule sentence.</p></div></div><div className="mt-5 grid gap-4 md:grid-cols-2"><label className={labelClass} htmlFor="gift-metric">Activity<select id="gift-metric" value={metric} onChange={(event) => setMetric(event.target.value)} className={fieldClass}>{metrics.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className={labelClass} htmlFor="gift-window">Time period<select id="gift-window" value={timeWindow} onChange={(event) => setTimeWindow(event.target.value)} className={fieldClass}>{timeWindows.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className={labelClass} htmlFor="gift-operator">Condition<select id="gift-operator" value={operator} onChange={(event) => setOperator(event.target.value)} className={fieldClass}>{operators.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>{operator === "between" ? <div className="grid grid-cols-2 gap-3"><label className={labelClass} htmlFor="gift-value-min">From<input id="gift-value-min" value={valueMin} onChange={(event) => setValueMin(event.target.value)} type="number" min="0" className={fieldClass} placeholder="0" /></label><label className={labelClass} htmlFor="gift-value-max">To<input id="gift-value-max" value={valueMax} onChange={(event) => setValueMax(event.target.value)} type="number" min="0" className={fieldClass} placeholder="10" /></label></div> : <label className={labelClass} htmlFor="gift-threshold">Target number<input id="gift-threshold" value={valueSingle} onChange={(event) => setValueSingle(event.target.value)} type="number" min="0" className={fieldClass} placeholder="3" /></label>}</div><div className="mt-5 rounded-2xl border border-black/10 bg-white px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">Plain-language rule</p><p className="mt-1 text-sm font-semibold leading-6 text-[#111]">{sentence}</p></div></section></div> : null}

        {step === 2 ? <div className="space-y-5"><section className="rounded-3xl border border-black/10 bg-[#faf9f6] p-5 sm:p-6" aria-labelledby="gift-availability-title"><div className="flex items-start gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#111] text-white"><PackageCheck aria-hidden="true" size={16} /></div><div><h4 id="gift-availability-title" className="text-lg font-semibold text-[#111]">Protect supply and set the promise</h4><p className="mt-1 text-sm leading-6 text-neutral-500">These limits travel with the rule so the team can fulfil every approved claim.</p></div></div><div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3"><label className={labelClass} htmlFor="gift-builder-status">Publish state<select id="gift-builder-status" value={status} onChange={(event) => setStatus(event.target.value as BuilderStatus)} className={fieldClass}>{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><span className="mt-1 block text-[11px] font-normal text-neutral-500">{statuses.find((item) => item.value === status)?.detail}</span></label><label className={labelClass} htmlFor="gift-builder-start">Starts<span className="relative block"><CalendarDays aria-hidden="true" size={15} className="pointer-events-none absolute left-3 top-3.5 text-neutral-400" /><input id="gift-builder-start" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} type="datetime-local" className={`${fieldClass} pl-9`} /></span></label><label className={labelClass} htmlFor="gift-builder-end">Ends<span className="relative block"><CalendarDays aria-hidden="true" size={15} className="pointer-events-none absolute left-3 top-3.5 text-neutral-400" /><input id="gift-builder-end" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} type="datetime-local" className={`${fieldClass} pl-9`} /></span></label><label className={labelClass} htmlFor="gift-builder-stock">Available stock<input id="gift-builder-stock" value={stock} onChange={(event) => setStock(event.target.value)} type="number" min="0" step="1" className={fieldClass} placeholder="Unlimited" /></label><label className={labelClass} htmlFor="gift-builder-limit">Limit per agent<input id="gift-builder-limit" value={claimLimit} onChange={(event) => setClaimLimit(event.target.value)} type="number" min="1" step="1" className={fieldClass} placeholder="No limit" /></label><label className={labelClass} htmlFor="gift-builder-value">Display value<input id="gift-builder-value" value={rewardValue} onChange={(event) => setRewardValue(event.target.value)} className={fieldClass} placeholder="e.g. EGP 1,200" /></label><label className={labelClass} htmlFor="gift-builder-vendor">Vendor or partner<input id="gift-builder-vendor" value={vendor} onChange={(event) => setVendor(event.target.value)} className={fieldClass} placeholder="e.g. Palm Hills concierge" /></label><label className={labelClass} htmlFor="gift-builder-owner">Fulfilment owner<input id="gift-builder-owner" value={fulfillmentOwner} onChange={(event) => setFulfillmentOwner(event.target.value)} className={fieldClass} placeholder="e.g. Growth Ops" /></label><label className={labelClass} htmlFor="gift-builder-method">Redemption method<select id="gift-builder-method" value={redemptionMethod} onChange={(event) => setRedemptionMethod(event.target.value)} className={fieldClass}><option value="manual">Team confirms manually</option><option value="shipping">Ship to agent</option><option value="pickup">Agent pickup</option><option value="code">Send a redemption code</option></select></label><label className={labelClass} htmlFor="gift-builder-cta">Mobile button label<input id="gift-builder-cta" value={cta} onChange={(event) => setCta(event.target.value)} className={fieldClass} /></label><label className={`${labelClass} md:col-span-2`} htmlFor="gift-builder-terms">Terms and instructions<textarea id="gift-builder-terms" value={terms} onChange={(event) => setTerms(event.target.value)} rows={2} className={`${fieldClass} py-3`} placeholder="Expiry, delivery area, or any conditions." /></label></div></section><div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900"><strong className="font-semibold">Guardrail:</strong> Scheduled and active rewards require a recipient preview before publishing.</div></div> : null}

        {step === 2 ? <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4" aria-labelledby="gift-approval-title"><div className="flex items-start gap-3"><ShieldCheck aria-hidden="true" size={17} className="mt-0.5 shrink-0 text-sky-800" /><div><h4 id="gift-approval-title" className="text-sm font-semibold text-sky-950">Approval is policy-controlled</h4><p className="mt-1 text-xs leading-5 text-sky-900">The server assigns review for high-value, partner-fulfilled, broad, or otherwise risky activations. Saving a draft never approves it, and the creator cannot approve their own reward.</p></div></div></section> : null}

        {step === 3 ? <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(290px,0.7fr)]"><div className="space-y-5"><section className="rounded-3xl border border-black/10 bg-[#faf9f6] p-5 sm:p-6" aria-labelledby="gift-review-title"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">Review</p><h4 id="gift-review-title" className="mt-2 text-xl font-semibold text-[#111]">One sentence, one safe launch</h4></div><span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(status)}`}>{statuses.find((item) => item.value === status)?.label}</span></div><div className="mt-5 rounded-2xl bg-[#111] px-4 py-4 text-white"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">Eligibility sentence</p><p className="mt-2 text-base font-semibold leading-7">{sentence}</p></div><dl className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-black/10 bg-white px-4 py-3"><dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Reward</dt><dd className="mt-1 text-sm font-semibold text-[#111]">{selectedGift?.title || "Not selected"}</dd></div><div className="rounded-2xl border border-black/10 bg-white px-4 py-3"><dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Availability</dt><dd className="mt-1 text-sm font-semibold text-[#111]">{stock ? `${stock} in stock` : "Unlimited stock"}{claimLimit ? ` · ${claimLimit} per agent` : ""}</dd></div><div className="rounded-2xl border border-black/10 bg-white px-4 py-3"><dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Window</dt><dd className="mt-1 text-sm font-semibold text-[#111]">{startsAt ? new Date(startsAt).toLocaleString() : "Starts when activated"}{endsAt ? ` → ${new Date(endsAt).toLocaleString()}` : ""}</dd></div><div className="rounded-2xl border border-black/10 bg-white px-4 py-3"><dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Fulfilment</dt><dd className="mt-1 text-sm font-semibold text-[#111]">{fulfillmentOwner || "Team to assign"} · {redemptionMethod.replaceAll("_", " ")}</dd></div></dl></section><section className="rounded-3xl border border-black/10 bg-white p-5 sm:p-6" aria-labelledby="gift-preview-title"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500"><Eye aria-hidden="true" size={14} />Impact preview</div><h4 id="gift-preview-title" className="mt-2 text-lg font-semibold text-[#111]">Who would receive this?</h4><p className="mt-1 text-sm leading-6 text-neutral-500">Preview is read-only. Nothing is claimed or sent from here.</p></div><button type="button" onClick={handlePreview} disabled={isPreviewing} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-black/15 bg-white px-4 py-2.5 text-sm font-semibold text-[#111] transition-colors hover:border-black/40 disabled:cursor-wait disabled:opacity-60"><Eye aria-hidden="true" size={15} />{isPreviewing ? "Checking…" : "Preview recipients"}</button></div>{previewResult ? <div className="mt-5 space-y-4"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Affected</p><p className="mt-1 text-2xl font-semibold text-emerald-950">{previewResult.count}</p><p className="text-xs text-emerald-800">eligible agents</p></div><div className="rounded-2xl border border-black/10 bg-[#faf9f6] px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Sampled</p><p className="mt-1 text-2xl font-semibold text-[#111]">{previewResult.recipients.length}</p><p className="text-xs text-neutral-500">named recipients shown</p></div><div className={`rounded-2xl border px-4 py-3 ${previewResult.conflicts.length ? "border-amber-200 bg-amber-50" : "border-sky-200 bg-sky-50"}`}><p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${previewResult.conflicts.length ? "text-amber-700" : "text-sky-700"}`}>Conflicts</p><p className={`mt-1 text-2xl font-semibold ${previewResult.conflicts.length ? "text-amber-950" : "text-sky-950"}`}>{previewResult.conflicts.length}</p><p className={`text-xs ${previewResult.conflicts.length ? "text-amber-800" : "text-sky-800"}`}>{previewResult.excludedCount ?? "No"} excluded</p></div></div>{previewResult.source === "legacy" ? <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">The evaluator returned the legacy count/sample shape. Recipient labels are anonymized until named preview detail is available; publishing remains gated behind this dry run.</p> : null}<div className="space-y-2" aria-label="Preview recipients">{previewResult.recipients.length ? previewResult.recipients.map((recipient) => <div key={recipient.key} className="flex flex-wrap items-start gap-3 rounded-2xl border border-black/10 bg-[#faf9f6] px-4 py-3">{recipient.avatarUrl ? <img src={recipient.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#111] text-xs font-semibold text-white">{recipient.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div>}<div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[#111]">{recipient.name}</p><p className="mt-0.5 text-xs text-neutral-500">{recipient.detail}{recipient.currentTier ? ` · ${recipient.currentTier}` : ""}{recipient.status ? ` · ${recipient.status}` : ""}</p><p className="mt-1 text-xs leading-5 text-neutral-700">{recipient.reason}</p>{recipient.conflict ? <p className="mt-1 text-xs font-semibold text-amber-700">Conflict: {recipient.conflict}</p> : null}</div></div>) : <p className="rounded-2xl border border-dashed border-black/15 px-4 py-6 text-center text-sm text-neutral-500">No sample recipients matched this trigger.</p>}</div>{previewResult.conflicts.length ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><div className="flex items-start gap-2"><AlertTriangle aria-hidden="true" size={16} className="mt-0.5 shrink-0" /><div><p className="font-semibold">Resolve conflicts before publishing</p><ul className="mt-1 list-disc pl-4 text-xs leading-5">{previewResult.conflicts.map((conflict, index) => <li key={`${conflict}-${index}`}>{conflict}</li>)}</ul></div></div></div> : null}</div> : <div className="mt-5 rounded-2xl border border-dashed border-black/15 bg-[#faf9f6] px-4 py-8 text-center"><p className="text-sm font-semibold text-[#111]">No dry run yet</p><p className="mt-1 text-xs text-neutral-500">Preview the audience to see affected agents and guardrails.</p></div>}</section></div><GiftMobilePreview title={selectedGift?.title || "Your reward"} titleAr={selectedGift?.titleAr || undefined} description={selectedGift?.description || undefined} cta={cta} terms={terms} iconUrl={selectedGift?.iconUrl} /></div> : null}

        {error ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p> : null}
        {message ? <p role="status" aria-live="polite" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p> : null}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-black/5 bg-[#faf9f6] px-5 py-5 sm:px-7"><button type="button" onClick={() => goToStep(Math.max(0, step - 1) as StepIndex)} disabled={step === 0} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 transition-colors hover:border-black/30 disabled:cursor-not-allowed disabled:opacity-40"><ArrowLeft aria-hidden="true" size={15} />Back</button>{step < 3 ? <button type="button" onClick={() => goToStep((step + 1) as StepIndex)} disabled={!gifts.length} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-black/10 transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40">Next step<ArrowRight aria-hidden="true" size={15} /></button> : <div className="flex flex-wrap items-center justify-end gap-2"><button type="button" onClick={() => handleSave(false)} disabled={isSaving || !previewResult || previewFingerprint !== draftPreviewFingerprint} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-black/15 bg-white px-4 py-2.5 text-sm font-semibold text-[#111] transition-colors hover:border-black/40 disabled:opacity-50"><Save aria-hidden="true" size={15} />{isSaving ? "Saving…" : "Save draft"}</button><button type="button" onClick={() => handleSave(true)} disabled={isSaving || !previewResult || previewFingerprint !== publishPreviewFingerprint || Boolean(previewResult.conflicts.length)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-black/10 transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"><Send aria-hidden="true" size={15} />{status === "scheduled" ? "Schedule reward" : "Publish rule"}</button></div>}</footer>

      {rules.length ? <div className="border-t border-black/5 px-5 py-4 sm:px-7"><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">Existing rule history</p><div className="mt-3 flex flex-wrap gap-2">{rules.slice(0, 4).map((rule) => <span key={rule.id} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs text-neutral-600">v{rule.version ?? 1} · {rule.metric?.replaceAll("_", " ") || "Rule"} · {rule.lifecycleState || (rule.isActive === false ? "inactive" : "active")}{rule.approvalStatus && rule.approvalStatus !== "not_required" ? ` · ${rule.approvalStatus}` : ""}</span>)}</div></div> : null}
    </section>
  );
}
