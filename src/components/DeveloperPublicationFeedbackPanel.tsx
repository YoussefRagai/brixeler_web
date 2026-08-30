import type { DeveloperPublicationFeedback } from "@/lib/developerQueries";

type ServerAction = (formData: FormData) => void | Promise<void>;

export function DeveloperPublicationFeedbackPanel({ projectId, feedback, resolveAction }: { projectId: string; feedback: DeveloperPublicationFeedback[]; resolveAction: ServerAction }) {
  const openFeedback = feedback.filter((item) => item.status === "open");
  return (
    <section className="rounded-3xl border border-black/5 bg-white p-4 sm:p-5" aria-label="Publication feedback">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Review feedback</p><h3 className="mt-1 text-lg font-semibold text-neutral-950">Field-level publication notes</h3></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${openFeedback.length ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}>{openFeedback.length} open</span></div>
      {feedback.length ? <ul className="mt-4 space-y-2">{feedback.slice(0, 10).map((item) => <li key={item.id} className="rounded-2xl border border-black/10 bg-neutral-50 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold text-neutral-800">{item.field_name ? `${item.entity_type} · ${item.field_name}` : item.entity_type}</p><p className="mt-1 text-xs text-neutral-600">{item.message}</p></div>{item.status === "open" ? <form action={resolveAction}><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="feedbackId" value={item.id} /><button type="submit" className="rounded-full border border-black/10 px-3 py-1.5 text-[10px] font-semibold text-neutral-700">Mark resolved</button></form> : <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-800">Resolved</span>}</div><p className="mt-2 text-[10px] text-neutral-400">{new Date(item.created_at).toLocaleString()}</p></li>)}</ul> : <p className="mt-4 rounded-2xl bg-neutral-50 p-4 text-xs text-neutral-500">No admin feedback has been recorded for this project.</p>}
    </section>
  );
}
