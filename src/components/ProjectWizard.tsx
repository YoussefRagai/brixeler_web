"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { MobilePreviewButton } from "@/components/MobilePreviewButton";

type WizardAction = (formData: FormData) => void | Promise<void>;

const steps = [
  { id: "basics", label: "Basics", hint: "Name, location & story" },
  { id: "commercial", label: "Commercial", hint: "Plans & pricing" },
  { id: "launch", label: "Launch", hint: "Types & timing" },
  { id: "media", label: "Media", hint: "Files & inventory" },
  { id: "amenities", label: "Amenities", hint: "Shared features" },
] as const;

export const PROJECT_WIZARD_DRAFT_KEY = "brixeler-project-wizard-draft-v1";

type DraftControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type DraftValue = { value: string; checked?: boolean };

function getDraftControls(form: HTMLFormElement) {
  const seen = new Map<string, number>();
  return Array.from(form.elements)
    .filter((control): control is DraftControl => {
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return false;
      if (!control.name || (control instanceof HTMLInputElement && ["file", "submit", "button", "reset"].includes(control.type))) return false;
      return true;
    })
    .map((control) => {
      const index = seen.get(control.name) ?? 0;
      seen.set(control.name, index + 1);
      return { control, key: `${control.name}:${index}` };
    });
}

function readLocalValue(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalValue(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Browser storage is optional; the wizard remains fully usable without it.
  }
}

function removeLocalValue(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Browser storage can be unavailable; clearing remains best effort.
  }
}

