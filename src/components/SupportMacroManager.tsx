type SupportMacro = {
  id: string;
  title: string;
  message: string;
  category: string | null;
  is_active: boolean;
  revision: number;
  updated_at: string;
  is_demo: boolean;
};

type MacroAction = (formData: FormData) => void | Promise<void>;

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export function SupportMacroManager({
  macros,
  categories,
  updateAction,
  toggleAction,
}: {
  macros: SupportMacro[];
  categories: readonly string[];
  updateAction: MacroAction;
  toggleAction: MacroAction;
}) {
  return (
    <section className="rounded-3xl border border-black/5 bg-white p-5" aria-labelledby="support-macro-manager-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">Saved replies</p>
          <h3 id="support-macro-manager-heading" className="mt-1 text-lg font-semibold">Manage support macros</h3>
          <p className="mt-1 text-xs text-neutral-500">Edits create an auditable version. Deactivation is reversible and never deletes the macro.</p>
        </div>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">{macros.length} visible</span>
      </div>
      <div className="mt-4 space-y-3">
        {macros.map((macro) => {
          const category = macro.category ?? categories[0] ?? "other";
          return (
            <details key={macro.id} className="rounded-2xl border border-black/10 bg-neutral-50 p-3">
              <summary className="cursor-pointer list-inside list-disc text-sm font-semibold text-neutral-900">
                {macro.title} <span className="ml-1 text-xs font-normal text-neutral-500">· {category.replaceAll("_", " ")} · v{macro.revision} · {macro.is_active ? "Active" : "Inactive"}{macro.is_demo ? " · Demo" : ""}</span>
              </summary>
              <p className="mt-2 text-[11px] text-neutral-500">Updated {formatDate(macro.updated_at)}. The submitted reason is retained in macro history.</p>
              <form action={updateAction} className="mt-3 space-y-3 border-t border-black/10 pt-3">
                <input type="hidden" name="macroId" value={macro.id} />
                <input type="hidden" name="expectedRevision" value={macro.revision} />
                <label className="block text-xs font-semibold text-neutral-600">Title<input name="title" required maxLength={200} defaultValue={macro.title} className="mt-1 min-h-10 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-normal text-neutral-900" /></label>
                <label className="block text-xs font-semibold text-neutral-600">Category<select name="category" required defaultValue={category} className="mt-1 min-h-10 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-normal text-neutral-900">{categories.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select></label>
                <label className="block text-xs font-semibold text-neutral-600">Message<textarea name="message" required maxLength={20000} defaultValue={macro.message} className="mt-1 min-h-28 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-normal text-neutral-900" /></label>
                <label className="block text-xs font-semibold text-neutral-600">Edit reason<input name="reason" required minLength={3} maxLength={1000} placeholder="Why is this reply changing?" className="mt-1 min-h-10 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-normal text-neutral-900" /></label>
                <button type="submit" className="min-h-10 rounded-full bg-black px-4 py-2 text-xs font-semibold text-white">Save new version</button>
              </form>
              <form action={toggleAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-black/10 pt-3">
                <input type="hidden" name="macroId" value={macro.id} />
                <input type="hidden" name="expectedRevision" value={macro.revision} />
                <input type="hidden" name="active" value={macro.is_active ? "false" : "true"} />
                <label className="min-w-48 flex-1 text-xs font-semibold text-neutral-600">{macro.is_active ? "Deactivation reason" : "Activation reason"}<input name="reason" required minLength={3} maxLength={1000} placeholder={macro.is_active ? "Why pause this reply?" : "Why restore this reply?"} className="mt-1 min-h-10 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-normal text-neutral-900" /></label>
                <button type="submit" className={`min-h-10 rounded-full px-4 py-2 text-xs font-semibold ${macro.is_active ? "border border-rose-300 text-rose-800" : "bg-emerald-700 text-white"}`}>{macro.is_active ? "Deactivate macro" : "Activate macro"}</button>
              </form>
            </details>
          );
        })}
        {!macros.length ? <p className="rounded-2xl border border-dashed border-black/15 p-4 text-center text-sm text-neutral-500">No macros are visible for this role scope.</p> : null}
      </div>
    </section>
  );
}
