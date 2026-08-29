"use client";

/* Reward artwork is supplied by the existing storage URLs; keep the compact catalog preview unoptimized. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  BadgeCheck,
  CalendarClock,
  Check,
  ChevronRight,
  CircleHelp,
  Eye,
  Layers3,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
} from "lucide-react";
import { RewardAudienceBuilder, type RewardAudienceOption } from "@/components/RewardAudienceBuilder";
import { RewardMobilePreview, type RewardPreviewData } from "@/components/RewardMobilePreview";
import { normalizePreviewConflictMessages, stablePreviewFingerprint } from "@/lib/growthPreview";

export type TierOption = {
  id: string;
  name: string;
  name_ar?: string | null;
  level: number | null;
  icon_url?: string | null;
  description?: string | null;
  benefit_type?: string | null;
  benefit_value?: number | null;
  benefit_description?: string | null;
  is_active?: boolean | null;
  approval_status?: string | null;
  version?: number | null;
};

export type BadgeOption = {
  id: string;
  name: string;
  name_ar?: string | null;
  icon_url?: string | null;
  description?: string | null;
  badge_type?: string | null;
  expires_in_days?: number | null;
  benefit_type?: string | null;
  benefit_value?: number | null;
  benefit_description?: string | null;
  is_active?: boolean | null;
  approval_status?: string | null;
  version?: number | null;
};

export type RewardAgentOption = {
  id: string;
  displayName?: string | null;
  name?: string | null;
  nameAr?: string | null;
  phone?: string | null;
  currentTier?: string | null;
  verificationStatus?: string | null;
};

export type RewardRuleOption = {
  id: string;
  target_type?: string | null;
  target_id?: string | null;
  metric?: string | null;
  time_window?: string | null;
  operator?: string | null;
  value_min?: number | null;
  value_max?: number | null;
  value_single?: number | null;
  is_active?: boolean | null;
  status?: string | null;
  lifecycle_state?: string | null;
  lifecycle_status?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  approval_status?: string | null;
  version?: number | null;
};

type TargetType = "tier" | "badge";
type LifecycleStatus = "draft" | "scheduled" | "active" | "paused" | "archived";
type TierDemotion = "hold" | "demote" | "reset";
type BadgeVisibility = "public" | "hidden";
type BadgeRepeatability = "once" | "renewable";
type BadgeExpiry = "permanent" | "days";

type PreviewRecipient = {
  id?: string;
  name: string;
  nameAr?: string | null;
  reason: string;
  currentTier?: string | null;
  nextTier?: string | null;
  conflict?: string | null;
};

type PreviewResult = {
  count: number;
  excludedCount: number;
  recipients: PreviewRecipient[];
  conflicts: string[];
  movements: string[];
};

const steps = [
  { id: "reward", number: "01", title: "Choose reward", description: "Select a tier or badge." },
  { id: "goal", number: "02", title: "Set the goal", description: "Explain when it is earned." },
  { id: "behaviour", number: "03", title: "Shape behaviour", description: "Decide how it works." },
  { id: "launch", number: "04", title: "Review & launch", description: "Preview, then publish safely." },
] as const;

const metrics = [
  { value: "deals_count", label: "Deals closed", hint: "Count of successful deals" },
  { value: "deals_volume", label: "Deal volume", hint: "Total value of closed deals" },
  { value: "revenue", label: "Commission earned", hint: "Total commission generated" },
  { value: "referrals", label: "Referrals", hint: "People brought into the network" },
  { value: "claim_acceptance", label: "Claim acceptance", hint: "Accepted sales claims as a share" },
  { value: "listings_count", label: "Listings created", hint: "Active inventory submitted" },
] as const;

const timeWindows = [
  { value: "all_time", label: "All time" },
  { value: "last_30d", label: "Last 30 days" },
  { value: "last_90d", label: "Last 90 days" },
  { value: "quarter", label: "This quarter" },
  { value: "year", label: "This year" },
] as const;

const operators = [
  { value: ">=", label: "At least", symbol: "≥", hint: "Meets or beats a goal" },
  { value: "<=", label: "At most", symbol: "≤", hint: "Stays within a limit" },
  { value: "between", label: "Between", symbol: "↔", hint: "Fits inside a range" },
  { value: "top_n", label: "Top people", symbol: "#", hint: "Ranks in the top N" },
  { value: "top_percent", label: "Top percentage", symbol: "%", hint: "Ranks in the top share" },
] as const;

const lifecycleOptions: Array<{ value: LifecycleStatus; label: string; detail: string; className: string }> = [
  { value: "draft", label: "Draft", detail: "Keep editing", className: "border-black/10 bg-neutral-50 text-neutral-700" },
  { value: "scheduled", label: "Scheduled", detail: "Start on a date", className: "border-[#c8c2e9] bg-[#f2f1fb] text-[#4d477f]" },
  { value: "active", label: "Active", detail: "Evaluate now", className: "border-[#c9d795] bg-[#f1f5d9] text-[#4c5d11]" },
  { value: "paused", label: "Paused", detail: "Hold awards", className: "border-[#f2c2aa] bg-[#fff3ec] text-[#8d482c]" },
  { value: "archived", label: "Archived", detail: "Keep the record", className: "border-black/10 bg-neutral-100 text-neutral-500" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asNumber(value: unknown, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalisePreview(raw: unknown, knownAgents: RewardAgentOption[]): PreviewResult {
  const root = isRecord(raw) ? raw : {};
  const payload = isRecord(root.data) ? root.data : root;
  const rawRecipients =
    (Array.isArray(payload.recipients) && payload.recipients) ||
    (Array.isArray(payload.users) && payload.users) ||
    (Array.isArray(payload.qualified_users) && payload.qualified_users) ||
    (Array.isArray(payload.sample) && payload.sample) ||
    [];
  const recipients = rawRecipients.slice(0, 10).map((entry, index): PreviewRecipient => {
    if (typeof entry === "string") {
      const known = knownAgents.find((agent) => agent.id === entry);
      return {
        id: entry,
        name: known?.displayName || known?.name || `Agent ${index + 1}`,
        nameAr: known?.nameAr,
        reason: "Matches the selected goal",
        currentTier: known?.currentTier,
      };
    }
    const item = isRecord(entry) ? entry : {};
    const id = getString(item.id) || getString(item.user_id) || getString(item.agent_id) || undefined;
    const known = id ? knownAgents.find((agent) => agent.id === id) : undefined;
    const name =
      getString(item.display_name) ||
      getString(item.displayName) ||
      getString(item.name) ||
      known?.displayName ||
      known?.name ||
      `Agent ${index + 1}`;
    return {
      id,
      name,
      nameAr: getString(item.name_ar) || getString(item.nameAr) || known?.nameAr,
      reason: getString(item.reason) || getString(item.qualification_reason) || "Matches the selected goal",
      currentTier: getString(item.current_tier) || getString(item.currentTier) || known?.currentTier,
      nextTier: getString(item.next_tier) || getString(item.nextTier),
      conflict: normalizePreviewConflictMessages(item.conflict ?? item.conflicts ?? item.conflict_reason).join(", ") || null,
    };
  });
  const count = asNumber(
    payload.eligible_count ?? payload.affected_count ?? payload.total_count ?? payload.count,
    recipients.length,
  );
  const excludedCount = asNumber(payload.excluded_count ?? payload.excludedCount ?? payload.conflict_count, 0);
  const rawConflicts = payload.conflicts;
  const recipientConflicts = recipients.flatMap((recipient) => recipient.conflict ? [recipient.conflict] : []);
  const conflicts = [...normalizePreviewConflictMessages(rawConflicts), ...recipientConflicts].filter((entry, index, all) => all.indexOf(entry) === index);
  const rawMovements = Array.isArray(payload.movements) ? payload.movements : Array.isArray(payload.tier_movements) ? payload.tier_movements : [];
  return {
    count,
    excludedCount,
    recipients,
    conflicts,
    movements: rawMovements.map((entry) => (typeof entry === "string" ? entry : isRecord(entry) ? getString(entry.label) || getString(entry.name) || "Tier movement" : "Tier movement")),
  };
}

export function RewardsRuleBuilder({
  tiers,
  badges,
  agents = [],
  rules = [],
  audiences = [],
}: {
  tiers: TierOption[];
  badges: BadgeOption[];
  agents?: RewardAgentOption[];
  rules?: RewardRuleOption[];
  audiences?: RewardAudienceOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const initialType: TargetType = tiers.length ? "tier" : "badge";
  const [activeStep, setActiveStep] = useState(0);
  const [targetType, setTargetType] = useState<TargetType>(initialType);
  const [targetId, setTargetId] = useState(initialType === "tier" ? tiers[0]?.id ?? "" : badges[0]?.id ?? "");
  const [metric, setMetric] = useState<string>("deals_count");
  const [timeWindow, setTimeWindow] = useState<string>("last_90d");
  const [operator, setOperator] = useState<string>(">=");
  const [valueSingle, setValueSingle] = useState("3");
  const [valueMin, setValueMin] = useState("");
  const [valueMax, setValueMax] = useState("");
  const [audienceId, setAudienceId] = useState("");
  const [tierDemotion, setTierDemotion] = useState<TierDemotion>("hold");
  const [tierReviewWindow, setTierReviewWindow] = useState("quarter");
  const [tierStacking, setTierStacking] = useState("highest_only");
  const [badgeVisibility, setBadgeVisibility] = useState<BadgeVisibility>("public");
  const [badgeRepeatability, setBadgeRepeatability] = useState<BadgeRepeatability>("once");
  const [badgeExpiry, setBadgeExpiry] = useState<BadgeExpiry>("permanent");
  const [badgeRevocation, setBadgeRevocation] = useState("keep");
  const [badgePriority, setBadgePriority] = useState("0");
  const [lifecycleStatus, setLifecycleStatus] = useState<LifecycleStatus>("draft");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [previewFingerprint, setPreviewFingerprint] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [showAllRecipients, setShowAllRecipients] = useState(false);

  const targetOptions = useMemo<Array<TierOption | BadgeOption>>(
    () => (targetType === "tier" ? tiers : badges),
    [badges, targetType, tiers],
  );
  const selectedReward = targetOptions.find((option) => option.id === targetId);
  const selectedTier = targetType === "tier" ? (selectedReward as TierOption | undefined) : undefined;
  const selectedBadge = targetType === "badge" ? (selectedReward as BadgeOption | undefined) : undefined;
  const selectedMetric = metrics.find((option) => option.value === metric) ?? metrics[0];
  const selectedOperator = operators.find((option) => option.value === operator) ?? operators[0];
  const activeRules = rules.filter((rule) => rule.is_active !== false && (rule.lifecycle_state ?? rule.lifecycle_status ?? rule.status ?? "active") !== "archived");

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!targetId || !selectedReward) errors.push("Choose a tier or badge to award.");
    if (!metric) errors.push("Choose the progress signal to measure.");
    if (!timeWindow) errors.push("Choose how far back to measure progress.");
    if (operator === "between") {
      const min = Number(valueMin);
      const max = Number(valueMax);
      if (!valueMin || !Number.isFinite(min) || min < 0) errors.push("Add a minimum value for the range.");
      if (!valueMax || !Number.isFinite(max) || max < 0) errors.push("Add a maximum value for the range.");
      if (Number.isFinite(min) && Number.isFinite(max) && min > max) errors.push("The minimum cannot be greater than the maximum.");
    } else {
      const value = Number(valueSingle);
      if (!valueSingle || !Number.isFinite(value) || value < 0) errors.push("Add a goal value of zero or higher.");
      if (operator === "top_n" && (!Number.isInteger(value) || value < 1)) errors.push("Top people needs a whole number of at least 1.");
      if (operator === "top_percent" && (value <= 0 || value > 100)) errors.push("Top percentage must be between 1 and 100.");
    }
    if (startAt && Number.isNaN(new Date(startAt).getTime())) errors.push("Choose a valid start date.");
    if (endAt && Number.isNaN(new Date(endAt).getTime())) errors.push("Choose a valid end date.");
    if (lifecycleStatus === "scheduled" && !startAt) errors.push("Choose a start date for a scheduled rule.");
    if (startAt && endAt && new Date(startAt).getTime() >= new Date(endAt).getTime()) errors.push("The end date must be after the start date.");
    return errors;
  }, [lifecycleStatus, metric, operator, selectedReward, startAt, targetId, timeWindow, valueMax, valueMin, valueSingle, endAt]);

  const stepErrors = (step: number) => {
    if (step === 0) return !targetId || !selectedReward ? ["Choose a tier or badge to award."] : [];
    if (step === 1) return validationErrors.filter((error) => error.includes("goal") || error.includes("range") || error.includes("minimum") || error.includes("maximum") || error.includes("percentage") || error.includes("audience"));
    if (step === 3) return validationErrors.filter((error) => error.includes("date"));
    return [];
  };

  const chooseTargetType = (next: TargetType) => {
    setTargetType(next);
    const nextOptions = next === "tier" ? tiers : badges;
    setTargetId(nextOptions[0]?.id ?? "");
    setPreviewResult(null);
    setPreviewFingerprint(null);
    setPreviewError(null);
  };

  const isoDate = (value: string) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  };

  const buildPayload = () => ({
    target_type: targetType,
    target_id: targetId,
    metric,
    time_window: timeWindow,
    operator,
    value_single: operator === "between" ? null : Number(valueSingle),
    value_min: operator === "between" ? Number(valueMin) : null,
    value_max: operator === "between" ? Number(valueMax) : null,
    audience_id: audienceId || null,
    filters: {},
    lifecycle_state: lifecycleStatus,
    lifecycle_status: lifecycleStatus,
    status: lifecycleStatus,
    start_at: isoDate(startAt),
    end_at: isoDate(endAt),
    tier_policy:
      targetType === "tier"
        ? { demotion: tierDemotion, review_window: tierReviewWindow, benefit_stacking: tierStacking }
        : null,
    badge_policy:
      targetType === "badge"
        ? {
            visibility: badgeVisibility,
            repeatability: badgeRepeatability,
            expiry: badgeExpiry,
            revocation: badgeRevocation,
            display_priority: Number(badgePriority) || 0,
          }
        : null,
  });
  const currentPreviewFingerprint = stablePreviewFingerprint(buildPayload());
  const previewIsFresh = Boolean(previewResult && previewFingerprint === currentPreviewFingerprint);

  useEffect(() => {
    if (previewResult && previewFingerprint !== currentPreviewFingerprint) {
      setPreviewResult(null);
      setPreviewFingerprint(null);
    }
  }, [currentPreviewFingerprint, previewFingerprint, previewResult]);

  const plainSummary = useMemo(() => {
    const rewardName = selectedReward?.name || (targetType === "tier" ? "this tier" : "this badge");
    const threshold =
      operator === "between"
        ? `between ${valueMin || "…"} and ${valueMax || "…"}`
        : operator === "top_n"
          ? `in the top ${valueSingle || "…"}`
          : operator === "top_percent"
            ? `in the top ${valueSingle || "…"}%`
            : `${selectedOperator.label.toLowerCase()} ${valueSingle || "…"}`;
    const window = timeWindows.find((option) => option.value === timeWindow)?.label.toLowerCase() ?? "the selected period";
    const audienceName = audiences.find((audience) => audience.id === audienceId)?.name;
    const audience = audienceName ? `, limited to the saved audience “${audienceName}”` : "";
    return targetType === "tier"
      ? `Move eligible agents to ${rewardName} when ${selectedMetric.label.toLowerCase()} is ${threshold} over ${window}${audience}.`
      : `Award ${rewardName} when an agent has ${selectedMetric.label.toLowerCase()} ${threshold} over ${window}${audience}.`;
  }, [audienceId, audiences, operator, selectedMetric.label, selectedOperator.label, selectedReward?.name, targetType, timeWindow, valueMax, valueMin, valueSingle]);

  const preview = async () => {
    setPreviewError(null);
    setActionMessage(null);
    if (validationErrors.length) {
      setPreviewResult(null);
      setPreviewFingerprint(null);
      setPreviewError(validationErrors[0]);
      setActiveStep(validationErrors.some((error) => error.includes("date")) ? 3 : 1);
      return;
    }
    try {
      const previewPayload = buildPayload();
      const nextPreviewFingerprint = stablePreviewFingerprint(previewPayload);
      const response = await fetch("/api/admin/rewards/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(previewPayload),
      });
      const raw = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(isRecord(raw) ? getString(raw.error) || "Preview could not be generated." : "Preview could not be generated.");
      }
      if (stablePreviewFingerprint(buildPayload()) !== nextPreviewFingerprint) return;
      setPreviewResult(normalisePreview(raw, agents));
      setPreviewFingerprint(nextPreviewFingerprint);
      setShowAllRecipients(false);
      setActionMessage("Preview refreshed. No agent records were changed.");
    } catch (error) {
      setPreviewResult(null);
      setPreviewFingerprint(null);
      setPreviewError(error instanceof Error ? error.message : "Preview could not be generated.");
    }
  };

  const save = async () => {
    setPreviewError(null);
    setActionMessage(null);
    if (validationErrors.length) {
      setPreviewError(validationErrors[0]);
      setActiveStep(validationErrors.some((error) => error.includes("date")) ? 3 : 1);
      return;
    }
    const payload = buildPayload();
    if (!previewResult || previewFingerprint !== stablePreviewFingerprint(payload)) {
      setPreviewResult(null);
      setPreviewFingerprint(null);
      setPreviewError("Refresh the affected-agent preview before saving this reward.");
      return;
    }
    try {
      const response = await fetch("/api/admin/rewards/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const raw = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(isRecord(raw) ? getString(raw.error) || "The rule could not be saved." : "The rule could not be saved.");
      }
      setActionMessage(`${lifecycleStatus[0].toUpperCase()}${lifecycleStatus.slice(1)} rule saved.`);
      startTransition(() => router.refresh());
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "The rule could not be saved.");
    }
  };

  const nextStep = () => {
    const errors = stepErrors(activeStep);
    if (errors.length) {
      setPreviewError(errors[0]);
      return;
    }
    setPreviewError(null);
    setActionMessage(null);
    setActiveStep((step) => Math.min(3, step + 1));
  };

  const selectedPreview: RewardPreviewData = {
    kind: targetType,
    name: selectedReward?.name || "New reward",
    nameAr: targetType === "tier" ? selectedTier?.name_ar : selectedBadge?.name_ar,
    description: selectedReward?.description,
    level: selectedTier?.level,
    badgeType: selectedBadge?.badge_type,
    benefit:
      targetType === "tier"
        ? selectedTier?.benefit_description || (selectedTier?.benefit_type === "commission_boost" ? `+${selectedTier?.benefit_value ?? 0}% commission` : null)
        : selectedBadge?.benefit_description || (selectedBadge?.benefit_type === "commission_boost" ? `+${selectedBadge?.benefit_value ?? 0}% commission` : null),
  };

  return (
    <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="overflow-hidden rounded-[1.7rem] border border-black/10 bg-white shadow-[0_18px_48px_rgba(5,5,5,0.06)]">
      <div className="border-b border-black/10 bg-[#11120f] px-5 py-5 text-white sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[#dff579]"><Sparkles aria-hidden="true" size={15} /><p className="text-[10px] font-semibold uppercase tracking-[0.24em]">Growth studio · guided setup</p></div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Build a reward without the rule jargon</h2>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-white/65">Choose the moment, describe the goal in everyday language, preview the people affected, and decide when the rule should run.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-right"><p className="text-[10px] uppercase tracking-[0.18em] text-white/45">Active rules</p><p className="mt-0.5 text-lg font-semibold text-[#dff579]">{activeRules.length}</p></div>
        </div>
        <ol className="mt-6 grid gap-2 sm:grid-cols-4" aria-label="Reward builder steps">
          {steps.map((step, index) => {
            const isCurrent = activeStep === index;
            const isComplete = activeStep > index;
            return (
              <li key={step.id}>
                <button type="button" onClick={() => { if (index <= activeStep) { setPreviewError(null); setActiveStep(index); } }} aria-current={isCurrent ? "step" : undefined} className={`flex min-h-[58px] w-full items-start gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${isCurrent ? "border-[#dff579] bg-[#dff579] text-[#11120f]" : "border-white/10 bg-white/5 text-white/65 hover:border-white/25"}`}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${isCurrent ? "bg-[#11120f] text-[#dff579]" : isComplete ? "bg-white/15 text-[#dff579]" : "bg-white/10 text-white/55"}`}>{isComplete ? <Check aria-hidden="true" size={14} /> : step.number}</span>
                  <span className="min-w-0"><span className="block text-xs font-semibold">{step.title}</span><span className={`mt-0.5 block text-[10px] leading-4 ${isCurrent ? "text-[#11120f]/65" : "text-white/45"}`}>{step.description}</span></span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="p-5 sm:p-6">
        {previewError ? <div role="alert" className="mb-5 flex items-start gap-2 rounded-2xl border border-[#efc5b1] bg-[#fff3ec] px-3.5 py-3 text-sm text-[#8d482c]"><AlertTriangle aria-hidden="true" size={17} className="mt-0.5 shrink-0" /><span>{previewError}</span></div> : null}
        {actionMessage ? <p role="status" aria-live="polite" className="mb-5 flex items-center gap-2 rounded-2xl border border-[#d9dfbf] bg-[#f1f5d9] px-3.5 py-3 text-sm text-[#4c5d11]"><Check aria-hidden="true" size={17} className="shrink-0" />{actionMessage}</p> : null}

        {activeStep === 0 ? (
          <div className="space-y-5">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#66722f]">Step 1 · the reward</p><h3 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#111]">What should an agent earn?</h3><p className="mt-1 max-w-2xl text-sm leading-5 text-neutral-500">Start with something already in your catalog. Tiers guide progression; badges celebrate a moment.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["tier", "badge"] as const).map((type) => {
                const selected = targetType === type;
                const available = type === "tier" ? tiers.length : badges.length;
                return <button key={type} type="button" onClick={() => chooseTargetType(type)} aria-pressed={selected} className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${selected ? "border-[#718327] bg-[#f1f5d9]" : "border-black/10 bg-[#fafaf8] hover:border-black/25"}`}><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-[#111] text-[#dff579]" : "bg-black/5 text-neutral-500"}`}>{type === "tier" ? <Layers3 aria-hidden="true" size={19} /> : <BadgeCheck aria-hidden="true" size={19} />}</span><span><span className="block text-sm font-semibold text-[#111]">{type === "tier" ? "Tier progression" : "Achievement badge"}</span><span className="mt-1 block text-xs leading-4 text-neutral-500">{type === "tier" ? "Move an agent up a visible ladder." : "Celebrate a repeatable or one-off milestone."}</span><span className="mt-2 block text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{available} in catalog</span></span></button>;
              })}
            </div>
            {selectedReward ? <div className="rounded-2xl border border-black/10 bg-[#f7f7f2] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#111] text-[#dff579]">{selectedReward.icon_url ? <img src={selectedReward.icon_url} alt="" className="h-full w-full object-cover" /> : targetType === "tier" ? <Award aria-hidden="true" size={23} /> : <BadgeCheck aria-hidden="true" size={23} />}</div><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Selected {targetType}</p><h4 className="truncate text-lg font-semibold text-[#111]">{targetType === "tier" && selectedTier?.level ? `Level ${selectedTier.level} · ` : ""}{selectedReward.name}</h4>{targetType === "badge" && selectedBadge?.name_ar ? <p className="text-xs text-neutral-500" dir="rtl">{selectedBadge.name_ar}</p> : null}</div></div><span className="rounded-full border border-[#d9dfbf] bg-[#f1f5d9] px-3 py-1 text-[11px] font-semibold text-[#4c5d11]">{selectedReward.is_active === false ? "Inactive" : "Ready to use"}</span></div><div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><p className="text-sm leading-5 text-neutral-600">{selectedReward.description || "Add a clear description so the reward feels intentional in the mobile app."}</p><label htmlFor="reward-target" className="text-xs font-semibold text-neutral-600">Catalog item<select id="reward-target" value={targetId} onChange={(event) => setTargetId(event.target.value)} className="mt-1.5 min-h-11 min-w-[220px] rounded-xl border border-black/10 bg-white px-3 text-sm font-medium text-[#111]"><option value="">Choose one</option>{targetOptions.map((option) => <option key={option.id} value={option.id}>{targetType === "tier" && "level" in option && option.level ? `Level ${option.level} · ${option.name}` : option.name}</option>)}</select></label></div></div> : <div className="rounded-2xl border border-dashed border-black/15 bg-neutral-50 px-4 py-8 text-center"><Target aria-hidden="true" size={24} className="mx-auto text-neutral-400" /><p className="mt-2 text-sm font-semibold text-[#111]">Create a tier or badge first</p><p className="mt-1 text-xs text-neutral-500">The catalog forms below this builder add a real item; then return here to attach its earning goal.</p></div>}
          </div>
        ) : null}

        {activeStep === 1 ? (
          <div className="space-y-5">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#66722f]">Step 2 · the goal</p><h3 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#111]">When is it earned?</h3><p className="mt-1 max-w-2xl text-sm leading-5 text-neutral-500">Write the rule as a measurable moment. A blank value is never treated as “everyone”.</p></div>
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]"><label htmlFor="reward-metric" className="block text-xs font-semibold text-neutral-600">Progress signal<select id="reward-metric" value={metric} onChange={(event) => setMetric(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm text-[#111]">{metrics.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><span className="mt-1 block font-normal text-neutral-400">{selectedMetric.hint}</span></label><label htmlFor="reward-window" className="block text-xs font-semibold text-neutral-600">Measure over<select id="reward-window" value={timeWindow} onChange={(event) => setTimeWindow(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm text-[#111]">{timeWindows.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><span className="mt-1 block font-normal text-neutral-400">The period used to check the goal.</span></label></div>
            <fieldset><legend className="text-xs font-semibold text-neutral-600">The goal is…</legend><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{operators.map((option) => <button key={option.value} type="button" onClick={() => setOperator(option.value)} aria-pressed={operator === option.value} className={`rounded-2xl border p-3 text-left transition-colors ${operator === option.value ? "border-[#718327] bg-[#f1f5d9]" : "border-black/10 bg-[#fafaf8] hover:border-black/25"}`}><span className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${operator === option.value ? "bg-[#111] text-[#dff579]" : "bg-black/5 text-neutral-500"}`}>{option.symbol}</span><span className="mt-2 block text-xs font-semibold text-[#111]">{option.label}</span><span className="mt-1 block text-[10px] leading-4 text-neutral-500">{option.hint}</span></button>)}</div></fieldset>
            {operator === "between" ? <div className="grid gap-3 sm:grid-cols-2"><label htmlFor="reward-value-min" className="block text-xs font-semibold text-neutral-600">Minimum<input id="reward-value-min" value={valueMin} onChange={(event) => setValueMin(event.target.value)} type="number" min={0} step="any" className="mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm text-[#111]" placeholder="0" /></label><label htmlFor="reward-value-max" className="block text-xs font-semibold text-neutral-600">Maximum<input id="reward-value-max" value={valueMax} onChange={(event) => setValueMax(event.target.value)} type="number" min={0} step="any" className="mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm text-[#111]" placeholder="10" /></label></div> : <label htmlFor="reward-value" className="block max-w-sm text-xs font-semibold text-neutral-600">{operator === "top_n" ? "Number of people" : operator === "top_percent" ? "Top percentage" : "Goal value"}<div className="relative"><input id="reward-value" value={valueSingle} onChange={(event) => setValueSingle(event.target.value)} type="number" min={0} max={operator === "top_percent" ? 100 : undefined} step={operator === "top_n" || operator === "top_percent" ? 1 : "any"} className="mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 pr-12 text-sm text-[#111]" placeholder={operator === "top_percent" ? "10" : "3"} />{operator === "top_percent" ? <span className="pointer-events-none absolute right-3 top-1/2 mt-1 -translate-y-1/2 text-xs text-neutral-400">%</span> : null}</div><span className="mt-1 block font-normal text-neutral-400">{operator === "top_n" ? "Example: top 10 agents this quarter." : "Use a precise number so the preview is trustworthy."}</span></label>}
            <RewardAudienceBuilder audiences={audiences} value={audienceId} onChange={setAudienceId} />
          </div>
        ) : null}

        {activeStep === 2 ? (
          <div className="space-y-5">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#66722f]">Step 3 · behaviour</p><h3 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#111]">What should happen after qualification?</h3><p className="mt-1 max-w-2xl text-sm leading-5 text-neutral-500">Choose the guardrails that make the reward predictable for agents and safe for the programme.</p></div>
            {targetType === "tier" ? <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label htmlFor="tier-demotion-policy" className="block text-xs font-semibold text-neutral-600">If the goal is missed<select id="tier-demotion-policy" value={tierDemotion} onChange={(event) => setTierDemotion(event.target.value as TierDemotion)} className="mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm text-[#111]"><option value="hold">Keep the current tier</option><option value="demote">Move down after review</option><option value="reset">Reset at the next period</option></select></label><label htmlFor="tier-review-window" className="block text-xs font-semibold text-neutral-600">Review & reset cadence<select id="tier-review-window" value={tierReviewWindow} onChange={(event) => setTierReviewWindow(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm text-[#111]"><option value="all_time">All-time progress</option><option value="last_30d">Every 30 days</option><option value="last_90d">Every 90 days</option><option value="quarter">Each quarter</option><option value="year">Each year</option></select></label></div><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-[#d9dfbf] bg-[#f1f5d9] p-4"><ArrowRight aria-hidden="true" size={17} className="text-[#4c5d11]" /><p className="mt-2 text-sm font-semibold text-[#111]">Promotion</p><p className="mt-1 text-xs leading-4 text-neutral-600">Agents move up when this rule is met.</p></div><div className="rounded-2xl border border-[#f2c2aa] bg-[#fff3ec] p-4"><RotateCcw aria-hidden="true" size={17} className="text-[#8d482c]" /><p className="mt-2 text-sm font-semibold text-[#111]">Demotion</p><p className="mt-1 text-xs leading-4 text-neutral-600">{tierDemotion === "hold" ? "No surprise drop; the current tier stays." : tierDemotion === "demote" ? "A missed goal can move agents down." : "Levels refresh on the selected cadence."}</p></div><div className="rounded-2xl border border-[#c8c2e9] bg-[#f2f1fb] p-4"><Layers3 aria-hidden="true" size={17} className="text-[#4d477f]" /><p className="mt-2 text-sm font-semibold text-[#111]">Benefits</p><select aria-label="Tier benefit stacking" value={tierStacking} onChange={(event) => setTierStacking(event.target.value)} className="mt-2 min-h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-xs text-[#111]"><option value="highest_only">Highest tier only</option><option value="stack">Stack with other rewards</option><option value="review">Review conflicts</option></select></div></div></div> : <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><fieldset><legend className="text-xs font-semibold text-neutral-600">Visibility</legend><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => setBadgeVisibility("public")} aria-pressed={badgeVisibility === "public"} className={`rounded-2xl border p-3 text-left ${badgeVisibility === "public" ? "border-[#4d477f] bg-[#f2f1fb]" : "border-black/10 bg-[#fafaf8]"}`}><Eye aria-hidden="true" size={16} className="text-[#4d477f]" /><span className="mt-2 block text-xs font-semibold text-[#111]">Public</span><span className="mt-1 block text-[10px] leading-4 text-neutral-500">Show on profile</span></button><button type="button" onClick={() => setBadgeVisibility("hidden")} aria-pressed={badgeVisibility === "hidden"} className={`rounded-2xl border p-3 text-left ${badgeVisibility === "hidden" ? "border-[#4d477f] bg-[#f2f1fb]" : "border-black/10 bg-[#fafaf8]"}`}><LockKeyhole aria-hidden="true" size={16} className="text-[#4d477f]" /><span className="mt-2 block text-xs font-semibold text-[#111]">Hidden</span><span className="mt-1 block text-[10px] leading-4 text-neutral-500">Secret until earned</span></button></div></fieldset><fieldset><legend className="text-xs font-semibold text-neutral-600">Repeatability</legend><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => setBadgeRepeatability("once")} aria-pressed={badgeRepeatability === "once"} className={`rounded-2xl border p-3 text-left ${badgeRepeatability === "once" ? "border-[#4d477f] bg-[#f2f1fb]" : "border-black/10 bg-[#fafaf8]"}`}><BadgeCheck aria-hidden="true" size={16} className="text-[#4d477f]" /><span className="mt-2 block text-xs font-semibold text-[#111]">Once</span><span className="mt-1 block text-[10px] leading-4 text-neutral-500">One lifetime moment</span></button><button type="button" onClick={() => setBadgeRepeatability("renewable")} aria-pressed={badgeRepeatability === "renewable"} className={`rounded-2xl border p-3 text-left ${badgeRepeatability === "renewable" ? "border-[#4d477f] bg-[#f2f1fb]" : "border-black/10 bg-[#fafaf8]"}`}><RotateCcw aria-hidden="true" size={16} className="text-[#4d477f]" /><span className="mt-2 block text-xs font-semibold text-[#111]">Repeatable</span><span className="mt-1 block text-[10px] leading-4 text-neutral-500">Renew after expiry</span></button></div></fieldset></div><div className="grid gap-4 sm:grid-cols-3"><label htmlFor="badge-expiry-mode" className="block text-xs font-semibold text-neutral-600">Expiry<select id="badge-expiry-mode" value={badgeExpiry} onChange={(event) => setBadgeExpiry(event.target.value as BadgeExpiry)} className="mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm text-[#111]"><option value="permanent">Never expires</option><option value="days">Expires after a set time</option></select></label><label htmlFor="badge-revocation" className="block text-xs font-semibold text-neutral-600">If qualification is reversed<select id="badge-revocation" value={badgeRevocation} onChange={(event) => setBadgeRevocation(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm text-[#111]"><option value="keep">Keep the earned badge</option><option value="revoke">Revoke it</option><option value="review">Ask an admin to review</option></select></label><label htmlFor="badge-priority" className="block text-xs font-semibold text-neutral-600">Display priority<input id="badge-priority" value={badgePriority} onChange={(event) => setBadgePriority(event.target.value)} type="number" min={0} step={1} className="mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm text-[#111]" /><span className="mt-1 block font-normal text-neutral-400">Lower number appears first.</span></label></div><div className="rounded-2xl border border-[#c8c2e9] bg-[#f2f1fb] px-4 py-3 text-xs leading-5 text-[#4d477f]"><CircleHelp aria-hidden="true" size={15} className="mb-1" />A hidden badge can still be earned and will appear at the moment the agent qualifies. Repeatable badges are most useful with an expiry or recurring window.</div></div>}
          </div>
        ) : null}

        {activeStep === 3 ? (
          <div className="space-y-5">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#66722f]">Step 4 · review & launch</p><h3 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#111]">Make the moment safe to ship</h3><p className="mt-1 max-w-2xl text-sm leading-5 text-neutral-500">Preview names, reasons, conflicts, and the bilingual mobile state before saving the rule.</p></div>
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)]">
              <div className="space-y-4">
                <section className="rounded-2xl border border-black/10 bg-[#f7f7f2] p-4" aria-labelledby="reward-summary-title"><div className="flex items-center gap-2 text-[#4c5d11]"><ShieldCheck aria-hidden="true" size={16} /><p id="reward-summary-title" className="text-[10px] font-semibold uppercase tracking-[0.2em]">Plain-language summary</p></div><p className="mt-3 text-lg font-semibold leading-7 tracking-[-0.02em] text-[#111]">{plainSummary}</p><div className="mt-4 flex flex-wrap gap-2 text-[11px] text-neutral-600"><span className="rounded-full border border-black/10 bg-white px-3 py-1.5">{targetType === "tier" ? `Level ${selectedTier?.level ?? "—"}` : "Achievement"}</span><span className="rounded-full border border-black/10 bg-white px-3 py-1.5">{lifecycleOptions.find((option) => option.value === lifecycleStatus)?.label}</span><span className="rounded-full border border-black/10 bg-white px-3 py-1.5">{selectedMetric.label}</span></div></section>
                <section className="rounded-2xl border border-black/10 bg-white p-4" aria-labelledby="reward-preview-title"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><UsersRound aria-hidden="true" size={16} className="text-[#4c5d11]" /><h4 id="reward-preview-title" className="text-sm font-semibold text-[#111]">Who would be affected?</h4></div><button type="button" onClick={() => void preview()} disabled={isPending} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-black/15 px-3.5 py-1.5 text-xs font-semibold text-[#111] transition-colors hover:border-black/35 disabled:opacity-50"><UsersRound aria-hidden="true" size={13} />{previewResult ? "Refresh preview" : "Run safe preview"}</button></div>{previewResult ? <><div className="mt-4 grid gap-2 sm:grid-cols-3"><div className="rounded-xl bg-[#f1f5d9] px-3 py-2.5"><p className="text-[10px] uppercase tracking-[0.14em] text-[#66722f]">Eligible</p><p className="mt-1 text-xl font-semibold text-[#111]">{previewResult.count}</p></div><div className="rounded-xl bg-[#f7f7f2] px-3 py-2.5"><p className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">Named sample</p><p className="mt-1 text-xl font-semibold text-[#111]">{previewResult.recipients.length}</p></div><div className="rounded-xl bg-[#fff3ec] px-3 py-2.5"><p className="text-[10px] uppercase tracking-[0.14em] text-[#8d482c]">Excluded</p><p className="mt-1 text-xl font-semibold text-[#111]">{previewResult.excludedCount}</p></div></div>{targetType === "tier" ? <div className="mt-4 rounded-xl border border-[#d9dfbf] bg-[#f1f5d9] px-3 py-2.5 text-xs text-[#4c5d11]"><p className="font-semibold">Movement preview</p><p className="mt-1 leading-4">{previewResult.movements.length ? previewResult.movements.slice(0, 2).join(" · ") : `Agents meeting this goal move to ${selectedTier?.name || "the selected level"}. Current tiers stay unchanged when demotion is set to hold.`}</p></div> : null}{previewResult.recipients.length ? <div className="mt-4 space-y-2">{(showAllRecipients ? previewResult.recipients : previewResult.recipients.slice(0, 4)).map((recipient, index) => <div key={`${recipient.id ?? recipient.name}-${index}`} className="flex items-start gap-3 rounded-xl border border-black/10 bg-[#fafaf8] px-3 py-2.5"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#111] text-[10px] font-bold text-[#dff579]">{recipient.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-[#111]">{recipient.name}</p>{recipient.nameAr ? <p dir="rtl" className="truncate text-[10px] text-neutral-500">{recipient.nameAr}</p> : null}<p className="mt-0.5 text-[10px] leading-4 text-neutral-500">{recipient.reason}{recipient.currentTier ? ` · Current: ${recipient.currentTier}` : ""}</p></div>{recipient.nextTier ? <span className="shrink-0 rounded-full bg-[#f1f5d9] px-2 py-1 text-[10px] font-semibold text-[#4c5d11]">→ {recipient.nextTier}</span> : null}</div>)}{previewResult.recipients.length > 4 ? <button type="button" onClick={() => setShowAllRecipients((current) => !current)} className="inline-flex items-center gap-1 text-xs font-semibold text-[#4c5d11] underline decoration-[#c9d795] underline-offset-4">{showAllRecipients ? "Show fewer" : `Show all ${previewResult.recipients.length} names`}<ChevronRight aria-hidden="true" size={13} className={showAllRecipients ? "rotate-90" : ""} /></button> : null}</div> : <p className="mt-4 rounded-xl border border-dashed border-black/15 px-3 py-4 text-center text-xs text-neutral-500">No named agents matched this goal in the preview.</p>}{previewResult.conflicts.length ? <div className="mt-4 rounded-xl border border-[#efc5b1] bg-[#fff3ec] px-3 py-2.5 text-xs text-[#8d482c]"><p className="font-semibold">Potential overlap</p><ul className="mt-1 list-disc pl-4">{previewResult.conflicts.slice(0, 3).map((conflict, index) => <li key={`${conflict}-${index}`}>{conflict}</li>)}</ul></div> : null}</> : <div className="mt-4 rounded-xl border border-dashed border-black/15 bg-neutral-50 px-4 py-6 text-center"><Target aria-hidden="true" size={20} className="mx-auto text-neutral-400" /><p className="mt-2 text-sm font-semibold text-[#111]">Preview before you publish</p><p className="mx-auto mt-1 max-w-sm text-xs leading-4 text-neutral-500">Run a safe preview to see eligible names, reasons, and possible overlaps.</p></div>}</section>
                <section className="rounded-2xl border border-black/10 bg-white p-4" aria-labelledby="reward-lifecycle-title"><div className="flex items-start gap-2"><CalendarClock aria-hidden="true" size={16} className="mt-0.5 text-[#4d477f]" /><div><h4 id="reward-lifecycle-title" className="text-sm font-semibold text-[#111]">Choose a lifecycle</h4><p className="mt-1 text-xs leading-4 text-neutral-500">Drafts are saved centrally for your team. The evaluator honours schedules and never awards from paused, archived, or unapproved rules.</p></div></div><div className="mt-4 flex flex-wrap gap-2">{lifecycleOptions.map((option) => <button key={option.value} type="button" onClick={() => setLifecycleStatus(option.value)} aria-pressed={lifecycleStatus === option.value} className={`rounded-xl border px-3 py-2 text-left transition-colors ${lifecycleStatus === option.value ? `${option.className} ring-2 ring-black/10` : "border-black/10 bg-white text-neutral-500 hover:border-black/25"}`}><span className="block text-xs font-semibold">{option.label}</span><span className="mt-0.5 block text-[10px] opacity-70">{option.detail}</span></button>)}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label htmlFor="reward-start-at" className="block text-xs font-semibold text-neutral-600">Starts {lifecycleStatus === "scheduled" ? <span className="text-[#8d482c]">*</span> : "(optional)"}<input id="reward-start-at" value={startAt} onChange={(event) => setStartAt(event.target.value)} type="datetime-local" className="mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm text-[#111]" /></label><label htmlFor="reward-end-at" className="block text-xs font-semibold text-neutral-600">Ends (optional)<input id="reward-end-at" value={endAt} onChange={(event) => setEndAt(event.target.value)} type="datetime-local" className="mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm text-[#111]" /></label></div></section>
              </div>
              <RewardMobilePreview reward={selectedPreview} />
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-5"><button type="button" onClick={() => { setPreviewError(null); setActionMessage(null); setActiveStep((step) => Math.max(0, step - 1)); }} disabled={activeStep === 0} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-sm font-semibold text-neutral-600 transition-colors hover:border-black/30 hover:text-[#111] disabled:invisible"><ArrowLeft aria-hidden="true" size={15} />Back</button><div className="flex flex-wrap items-center justify-end gap-2">{activeStep === 3 ? <button type="button" onClick={() => void preview()} disabled={isPending} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-semibold text-[#111] transition-colors hover:border-black/35 disabled:opacity-50"><Target aria-hidden="true" size={15} />{previewResult ? "Refresh preview" : "Preview impact"}</button> : null}<button type={activeStep === 3 ? "submit" : "button"} onClick={activeStep === 3 ? undefined : nextStep} disabled={isPending || !selectedReward || (activeStep === 3 && !previewIsFresh)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#111] px-5 py-2 text-sm font-semibold text-[#dff579] shadow-lg shadow-black/10 transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50">{activeStep === 3 ? <>{lifecycleStatus === "draft" ? "Save draft" : `Save ${lifecycleStatus}`}<Check aria-hidden="true" size={15} /></> : <>Continue<ArrowRight aria-hidden="true" size={15} /></>}</button></div></div>
      </div>
    </form>
  );
}