export function ProjectWizard({ action, children, developerId }: { action: WizardAction; children: ReactNode; developerId: string }) {
  const [activeStep, setActiveStep] = useState(0);
  const [draftRestored, setDraftRestored] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement | null>(null);
  const draftKey = `${PROJECT_WIZARD_DRAFT_KEY}:${developerId}`;

  useEffect(() => {
    const savedStep = Number(readLocalValue(`${draftKey}:step`));
    if (!Number.isInteger(savedStep) || savedStep < 0 || savedStep >= steps.length) return;
    const restore = window.setTimeout(() => setActiveStep(savedStep), 0);
    return () => window.clearTimeout(restore);
  }, [draftKey]);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const rawDraft = readLocalValue(draftKey);
    if (!rawDraft) return;
    try {
      const draft = JSON.parse(rawDraft) as Record<string, DraftValue>;
      let restored = false;
      for (const { control, key } of getDraftControls(form)) {
        const saved = draft[key];
        if (!saved) continue;
        if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) {
          control.checked = Boolean(saved.checked);
        } else {
          control.value = saved.value;
        }
        restored = true;
      }
      const restore = window.setTimeout(() => setDraftRestored(restored), 0);
      return () => window.clearTimeout(restore);
    } catch {
      removeLocalValue(draftKey);
    }
  }, [draftKey]);

  const persistDraft = () => {
    const form = formRef.current;
    if (!form) return;
    const draft: Record<string, DraftValue> = {};
    for (const { control, key } of getDraftControls(form)) {
      draft[key] = {
        value: control.value,
        ...(control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")
          ? { checked: control.checked }
          : {}),
      };
    }
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // Browser storage can be unavailable or full; the form remains usable.
    }
  };

  const clearDraft = () => {
    removeLocalValue(draftKey);
    removeLocalValue(`${draftKey}:step`);
    formRef.current?.reset();
    setDraftRestored(false);
    setActiveStep(0);
    setError("");
  };

  const changeStep = (nextStep: number) => {
    persistDraft();
    const boundedStep = Math.max(0, Math.min(nextStep, steps.length - 1));
    setActiveStep(boundedStep);
    writeLocalValue(`${draftKey}:step`, String(boundedStep));
    window.requestAnimationFrame(() => {
      document.querySelector(`[data-wizard-panel="${steps[boundedStep].id}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  };

  const moveForward = () => {
    const activePanel = formRef.current?.querySelector(`[data-wizard-panel="${steps[activeStep].id}"]`);
    const controls = Array.from(activePanel?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea") ?? []);
    const invalidControl = controls.find((control) => !control.checkValidity());
    if (invalidControl) {
      setError("Fix the highlighted field before continuing.");
      invalidControl.focus();
      invalidControl.reportValidity();
      return;
    }
    setError("");
    changeStep(activeStep + 1);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    persistDraft();
    const form = formRef.current;
    if (!form) return;
    const invalidControl = getDraftControls(form).find(({ control }) => !control.checkValidity())?.control;
    if (invalidControl) {
      event.preventDefault();
      setError("Fix the highlighted field before creating the project.");
      invalidControl.focus();
      invalidControl.reportValidity();
      return;
    }
    removeLocalValue(`${draftKey}:step`);
  };

  return (
    <div className="project-wizard overflow-hidden rounded-3xl border border-black/5 bg-white shadow-[0_24px_80px_rgba(0,0,0,0.05)]" data-active-step={steps[activeStep].id}>
      <div className="border-b border-black/5 bg-neutral-50/70 p-3 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500">Setup progress</p>
            <p className="mt-1 text-xs text-neutral-500">Details are saved in this browser only. Uploads are never saved.</p>
          </div>
          <div className="flex items-center gap-3">
            {draftRestored ? <button type="button" onClick={clearDraft} className="text-xs font-semibold text-neutral-500 underline underline-offset-2 hover:text-black">Clear saved details</button> : null}
            <span className="dashboard-number shrink-0 text-sm font-semibold text-neutral-900">{activeStep + 1} / {steps.length}</span>
          </div>
        </div>
        <ol className="mt-3 grid grid-cols-5 gap-1" aria-label="Project setup steps">
          {steps.map((step, index) => {
            const active = index === activeStep;
            const complete = index < activeStep;
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => changeStep(index)}
                  aria-current={active ? "step" : undefined}
                  className={`w-full rounded-xl border px-2 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/60 sm:px-3 sm:text-left ${
                    active ? "border-black bg-black text-white" : "border-black/10 bg-white text-neutral-700 hover:border-black/30"
                  }`}
                >
                  <span className="flex items-center justify-center gap-2 text-xs font-semibold sm:justify-start">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${active ? "bg-white text-black" : complete ? "bg-black text-white" : "bg-neutral-200 text-neutral-600"}`}>
                      {complete ? "✓" : index + 1}
                    </span>
                    <span className="hidden sm:inline">{step.label}</span>
                  </span>
                  <span className={`mt-1 hidden truncate text-[11px] lg:block ${active ? "text-white/70" : "text-neutral-500"}`}>{step.hint}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {error ? <p id="project-wizard-error" role="alert" aria-live="assertive" className="mx-5 mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 sm:mx-7">{error}</p> : null}
      <form id="project-creator" ref={formRef} action={action} onSubmit={submit} onInput={persistDraft} onChange={persistDraft} aria-describedby={error ? "project-wizard-error" : undefined} className="space-y-4 p-5 sm:p-7">
        <div className="mx-auto max-w-4xl">{children}</div>
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white/95 p-3 shadow-lg shadow-black/10 backdrop-blur">
          <button
            type="button"
            onClick={() => changeStep(activeStep - 1)}
            disabled={activeStep === 0}
            className="min-h-11 rounded-full border border-black/10 px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:border-black/30 hover:text-black disabled:opacity-40"
          >
            Back
          </button>
          <span className="hidden text-xs text-neutral-500 sm:block">Step {activeStep + 1}: {steps[activeStep].hint}</span>
          {activeStep < steps.length - 1 ? (
            <button type="button" onClick={moveForward} className="min-h-11 rounded-full bg-black px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800">
              Continue to {steps[activeStep + 1].label}
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <MobilePreviewButton formId="project-creator" titleField="name" bodyField="description" typeField="launchStatus" />
              <ProjectSubmitButton />
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

function ProjectSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className="min-h-11 rounded-full bg-black px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-60">
      {pending ? "Creating…" : "Create project"}
    </button>
  );
}
