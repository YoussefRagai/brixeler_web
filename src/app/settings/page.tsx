import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
import { requireAdminContext } from "@/lib/adminAuth";
import { logAdminActivity } from "@/lib/adminQueries";
import { supabaseServer } from "@/lib/supabaseServer";
import { revalidatePath } from "next/cache";

type ReferralTier = {
  id: string;
  tier_name: string;
  min_referrals: number;
  max_referrals: number | null;
  bonus_percentage: number;
  requires_verification: boolean;
  requires_first_deal: boolean;
  behavior_requirement: "none" | "verified" | "first_deal";
};

type Badge = {
  id: string;
  name: string;
  badge_type: string;
  unlock_criteria: Record<string, unknown>;
  benefit_type: string;
  benefit_value: number | null;
  is_active: boolean;
  display_order: number | null;
};

async function getSettingsData(): Promise<{ tiers: ReferralTier[]; badges: Badge[] }> {
  const [{ data: tiers }, { data: badges }] = await Promise.all([
    supabaseServer
      .from("referral_bonus_rules")
      .select("id, tier_name, min_referrals, max_referrals, bonus_percentage, requires_verification, requires_first_deal, behavior_requirement")
      .order("min_referrals", { ascending: true }),
    supabaseServer
      .from("badges")
      .select("id, name, badge_type, unlock_criteria, benefit_type, benefit_value, is_active, display_order")
      .order("display_order", { ascending: true }),
  ]);

  return {
    tiers: (tiers ?? []) as ReferralTier[],
    badges: (badges ?? []) as Badge[],
  };
}

async function upsertTier(formData: FormData) {
  "use server";
  const admin = await requireAdminContext();
  const tierId = formData.get("tierId")?.toString() || undefined;
  const tierName = formData.get("tierName")?.toString() ?? "";
  const minReferrals = parseInt(formData.get("minReferrals")?.toString() ?? "0", 10);
  const maxReferralsRaw = formData.get("maxReferrals")?.toString() ?? "";
  const bonusPercentage = parseFloat(formData.get("bonusPercentage")?.toString() ?? "0");
  const behaviorRequirement = (formData.get("behaviorRequirement")?.toString() ??
    "none") as ReferralTier["behavior_requirement"];
  const requiresVerification = behaviorRequirement === "verified";
  const requiresFirstDeal = behaviorRequirement === "first_deal";

  if (!tierName.trim()) return;

  await supabaseServer.from("referral_bonus_rules").upsert({
    id: tierId,
    tier_name: tierName.trim(),
    min_referrals: Number.isNaN(minReferrals) ? 0 : minReferrals,
    max_referrals: maxReferralsRaw.length ? Number(maxReferralsRaw) : null,
    bonus_percentage: Number.isNaN(bonusPercentage) ? 0 : bonusPercentage,
    requires_verification: requiresVerification,
    requires_first_deal: requiresFirstDeal,
    behavior_requirement: behaviorRequirement,
  });
  await logAdminActivity({
    adminId: admin.adminId,
    action: tierId ? "settings.update_tier" : "settings.create_tier",
    resourceType: "referral_bonus_rules",
    resourceId: tierId ?? null,
    metadata: { tier_name: tierName.trim() },
  });

  revalidatePath("/settings");
}

async function deleteTier(formData: FormData) {
  "use server";
  const admin = await requireAdminContext();
  const tierId = formData.get("tierId")?.toString();
  if (!tierId) return;
  await supabaseServer.from("referral_bonus_rules").delete().eq("id", tierId);
  await logAdminActivity({
    adminId: admin.adminId,
    action: "settings.delete_tier",
    resourceType: "referral_bonus_rules",
    resourceId: tierId,
  });
  revalidatePath("/settings");
}

async function upsertBadge(formData: FormData) {
  "use server";
  const admin = await requireAdminContext();
  const badgeId = formData.get("badgeId")?.toString() || undefined;
  const badgeName = formData.get("badgeName")?.toString() ?? "";
  const badgeType = formData.get("badgeType")?.toString() ?? "deal_milestone";
  const criteriaType = formData.get("criteriaType")?.toString() ?? "total_deals";
  const criteriaValue = parseFloat(formData.get("criteriaValue")?.toString() ?? "0");
  const benefitType = formData.get("benefitType")?.toString() ?? "none";
  const benefitValue = parseFloat(formData.get("benefitValue")?.toString() ?? "0");
  const displayOrder = parseInt(formData.get("displayOrder")?.toString() ?? "0", 10);
  const isActive = formData.get("isActive") === "on";

  if (!badgeName.trim()) return;

  await supabaseServer.from("badges").upsert({
    id: badgeId,
    name: badgeName.trim(),
    badge_type: badgeType,
    unlock_criteria: { type: criteriaType, threshold: Number.isNaN(criteriaValue) ? 0 : criteriaValue },
    benefit_type: benefitType,
    benefit_value: Number.isNaN(benefitValue) ? null : benefitValue,
    display_order: Number.isNaN(displayOrder) ? null : displayOrder,
    is_active: isActive,
  });
  await logAdminActivity({
    adminId: admin.adminId,
    action: badgeId ? "settings.update_badge" : "settings.create_badge",
    resourceType: "badges",
    resourceId: badgeId ?? null,
  });

  revalidatePath("/settings");
}

