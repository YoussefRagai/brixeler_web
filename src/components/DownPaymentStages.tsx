import type { DownPaymentStage } from "@/lib/projectMerchandising";

export function DownPaymentStages({ prefix, stages = [] }: { prefix: string; stages?: DownPaymentStage[] }) {
  return (
    <details className="mt-3 rounded-xl border border-black/10 bg-neutral-50 p-3" open={stages.length > 0}>
      <summary className="cursor-pointer text-xs font-semibold text-neutral-700">Split the down payment over time</summary>
      <p className="mt-2 text-xs text-neutral-500">The down payment above is due at booking. Add later payments here, for example another 5% after 3 months.</p>
      <div className="mt-3 space-y-2">
        {[0, 1].map((index) => (
          <details key={index} open={index === 0 || Boolean(stages[index])}>
            <summary className="cursor-pointer py-1 text-xs text-neutral-500">Payment {index + 2}{stages[index] ? ` · ${stages[index].percent}% after ${stages[index].after_months} months` : " · optional"}</summary>
            <div className="grid grid-cols-2 gap-3 py-2">
              <label className="text-xs text-neutral-600">Additional %<input className="mt-1 min-h-10 w-full rounded-xl border border-black/10 bg-white px-3" aria-label={`Payment ${index + 2} percentage`} name={`${prefix}StagePercent_${index}`} type="number" min="0.01" max="100" step="0.01" defaultValue={stages[index]?.percent ?? ""} /></label>
              <label className="text-xs text-neutral-600">Months after booking<input className="mt-1 min-h-10 w-full rounded-xl border border-black/10 bg-white px-3" aria-label={`Payment ${index + 2} months after booking`} name={`${prefix}StageMonth_${index}`} type="number" min="1" max="1200" step="1" defaultValue={stages[index]?.after_months ?? ""} /></label>
            </div>
          </details>
        ))}
        <details open={stages.length > 2}>
          <summary className="cursor-pointer py-2 text-xs font-semibold text-neutral-600">More payment milestones</summary>
          {Array.from({ length: 10 }, (_, offset) => offset + 2).map((index) => <div key={index} className="grid grid-cols-2 gap-3 py-2">
            <label className="text-xs text-neutral-600">Payment {index + 2} · additional %<input className="mt-1 min-h-10 w-full rounded-xl border border-black/10 bg-white px-3" name={`${prefix}StagePercent_${index}`} type="number" min="0.01" max="100" step="0.01" defaultValue={stages[index]?.percent ?? ""} /></label>
            <label className="text-xs text-neutral-600">Months after booking<input className="mt-1 min-h-10 w-full rounded-xl border border-black/10 bg-white px-3" name={`${prefix}StageMonth_${index}`} type="number" min="1" max="1200" step="1" defaultValue={stages[index]?.after_months ?? ""} /></label>
          </div>)}
        </details>
      </div>
    </details>
  );
}
