import Link from "next/link";
import { ArrowLeft, PackageCheck } from "lucide-react";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { AdminLayout } from "@/components/AdminLayout";
import { GiftClaimsWorkspace, type GiftClaimEntry, type GiftClaimStatus } from "@/components/GiftClaimsWorkspace";
import { buildAdminUi } from "@/lib/adminUi";
import { supabaseServer } from "@/lib/supabaseServer";

type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RawRecord) : {};
}

function firstNested(value: unknown): RawRecord {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

function stringValue(record: RawRecord, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return fallback;
}

function numberValue(record: RawRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function normalizeStatus(value: unknown): GiftClaimStatus {
  return ["pending", "approved", "fulfilled", "rejected", "cancelled"].includes(String(value)) ? (String(value) as GiftClaimStatus) : "pending";
}

function formatTrigger(rule: RawRecord | undefined): string | null {
  if (!rule) return null;
  const metric = stringValue(rule, ["metric"]).replaceAll("_", " ");
  const operator = stringValue(rule, ["operator"], "at least");
  const single = stringValue(rule, ["value_single"]);
  const min = stringValue(rule, ["value_min"]);
  const max = stringValue(rule, ["value_max"]);
  const value = operator === "between" ? `${min || "…"}–${max || "…"}` : single || "the configured target";
  const window = stringValue(rule, ["time_window"], "all time").replaceAll("_", " ");
  return `Trigger: ${metric || "activity"} ${operator} ${value} · ${window}.`;
}

function optionalString(record: RawRecord, keys: string[]): string | null {
  const value = stringValue(record, keys);
  return value || null;
}

export default async function GiftClaimsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  const ui = await buildAdminUi(["marketing_admin"]);
  const params = searchParams instanceof Promise ? await searchParams : searchParams;
  const requestedStatus = typeof params?.status === "string" ? params.status : "pending";
  const initialStatus: GiftClaimStatus = ["pending", "approved", "fulfilled", "rejected", "cancelled"].includes(requestedStatus) ? (requestedStatus as GiftClaimStatus) : "pending";

  const [claimsResult, eligibilityResult, rulesResult] = await Promise.all([
    supabaseServer.from("gift_claims").select("*, gifts(*), users_profile(id, display_name, phone, profile_picture_url, verification_status, account_status, total_deals)").order("claimed_at", { ascending: false }).limit(500),
    supabaseServer.from("gift_eligibilities").select("gift_id, agent_id, status, eligible_at, updated_at").limit(2000),
    supabaseServer.from("gift_rules").select("*").order("created_at", { ascending: false }).limit(1000),
  ]);

  const rawClaims = ((claimsResult.data ?? []) as unknown[]).map(asRecord);
  const agentIds = Array.from(new Set(rawClaims.map((claim) => stringValue(claim, ["agent_id"])).filter(Boolean)));
  const tierResult = agentIds.length
    ? await supabaseServer.from("user_tiers").select("user_id, tiers(name, level)").in("user_id", agentIds)
    : { data: [], error: null };
  const eligibilityMap = new Map<string, RawRecord>();
  for (const row of (eligibilityResult.data ?? []) as unknown[]) {
    const record = asRecord(row);
    const key = `${stringValue(record, ["gift_id"])}:${stringValue(record, ["agent_id"])}`;
    if (key !== ":") eligibilityMap.set(key, record);
  }
  const rulesByGift = new Map<string, RawRecord>();
  for (const row of (rulesResult.data ?? []) as unknown[]) {
    const record = asRecord(row);
    const giftId = stringValue(record, ["gift_id"]);
    if (giftId && !rulesByGift.has(giftId)) rulesByGift.set(giftId, record);
  }
  const tierByAgent = new Map<string, string>();
  for (const row of (tierResult.data ?? []) as unknown[]) {
    const record = asRecord(row);
    const tier = firstNested(record.tiers);
    const level = stringValue(tier, ["level"]);
    const name = stringValue(tier, ["name"]);
    const userId = stringValue(record, ["user_id"]);
    if (userId) tierByAgent.set(userId, `${level ? `Tier ${level}` : "Tier"}${name ? ` · ${name}` : ""}`);
  }

  const historyByAgent = new Map<string, Array<{ status: string; at?: string | null; note?: string | null }>>();
  for (const claim of rawClaims) {
    const agentId = stringValue(claim, ["agent_id"]);
    if (!agentId) continue;
    const history = historyByAgent.get(agentId) ?? [];
    history.push({ status: normalizeStatus(claim.status), at: optionalString(claim, ["claimed_at", "updated_at"]), note: optionalString(claim, ["notes"]) });
    historyByAgent.set(agentId, history);
  }

  const normalizedClaims: GiftClaimEntry[] = rawClaims.map((claim) => {
    const gift = firstNested(claim.gifts);
    const agent = firstNested(claim.users_profile);
    const giftId = optionalString(claim, ["gift_id"]);
    const agentId = optionalString(claim, ["agent_id"]);
    const giftTitle = stringValue(gift, ["title"], "Reward");
    const agentName = stringValue(agent, ["display_name"], "Brixeler agent");
    const eligibility = eligibilityMap.get(`${giftId ?? ""}:${agentId ?? ""}`);
    const rule = giftId ? rulesByGift.get(giftId) : undefined;
    const history = agentId ? historyByAgent.get(agentId) ?? [] : [];
    const otherActive = rawClaims.filter((other) => {
      if (other === claim || stringValue(other, ["agent_id"]) !== agentId) return false;
      return ["pending", "approved", "fulfilled"].includes(normalizeStatus(other.status));
    });
    const otherGiftNames = otherActive.map((other) => stringValue(firstNested(other.gifts), ["title"], "another reward"));
    const conflicts = otherGiftNames.length && (stringValue(gift, ["exclusivity_mode"]) !== "none" || otherGiftNames.some((name) => name === giftTitle))
      ? [`Another active claim exists for ${otherGiftNames.join(", ")}.`]
      : [];
    const evidence = [
      formatTrigger(rule),
      eligibility ? `Eligibility record: ${stringValue(eligibility, ["status"], "evaluated")} · last checked ${stringValue(eligibility, ["updated_at", "eligible_at"], "recently")}.` : "Eligibility record is linked to this claim.",
      stringValue(agent, ["verification_status"]) === "verified" ? "Agent verification is complete." : "Agent verification status is visible to the reviewer.",
      otherGiftNames.length ? `Duplicate check found ${otherGiftNames.length} active claim${otherGiftNames.length === 1 ? "" : "s"} for this agent.` : "No duplicate active claim was found for this agent.",
    ].filter((item): item is string => Boolean(item));
    const rawEvidence = claim.evidence ?? claim.eligibility_evidence;
    if (Array.isArray(rawEvidence)) evidence.push(...rawEvidence.map(String));
    const rawHistory = Array.isArray(claim.history) ? claim.history.map((item) => { const record = asRecord(item); return { status: stringValue(record, ["status"], "updated"), at: optionalString(record, ["at", "created_at", "updated_at"]), note: optionalString(record, ["note", "notes"]) }; }) : history;
    return {
      id: stringValue(claim, ["id"]),
      giftId,
      status: normalizeStatus(claim.status),
      notes: optionalString(claim, ["notes", "fulfillment_notes"]),
      claimedAt: optionalString(claim, ["claimed_at", "created_at"]),
      updatedAt: optionalString(claim, ["updated_at", "claimed_at"]),
      agent: {
        id: agentId,
        name: agentName,
        phone: optionalString(agent, ["phone"]) ?? optionalString(claim, ["agent_phone", "contact_phone"]),
        email: optionalString(agent, ["email"]) ?? optionalString(claim, ["agent_email", "contact_email"]),
        avatarUrl: optionalString(agent, ["profile_picture_url", "avatar_url"]),
        verificationStatus: optionalString(agent, ["verification_status"]),
        accountStatus: optionalString(agent, ["account_status"]),
        totalDeals: numberValue(agent, ["total_deals"]),
        tier: agentId ? tierByAgent.get(agentId) ?? null : null,
      },
      gift: {
        title: giftTitle,
        titleAr: optionalString(gift, ["title_ar"]),
        description: optionalString(gift, ["description"]),
        iconUrl: optionalString(gift, ["icon_url"]),
        type: optionalString(gift, ["gift_type", "reward_type", "type"]),
        value: optionalString(gift, ["value", "display_value", "value_amount"]),
        vendor: optionalString(gift, ["vendor", "vendor_name"]),
        fulfillmentOwner: optionalString(gift, ["fulfillment_owner", "fulfilment_owner"]),
        redemptionMethod: optionalString(gift, ["fulfillment_method", "redemption_method"]),
        terms: optionalString(gift, ["terms", "redemption_terms"]),
      },
      eligibility: eligibility ? { status: optionalString(eligibility, ["status"]), eligibleAt: optionalString(eligibility, ["eligible_at"]), updatedAt: optionalString(eligibility, ["updated_at"]) } : null,
      evidence,
      conflicts,
      fulfillment: {
        contactName: optionalString(claim, ["contact_name", "fulfillment_contact_name"]),
        contactPhone: optionalString(claim, ["contact_phone", "fulfillment_contact_phone"]),
        contactEmail: optionalString(claim, ["contact_email", "fulfillment_contact_email"]),
        method: optionalString(claim, ["fulfillment_method", "redemption_method"]),
        owner: optionalString(claim, ["fulfillment_owner", "fulfilment_owner"]),
        vendor: optionalString(claim, ["vendor", "vendor_name"]),
        reference: optionalString(claim, ["fulfillment_reference", "delivery_reference"]),
        dueAt: optionalString(claim, ["fulfillment_due_at", "due_at"]),
      },
      history: rawHistory,
    };
  }).filter((claim) => claim.id);

  const dataWarning = claimsResult.error || eligibilityResult.error || rulesResult.error || tierResult.error
    ? "Some live claim detail is unavailable. The queue remains safe to review, but refresh after permissions or data access are restored."
    : null;

  return (
    <AdminLayout
      title="Gift Claims"
      description="Review, approve, and fulfil rewards with evidence in view."
      navItems={ui.navItems}
      meta={ui.meta}
      actions={<Link href="/gifts" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:border-black/30"><ArrowLeft aria-hidden="true" size={15} />Gifts Studio</Link>}
    >
      {!ui.hasAccess ? <AdminAccessDenied /> : <>
        <section className="relative overflow-hidden rounded-3xl bg-[#111] px-5 py-7 text-white shadow-[0_18px_50px_rgba(0,0,0,0.14)] sm:px-8 sm:py-8"><div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[#e8bd6b]/20 blur-3xl" /><div className="relative flex flex-wrap items-end justify-between gap-6"><div><p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-[#e8bd6b]">Claims workspace</p><h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Fulfil the promise, not just the status.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-white/65">Every handoff keeps the agent identity, eligibility evidence, contact path, and SLA together.</p></div><div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/8"><PackageCheck aria-hidden="true" size={24} className="text-[#e8bd6b]" /></div></div></section>
        <GiftClaimsWorkspace claims={normalizedClaims} initialStatus={initialStatus} dataWarning={dataWarning} />
      </>}
    </AdminLayout>
  );
}
