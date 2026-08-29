import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { AdminLayout } from "@/components/AdminLayout";
import { BadgeCatalogForm } from "@/components/BadgeCatalogForm";
import { GrowthApprovalControls } from "@/components/GrowthApprovalControls";
import { GrowthVersionHistory } from "@/components/GrowthVersionHistory";
import { RewardBadgeCatalog } from "@/components/RewardBadgeCatalog";
import type { RewardAudienceOption } from "@/components/RewardAudienceBuilder";
import { RewardTierLadder } from "@/components/RewardTierLadder";
import { RewardsRuleBuilder, type RewardAgentOption, type RewardRuleOption } from "@/components/RewardsRuleBuilder";
import { TierCatalogForm } from "@/components/TierCatalogForm";
import { buildAdminUi } from "@/lib/adminUi";
import { supabaseServer } from "@/lib/supabaseServer";
import { ArrowUp, BadgeCheck, Layers3, Sparkles } from "lucide-react";

type TierRow = {
  id: string;
  name: string;
  name_ar?: string | null;
  level: number | null;
  icon_url: string | null;
  description: string | null;
  benefit_type: string | null;
  benefit_value: number | null;
  benefit_description: string | null;
  is_active: boolean | null;
  approval_status?: string | null;
  version?: number | null;
};

type BadgeRow = {
  id: string;
  name: string;
  name_ar: string | null;
  icon_url: string | null;
  description: string | null;
  badge_type: string | null;
  expires_in_days: number | null;
  benefit_type?: string | null;
  benefit_value?: number | null;
  benefit_description?: string | null;
  is_active: boolean | null;
  approval_status?: string | null;
  version?: number | null;
};

type BadgeAssignmentRow = {
  agent_id: string;
  badge_id: string;
  unlocked_at: string | null;
  expires_at: string | null;
  badges: { name: string | null; name_ar?: string | null }[] | null;
  users_profile: { display_name: string | null; phone?: string | null }[] | null;
};

type TierAssignmentRow = {
  user_id: string;
  tier_id: string;
  awarded_at: string | null;
  tiers: { name: string | null; level?: number | null }[] | null;
  users_profile: { display_name: string | null; phone?: string | null }[] | null;
};

type PreviewAgentRow = {
  id: string;
  display_name: string | null;
  first_name_en: string | null;
  last_name_en: string | null;
  first_name_ar: string | null;
  last_name_ar: string | null;
  verification_status: string | null;
};

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const displayName = (profile?: { display_name: string | null }[] | null, fallback = "Agent") =>
  profile?.[0]?.display_name || fallback;

const statusLabel = (rule: RewardRuleOption) => {
  const status = rule.lifecycle_state ?? rule.lifecycle_status ?? rule.status;
  if (status) return status.charAt(0).toUpperCase() + status.slice(1);
  return rule.is_active === false ? "Paused" : "Active";
};

const statusClasses = (status: string) => {
  if (status === "Active") return "border-[#c9d795] bg-[#f1f5d9] text-[#4c5d11]";
  if (status === "Scheduled") return "border-[#c8c2e9] bg-[#f2f1fb] text-[#4d477f]";
  if (status === "Paused") return "border-[#f2c2aa] bg-[#fff3ec] text-[#8d482c]";
  return "border-black/10 bg-neutral-100 text-neutral-500";
};

