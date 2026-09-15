import { Check, ChevronRight } from "lucide-react";
import { ProjectWorkflowSubmitButton } from "@/components/ProjectWorkflowSubmitButton";

type ServerAction = (formData: FormData) => void | Promise<void>;
type Props = {
  projectId: string;
  phaseId?: string | null;
  status?: string | null;
  readiness: { score: number; missing: string[] };
  markReadyAction: ServerAction;
  submitAction: ServerAction;
  isDemo?: boolean;
};

const STATES: Record<string, { label: string; stage: number; message: string }> = {
  draft: { label: "Draft", stage: 0, message: "Complete the checklist, then send this project to the Brixeler team." },
  ready: { label: "Ready to submit", stage: 0, message: "Your project is prepared. Submit it when you are ready for review." },
  submitted: { label: "With the review team", stage: 1, message: "Your project has been submitted. Feedback will appear here; no need to submit again." },
  changes_requested: { label: "Changes requested", stage: 0, message: "Address the review feedback below, then resubmit your project." },
  approved: { label: "Approved", stage: 1, message: "Review is complete. Publication is managed by the Brixeler team." },
  published: { label: "Published", stage: 2, message: "Project publication is approved. Customer visibility also depends on company, phase, and inventory eligibility." },
  archived: { label: "Archived", stage: 0, message: "Restore this project before preparing it for review." },
};

export function DeveloperPublicationWorkflow({ projectId, phaseId, status, readiness, markReadyAction, submitAction, isDemo = false }: Props) {
  // Unknown states are display-only: never offer a transition we cannot explain.
  const state = STATES[status ?? "draft"] ?? { label: "Status unavailable", stage: 0, message: "Refresh the project before submitting it for review." };
  const canPrepare = ["draft", "ready", "changes_requested"].includes(status ?? "draft");
  const blocked = readiness.missing.length > 0;
  const score = Number.isFinite(readiness.score) ? Math.max(0, Math.min(100, readiness.score)) : 0;
  const issueHref = (issue: string) => {
    const key = issue.toLowerCase();
    const section = /unit|inventory|price|area/.test(key) ? "inventory&inventoryView=types" : /phase/.test(key) ? "phases" : "settings";
    const anchor = /hero|media|image/.test(key) ? "project-media" : section.startsWith("inventory") ? "project-inventory" : section === "phases" ? "project-phases" : "project-settings";
    return `/developer/projects/${projectId}?section=${section}${phaseId ? `&phase=${encodeURIComponent(phaseId)}` : ""}#${anchor}`;
  };

  return (
    <section className="rounded-3xl border border-black/5 bg-white p-4 sm:p-5" aria-label="Publication workflow">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-neutral-950">Review & publication</h3>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">{state.message}</p>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status === "changes_requested" ? "bg-amber-50 text-amber-800" : "bg-neutral-100 text-neutral-700"}`}>{isDemo && status === "published" ? "Published · demo hidden" : state.label}</span>
      </div>
      <ol className="mt-5 grid grid-cols-3 gap-2" aria-label="Publication stages">
        {["Prepare", "Admin review", "Publication"].map((label, index) => (
          <li key={label} aria-current={index === state.stage ? "step" : undefined} className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-xs font-semibold ${index === state.stage ? "border-black bg-black text-white" : "border-black/10 text-neutral-500"}`}>
            {index < state.stage ? <Check size={14} aria-hidden="true" /> : <span aria-hidden="true">{index + 1}</span>}{label}
          </li>
        ))}
      </ol>
      {isDemo ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Demo project — hidden from customers, including after approval.</p> : null}
      <div className="mt-4 rounded-2xl border border-black/10 p-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <h4 className="font-semibold text-neutral-900">Before you submit</h4>
          <span className="text-xs text-neutral-500">{blocked ? `${readiness.missing.length} to complete` : "Checks complete"}</span>
        </div>
        <div role="progressbar" aria-label="Project completeness" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-100"><span className="block h-full rounded-full bg-neutral-900" style={{ width: `${score}%` }} /></div>
        {blocked ? (
          <ul className="mt-3 divide-y divide-black/5">
            {readiness.missing.map((issue) => <li key={issue}><a href={issueHref(issue)} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm text-neutral-700 hover:text-black"><span>{issue}</span><ChevronRight size={15} aria-hidden="true" /></a></li>)}
          </ul>
        ) : <p className="mt-3 text-xs text-neutral-500">The server checks eligibility again when you submit. Saving changes does not publish them.</p>}
      </div>
      {canPrepare ? <div className="mt-4 flex flex-wrap justify-end gap-2">
        {status !== "ready" ? <form action={markReadyAction}>
          <input type="hidden" name="projectId" value={projectId} />
          <ProjectWorkflowSubmitButton disabled={blocked} pendingLabel="Checking…">Mark ready</ProjectWorkflowSubmitButton>
        </form> : null}
        <form action={submitAction}>
          <input type="hidden" name="projectId" value={projectId} />
          <ProjectWorkflowSubmitButton disabled={blocked} primary pendingLabel="Submitting…">{status === "changes_requested" ? "Resubmit for review" : "Submit for review"}</ProjectWorkflowSubmitButton>
        </form>
      </div> : null}
    </section>
  );
}
