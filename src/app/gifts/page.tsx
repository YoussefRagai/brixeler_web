import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { AdminLayout } from "@/components/AdminLayout";
import { buildAdminUi } from "@/lib/adminUi";
import { supabaseServer } from "@/lib/supabaseServer";
import { GiftRuleBuilder } from "@/components/GiftRuleBuilder";

type TierRow = {
  id: string;
  name: string;
  level: number | null;
};

type GiftRow = {
  id: string;
  title: string;
  title_ar: string | null;
  description: string | null;
  icon_url: string | null;
  is_active: boolean | null;
  tier_ids: string[] | null;
  max_concurrent_claims: number | null;
  exclusivity_mode: string | null;
};

type GiftRuleRow = {
  id: string;
  gift_id: string | null;
  metric: string | null;
  time_window: string | null;
  operator: string | null;
  value_min: number | null;
  value_max: number | null;
  value_single: number | null;
  is_active: boolean | null;
  created_at: string | null;
};

export default async function GiftsPage() {
  const ui = await buildAdminUi(["marketing_admin"]);
  const { data: tiers } = await supabaseServer
    .from("tiers")
    .select("id, name, level")
    .order("level", { ascending: true });
  const { data: gifts } = await supabaseServer
    .from("gifts")
    .select(
      "id, title, title_ar, description, icon_url, is_active, tier_ids, max_concurrent_claims, exclusivity_mode",
    )
    .order("created_at", { ascending: false });
  const { data: giftRules } = await supabaseServer
    .from("gift_rules")
    .select(
      "id, gift_id, metric, time_window, operator, value_min, value_max, value_single, is_active, created_at",
    )
    .order("created_at", { ascending: false });
  const { data: giftClaims } = await supabaseServer
    .from("gift_claims")
    .select("id, gift_id, agent_id, status, claimed_at, gifts(title), users_profile(display_name)")
    .order("claimed_at", { ascending: false })
    .limit(30);
  const tierLookup = new Map((tiers ?? []).map((tier) => [tier.id, tier]));

  return (
    <AdminLayout
      title="Gifts"
      description="Design perks, set eligibility, and approve redemptions."
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
                <p className="text-xs uppercase tracking-[0.4em] text-neutral-400">Gift studio</p>
                <h2 className="text-3xl font-semibold text-[#050505]">Gifts & claims control room</h2>
                <p className="mt-2 text-sm text-neutral-500">
                  Publish gifts, apply rules, and watch claims flow into approval.
                </p>
              </div>
              <form action="/api/admin/gifts/apply" method="post">
                <button className="rounded-full bg-black px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-black/15 hover:bg-black/90">
                  Apply gift rules now
                </button>
              </form>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <div className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs text-neutral-500">
                {gifts?.length ?? 0} gifts
              </div>
              <div className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs text-neutral-500">
                {giftRules?.length ?? 0} active rules
              </div>
              <div className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs text-neutral-500">
                {giftClaims?.length ?? 0} recent claims
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-4">
              <div className="rounded-3xl border border-black/5 bg-white px-6 py-4 shadow-xl shadow-black/5">
                <h3 className="text-lg font-semibold text-[#050505]">Build gift rules</h3>
                <p className="text-sm text-neutral-500">Preview who qualifies before you activate.</p>
              </div>
              <GiftRuleBuilder gifts={(gifts ?? []).map((gift) => ({ id: gift.id, title: gift.title }))} />
            </div>

            <div className="space-y-6">
              <details open className="rounded-3xl border border-black/5 bg-white px-6 py-6 shadow-xl shadow-black/5">
                <summary className="cursor-pointer text-lg font-semibold text-[#050505]">Create gift</summary>
                <p className="mt-2 text-sm text-neutral-500">Define eligibility, exclusivity, and limits.</p>
                <form
                  action="/api/admin/gifts/create"
                  method="post"
                  encType="multipart/form-data"
                  className="mt-6 space-y-4 text-sm text-neutral-600"
                >
                  <label className="text-xs text-neutral-500">
                    Title
                    <input
                      name="title"
                      required
                      className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#050505]"
                    />
                  </label>
                  <label className="text-xs text-neutral-500">
                    Title (Arabic)
                    <input
                      name="title_ar"
                      className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#050505]"
                    />
                  </label>
                  <label className="text-xs text-neutral-500">
                    Icon
                    <input name="icon" type="file" accept="image/*" required className="mt-2 w-full text-sm" />
                  </label>
                  <label className="text-xs text-neutral-500">
                    Max concurrent claims (global per user)
                    <input
                      name="max_concurrent_claims"
                      type="number"
                      min="1"
                      className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#050505]"
                    />
                  </label>
                  <label className="text-xs text-neutral-500 md:col-span-2">
                    Description
                    <textarea
                      name="description"
                      rows={3}
                      className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#050505]"
                    />
                  </label>
                  <label className="text-xs text-neutral-500 md:col-span-2">
                    Eligible tiers (select)
                    <select
                      name="tier_ids"
                      multiple
                      className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#050505]"
                    >
                      {(tiers ?? []).map((tier) => (
                        <option key={tier.id} value={tier.id}>
                          Tier {tier.level ?? "—"} · {tier.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-neutral-500">
                    Exclusivity mode
                    <select
                      name="exclusivity_mode"
                      className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#050505]"
                    >
                      <option value="none">No exclusivity</option>
                      <option value="eligible">Block others when eligible</option>
                      <option value="claimed">Block others after claim</option>
                    </select>
                  </label>
                  <button className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-black/10 hover:bg-black/90">
                    Save gift
                  </button>
                </form>
              </details>

              <details className="rounded-3xl border border-black/5 bg-white px-6 py-6 shadow-xl shadow-black/5">
                <summary className="cursor-pointer text-lg font-semibold text-[#050505]">Active gift rules</summary>
                <div className="mt-4 space-y-3 text-sm text-neutral-600">
                  {(giftRules ?? []).map((rule) => (
                    <div key={rule.id} className="flex items-center justify-between gap-4 rounded-2xl border border-black/5 bg-black/5 px-4 py-3">
                      <div>
                        <p className="font-semibold text-[#050505]">
                          {rule.metric} · {rule.operator}{" "}
                          {rule.operator === "between" ? `${rule.value_min}–${rule.value_max}` : rule.value_single}
                        </p>
                        <p className="text-xs text-neutral-500">Window: {rule.time_window ?? "all_time"}</p>
                      </div>
                      <span className="rounded-full border border-black/10 px-3 py-1 text-xs">
                        {rule.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  ))}
                  {!giftRules?.length && <p className="text-sm text-neutral-400">No gift rules yet.</p>}
                </div>
              </details>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <details open className="rounded-3xl border border-black/5 bg-white px-6 py-6 shadow-xl shadow-black/5">
              <summary className="cursor-pointer text-lg font-semibold text-[#050505]">Gift catalog</summary>
              <p className="mt-2 text-sm text-neutral-500">Preview which tiers can unlock each reward.</p>
              <div className="mt-6 space-y-3 text-sm text-neutral-600">
                {(gifts ?? []).map((gift) => (
                  <div key={gift.id} className="flex items-center gap-3 rounded-2xl border border-black/5 bg-black/5 px-4 py-3">
                    {gift.icon_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={gift.icon_url} alt={gift.title} className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-neutral-200" />
                    )}
                    <div className="flex-1">
                      <p className="font-semibold text-[#050505]">
                        {gift.title}
                        {gift.title_ar ? (
                          <span className="ml-2 text-xs font-normal text-neutral-500">· {gift.title_ar}</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-neutral-500">{gift.description ?? "No description"}</p>
                      <p className="mt-1 text-[11px] text-neutral-400">
                        Exclusivity: {gift.exclusivity_mode ?? "none"} · Limit:{" "}
                        {gift.max_concurrent_claims ? gift.max_concurrent_claims : "—"}
                      </p>
                      {gift.tier_ids?.length ? (
                        <p className="mt-1 text-[11px] text-neutral-400">
                          Eligible tiers:{" "}
                          {gift.tier_ids
                            .map((id) => {
                              const tier = tierLookup.get(id);
                              return tier ? `Tier ${tier.level ?? "—"}` : null;
                            })
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      ) : (
                        <p className="mt-1 text-[11px] text-neutral-400">Eligible tiers: All</p>
                      )}
                    </div>
                  </div>
                ))}
                {!gifts?.length && <p className="text-sm text-neutral-400">No gifts created yet.</p>}
              </div>
            </details>

            <details className="rounded-3xl border border-black/5 bg-white px-6 py-6 shadow-xl shadow-black/5">
              <summary className="cursor-pointer text-lg font-semibold text-[#050505]">Gift claims</summary>
              <p className="mt-2 text-sm text-neutral-500">
                Approve redemptions in the claims queue.
              </p>
              <div className="mt-4 space-y-3 text-sm text-neutral-600">
                {(giftClaims ?? []).map((claim) => (
                  <div
                    key={claim.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-black/5 bg-black/5 px-4 py-3"
                  >
                    <div>
                      <p className="font-semibold text-[#050505]">
                        {claim.users_profile?.display_name ?? claim.agent_id}
                      </p>
                      <p className="text-xs text-neutral-500">{claim.gifts?.title ?? "Gift"}</p>
                    </div>
                    <div className="text-xs text-neutral-500">{claim.status}</div>
                  </div>
                ))}
                {!giftClaims?.length && <p className="text-sm text-neutral-400">No claims yet.</p>}
              </div>
              <a
                href="/gifts/claims"
                className="mt-6 inline-flex items-center rounded-full border border-black/10 px-4 py-2 text-xs font-semibold text-neutral-600"
              >
                Open gift claims
              </a>
            </details>
          </section>
        </>
      )}
    </AdminLayout>
  );
}
