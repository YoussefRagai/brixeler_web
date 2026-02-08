import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
import { supabaseServer } from "@/lib/supabaseServer";
import { RewardsRuleBuilder } from "@/components/RewardsRuleBuilder";

type TierRow = {
  id: string;
  name: string;
  level: number | null;
  icon_url: string | null;
  description: string | null;
  is_active: boolean | null;
};

type BadgeRow = {
  id: string;
  name: string;
  name_ar: string | null;
  icon_url: string | null;
  description: string | null;
  badge_type: string | null;
  expires_in_days: number | null;
  is_active: boolean | null;
};

type RuleRow = {
  id: string;
  target_type: string | null;
  target_id: string | null;
  metric: string | null;
  time_window: string | null;
  operator: string | null;
  value_min: number | null;
  value_max: number | null;
  value_single: number | null;
  is_active: boolean | null;
  created_at: string | null;
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

export default async function RewardsPage() {
  const ui = await buildAdminUi(["marketing_admin"]);
  const { data: tiers } = await supabaseServer
    .from("tiers")
    .select("id, name, level, icon_url, description, is_active")
    .order("level", { ascending: true });
  const { data: badges } = await supabaseServer
    .from("badges")
    .select("id, name, name_ar, icon_url, description, badge_type, expires_in_days, is_active")
    .order("display_order", { ascending: true });
  const { data: rules } = await supabaseServer
    .from("admin_rules")
    .select(
      "id, target_type, target_id, metric, time_window, operator, value_min, value_max, value_single, is_active, created_at",
    )
    .order("created_at", { ascending: false });
  const { data: badgeAssignments } = await supabaseServer
    .from("agent_badges")
    .select("agent_id, badge_id, unlocked_at, expires_at, badges(name, name_ar), users_profile(display_name, phone)")
    .order("unlocked_at", { ascending: false })
    .limit(20);
  const { data: tierAssignments } = await supabaseServer
    .from("user_tiers")
    .select("user_id, tier_id, awarded_at, tiers(name, level), users_profile(display_name, phone)")
    .order("awarded_at", { ascending: false })
    .limit(20);
  const badgeRows = (badgeAssignments ?? []) as BadgeAssignmentRow[];
  const tierRows = (tierAssignments ?? []) as TierAssignmentRow[];

  return (
    <AdminLayout
      title="Tiers & Badges"
      description="Create incentives, assign tiers, and configure instant qualification rules."
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <>
          <section className="rounded-3xl border border-black/5 bg-gradient-to-br from-white via-white to-black/5 px-8 py-7 shadow-xl shadow-black/5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-neutral-400">Rewards studio</p>
                <h2 className="text-3xl font-semibold text-[#050505]">Tiers & badges control room</h2>
                <p className="mt-2 text-sm text-neutral-500">
                  Build tiers, craft badges, then push rules when you are ready. Keep the activity feed lightweight.
                </p>
              </div>
              <form action="/api/admin/rewards/apply" method="post">
                <button className="rounded-full bg-black px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-black/15 hover:bg-black/90">
                  Apply rules now
                </button>
              </form>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <div className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs text-neutral-500">
                {tiers?.length ?? 0} tiers
              </div>
              <div className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs text-neutral-500">
                {badges?.length ?? 0} badges
              </div>
              <div className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs text-neutral-500">
                {rules?.length ?? 0} active rules
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-4">
              <div className="rounded-3xl border border-black/5 bg-white px-6 py-4 shadow-xl shadow-black/5">
                <h3 className="text-lg font-semibold text-[#050505]">Build rules</h3>
                <p className="text-sm text-neutral-500">Preview who qualifies before you activate.</p>
              </div>
              <RewardsRuleBuilder tiers={(tiers ?? []) as TierRow[]} badges={(badges ?? []) as BadgeRow[]} />
            </div>

            <div className="space-y-6">
              <details open className="rounded-3xl border border-black/5 bg-white px-6 py-6 shadow-xl shadow-black/5">
                <summary className="cursor-pointer text-lg font-semibold text-[#050505]">Create tier</summary>
                <p className="mt-2 text-sm text-neutral-500">Higher levels override lower ones. Promotion only.</p>
                <form
                  action="/api/admin/rewards/tiers"
                  method="post"
                  encType="multipart/form-data"
                  className="mt-6 space-y-4 text-sm text-neutral-600"
                >
                  <div>
                    <label className="text-xs text-neutral-500">Tier name</label>
                    <input
                      name="name"
                      required
                      className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#050505]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-500">Level</label>
                    <input
                      name="level"
                      type="number"
                      min="1"
                      required
                      className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#050505]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-500">Description</label>
                    <textarea
                      name="description"
                      rows={3}
                      className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#050505]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-500">Icon</label>
                    <input name="icon" type="file" accept="image/*" required className="mt-2 w-full text-sm" />
                  </div>
                  <button className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-black/10 hover:bg-black/90">
                    Save tier
                  </button>
                </form>
              </details>

              <details className="rounded-3xl border border-black/5 bg-white px-6 py-6 shadow-xl shadow-black/5">
                <summary className="cursor-pointer text-lg font-semibold text-[#050505]">Create badge</summary>
                <p className="mt-2 text-sm text-neutral-500">Badges can be permanent or expiring.</p>
                <form
                  action="/api/admin/rewards/badges"
                  method="post"
                  encType="multipart/form-data"
                  className="mt-6 space-y-4 text-sm text-neutral-600"
                >
                  <div>
                    <label className="text-xs text-neutral-500">Badge name</label>
                    <input
                      name="name"
                      required
                      className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#050505]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-500">Badge name (Arabic)</label>
                    <input
                      name="name_ar"
                      className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#050505]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-500">Badge type</label>
                    <select
                      name="badge_type"
                      className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#050505]"
                    >
                      <option value="special">Special</option>
                      <option value="deal_milestone">Deal milestone</option>
                      <option value="earnings">Earnings</option>
                      <option value="referrals">Referrals</option>
                      <option value="speed">Speed</option>
                      <option value="contributions">Contributions</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-neutral-500">Expires in days (optional)</label>
                    <input
                      name="expires_in_days"
                      type="number"
                      min="1"
                      className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#050505]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-500">Description</label>
                    <textarea
                      name="description"
                      rows={3}
                      className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#050505]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-500">Icon</label>
                    <input name="icon" type="file" accept="image/*" required className="mt-2 w-full text-sm" />
                  </div>
                  <button className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-black/10 hover:bg-black/90">
                    Save badge
                  </button>
                </form>
              </details>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <details open className="rounded-3xl border border-black/5 bg-white px-6 py-6 shadow-xl shadow-black/5">
              <summary className="cursor-pointer text-lg font-semibold text-[#050505]">Catalog</summary>
              <div className="mt-6 space-y-6 text-sm text-neutral-600">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">Active tiers</p>
                  <div className="mt-3 space-y-3">
                    {(tiers ?? []).map((tier) => (
                      <div key={tier.id} className="flex items-center gap-3 rounded-2xl border border-black/5 bg-black/5 px-4 py-3">
                        {tier.icon_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={tier.icon_url} alt={tier.name} className="h-10 w-10 rounded-full object-cover" />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-neutral-200" />
                        )}
                        <div className="flex-1">
                          <p className="font-semibold text-[#050505]">
                            Level {tier.level ?? "—"} · {tier.name}
                          </p>
                          <p className="text-xs text-neutral-500">{tier.description ?? "No description"}</p>
                        </div>
                        <span className="rounded-full border border-black/10 px-3 py-1 text-xs">
                          {tier.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                    ))}
                    {!tiers?.length && <p className="text-sm text-neutral-400">No tiers created yet.</p>}
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">Badges</p>
                  <div className="mt-3 space-y-3">
                    {(badges ?? []).map((badge) => (
                      <div key={badge.id} className="flex items-center gap-3 rounded-2xl border border-black/5 bg-black/5 px-4 py-3">
                        {badge.icon_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={badge.icon_url} alt={badge.name} className="h-10 w-10 rounded-full object-cover" />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-neutral-200" />
                        )}
                        <div className="flex-1">
                          <p className="font-semibold text-[#050505]">
                            {badge.name}
                            {badge.name_ar ? (
                              <span className="ml-2 text-xs font-normal text-neutral-500">· {badge.name_ar}</span>
                            ) : null}
                          </p>
                          <p className="text-xs text-neutral-500">{badge.description ?? "No description"}</p>
                        </div>
                        <span className="rounded-full border border-black/10 px-3 py-1 text-xs">
                          {badge.expires_in_days ? `${badge.expires_in_days}d` : "Permanent"}
                        </span>
                      </div>
                    ))}
                    {!badges?.length && <p className="text-sm text-neutral-400">No badges created yet.</p>}
                  </div>
                </div>
              </div>
            </details>

            <details className="rounded-3xl border border-black/5 bg-white px-6 py-6 shadow-xl shadow-black/5">
              <summary className="cursor-pointer text-lg font-semibold text-[#050505]">Active rules</summary>
              <div className="mt-4 space-y-3 text-sm text-neutral-600">
                {(rules ?? []).map((rule) => (
                  <div key={rule.id} className="flex items-center justify-between gap-4 rounded-2xl border border-black/5 bg-black/5 px-4 py-3">
                    <div>
                      <p className="font-semibold text-[#050505]">
                        {rule.target_type} · {rule.metric} · {rule.operator}{" "}
                        {rule.operator === "between" ? `${rule.value_min}–${rule.value_max}` : rule.value_single}
                      </p>
                      <p className="text-xs text-neutral-500">Window: {rule.time_window ?? "all_time"}</p>
                    </div>
                    <span className="rounded-full border border-black/10 px-3 py-1 text-xs">
                      {rule.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                ))}
                {!rules?.length && <p className="text-sm text-neutral-400">No rules created yet.</p>}
              </div>
            </details>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-black/5 bg-white px-6 py-6 shadow-xl shadow-black/5">
              <h3 className="text-lg font-semibold text-[#050505]">Recent badge assignments</h3>
              <div className="mt-4 space-y-3 text-sm text-neutral-600">
                {badgeRows.map((row) => (
                  <div
                    key={`${row.agent_id}-${row.badge_id}-${row.unlocked_at}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-black/5 bg-black/5 px-4 py-3"
                  >
                    <div>
                      <p className="font-semibold text-[#050505]">
                        {row.users_profile?.[0]?.display_name ?? row.agent_id}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {row.badges?.[0]?.name ?? "Badge"}
                        {row.badges?.[0]?.name_ar ? ` · ${row.badges[0].name_ar}` : ""}
                      </p>
                    </div>
                    <div className="text-xs text-neutral-500">
                      {row.unlocked_at ? new Date(row.unlocked_at).toLocaleDateString() : "—"}
                    </div>
                  </div>
                ))}
                {!badgeAssignments?.length && <p className="text-sm text-neutral-400">No badge activity yet.</p>}
              </div>
            </div>

            <div className="rounded-3xl border border-black/5 bg-white px-6 py-6 shadow-xl shadow-black/5">
              <h3 className="text-lg font-semibold text-[#050505]">Recent tier promotions</h3>
              <div className="mt-4 space-y-3 text-sm text-neutral-600">
                {tierRows.map((row) => (
                  <div
                    key={`${row.user_id}-${row.tier_id}-${row.awarded_at}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-black/5 bg-black/5 px-4 py-3"
                  >
                    <div>
                      <p className="font-semibold text-[#050505]">
                        {row.users_profile?.[0]?.display_name ?? row.user_id}
                      </p>
                      <p className="text-xs text-neutral-500">
                        Tier {row.tiers?.[0]?.level ?? "—"} · {row.tiers?.[0]?.name ?? "—"}
                      </p>
                    </div>
                    <div className="text-xs text-neutral-500">
                      {row.awarded_at ? new Date(row.awarded_at).toLocaleDateString() : "—"}
                    </div>
                  </div>
                ))}
                {!tierAssignments?.length && <p className="text-sm text-neutral-400">No tier activity yet.</p>}
              </div>
            </div>
          </section>
        </>
      )}
    </AdminLayout>
  );
}