async function deleteBadge(formData: FormData) {
  "use server";
  const admin = await requireAdminContext();
  const badgeId = formData.get("badgeId")?.toString();
  if (!badgeId) return;
  await supabaseServer.from("badges").delete().eq("id", badgeId);
  await logAdminActivity({
    adminId: admin.adminId,
    action: "settings.delete_badge",
    resourceType: "badges",
    resourceId: badgeId,
  });
  revalidatePath("/settings");
}

export default async function SettingsPage() {
  const ui = await buildAdminUi(["super_admin"]);
  const { tiers, badges } = await getSettingsData();

  return (
    <AdminLayout
      title="System settings"
      description="Adjust payout overrides, referral tiers, and gamification rewards."
      actions={
        <button className="rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-emerald-950">
          Auto-save enabled
        </button>
      }
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-3xl border border-white/5 bg-white/5 p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Referral tiers</p>
          <div className="mt-4 space-y-4 text-sm text-slate-200">
            {tiers.map((tier) => (
              <form
                key={tier.id}
                action={upsertTier}
                className="grid gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs uppercase tracking-[0.3em] text-slate-500 md:grid-cols-5"
              >
                <input type="hidden" name="tierId" value={tier.id} />
                <label className="md:col-span-2 flex flex-col gap-2">
                  Name
                  <input
                    name="tierName"
                    defaultValue={tier.tier_name}
                    className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  Min
                  <input
                    name="minReferrals"
                    type="number"
                    defaultValue={tier.min_referrals}
                    className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  Max
                  <input
                    name="maxReferrals"
                    type="number"
                    defaultValue={tier.max_referrals ?? ""}
                    className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  Bonus %
                  <input
                    name="bonusPercentage"
                    type="number"
                    step="0.05"
                    defaultValue={tier.bonus_percentage}
                    className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="md:col-span-2 flex flex-col gap-2">
                  Behavior
                  <select
                    name="behaviorRequirement"
                    defaultValue={tier.behavior_requirement ?? "none"}
                    className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
                  >
                    <option value="none">Total referrals</option>
                    <option value="verified">Verified referrals</option>
                    <option value="first_deal">Referrals with deals</option>
                  </select>
                </label>
                <div className="md:col-span-5 flex gap-2">
                  <button
                    type="submit"
                    className="rounded-full bg-white/90 px-4 py-2 text-[11px] font-semibold text-black"
                  >
                    Save tier
                  </button>
                  <button
                    formAction={deleteTier}
                    className="rounded-full border border-white/20 px-4 py-2 text-[11px] text-white/60 hover:text-white"
                  >
                    Delete
                  </button>
                </div>
              </form>
            ))}
          </div>
          <div className="mt-6 rounded-2xl border border-dashed border-white/10 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Add tier</p>
            <form action={upsertTier} className="mt-4 grid gap-4 md:grid-cols-4">
              <input type="hidden" name="tierId" value="" />
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                Name
                <input
                  name="tierName"
                  placeholder="Tier label"
                  className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
                  required
                />
              </label>
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                Min
                <input
                  name="minReferrals"
                  type="number"
                  placeholder="0"
                  className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                Max
                <input
                  name="maxReferrals"
                  type="number"
                  placeholder="Leave blank"
                  className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                Bonus %
                <input
                  name="bonusPercentage"
                  type="number"
                  step="0.05"
                  placeholder="0.25"
                  className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                Behavior
                <select
                  name="behaviorRequirement"
                  className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
                  defaultValue="none"
                >
                  <option value="none">Total referrals</option>
                  <option value="verified">Verified referrals</option>
                  <option value="first_deal">Referrals with deals</option>
                </select>
              </label>
              <div className="md:col-span-3 flex justify-end">
                <button className="rounded-full bg-emerald-400 px-6 py-2 text-sm font-semibold text-emerald-950">
                  Add tier
                </button>
              </div>
            </form>
          </div>
        </article>

        <article className="rounded-3xl border border-white/5 bg-white/5 p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Badges & gamification</p>
          <div className="mt-4 space-y-4 text-sm text-slate-200">
            {badges.map((badge) => {
              const criteria = badge.unlock_criteria as { type?: string; threshold?: number };
              return (
                <form
                  key={badge.id}
                  action={upsertBadge}
                  className="grid gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs uppercase tracking-[0.3em] text-slate-500 md:grid-cols-6"
                >
                  <input type="hidden" name="badgeId" value={badge.id} />
                  <label className="md:col-span-2 flex flex-col gap-2">
                    Name
                    <input
                      name="badgeName"
                      defaultValue={badge.name}
                      className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    Type
                    <select
                      name="badgeType"
                      defaultValue={badge.badge_type}
                      className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
                    >
                      <option value="deal_milestone">Deals</option>
                      <option value="earnings">Earnings</option>
                      <option value="referrals">Referrals</option>
                      <option value="speed">Speed</option>
                      <option value="contributions">Contributions</option>
                      <option value="special">Special</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-2">
                    Criteria
                    <select
                      name="criteriaType"
                      defaultValue={(criteria?.type as string) ?? "total_deals"}
                      className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
                    >
                      <option value="total_deals">Total deals</option>
                      <option value="total_volume">Total volume</option>
                      <option value="verified_referrals">Verified referrals</option>
                      <option value="avg_review_time">Avg review time</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-2">
                    Threshold
                    <input
                      name="criteriaValue"
                      type="number"
                      step="0.5"
                      defaultValue={criteria?.threshold ?? 0}
                      className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    Display order
                    <input
                      name="displayOrder"
                      type="number"
                      defaultValue={badge.display_order ?? 0}
                      className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    Benefit
                    <select
                      name="benefitType"
                      defaultValue={badge.benefit_type}
                      className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
                    >
                      <option value="none">None</option>
                      <option value="commission_boost">Commission boost</option>
                      <option value="priority_support">Priority support</option>
                      <option value="custom">Custom</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-2">
                    Benefit value
                    <input
                      name="benefitValue"
                      type="number"
                      step="0.05"
                      defaultValue={badge.benefit_value ?? 0}
                      className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-slate-500">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="isActive" defaultChecked={badge.is_active} />
                      Active
                    </label>
                  </div>
                  <div className="md:col-span-6 flex gap-2">
                    <button
                      type="submit"
                      className="rounded-full bg-white/90 px-4 py-2 text-[11px] font-semibold text-black"
                    >
                      Save badge
                    </button>
                    <button
                      formAction={deleteBadge}
                      className="rounded-full border border-white/20 px-4 py-2 text-[11px] text-white/60 hover:text-white"
                    >
                      Delete
                    </button>
                  </div>
                </form>
              );
            })}
          </div>
          <div className="mt-6 rounded-2xl border border-dashed border-white/10 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Add badge</p>
            <form action={upsertBadge} className="mt-4 grid gap-4 md:grid-cols-3">
              <input type="hidden" name="badgeId" value="" />
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                Name
                <input
                  name="badgeName"
                  placeholder="Momentum Maker"
                  className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
                  required
                />
              </label>
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                Type
                <select
                  name="badgeType"
                  className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
                >
                  <option value="deal_milestone">Deals</option>
                  <option value="earnings">Earnings</option>
                  <option value="referrals">Referrals</option>
                  <option value="speed">Speed</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                Criteria type
                <select
                  name="criteriaType"
                  className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
                >
                  <option value="total_deals">Total deals</option>
                  <option value="total_volume">Total volume</option>
                  <option value="verified_referrals">Verified referrals</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                Threshold
                <input
                  name="criteriaValue"
                  type="number"
                  step="0.5"
                  placeholder="5"
                  className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                Benefit type
                <select
                  name="benefitType"
                  className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
                >
                  <option value="none">None</option>
                  <option value="commission_boost">Commission boost</option>
                  <option value="priority_support">Priority support</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                Benefit value
                <input
                  name="benefitValue"
                  type="number"
                  step="0.05"
                  placeholder="0.25"
                  className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                Display order
                <input
                  name="displayOrder"
                  type="number"
                  placeholder="10"
                  className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
                />
              </label>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-slate-500">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="isActive" defaultChecked />
                  Active
                </label>
              </div>
              <div className="md:col-span-3 flex justify-end">
                <button className="rounded-full bg-emerald-400 px-6 py-2 text-sm font-semibold text-emerald-950">
                  Add badge
                </button>
              </div>
            </form>
          </div>
        </article>
        </section>
      )}
    </AdminLayout>
  );
}
