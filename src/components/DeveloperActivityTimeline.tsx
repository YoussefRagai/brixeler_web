import type { DeveloperInventoryActivity } from "@/lib/developerQueries";

type Props = { activities: DeveloperInventoryActivity[] };

const titleForAction = (action: string) => action.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export function DeveloperActivityTimeline({ activities }: Props) {
  return (
    <section className="rounded-3xl border border-black/5 bg-white p-4 sm:p-5" aria-label="Inventory activity timeline">
      <div className="flex items-center justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Activity</p><h3 className="mt-1 text-lg font-semibold text-neutral-950">Recent workspace changes</h3></div>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-semibold text-neutral-600">{activities.length} events</span>
      </div>
      {activities.length ? (
        <ol className="mt-4 space-y-3">
          {activities.map((activity) => (
            <li key={activity.id} className="relative border-l border-black/10 pl-4">
              <span className="absolute -left-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-black" />
              <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-sm font-semibold text-neutral-800">{titleForAction(activity.action)}</p><time className="text-[10px] text-neutral-400" dateTime={activity.created_at}>{new Date(activity.created_at).toLocaleString()}</time></div>
              <p className="mt-1 text-xs text-neutral-500">{activity.entity_type.replace(/_/g, " ")}{activity.entity_id ? ` · ${activity.entity_id.slice(0, 8)}` : ""}</p>
            </li>
          ))}
        </ol>
      ) : <p className="mt-4 rounded-2xl bg-neutral-50 p-4 text-xs text-neutral-500">No activity recorded for this project yet.</p>}
    </section>
  );
}
