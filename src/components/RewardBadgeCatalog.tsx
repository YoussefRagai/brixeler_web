import { BadgeCheck, Eye, EyeOff, Repeat2, Sparkles } from "lucide-react";

import type { BadgeOption } from "@/components/RewardsRuleBuilder";
import { GrowthApprovalControls } from "@/components/GrowthApprovalControls";
import { GrowthVersionHistory } from "@/components/GrowthVersionHistory";

const categoryCopy: Record<string, string> = {
  special: "A memorable one-off moment.",
  deal_milestone: "A clear deal or sales milestone.",
  earnings: "A commission or revenue achievement.",
  referrals: "A helpful introduction to the network.",
  speed: "Fast, reliable follow-through.",
  contributions: "Community or content impact.",
};

const prettyCategory = (value?: string | null) =>
  (value || "special")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export function RewardBadgeCatalog({ badges, canApprove = false }: { badges: BadgeOption[]; canApprove?: boolean }) {
  return (
    <section className="rounded-[1.6rem] border border-black/10 bg-white p-5 shadow-[0_16px_40px_rgba(5,5,5,0.05)] sm:p-6" aria-labelledby="reward-badge-catalog-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[#4d477f]"><BadgeCheck aria-hidden="true" size={16} /><p className="text-[10px] font-semibold uppercase tracking-[0.24em]">Badge library</p></div>
          <h2 id="reward-badge-catalog-title" className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#111]">Celebrate the details</h2>
          <p className="mt-1 max-w-xl text-sm leading-5 text-neutral-500">Badges can be public or secret, permanent or renewable. Every card below is ready to pair with an earning goal.</p>
        </div>
        <span className="rounded-full border border-[#c8c2e9] bg-[#f2f1fb] px-3 py-1.5 text-xs font-semibold text-[#4d477f]">{badges.length} badges</span>
      </div>

      {badges.length ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {badges.map((badge) => {
            const category = badge.badge_type || "special";
            return (
              <article key={badge.id} className="group rounded-2xl border border-black/10 bg-[#fafaf8] p-3.5 transition-colors hover:border-[#c8c2e9]">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#111] text-[#dff579]">
                    {badge.icon_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={badge.icon_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <BadgeCheck aria-hidden="true" size={22} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate text-sm font-semibold text-[#111]">{badge.name}</h3>
                      {badge.is_active === false ? <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[9px] font-semibold text-neutral-500">Paused</span> : null}
                    </div>
                    {badge.name_ar ? <p className="truncate text-xs text-neutral-500" dir="rtl">{badge.name_ar}</p> : null}
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 min-h-8 text-xs leading-4 text-neutral-600">{badge.description || "A small signal that makes good work visible."}</p>
                <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                  <span className="rounded-full border border-[#c8c2e9] bg-[#f2f1fb] px-2 py-1 text-[#4d477f]">{prettyCategory(category)}</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-2 py-1 text-neutral-500">{badge.expires_in_days ? `${badge.expires_in_days} days` : "Permanent"}</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-2 py-1 text-neutral-500">{badge.is_active === false ? <EyeOff aria-hidden="true" size={11} /> : <Eye aria-hidden="true" size={11} />} {badge.is_active === false ? "Hidden" : "Public"}</span>
                </div>
                <p className="mt-3 border-t border-black/10 pt-2 text-[10px] leading-4 text-neutral-500">{categoryCopy[category] || "A reward category for your growth programme."}</p>
                <div className="mt-2 flex items-start justify-between gap-2">
                  <GrowthApprovalControls entityType="badge" entityId={badge.id} status={badge.approval_status ?? "not_required"} canApprove={canApprove} />
                  <GrowthVersionHistory entityType="badge" entityId={badge.id} currentVersion={badge.version ?? 1} />
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-black/15 bg-neutral-50 px-4 py-8 text-center"><Sparkles aria-hidden="true" size={22} className="mx-auto text-neutral-400" /><p className="mt-2 text-sm font-semibold text-[#111]">No badges created yet</p><p className="mt-1 text-xs text-neutral-500">Create a badge below to give your next milestone a visible shape.</p></div>
      )}

      <div className="mt-5 grid gap-3 border-t border-black/10 pt-5 sm:grid-cols-3">
        <div className="rounded-2xl bg-[#f2f1fb] p-3"><BadgeCheck aria-hidden="true" size={15} className="text-[#4d477f]" /><p className="mt-2 text-xs font-semibold text-[#111]">Category explains the why</p><p className="mt-1 text-[11px] leading-4 text-neutral-600">Help admins choose the right kind of recognition.</p></div>
        <div className="rounded-2xl bg-[#f7f7f2] p-3"><Repeat2 aria-hidden="true" size={15} className="text-[#4c5d11]" /><p className="mt-2 text-xs font-semibold text-[#111]">Repeatable means renewable</p><p className="mt-1 text-[11px] leading-4 text-neutral-600">Use an expiry and a recurring goal for fresh moments.</p></div>
        <div className="rounded-2xl bg-[#fff3ec] p-3"><EyeOff aria-hidden="true" size={15} className="text-[#8d482c]" /><p className="mt-2 text-xs font-semibold text-[#111]">Hidden can be intentional</p><p className="mt-1 text-[11px] leading-4 text-neutral-600">Secret achievements reveal themselves when earned.</p></div>
      </div>
    </section>
  );
}
