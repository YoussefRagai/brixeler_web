import { ArrowDown, ArrowUp, Check, CircleHelp, Layers3, LockKeyhole } from "lucide-react";
import { GrowthApprovalControls } from "@/components/GrowthApprovalControls";
import { GrowthVersionHistory } from "@/components/GrowthVersionHistory";

export type RewardTierOption = {
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

type RecentTierMovement = {
  name: string;
  from?: string | null;
  to?: string | null;
  reason?: string | null;
};

const benefitLabel = (tier: RewardTierOption) => {
  if (!tier.benefit_type || tier.benefit_type === "none") return "No extra benefit";
  if (tier.benefit_type === "commission_boost") return `+${tier.benefit_value ?? 0}% commission`;
  if (tier.benefit_type === "priority_support") return "Priority support";
  return tier.benefit_description || "Custom benefit";
};

export function RewardTierLadder({
  tiers,
  recentMovements = [],
  canApprove = false,
}: {
  tiers: RewardTierOption[];
  recentMovements?: RecentTierMovement[];
  canApprove?: boolean;
}) {
  const orderedTiers = [...tiers].sort((left, right) => (left.level ?? 0) - (right.level ?? 0));

  return (
    <section className="rounded-[1.6rem] border border-black/10 bg-white p-5 shadow-[0_16px_40px_rgba(5,5,5,0.05)] sm:p-6" aria-labelledby="reward-tier-ladder-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[#4c5d11]">
            <Layers3 aria-hidden="true" size={16} />
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em]">Tier ladder</p>
          </div>
          <h2 id="reward-tier-ladder-title" className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#111]">
            Progression at a glance
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-5 text-neutral-500">
            Levels are ordered automatically. A higher qualification replaces a lower tier, so agents always know what comes next.
          </p>
        </div>
        <span className="rounded-full border border-[#d9dfbf] bg-[#f1f5d9] px-3 py-1.5 text-xs font-semibold text-[#4c5d11]">
          {orderedTiers.length ? `${orderedTiers.length} levels` : "Build your first level"}
        </span>
      </div>

      {orderedTiers.length ? (
        <div className="mt-6 overflow-x-auto pb-2" aria-label="Ordered tier ladder">
          <div className="flex min-w-[620px] items-stretch gap-2">
            {orderedTiers.map((tier, index) => (
              <div key={tier.id} className="flex min-w-[132px] flex-1 items-stretch gap-2">
                <article className={`relative flex min-w-0 flex-1 flex-col rounded-2xl border p-3 ${
                  tier.is_active === false ? "border-black/10 bg-neutral-50 opacity-65" : "border-[#cfd9a0] bg-[#f8fae9]"
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-[#111] text-[#dff579]">
                      {tier.icon_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={tier.icon_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-sm font-semibold">{tier.level ?? index + 1}</span>
                      )}
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#66722f]">
                      L{tier.level ?? index + 1}
                    </span>
                  </div>
                  <h3 className="mt-3 truncate text-sm font-semibold text-[#111]">{tier.name}</h3>
                  <p className="mt-1 line-clamp-2 min-h-8 text-[11px] leading-4 text-neutral-600">
                    {tier.description || "Add a short promise for agents."}
                  </p>
                  <p className="mt-3 border-t border-black/10 pt-2 text-[10px] font-semibold text-[#4c5d11]">{benefitLabel(tier)}</p>
                  <div className="mt-2 flex items-start justify-between gap-2">
                    <GrowthApprovalControls entityType="tier" entityId={tier.id} status={tier.approval_status ?? "not_required"} canApprove={canApprove} />
                    <GrowthVersionHistory entityType="tier" entityId={tier.id} currentVersion={tier.version ?? 1} />
                  </div>
                </article>
                {index < orderedTiers.length - 1 ? (
                  <div className="flex shrink-0 items-center text-[#8a964c]" aria-hidden="true">
                    <ArrowUp size={16} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-black/15 bg-neutral-50 px-4 py-7 text-center">
          <p className="text-sm font-semibold text-[#111]">No tier levels yet</p>
          <p className="mt-1 text-xs text-neutral-500">Create Level 1 below, then use the builder to attach a qualification rule.</p>
        </div>
      )}

      <div className="mt-5 grid gap-3 border-t border-black/10 pt-5 sm:grid-cols-3">
        <div className="rounded-2xl bg-[#f7f7f2] p-3">
          <div className="flex items-center gap-2 text-[#4c5d11]"><ArrowUp aria-hidden="true" size={14} /><span className="text-xs font-semibold">Promotion</span></div>
          <p className="mt-1 text-[11px] leading-4 text-neutral-600">Use a new threshold to move agents up automatically.</p>
        </div>
        <div className="rounded-2xl bg-[#fff3ec] p-3">
          <div className="flex items-center gap-2 text-[#8d482c]"><ArrowDown aria-hidden="true" size={14} /><span className="text-xs font-semibold">Demotion</span></div>
          <p className="mt-1 text-[11px] leading-4 text-neutral-600">Choose whether missed goals should change a level.</p>
        </div>
        <div className="rounded-2xl bg-[#f2f1fb] p-3">
          <div className="flex items-center gap-2 text-[#4d477f]"><LockKeyhole aria-hidden="true" size={14} /><span className="text-xs font-semibold">Safe defaults</span></div>
          <p className="mt-1 text-[11px] leading-4 text-neutral-600">Preview movement before an active rule can affect anyone.</p>
        </div>
      </div>

      {recentMovements.length ? (
        <div className="mt-5 border-t border-black/10 pt-5" aria-labelledby="recent-tier-movements-title">
          <div className="flex items-center gap-2">
            <p id="recent-tier-movements-title" className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Recent movement</p>
            <CircleHelp aria-hidden="true" size={14} className="text-neutral-400" />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {recentMovements.slice(0, 4).map((movement, index) => (
              <div key={`${movement.name}-${index}`} className="flex items-center gap-2 rounded-xl border border-black/10 bg-neutral-50 px-3 py-2">
                <Check aria-hidden="true" size={14} className="shrink-0 text-[#4c5d11]" />
                <p className="min-w-0 truncate text-xs text-[#111]">
                  <span className="font-semibold">{movement.name}</span>{" "}
                  {movement.from ? `${movement.from} → ` : "moved to "}{movement.to || "next level"}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
