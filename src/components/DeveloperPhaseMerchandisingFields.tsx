import { DeveloperMediaField } from "@/components/DeveloperMediaField";
import type { DeveloperProjectPhase } from "@/lib/developerQueries";

export function DeveloperPhaseMerchandisingFields({ phase }: { phase?: DeveloperProjectPhase }) {
  const inputClass = "min-h-11 rounded-xl border border-black/10 bg-white px-3 text-sm";
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-neutral-700">Sales status</span><select name="phaseSalesStatus" defaultValue={phase?.sales_status ?? "upcoming"} className={inputClass}><option value="upcoming">Upcoming</option><option value="selling">Currently selling</option><option value="sold_out">Sold out</option><option value="paused">Sales paused</option></select></label>
        <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-neutral-700">Delivery date</span><input name="phaseDeliveryDate" type="date" defaultValue={phase?.delivery_date?.slice(0, 10) ?? ""} className={inputClass} /></label>
        <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-neutral-700">Phase facilities</span><textarea name="phaseFacilities" defaultValue={phase?.facilities?.join("\n") ?? ""} placeholder={"Pool\nClubhouse"} maxLength={6000} className={`${inputClass} min-h-24 py-3`} /><span className="text-xs text-neutral-500">One facility per line.</span></label>
        <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-neutral-700">Selling points</span><textarea name="phaseSellingPoints" defaultValue={phase?.selling_points?.join("\n") ?? ""} placeholder={"Park-facing homes\nWalkable retail"} maxLength={6000} className={`${inputClass} min-h-24 py-3`} /><span className="text-xs text-neutral-500">One selling point per line.</span></label>
      </div>
      <DeveloperMediaField label="Phase masterplan" description="Upload or drop an image or PDF, or paste its URL." fileName="phaseMasterplan" urlName="phaseMasterplanUrl" accept="image/*,application/pdf,.pdf" defaultUrl={phase?.masterplan_url ?? ""} currentValue={phase?.masterplan_url ?? null} />
    </div>
  );
}
