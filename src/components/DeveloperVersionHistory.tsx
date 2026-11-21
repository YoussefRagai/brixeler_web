import type { DeveloperInventoryVersion } from "@/lib/developerQueries";

type ServerAction = (formData: FormData) => void | Promise<void>;

type Props = { projectId: string; phaseId?: string | null; versions: DeveloperInventoryVersion[]; restoreAction: ServerAction };

const formatDateTime = (value: string) => new Intl.DateTimeFormat("en-US", {
  timeZone: "Africa/Cairo",
  dateStyle: "medium",
  timeStyle: "short",
}).format(new Date(value));

export function DeveloperVersionHistory({ projectId, phaseId, versions, restoreAction }: Props) {
  return (
    <section className="rounded-3xl border border-black/5 bg-white p-4 sm:p-5" aria-label="Inventory version history">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Version history</p><h3 className="mt-1 text-lg font-semibold text-neutral-950">Restore with an audit trail</h3><p className="mt-1 text-xs text-neutral-500">Snapshots are immutable. Restoring always returns the record to draft review.</p></div>
      {versions.length ? (
        <ol className="mt-4 space-y-2">
          {versions.slice(0, 12).map((version) => (
            <li key={version.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 bg-neutral-50 px-3 py-3">
              <div><p className="text-sm font-semibold text-neutral-800">v{version.version} · {version.entity_type.replace(/_/g, " ")}</p><p className="mt-1 text-xs text-neutral-500">{version.change_summary ?? "Updated"} · {formatDateTime(version.created_at)}</p>{version.changed_fields.length ? <p className="mt-1 text-[10px] text-neutral-400">Changed: {version.changed_fields.slice(0, 5).join(", ")}</p> : null}</div>
              <form action={restoreAction}><input type="hidden" name="projectId" value={projectId} />{phaseId ? <input type="hidden" name="phaseId" value={phaseId} /> : null}<input type="hidden" name="versionId" value={version.id} /><button type="submit" className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:border-black/30">Restore v{version.version}</button></form>
            </li>
          ))}
        </ol>
      ) : <p className="mt-4 rounded-2xl bg-neutral-50 p-4 text-xs text-neutral-500">No snapshots yet. New edits will appear here.</p>}
    </section>
  );
}
