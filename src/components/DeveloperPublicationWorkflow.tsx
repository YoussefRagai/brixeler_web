import type { DeveloperPublicationStatus } from "@/lib/developerQueries";

type ServerAction = (formData: FormData) => void | Promise<void>;

type Props = {
  projectId: string;
  status?: DeveloperPublicationStatus | string | null;
  readiness: { score: number; missing: string[] };
  markReadyAction: ServerAction;
  submitAction: ServerAction;
};

const STEPS: Array<{ key: DeveloperPublicationStatus; label: string }> = [
  { key: "draft", label: "Draft" },
  { key: "ready", label: "Ready" },
  { key: "submitted", label: "Submitted" },
  { key: "changes_requested", label: "Changes requested" },
  { key: "approved", label: "Approved" },
  { key: "published", label: "Published" },
];

const statusIndex = (status?: string | null) => {
  const index = STEPS.findIndex((step) => step.key === status);
  return index < 0 ? 0 : index;
};

export function DeveloperPublicationWorkflow({
  projectId,
  status,
  readiness,
  markReadyAction,
  submitAction,
}: Props) {
  const activeIndex = statusIndex(status);
  const blocked = readiness.missing.length > 0;
  return (
    <section className="rounded-3xl border border-black/5 bg-white p-4 sm:p-5" aria-label="Publication workflow">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Publication workflow</p>
          <h3 className="mt-1 text-lg font-semibold text-neutral-950">One explicit path to mobile</h3>
          <p className="mt-1 max-w-2xl text-xs text-neutral-500">Draft content locally, verify the readiness checklist, submit for admin review, and publish only after approval.</p>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700">Current: {(status ?? "draft").replace(/_/g, " ")}</span>
      </div>
      <ol className="mt-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {STEPS.map((step, index) => {
          const isCurrent = index === activeIndex;
          const complete = index < activeIndex && !(status === "changes_requested" && index >= 3);
          return (
            <li key={step.key} className={`rounded-2xl border px-3 py-3 ${isCurrent ? "border-black bg-black text-white" : complete ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-black/10 bg-neutral-50 text-neutral-500"}`}>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em]">{index + 1}</p>
              <p className="mt-1 text-xs font-semibold">{step.label}</p>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="rounded-2xl border border-black/10 bg-neutral-50 p-3">
          <div className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-neutral-700">Readiness checklist</span><span className="font-bold text-neutral-900">{readiness.score}%</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><span className={`block h-full rounded-full ${readiness.score >= 80 ? "bg-emerald-500" : readiness.score >= 50 ? "bg-amber-400" : "bg-rose-400"}`} style={{ width: `${readiness.score}%` }} /></div>
          {blocked ? <p className="mt-2 text-xs text-amber-800">Still needed: {readiness.missing.join(", ")}</p> : <p className="mt-2 text-xs text-emerald-700">All local checks are complete. Server validation will run again before transition.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={markReadyAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <button type="submit" disabled={blocked} className="rounded-full border border-black/10 px-3 py-2 text-xs font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:opacity-40">Mark ready</button>
          </form>
          <form action={submitAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <button type="submit" disabled={blocked} className="rounded-full bg-black px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Submit for review</button>
          </form>
        </div>
      </div>
    </section>
  );
}
