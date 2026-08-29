/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { Activity, ArrowUpRight, Gift as GiftIcon, PackageCheck, ShieldCheck } from "lucide-react";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { AdminLayout } from "@/components/AdminLayout";
import { GiftCreateForm } from "@/components/GiftCreateForm";
import { GrowthApprovalControls } from "@/components/GrowthApprovalControls";
import { GrowthVersionHistory } from "@/components/GrowthVersionHistory";
import { GiftRuleBuilder, type GiftAgentDirectoryEntry, type GiftOption, type GiftRuleSummary } from "@/components/GiftRuleBuilder";
import type { GiftSavedAudience } from "@/components/GiftAudienceBuilder";
import { buildAdminUi } from "@/lib/adminUi";
import { supabaseServer } from "@/lib/supabaseServer";

type TierRow = { id: string; name: string; level: number | null };

type CatalogGift = GiftOption & {
  status: string;
  version?: number | null;
  approvalStatus?: string;
  type?: string;
  value?: string;
  stock?: number | null;
  vendor?: string;
  fulfillmentOwner?: string;
  redemptionMethod?: string;
  maxClaims?: number | null;
  exclusivityMode?: string;
  tierIds: string[];
  createdAt?: string | null;
};

type RecentClaim = {
  id: string;
  giftTitle: string;
  agentName: string;
  status: string;
  claimedAt: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(record: Record<string, unknown>, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return fallback;
}

function booleanValue(record: Record<string, unknown>, keys: string[], fallback = false): boolean {
  for (const key of keys) {
    if (typeof record[key] === "boolean") return record[key] as boolean;
  }
  return fallback;
}

function numberValue(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function firstNested(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

function giftState(record: Record<string, unknown>): string {
  const explicit = stringValue(record, ["lifecycle_state", "status", "lifecycle_status", "publish_state"]);
  if (["draft", "scheduled", "active", "paused", "archived"].includes(explicit)) return explicit;
  return booleanValue(record, ["is_active"], true) ? "active" : "paused";
}

function stateTone(state: string): string {
  if (state === "active") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (state === "scheduled") return "border-sky-200 bg-sky-50 text-sky-800";
  if (state === "paused") return "border-amber-200 bg-amber-50 text-amber-800";
  if (state === "archived") return "border-neutral-300 bg-neutral-100 text-neutral-600";
  return "border-black/10 bg-white text-neutral-600";
}

function formatDate(value?: string | null): string {
  if (!value) return "Not set";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not set" : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatRule(rule: GiftRuleSummary, giftTitle: string): string {
  const metric = (rule.metric ?? "activity").replaceAll("_", " ");
  const operator = rule.operator ?? ">=";
  const value = operator === "between" ? `${rule.valueMin ?? "…"}–${rule.valueMax ?? "…"}` : String(rule.valueSingle ?? "…");
  const window = (rule.timeWindow ?? "all_time").replaceAll("_", " ");
  return `${giftTitle} · ${metric} ${operator} ${value} · ${window}`;
}

export default async function GiftsPage() {
  const ui = await buildAdminUi(["marketing_admin"]);
  const [{ data: tiers }, { data: gifts }, { data: giftRules }, { data: giftClaims }, { data: agents }, { data: audiences }] = await Promise.all([
    supabaseServer.from("tiers").select("id, name, level").order("level", { ascending: true }),
    supabaseServer.from("gifts").select("*").order("created_at", { ascending: false }),
    supabaseServer.from("gift_rules").select("*").order("created_at", { ascending: false }),
    supabaseServer.from("gift_claims").select("id, gift_id, agent_id, status, claimed_at, gifts(title), users_profile(display_name)").order("claimed_at", { ascending: false }).limit(30),
    supabaseServer.from("users_profile").select("id, display_name, profile_picture_url").order("display_name", { ascending: true }).limit(500),
    supabaseServer.from("growth_audiences").select("id, name, description, lifecycle_state").order("created_at", { ascending: false }).limit(100),
  ]);

  const tierRows = (tiers ?? []) as TierRow[];
  const catalogGifts: CatalogGift[] = (gifts ?? []).map((row) => {
    const record = asRecord(row);
    const tierIds = Array.isArray(record.tier_ids) ? record.tier_ids.map(String) : [];
    return {
      id: stringValue(record, ["id"]),
      title: stringValue(record, ["title"], "Untitled reward"),
      titleAr: stringValue(record, ["title_ar"]) || null,
      description: stringValue(record, ["description"]) || null,
      iconUrl: stringValue(record, ["icon_url"]) || null,
      isActive: booleanValue(record, ["is_active"], true),
      status: giftState(record),
      version: numberValue(record, ["version"]),
      approvalStatus: stringValue(record, ["approval_status"]) || undefined,
      type: stringValue(record, ["gift_type", "reward_type", "type"]) || undefined,
      value: stringValue(record, ["value", "display_value", "value_amount"]) || undefined,
      stock: numberValue(record, ["quantity", "stock", "inventory", "available_stock"]),
      vendor: stringValue(record, ["vendor", "vendor_name"]) || undefined,
      fulfillmentOwner: stringValue(record, ["fulfillment_owner", "fulfilment_owner"]) || undefined,
      redemptionMethod: stringValue(record, ["fulfillment_method", "redemption_method"]) || undefined,
      maxClaims: numberValue(record, ["max_concurrent_claims", "max_claims_per_agent"]),
      exclusivityMode: stringValue(record, ["exclusivity_mode"]) || undefined,
      tierIds,
      createdAt: stringValue(record, ["created_at"]) || null,
    };
  }).filter((gift) => gift.id);

  const ruleSummaries: GiftRuleSummary[] = (giftRules ?? []).map((row) => {
    const record = asRecord(row);
    return {
      id: stringValue(record, ["id"]),
      giftId: stringValue(record, ["gift_id"]) || null,
      metric: stringValue(record, ["metric"]) || null,
      timeWindow: stringValue(record, ["time_window"]) || null,
      operator: stringValue(record, ["operator"]) || null,
      valueSingle: (record.value_single as number | string | null | undefined) ?? null,
      valueMin: (record.value_min as number | string | null | undefined) ?? null,
      valueMax: (record.value_max as number | string | null | undefined) ?? null,
      filters: asRecord(record.filters),
      isActive: typeof record.is_active === "boolean" ? record.is_active : true,
      lifecycleState: stringValue(record, ["lifecycle_state", "status"]) || null,
      approvalStatus: stringValue(record, ["approval_status"]) || null,
      version: numberValue(record, ["version"]),
      createdAt: stringValue(record, ["created_at"]) || null,
    };
  }).filter((rule) => rule.id);

  const recentClaims: RecentClaim[] = (giftClaims ?? []).map((row) => {
    const record = asRecord(row);
    const gift = firstNested(record.gifts);
    const profile = firstNested(record.users_profile);
    return {
      id: stringValue(record, ["id"]),
      giftTitle: stringValue(gift, ["title"], "Reward"),
      agentName: stringValue(profile, ["display_name"], "Agent"),
      status: stringValue(record, ["status"], "pending"),
      claimedAt: stringValue(record, ["claimed_at"]) || null,
    };
  }).filter((claim) => claim.id);

  const agentDirectory: GiftAgentDirectoryEntry[] = (agents ?? []).map((row) => {
    const record = asRecord(row);
    return {
      id: stringValue(record, ["id"]),
      name: stringValue(record, ["display_name"], "Brixeler agent"),
      avatarUrl: stringValue(record, ["profile_picture_url"]) || null,
    };
  }).filter((agent) => agent.id);

  const savedAudiences: GiftSavedAudience[] = (audiences ?? []).map((row) => {
    const record = asRecord(row);
    return {
      id: stringValue(record, ["id"]),
      name: stringValue(record, ["name"], "Saved audience"),
      description: stringValue(record, ["description"]) || null,
      lifecycleState: stringValue(record, ["lifecycle_state"], "active"),
    };
  }).filter((audience) => audience.id && audience.lifecycleState !== "archived");

  const activeGiftCount = catalogGifts.filter((gift) => gift.status === "active").length;
  const pendingClaims = recentClaims.filter((claim) => claim.status === "pending").length;
  const liveRules = ruleSummaries.filter((rule) => rule.isActive !== false).length;
  const giftTitleById = new Map(catalogGifts.map((gift) => [gift.id, gift.title]));

  return (
    <AdminLayout
      title="Gifts Studio"
      description="Turn agent activity into thoughtful, fulfilable rewards."
      navItems={ui.navItems}
      meta={ui.meta}
      actions={<Link href="/gifts/claims" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:border-black/30"><PackageCheck aria-hidden="true" size={15} />Claims workspace</Link>}
    >
      {!ui.hasAccess ? <AdminAccessDenied /> : <>
        <section className="relative overflow-hidden rounded-3xl bg-[#111] px-5 py-7 text-white shadow-[0_18px_50px_rgba(0,0,0,0.14)] sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[#e8bd6b]/20 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.65fr)] lg:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-[#e8bd6b]">Gift studio</p>
              <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Reward the moments that move the business.</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-white/65">A guided rule, a clear promise, and a fulfilment path your team can trust.</p>
              <div className="mt-6 flex flex-wrap gap-3"><a href="#gift-rule-builder" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#111] hover:bg-[#f4f1e9]">Build a rule <ArrowUpRight aria-hidden="true" size={15} /></a><a href="#gift-catalog" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold text-white hover:border-white/50">Add a reward</a></div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-4"><p className="text-[10px] uppercase tracking-[0.18em] text-white/45">Live gifts</p><p className="mt-2 text-2xl font-semibold">{activeGiftCount}</p><p className="mt-1 text-[11px] text-white/55">of {catalogGifts.length}</p></div>
              <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-4"><p className="text-[10px] uppercase tracking-[0.18em] text-white/45">Live rules</p><p className="mt-2 text-2xl font-semibold">{liveRules}</p><p className="mt-1 text-[11px] text-white/55">guarded triggers</p></div>
              <div className="rounded-2xl border border-[#e8bd6b]/30 bg-[#e8bd6b]/12 px-3 py-4"><p className="text-[10px] uppercase tracking-[0.18em] text-[#e8bd6b]/75">Needs review</p><p className="mt-2 text-2xl font-semibold text-[#ffe4a9]">{pendingClaims}</p><p className="mt-1 text-[11px] text-[#ffe4a9]/70">pending claims</p></div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3" aria-label="Gift operations snapshot">
          <div className="rounded-2xl border border-black/10 bg-white px-5 py-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Design</p><GiftIcon aria-hidden="true" size={18} className="text-[#a36d16]" /></div><p className="mt-3 text-sm font-semibold text-[#111]">{catalogGifts.length} catalog rewards</p><p className="mt-1 text-xs leading-5 text-neutral-500">Bilingual copy, value, vendor, and redemption details.</p></div>
          <div className="rounded-2xl border border-black/10 bg-white px-5 py-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Eligibility</p><Activity aria-hidden="true" size={18} className="text-[#a36d16]" /></div><p className="mt-3 text-sm font-semibold text-[#111]">{liveRules} active triggers</p><p className="mt-1 text-xs leading-5 text-neutral-500">Dry-run the audience before it changes eligibility.</p></div>
          <div className="rounded-2xl border border-black/10 bg-white px-5 py-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Fulfilment</p><ShieldCheck aria-hidden="true" size={18} className="text-[#a36d16]" /></div><p className="mt-3 text-sm font-semibold text-[#111]">{pendingClaims} claims need review</p><p className="mt-1 text-xs leading-5 text-neutral-500">Named identity, evidence, contact, and SLA in one queue.</p></div>
        </section>

        <GiftRuleBuilder gifts={catalogGifts} rules={ruleSummaries} agentDirectory={agentDirectory} savedAudiences={savedAudiences} />
        <GiftCreateForm tiers={tierRows} />

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-black/10 bg-white shadow-[0_16px_44px_rgba(0,0,0,0.05)]" aria-labelledby="gift-catalog-title">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/5 px-5 py-5 sm:px-7"><div><p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Catalog</p><h3 id="gift-catalog-title" className="mt-2 text-xl font-semibold text-[#111]">Your reward shelf</h3></div><span className="rounded-full border border-black/10 bg-[#faf9f6] px-3 py-1.5 text-xs text-neutral-600">{catalogGifts.length} total</span></div>
            <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-7">{catalogGifts.slice(0, 8).map((gift) => <article key={gift.id} className="rounded-2xl border border-black/10 bg-[#faf9f6] p-3"><div className="flex items-start gap-3">{gift.iconUrl ? <img src={gift.iconUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" /> : <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white text-neutral-600"><GiftIcon aria-hidden="true" size={18} /></div>}<div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><h4 className="truncate text-sm font-semibold text-[#111]">{gift.title}</h4><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${stateTone(gift.status)}`}>{gift.status}</span></div><p className="mt-1 line-clamp-2 text-xs leading-5 text-neutral-500">{gift.description || "No description yet."}</p></div></div><div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-neutral-500">{gift.type ? <span className="rounded-full bg-white px-2 py-1 capitalize">{gift.type}</span> : null}{gift.value ? <span className="rounded-full bg-white px-2 py-1">{gift.value}</span> : null}{gift.stock !== null && gift.stock !== undefined ? <span className="rounded-full bg-white px-2 py-1">{gift.stock} stock</span> : <span className="rounded-full bg-white px-2 py-1">Unlimited stock</span>}{gift.vendor ? <span className="rounded-full bg-white px-2 py-1">{gift.vendor}</span> : null}</div><p className="mt-3 text-[11px] text-neutral-400">v{gift.version ?? 1} · Added {formatDate(gift.createdAt)}{gift.fulfillmentOwner ? ` · ${gift.fulfillmentOwner} fulfils` : ""}</p><div className="mt-2 flex items-start justify-between gap-3"><GrowthApprovalControls entityType="gift" entityId={gift.id} status={gift.approvalStatus ?? "not_required"} canApprove={ui.roles.includes("super_admin")} /><GrowthVersionHistory entityType="gift" entityId={gift.id} currentVersion={gift.version ?? 1} /></div></article>)}{!catalogGifts.length ? <p className="col-span-full rounded-2xl border border-dashed border-black/15 px-4 py-8 text-center text-sm text-neutral-500">No rewards yet. Add the first promise above.</p> : null}</div>
          </section>

          <section className="rounded-3xl border border-black/10 bg-white shadow-[0_16px_44px_rgba(0,0,0,0.05)]" aria-labelledby="gift-history-title">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/5 px-5 py-5 sm:px-7"><div><p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Activity</p><h3 id="gift-history-title" className="mt-2 text-xl font-semibold text-[#111]">Rule and claim history</h3></div><Link href="/gifts/claims" className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-600 hover:text-black">Open queue <ArrowUpRight aria-hidden="true" size={14} /></Link></div>
            <div className="space-y-5 p-5 sm:p-7"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Recent claims</p><div className="mt-3 space-y-2">{recentClaims.slice(0, 5).map((claim) => <div key={claim.id} className="flex items-center gap-3 rounded-2xl border border-black/10 bg-[#faf9f6] px-3 py-3"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#111] text-xs font-semibold text-white">{claim.agentName.slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#111]">{claim.agentName}</p><p className="truncate text-xs text-neutral-500">{claim.giftTitle} · {formatDate(claim.claimedAt)}</p></div><span className="rounded-full border border-black/10 bg-white px-2 py-1 text-[10px] font-semibold capitalize text-neutral-600">{claim.status}</span></div>)}{!recentClaims.length ? <p className="text-sm text-neutral-500">No claims yet.</p> : null}</div></div><div className="border-t border-black/5 pt-5"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Rule history</p><div className="mt-3 space-y-2">{ruleSummaries.slice(0, 5).map((rule) => <div key={rule.id} className="rounded-2xl border border-black/10 bg-[#faf9f6] px-3 py-3"><p className="text-sm font-semibold text-[#111]">{formatRule(rule, giftTitleById.get(rule.giftId ?? "") ?? "Reward")}</p><p className="mt-1 text-xs text-neutral-500">{rule.isActive === false ? "Inactive" : "Active"} · added {formatDate(rule.createdAt)}</p></div>)}{!ruleSummaries.length ? <p className="text-sm text-neutral-500">No rules yet.</p> : null}</div></div></div>
          </section>
        </section>
      </>}
    </AdminLayout>
  );
}
