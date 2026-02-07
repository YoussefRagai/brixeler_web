import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { agentRows } from "@/data/mock";
import { buildAdminUi } from "@/lib/adminUi";
import { supabaseServer } from "@/lib/supabaseServer";
import { AgentTable, type AgentRow } from "@/components/AgentTable";

type ReferralRule = {
  tier_name: string;
  min_referrals: number;
  max_referrals: number | null;
  bonus_percentage: number;
  behavior_requirement: "none" | "verified" | "first_deal";
};

function resolveTier(
  rules: ReferralRule[],
  metrics: { total_referrals: number; verified_referrals: number; referrals_with_first_deal: number },
) {
  if (!rules.length) return "—";
  const sorted = [...rules].sort((a, b) => b.min_referrals - a.min_referrals);
  for (const rule of sorted) {
    const value =
      rule.behavior_requirement === "verified"
        ? metrics.verified_referrals
        : rule.behavior_requirement === "first_deal"
        ? metrics.referrals_with_first_deal
        : metrics.total_referrals;
    const withinMax = rule.max_referrals == null || value <= rule.max_referrals;
    if (value >= rule.min_referrals && withinMax) {
      return rule.tier_name;
    }
  }
  return "Tier 0";
}

async function loadAgents(): Promise<AgentRow[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return agentRows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      deals: row.deals,
      earnings: row.earnings,
      status: row.status,
      tier: "Tier 1",
      badges: ["Starter"],
      profile_picture_url: null,
      language_preference: "en",
    }));
  }

  const [{ data: profiles }, { data: rules }, { data: badgeRows }] = await Promise.all([
    supabaseServer
      .from("users_profile")
      .select(
        "id, display_name, phone, total_deals, total_earnings, account_status, total_referrals, verified_referrals, referrals_with_first_deal, profile_picture_url, language_preference",
      )
      .order("account_created_at", { ascending: false })
      .limit(200),
    supabaseServer
      .from("referral_bonus_rules")
      .select("tier_name, min_referrals, max_referrals, bonus_percentage, behavior_requirement")
      .eq("is_active", true),
    supabaseServer
      .from("agent_badges")
      .select("agent_id, badges(name)")
      .order("unlocked_at", { ascending: false }),
  ]);

  const badgeMap = new Map<string, string[]>();
  (badgeRows ?? []).forEach((row: any) => {
    const name = row.badges?.name;
    if (!name) return;
    const list = badgeMap.get(row.agent_id) ?? [];
    if (!list.includes(name)) list.push(name);
    badgeMap.set(row.agent_id, list);
  });

  return (profiles ?? []).map((profile: any) => {
    const tier = resolveTier((rules ?? []) as ReferralRule[], {
      total_referrals: profile.total_referrals ?? 0,
      verified_referrals: profile.verified_referrals ?? 0,
      referrals_with_first_deal: profile.referrals_with_first_deal ?? 0,
    });
    return {
      id: profile.id,
      name: profile.display_name ?? "Agent",
      phone: profile.phone ?? "—",
      deals: profile.total_deals ?? 0,
      earnings: profile.total_earnings ? `${profile.total_earnings}` : "—",
      status: profile.account_status ?? "active",
      tier,
      badges: badgeMap.get(profile.id) ?? [],
      profile_picture_url: profile.profile_picture_url ?? null,
      language_preference: profile.language_preference ?? null,
    };
  });
}

export default async function AgentsPage() {
  const ui = await buildAdminUi(["user_auth_admin"]);
  const agents = await loadAgents();
  return (
    <AdminLayout
      title="Agents"
      description="Manage verification, commission tiers, referrals, and account health."
      actions={
        <button className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900">
          Add admin note
        </button>
      }
      navItems={ui.navItems}
      meta={ui.meta}
    >
  {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <section className="rounded-3xl border border-white/5 bg-white/5 p-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
              Roster
            </p>
            <p className="text-lg text-slate-300">Agent directory</p>
          </div>
          <div className="flex gap-3 text-sm">
            <button className="rounded-full border border-white/10 px-4 py-2 text-white/80 hover:bg-white/10">
              Export CSV
            </button>
            <button className="rounded-full border border-emerald-400 px-4 py-2 text-emerald-200">
              Filter: Verified
            </button>
          </div>
        </header>
        <AgentTable agents={agents} />
        </section>
      )}
    </AdminLayout>
  );
}
