"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

type Props = {
  formId: string;
  titleField: string;
  bodyField: string;
  typeField?: string;
  titleArField?: string;
  bodyArField?: string;
  actionField?: string;
  label?: string;
};

type PreviewDraft = {
  title: string;
  body: string;
  titleAr: string;
  bodyAr: string;
  type: string;
  destination: string;
};

export function MobilePreviewButton({
  formId,
  titleField,
  bodyField,
  typeField,
  titleArField,
  bodyArField,
  actionField,
  label = "Preview in mobile",
}: Props) {
  const [open, setOpen] = useState(false);
  const [locale, setLocale] = useState<"en" | "ar">("en");
  const [draft, setDraft] = useState<PreviewDraft>({
    title: "Preview",
    body: "Your update will appear here.",
    titleAr: "",
    bodyAr: "",
    type: "Announcement",
    destination: "Home",
  });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const readDraft = useCallback(() => {
    const form = document.getElementById(formId);
    const read = (name?: string) => {
      if (!name) return "";
      return (form?.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null)?.value.trim() ?? "";
    };
    setDraft({
      title: read(titleField) || "Preview",
      body: read(bodyField) || "Your update will appear here.",
      titleAr: read(titleArField),
      bodyAr: read(bodyArField),
      type: typeField ? read(typeField).replaceAll("_", " ") || "Announcement" : "Announcement",
      destination: actionField ? read(actionField) || "/" : "Home",
    });
  }, [actionField, bodyArField, bodyField, formId, titleArField, titleField, typeField]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const form = document.getElementById(formId);
    const handleFormChange = () => readDraft();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
    form?.addEventListener("input", handleFormChange);
    form?.addEventListener("change", handleFormChange);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      form?.removeEventListener("input", handleFormChange);
      form?.removeEventListener("change", handleFormChange);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [formId, open, readDraft]);

  const closePreview = () => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const openPreview = () => {
    readDraft();
    setOpen(true);
  };

  const useArabic = locale === "ar";
  const visibleTitle = useArabic ? draft.titleAr || draft.title : draft.title;
  const visibleBody = useArabic ? draft.bodyAr || draft.body : draft.body;
  const destinationLabel = draft.destination === "/" ? "Home" : draft.destination.replace(/^\//, "").replaceAll("-", " ");

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
              <button ref={closeRef} type="button" onClick={closePreview} aria-label="Close mobile preview" className="grid h-9 w-9 place-items-center rounded-full border border-black/10 bg-white text-neutral-700 hover:border-black/30"><X aria-hidden="true" size={16} /></button>
            </div>
            <div className="mt-3 flex justify-center" aria-label="Preview language">
              <div className="inline-flex rounded-full border border-black/10 bg-white p-1">
                <button type="button" onClick={() => setLocale("en")} aria-pressed={locale === "en"} className={`rounded-full px-3 py-1 text-xs font-semibold ${locale === "en" ? "bg-black text-white" : "text-neutral-600"}`}>English</button>
                <button type="button" onClick={() => setLocale("ar")} aria-pressed={locale === "ar"} className={`rounded-full px-3 py-1 text-xs font-semibold ${locale === "ar" ? "bg-black text-white" : "text-neutral-600"}`}>العربية</button>
              </div>
            </div>
            <div className="mx-auto mt-4 max-w-[280px] rounded-[2rem] border-[7px] border-neutral-900 bg-white p-3 shadow-xl">
              <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-neutral-800" aria-hidden="true" />
              <div dir={useArabic ? "rtl" : "ltr"} className={useArabic ? "text-right" : "text-left"}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">{draft.type}</p>
                <h3 className="mt-2 break-words text-xl font-semibold text-neutral-950">{visibleTitle}</h3>
                <p className="mt-3 break-words text-sm leading-6 text-neutral-600">{visibleBody}</p>
              </div>
              <div className="mt-6 rounded-xl bg-neutral-100 px-3 py-2 text-center text-xs font-semibold capitalize text-neutral-700">Open {destinationLabel} in Brixeler</div>
            </div>
            <p className="mt-4 text-center text-xs text-neutral-500">The preview updates while you edit. Verify both languages before publishing.</p>
          </section>
        </div>
      ) : null}
    </>
  );
}