export default async function RewardsPage() {
  const ui = await buildAdminUi(["marketing_admin"]);
  const [{ data: tiers }, { data: badges }, { data: rules }, { data: badgeAssignments }, { data: tierAssignments }, { data: previewAgents }, { data: audiences }] = await Promise.all([
    supabaseServer
      .from("tiers")
      .select("id, name, level, icon_url, description, benefit_type, benefit_value, benefit_description, is_active, approval_status, version")
      .order("level", { ascending: true }),
    supabaseServer
      .from("badges")
      .select("id, name, name_ar, icon_url, description, badge_type, expires_in_days, benefit_type, benefit_value, benefit_description, is_active, approval_status, version")
      .order("display_order", { ascending: true }),
    supabaseServer
      .from("admin_rules")
      .select("id, target_type, target_id, metric, time_window, operator, value_min, value_max, value_single, is_active, lifecycle_state, start_at, end_at, approval_status, version, created_at")
      .order("created_at", { ascending: false }),
    supabaseServer
      .from("agent_badges")
      .select("agent_id, badge_id, unlocked_at, expires_at, badges(name, name_ar), users_profile(display_name, phone)")
      .order("unlocked_at", { ascending: false })
      .limit(20),
    supabaseServer
      .from("user_tiers")
      .select("user_id, tier_id, awarded_at, tiers(name, level), users_profile(display_name, phone)")
      .order("awarded_at", { ascending: false })
      .limit(20),
    supabaseServer
      .from("users_profile")
      .select("id, display_name, first_name_en, last_name_en, first_name_ar, last_name_ar, verification_status")
      .order("created_at", { ascending: false })
      .limit(60),
    supabaseServer
      .from("growth_audiences")
      .select("id, name, description, metadata")
      .eq("lifecycle_state", "active")
      .order("name", { ascending: true }),
  ]);

  const tierRows = (tiers ?? []) as TierRow[];
  const badgeRows = (badges ?? []) as BadgeRow[];
  const ruleRows = (rules ?? []) as RewardRuleOption[];
  const badgeRowsActivity = (badgeAssignments ?? []) as BadgeAssignmentRow[];
  const tierRowsActivity = (tierAssignments ?? []) as TierAssignmentRow[];
  const previewAgentRows = (previewAgents ?? []) as PreviewAgentRow[];
  const rewardAudiences: RewardAudienceOption[] = (audiences ?? []).map((audience) => ({
    id: audience.id,
    name: audience.name,
    description: audience.description,
    estimatedCount: typeof audience.metadata?.estimated_count === "number" ? audience.metadata.estimated_count : null,
  }));
  const previewAgentOptions: RewardAgentOption[] = previewAgentRows.map((agent) => ({
    id: agent.id,
    displayName: agent.display_name || [agent.first_name_en, agent.last_name_en].filter(Boolean).join(" ") || null,
    nameAr: [agent.first_name_ar, agent.last_name_ar].filter(Boolean).join(" ") || null,
    verificationStatus: agent.verification_status,
  }));

  const tierLookup = new Map(tierRows.map((tier) => [tier.id, tier]));
  const badgeLookup = new Map(badgeRows.map((badge) => [badge.id, badge]));
  const activeRuleCount = ruleRows.filter((rule) => rule.is_active !== false && statusLabel(rule) !== "Archived").length;

  return (
    <AdminLayout
      title="Tiers & Badges"
      description="Turn agent progress into visible momentum with safe, understandable rewards."
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <>
          <section className="relative overflow-hidden rounded-[1.7rem] border border-black/10 bg-[#11120f] px-5 py-6 text-white shadow-[0_20px_50px_rgba(5,5,5,0.12)] sm:px-8 sm:py-8" aria-labelledby="rewards-hero-title">
            <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full border-[38px] border-[#dff579]/10" aria-hidden="true" />
            <div className="pointer-events-none absolute bottom-[-5rem] right-[22%] h-40 w-40 rotate-12 border border-[#dff579]/20" aria-hidden="true" />
            <div className="relative flex flex-wrap items-start justify-between gap-6">
              <div className="max-w-3xl">
                <div className="flex items-center gap-2 text-[#dff579]"><Sparkles aria-hidden="true" size={16} /><p className="text-[10px] font-semibold uppercase tracking-[0.3em]">Growth studio / reward design</p></div>
                <h2 id="rewards-hero-title" className="mt-3 max-w-2xl text-3xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-5xl">Make good work impossible to miss.</h2>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-white/65 sm:text-base">Build a tier journey or a badge moment in plain language. Preview the people affected, check the mobile experience, and choose exactly when it should run.</p>
              </div>
              <form action="/api/admin/rewards/apply" method="post" className="relative shrink-0">
                <button className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#dff579] px-5 py-2.5 text-sm font-semibold text-[#11120f] shadow-[0_8px_20px_rgba(223,245,121,0.2)] transition-transform hover:-translate-y-0.5" title="Re-evaluate currently active reward rules">
                  <span className="h-2 w-2 rounded-full bg-[#4c5d11]" aria-hidden="true" />
                  Run active rules
                </button>
                <p className="mt-2 text-right text-[10px] text-white/40">Re-checks active rules only</p>
              </form>
            </div>
            <div className="relative mt-8 grid gap-2 sm:grid-cols-4">
              <HeroStat label="Tier levels" value={tierRows.length} detail="ordered in the ladder" />
              <HeroStat label="Badges" value={badgeRows.length} detail="moments to celebrate" />
              <HeroStat label="Active rules" value={activeRuleCount} detail="currently evaluating" />
              <HeroStat label="Recent awards" value={badgeRowsActivity.length + tierRowsActivity.length} detail="last 20 of each feed" />
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.34fr)]" aria-labelledby="studio-guide-title">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#66722f]">One guided workflow</p>
              <h2 id="studio-guide-title" className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#111]">From idea to impact preview</h2>
            </div>
            <div className="rounded-2xl border border-black/10 bg-[#f7f7f2] px-4 py-3 text-xs leading-5 text-neutral-600">A draft never awards anything. Use the final step to see named recipients, overlap warnings, and the bilingual mobile state before activation.</div>
          </section>

          <RewardsRuleBuilder tiers={tierRows} badges={badgeRows} agents={previewAgentOptions} rules={ruleRows} audiences={rewardAudiences} />

          <section className="grid gap-5 xl:grid-cols-2" aria-label="Reward catalog setup">
            <details open className="rounded-[1.6rem] border border-black/10 bg-white p-5 shadow-[0_16px_40px_rgba(5,5,5,0.05)] sm:p-6">
              <summary className="cursor-pointer list-none"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#66722f]">Catalog / tiers</p><h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#111]">Add a level to the ladder</h2><p className="mt-1 text-sm text-neutral-500">Give agents a clear next step and a benefit they can understand.</p></div><span className="rounded-full border border-black/10 bg-[#f7f7f2] px-3 py-1.5 text-[11px] font-semibold text-neutral-600">Level {tierRows.length + 1} suggested</span></div></summary>
              <div className="mt-5"><TierCatalogForm existingLevels={tierRows.map((tier) => tier.level).filter((level): level is number => level !== null)} /></div>
            </details>
            <details open className="rounded-[1.6rem] border border-black/10 bg-white p-5 shadow-[0_16px_40px_rgba(5,5,5,0.05)] sm:p-6">
              <summary className="cursor-pointer list-none"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#4d477f]">Catalog / badges</p><h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#111]">Create a recognition moment</h2><p className="mt-1 text-sm text-neutral-500">Explain the story, visibility, expiry, and what happens next.</p></div><span className="rounded-full border border-[#c8c2e9] bg-[#f2f1fb] px-3 py-1.5 text-[11px] font-semibold text-[#4d477f]">Bilingual ready</span></div></summary>
              <div className="mt-5"><BadgeCatalogForm /></div>
            </details>
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]" aria-label="Reward libraries and activity">
            <RewardTierLadder tiers={tierRows} recentMovements={tierRowsActivity.slice(0, 4).map((row) => ({ name: displayName(row.users_profile), to: row.tiers?.[0]?.name }))} canApprove={ui.roles.includes("super_admin")} />
            <RewardBadgeCatalog badges={badgeRows} canApprove={ui.roles.includes("super_admin")} />
          </section>

          <section className="grid gap-5 xl:grid-cols-2" aria-label="Reward activity and saved rules">
            <section className="rounded-[1.6rem] border border-black/10 bg-white p-5 shadow-[0_16px_40px_rgba(5,5,5,0.05)] sm:p-6" aria-labelledby="reward-rules-title">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#66722f]">Guardrails</p><h2 id="reward-rules-title" className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#111]">Saved qualification rules</h2><p className="mt-1 text-sm text-neutral-500">See what is live, waiting, paused, or kept for history.</p></div><span className="rounded-full border border-black/10 bg-[#f7f7f2] px-3 py-1.5 text-[11px] font-semibold text-neutral-600">{ruleRows.length} total</span></div>
              <div className="mt-5 space-y-2.5">{ruleRows.slice(0, 8).map((rule) => { const target = rule.target_type === "tier" ? tierLookup.get(rule.target_id || "") : badgeLookup.get(rule.target_id || ""); const status = statusLabel(rule); const value = rule.operator === "between" ? `${rule.value_min ?? "—"}–${rule.value_max ?? "—"}` : `${rule.value_single ?? "—"}`; return <article key={rule.id} className="flex items-start gap-3 rounded-2xl border border-black/10 bg-[#fafaf8] px-3.5 py-3"><div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${rule.target_type === "tier" ? "bg-[#f1f5d9] text-[#4c5d11]" : "bg-[#f2f1fb] text-[#4d477f]"}`}>{rule.target_type === "tier" ? <Layers3 aria-hidden="true" size={15} /> : <BadgeCheck aria-hidden="true" size={15} />}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-[#111]">{target ? `${rule.target_type === "tier" && "level" in target && target.level ? `Level ${target.level} · ` : ""}${target.name}` : "Reward rule"}</p><p className="mt-1 truncate text-[11px] text-neutral-500">{rule.metric?.replaceAll("_", " ")} · {rule.operator} {value} · {rule.time_window?.replaceAll("_", " ")}</p><GrowthApprovalControls entityType="admin_rule" entityId={rule.id} status={rule.approval_status ?? "not_required"} canApprove={ui.roles.includes("super_admin")} /></div><div className="flex shrink-0 flex-col items-end gap-2"><span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClasses(status)}`}>{status}</span><GrowthVersionHistory entityType="admin_rule" entityId={rule.id} currentVersion={rule.version ?? 1} /></div></article>; })}{!ruleRows.length ? <EmptyMessage title="No rules yet" body="Use the guided builder above to attach a goal to a tier or badge." /> : null}</div>
            </section>
            <section className="rounded-[1.6rem] border border-black/10 bg-white p-5 shadow-[0_16px_40px_rgba(5,5,5,0.05)] sm:p-6" aria-labelledby="reward-activity-title">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#4d477f]">Signals</p><h2 id="reward-activity-title" className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#111]">Recent reward moments</h2><p className="mt-1 text-sm text-neutral-500">Named activity keeps the programme human and reviewable.</p></div><span className="rounded-full border border-[#c8c2e9] bg-[#f2f1fb] px-3 py-1.5 text-[11px] font-semibold text-[#4d477f]">Live feed</span></div>
              <div className="mt-5 space-y-2.5">{[...badgeRowsActivity.map((row) => ({ key: `badge-${row.agent_id}-${row.badge_id}-${row.unlocked_at}`, name: displayName(row.users_profile), reward: row.badges?.[0]?.name || "Badge", detail: row.badges?.[0]?.name_ar, date: row.unlocked_at, tone: "badge" })), ...tierRowsActivity.map((row) => ({ key: `tier-${row.user_id}-${row.tier_id}-${row.awarded_at}`, name: displayName(row.users_profile), reward: row.tiers?.[0]?.name || "Tier", detail: row.tiers?.[0]?.level ? `Level ${row.tiers[0].level}` : null, date: row.awarded_at, tone: "tier" }))].slice(0, 10).map((item) => <div key={item.key} className="flex items-center gap-3 rounded-2xl border border-black/10 bg-[#fafaf8] px-3.5 py-3"><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${item.tone === "tier" ? "bg-[#f1f5d9] text-[#4c5d11]" : "bg-[#f2f1fb] text-[#4d477f]"}`}>{item.tone === "tier" ? <ArrowUp aria-hidden="true" size={15} /> : <BadgeCheck aria-hidden="true" size={15} />}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-[#111]">{item.name}</p><p className="truncate text-[11px] text-neutral-500">{item.reward}{item.detail ? ` · ${item.detail}` : ""}</p></div><time className="shrink-0 text-[10px] text-neutral-400" dateTime={item.date || undefined}>{formatDate(item.date)}</time></div>)}{!badgeRowsActivity.length && !tierRowsActivity.length ? <EmptyMessage title="No activity yet" body="The feed will show an agent name and the reward moment after the first qualification." /> : null}</div>
            </section>
          </section>
        </>
      )}
    </AdminLayout>
  );
}

function HeroStat({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/5 px-3.5 py-3"><p className="text-[10px] uppercase tracking-[0.16em] text-white/45">{label}</p><p className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#dff579]">{value}</p><p className="mt-0.5 text-[10px] text-white/45">{detail}</p></div>;
}

function EmptyMessage({ title, body }: { title: string; body: string }) {
  return <div className="rounded-2xl border border-dashed border-black/15 bg-neutral-50 px-4 py-7 text-center"><p className="text-sm font-semibold text-[#111]">{title}</p><p className="mt-1 text-xs leading-4 text-neutral-500">{body}</p></div>;
}
