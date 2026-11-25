import type { DeveloperPublicationFeedback } from "@/lib/developerQueries";

type ServerAction = (formData: FormData) => void | Promise<void>;
const formatDateTime = (value: string) => new Intl.DateTimeFormat("en-US", {
  timeZone: "Africa/Cairo",
  dateStyle: "medium",
  timeStyle: "short",
}).format(new Date(value));

const ISSUE_ALIASES = [
  { label: "Location", matches: ["location", "address"] },
  { label: "Project type", matches: ["project type", "project types", "property type", "property types"] },
  { label: "Unit inventory", matches: ["unit inventory", "unit type", "unit types", "inventory"] },
  { label: "Unit details", matches: ["unit details", "price", "area", "description"] },
  { label: "Release phase", matches: ["phase", "release"] },
  { label: "Hero media", matches: ["hero", "media", "image"] },
] as const;

const displayIssue = (issue: string) => issue === "Project type" ? "Property types" : issue;

const feedbackText = (item: DeveloperPublicationFeedback) => `${item.field_name ?? ""} ${item.message}`.toLocaleLowerCase();

const relevantIssues = (item: DeveloperPublicationFeedback) => {
  const text = feedbackText(item);
  return ISSUE_ALIASES.filter((issue) => issue.matches.some((match) => text.includes(match))).map((issue) => issue.label);
};

const feedbackHref = (projectId: string, phaseId: string | null | undefined, item: DeveloperPublicationFeedback) => {
  const text = feedbackText(item);
  const field = (item.field_name ?? "").toLocaleLowerCase();
  const section = /phase|release/.test(field) || (!field && /phase|release/.test(text))
    ? "phases"
    : /unit|inventory|price|area/.test(field) || (!field && /unit|inventory|price|area/.test(text))
      ? "inventory&inventoryView=types"
      : "settings";
  const anchor = section === "phases" ? "project-phases" : section.startsWith("inventory") ? "add-property-types" : /hero|media|image/.test(text) ? "project-media" : "project-settings";
  return `/developer/projects/${projectId}?section=${section}${phaseId ? `&phase=${encodeURIComponent(phaseId)}` : ""}#${anchor}`;
};

export function DeveloperPublicationFeedbackPanel({ projectId, phaseId, feedback, resolveAction, rejectionReason, readinessMissing = [] }: { projectId: string; phaseId?: string | null; feedback: DeveloperPublicationFeedback[]; resolveAction: ServerAction; rejectionReason?: string | null; readinessMissing?: string[] }) {
  const openFeedback = feedback.filter((item) => item.status === "open");
  return (
    <section className="rounded-3xl border border-black/5 bg-white p-4 sm:p-5" aria-label="Publication feedback">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Review feedback</p><h3 className="mt-1 text-lg font-semibold text-neutral-950">Field-level publication notes</h3></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${openFeedback.length ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}>{openFeedback.length} open</span></div>
      {rejectionReason ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-950"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-700">Latest reviewer reason</p><p className="mt-1 font-medium">{rejectionReason}</p><p className="mt-2 text-xs leading-5 text-rose-800">This note describes the last review decision. The checklist below reflects the project data saved now, so an older note can be addressed already or may need reviewer clarification.</p></div> : null}
      {feedback.length ? <ul className="mt-4 space-y-2">{feedback.slice(0, 10).map((item) => {
        const relevant = relevantIssues(item);
        const unresolved = relevant.filter((issue) => readinessMissing.includes(issue));
        const currentState = relevant.length
          ? unresolved.length
            ? { label: "Still blocks the current checklist", className: "border-rose-200 bg-rose-50 text-rose-800", detail: `Current blocker: ${unresolved.map(displayIssue).join(" · ")}.` }
            : { label: "Current checklist is satisfied", className: "border-sky-200 bg-sky-50 text-sky-800", detail: "The saved data currently passes this check. The note may be stale or may refer to a detail outside this checklist; keep it open until Brixeler confirms." }
          : null;
        return <li key={item.id} className="rounded-2xl border border-black/10 bg-neutral-50 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="text-sm font-semibold text-neutral-800">{item.field_name ? `${item.entity_type} · ${item.field_name}` : item.entity_type}</p><p className="mt-1 text-xs text-neutral-600">{item.message}</p>{currentState ? <div className={`mt-2 rounded-xl border px-2.5 py-2 text-xs ${currentState.className}`}><p className="font-semibold">{currentState.label}</p><p className="mt-1 leading-5">{currentState.detail}</p></div> : null}<a href={feedbackHref(projectId, phaseId, item)} className="mt-2 inline-flex min-h-9 items-center text-xs font-semibold text-neutral-700 underline underline-offset-4 hover:text-black">Check the saved field</a></div>{item.status === "open" ? <form action={resolveAction}><input type="hidden" name="projectId" value={projectId} />{phaseId ? <input type="hidden" name="phaseId" value={phaseId} /> : null}<input type="hidden" name="feedbackId" value={item.id} /><button type="submit" className="rounded-full border border-black/10 px-3 py-1.5 text-[10px] font-semibold text-neutral-700">Mark resolved</button></form> : <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-800">Resolved</span>}</div><p className="mt-2 text-[10px] text-neutral-400">{formatDateTime(item.created_at)}</p></li>;
      })}</ul> : <p className="mt-4 rounded-2xl bg-neutral-50 p-4 text-xs text-neutral-500">No admin feedback has been recorded for this project.</p>}
    </section>
  );
}
