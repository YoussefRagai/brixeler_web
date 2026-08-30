import type { DeveloperProjectTemplate } from "@/lib/developerQueries";

type ServerAction = (formData: FormData) => void | Promise<void>;

type Props = {
  projectId: string;
  projectName: string;
  projectPayload: Record<string, unknown>;
  templates: DeveloperProjectTemplate[];
  saveAction: ServerAction;
  cloneAction: ServerAction;
};

export function DeveloperTemplateManager({ projectId, projectName, projectPayload, templates, saveAction, cloneAction }: Props) {
  return (
    <section className="rounded-3xl border border-black/5 bg-white p-4 sm:p-5" aria-label="Reusable project templates">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Templates</p><h3 className="mt-1 text-lg font-semibold text-neutral-950">Reuse project, phase, unit, and payment setup</h3><p className="mt-1 text-xs text-neutral-500">Templates preserve structure and commercial defaults; every clone starts as a draft.</p></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <form action={saveAction} className="rounded-2xl border border-black/10 bg-neutral-50 p-3">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="payload" value={JSON.stringify(projectPayload)} />
          <input type="hidden" name="templateType" value="project" />
          <label className="text-xs font-semibold text-neutral-600">Save current project as template<input name="name" defaultValue={`${projectName} template`} className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-normal" required /></label>
          <input name="description" placeholder="Optional description" className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-xs" />
          <button type="submit" className="mt-3 rounded-full bg-black px-3 py-2 text-xs font-semibold text-white">Save project template</button>
        </form>
        <div className="space-y-2">
          {templates.length ? templates.map((template) => <div key={template.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-black/10 bg-neutral-50 px-3 py-3"><div><p className="text-sm font-semibold text-neutral-800">{template.name}</p><p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-neutral-400">{template.template_type} · v{template.version}</p></div>{template.template_type === "project" ? <form action={cloneAction} className="flex items-center gap-1"><input type="hidden" name="templateId" value={template.id} /><input name="name" placeholder="New project name" className="w-32 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs" /><button type="submit" className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-neutral-700">Clone</button></form> : null}</div>) : <p className="rounded-2xl bg-neutral-50 p-4 text-xs text-neutral-500">No reusable templates yet.</p>}
        </div>
      </div>
    </section>
  );
}
