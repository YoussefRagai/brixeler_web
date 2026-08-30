import { Clock3, Radio } from "lucide-react";
import { DeveloperLayout } from "@/components/DeveloperLayout";
import { currentDeveloperImpersonation, requireDeveloperCapability } from "@/lib/developerAuth";
import { fetchDeveloperActivity } from "@/lib/developerSalesOps";

export const dynamic = "force-dynamic";

export default async function DeveloperActivityPage() {
  const session = await requireDeveloperCapability("view_contacts");
  const [events, impersonation] = await Promise.all([
    fetchDeveloperActivity(session.developerId, { limit: 250 }),
    currentDeveloperImpersonation(),
  ]);
  return (
    <DeveloperLayout title="Activity" description="A durable record of lead ownership, stage changes, notes, and notifications." impersonation={impersonation}>
      <section className="overflow-hidden rounded-3xl border border-black/5 bg-white">
        <div className="flex flex-wrap items-start gap-3 border-b border-black/5 p-5 sm:p-6"><div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-neutral-100 text-neutral-700"><Radio aria-hidden="true" size={18} /></div><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Collaboration log</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-neutral-900">What changed across your workspace</h2><p className="mt-1 text-sm text-neutral-500">Events are tenant-scoped and retain the actor and entity context needed for handoffs.</p></div></div>
        {events.length ? <ol className="divide-y divide-black/5">{events.map((event) => <li key={event.id} className="flex gap-4 px-5 py-5 sm:px-6"><span className="mt-1 grid size-8 shrink-0 place-items-center rounded-xl bg-[#f1f5d9] text-[#4c5d11]"><Clock3 aria-hidden="true" size={15} /></span><div className="min-w-0"><p className="text-sm font-semibold text-neutral-900">{event.summary}</p><p className="mt-1 text-xs text-neutral-500">{event.actor_name} · {capitalize(event.event_type)} · {formatDateTime(event.created_at)}</p></div></li>)}</ol> : <div className="px-5 py-10 text-center sm:px-6"><p className="text-sm font-semibold text-neutral-800">No activity yet.</p><p className="mt-1 text-sm text-neutral-500">New mobile leads and teammate actions will appear here.</p></div>}
      </section>
    </DeveloperLayout>
  );
}

function capitalize(value: string) { return value ? value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ") : "—"; }
function formatDateTime(value: string) { const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date) : "—"; }
