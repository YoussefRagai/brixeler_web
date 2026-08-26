"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  formId: string;
  titleField: string;
  bodyField: string;
  typeField?: string;
  label?: string;
};

export function MobilePreviewButton({ formId, titleField, bodyField, typeField, label = "Preview in mobile" }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ title: "Preview", body: "Your update will appear here.", type: "Announcement" });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const closePreview = () => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const openPreview = () => {
    const form = document.getElementById(formId);
    const read = (name: string) => (form?.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null)?.value.trim() ?? "";
    setDraft({ title: read(titleField) || "Preview", body: read(bodyField) || "Your update will appear here.", type: typeField ? read(typeField).replaceAll("_", " ") || "Announcement" : "Announcement" });
    setOpen(true);
  };

  return (
    <>
      <button ref={triggerRef} type="button" onClick={openPreview} className="min-h-11 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition-colors hover:border-black/30 hover:bg-neutral-50">
        {label}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) closePreview(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby={`${formId}-preview-title`} className="w-full max-w-sm rounded-[2rem] border border-black/10 bg-neutral-100 p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3 px-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-neutral-500">Mobile preview</p>
                <h2 id={`${formId}-preview-title`} className="text-lg font-semibold text-neutral-950">How agents will see this</h2>
              </div>
              <button ref={closeRef} type="button" onClick={closePreview} aria-label="Close mobile preview" className="rounded-full border border-black/10 bg-white px-3 py-1 text-sm text-neutral-700 hover:border-black/30">×</button>
            </div>
            <div className="mx-auto mt-4 max-w-[280px] rounded-[2rem] border-[7px] border-neutral-900 bg-white p-3 shadow-xl">
              <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-neutral-800" aria-hidden="true" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">{draft.type}</p>
              <h3 className="mt-2 break-words text-xl font-semibold text-neutral-950">{draft.title}</h3>
              <p className="mt-3 break-words text-sm leading-6 text-neutral-600">{draft.body}</p>
              <div className="mt-6 rounded-xl bg-neutral-100 px-3 py-2 text-center text-xs font-semibold text-neutral-700">Open in Brixeler</div>
            </div>
            <p className="mt-4 text-center text-xs text-neutral-500">This is a local preview. Publishing still uses the existing server action.</p>
          </section>
        </div>
      ) : null}
    </>
  );
}
