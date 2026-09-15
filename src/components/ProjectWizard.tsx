"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { MobilePreviewButton } from "@/components/MobilePreviewButton";

export type ProjectWizardAction = (formData: FormData) => void | Promise<void>;

const steps = [
  { id: "details", label: "Project details", hint: "Name, story & facilities" },
  { id: "materials", label: "Materials", hint: "Images, documents & media" },
  { id: "review", label: "Review & create", hint: "Check details and save" },
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

function normalizeProjectName(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function panelIndexForControl(control: DraftControl) {
  const panel = control.closest<HTMLElement>("[data-wizard-panel]");
  return panel ? steps.findIndex((step) => step.id === panel.dataset.wizardPanel) : -1;
}

function revealInvalidControl(control: DraftControl) {
  let parentDetails = control.closest("details");
  while (parentDetails) {
    parentDetails.open = true;
    parentDetails = parentDetails.parentElement?.closest("details") ?? null;
  }
}

function draftMatchesContext(rawDraft: string | null, draftContext: string | null) {
  if (!rawDraft) return true;
  try {
    const draft = JSON.parse(rawDraft) as Record<string, DraftValue | string | null>;
    const hasTemplateMarker = Object.prototype.hasOwnProperty.call(draft, "__templateId");
    const savedTemplateId = typeof draft.__templateId === "string" ? draft.__templateId : null;
    const contextMismatch = draftContext
      ? !hasTemplateMarker || savedTemplateId !== draftContext
      : hasTemplateMarker && Boolean(savedTemplateId);
    return !contextMismatch;
  } catch {
    return false;
  }
}

function panelChildren(children: ReactNode, activeStep: number) {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const panelId = (child.props as { [key: string]: unknown })["data-wizard-panel"];
    if (typeof panelId !== "string") return child;
    return cloneElement(child as ReactElement<{ hidden?: boolean }>, {
      hidden: panelId !== steps[activeStep].id,
    });
  });
}

export function ProjectWizard({
  action,
  children,
  developerId,
  existingProjectNames = [],
  draftContext = null,
}: {
  action: ProjectWizardAction;
  children: ReactNode;
  developerId: string;
  existingProjectNames?: string[];
  /** Optional template identity used to avoid restoring another template's draft over this one. */
  draftContext?: string | null;
}) {
  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [draftRestored, setDraftRestored] = useState(false);
  const [error, setError] = useState("");
  const [duplicateNameWarning, setDuplicateNameWarning] = useState(false);
  const [submitLocked, setSubmitLocked] = useState(false);
  const [draftContextConflict, setDraftContextConflict] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const draftKey = `${PROJECT_WIZARD_DRAFT_KEY}:${developerId}`;

  useEffect(() => {
    if (!draftMatchesContext(readLocalValue(draftKey), draftContext ?? null)) return;
    const savedStep = Number(readLocalValue(`${draftKey}:step`));
    if (!Number.isInteger(savedStep) || savedStep < 0 || savedStep >= steps.length) return;
    const restore = window.setTimeout(() => setActiveStep(savedStep), 0);
    return () => window.clearTimeout(restore);
  }, [draftContext, draftKey]);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const rawDraft = readLocalValue(draftKey);
    if (!rawDraft) return;
    try {
      const draft = JSON.parse(rawDraft) as Record<string, DraftValue | string | null>;
      if (!draftMatchesContext(rawDraft, draftContext ?? null)) {
        const restore = window.setTimeout(() => setDraftContextConflict(true), 0);
        return () => window.clearTimeout(restore);
      }
      let restored = false;
      for (const { control, key } of getDraftControls(form)) {
        const saved = draft[key] as DraftValue | undefined;
        if (!saved || typeof saved !== "object") continue;
        if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) {
          control.checked = Boolean(saved.checked);
        } else {
          control.value = saved.value;
        }
        restored = true;
      }
      const restore = window.setTimeout(() => {
        setDraftRestored(restored);
        setDraftContextConflict(false);
        form.dispatchEvent(new CustomEvent("project-wizard-sync", { detail: { reset: false } }));
      }, 0);
      return () => window.clearTimeout(restore);
    } catch {
      removeLocalValue(draftKey);
    }
  }, [draftContext, draftKey]);

  const persistDraft = () => {
    const form = formRef.current;
    if (!form) return;
    const draft: Record<string, DraftValue | string | null> = {};
    for (const { control, key } of getDraftControls(form)) {
      draft[key] = {
        value: control.value,
        ...(control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")
          ? { checked: control.checked }
          : {}),
      };
    }
    draft.__templateId = draftContext;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // Browser storage can be unavailable or full; the form remains usable.
    }
  };

  const checkDuplicateName = () => {
    const value = (formRef.current?.elements.namedItem("name") as HTMLInputElement | null)?.value ?? "";
    const normalizedName = normalizeProjectName(value);
    setDuplicateNameWarning(Boolean(normalizedName) && existingProjectNames.some((name) => normalizeProjectName(name) === normalizedName));
  };

  const focusInvalid = (control: DraftControl, message: string) => {
    setError(message);
    revealInvalidControl(control);
    const panelIndex = panelIndexForControl(control);
    if (panelIndex >= 0 && panelIndex !== activeStep) {
      setActiveStep(panelIndex);
      writeLocalValue(`${draftKey}:step`, String(panelIndex));
    }
    window.requestAnimationFrame(() => {
      control.focus({ preventScroll: true });
      control.reportValidity();
      control.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };

  const handleInput = (event: React.FormEvent<HTMLFormElement>) => {
    persistDraft();
    checkDuplicateName();
    const panel = (event.target as Element | null)?.closest<HTMLElement>("[data-wizard-panel]");
    const panelIndex = panel ? steps.findIndex((step) => step.id === panel.dataset.wizardPanel) : -1;
    if (!panel || panelIndex < 0) return;
    const controls = Array.from(panel.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea"));
    if (controls.some((control) => !control.checkValidity())) {
      setCompletedSteps((current) => current.filter((step) => step < panelIndex));
    }
  };

  const clearDraft = () => {
    removeLocalValue(draftKey);
    removeLocalValue(`${draftKey}:step`);
    formRef.current?.reset();
    setDraftRestored(false);
    setDuplicateNameWarning(false);
    setActiveStep(0);
    setCompletedSteps([]);
    setError("");
    setSubmitLocked(false);
    setDraftContextConflict(false);
    formRef.current?.dispatchEvent(new CustomEvent("project-wizard-sync", { detail: { reset: true } }));
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
      focusInvalid(invalidControl, "Fix the highlighted field before continuing.");
      return;
    }
    setError("");
    setCompletedSteps((current) => current.includes(activeStep) ? current : [...current, activeStep]);
    changeStep(activeStep + 1);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    if (submitLocked) {
      event.preventDefault();
      return;
    }
    persistDraft();
    const form = formRef.current;
    if (!form) return;
    const invalidControl = getDraftControls(form).find(({ control }) => !control.checkValidity())?.control;
    if (invalidControl) {
      event.preventDefault();
      focusInvalid(invalidControl, "Fix the highlighted field before creating the project.");
      return;
    }
    setSubmitLocked(true);
    removeLocalValue(`${draftKey}:step`);
  };

  const describedBy = [error ? "project-wizard-error" : null, duplicateNameWarning ? "project-wizard-duplicate" : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="project-wizard overflow-hidden rounded-3xl border border-black/5 bg-white shadow-[0_24px_80px_rgba(0,0,0,0.05)]" data-active-step={steps[activeStep].id}>
      <div className="border-b border-black/5 bg-neutral-50/70 p-3 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500">Project setup</p>
            <p className="mt-1 text-xs text-neutral-500">Text and links may be saved in this browser. Uploads are never saved.</p>
          </div>
          <div className="flex items-center gap-3">
            {draftRestored || draftContextConflict ? <button type="button" onClick={clearDraft} className="text-xs font-semibold text-neutral-500 underline underline-offset-2 hover:text-black">Clear saved details</button> : null}
            <span className="dashboard-number shrink-0 text-sm font-semibold text-neutral-900">{activeStep + 1} / {steps.length}</span>
          </div>
        </div>
        {draftRestored ? <p className="mt-2 text-xs text-neutral-500" role="status">Saved details were restored. Review them before creating; template values remain starting points.</p> : null}
        <ol className="mt-3 grid grid-cols-3 gap-1" aria-label="Project setup steps">
          {steps.map((step, index) => {
            const active = index === activeStep;
            const complete = completedSteps.includes(index);
            const locked = index > activeStep + 1 && !complete;
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (locked) return;
                    if (index === activeStep + 1 && !complete) {
                      moveForward();
                      return;
                    }
                    changeStep(index);
                  }}
                  disabled={locked}
                  aria-current={active ? "step" : undefined}
                  aria-label={`${index + 1} ${step.label}: ${step.hint}${locked ? " (complete earlier steps first)" : ""}`}
                  className={`w-full rounded-xl border px-2 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/60 sm:px-3 sm:text-left ${
                    active ? "border-black bg-black text-white" : "border-black/10 bg-white text-neutral-700 hover:border-black/30 disabled:cursor-not-allowed disabled:opacity-45"
                  }`}
                >
                  <span className="flex flex-col items-center justify-center gap-2 text-xs font-semibold sm:flex-row sm:justify-start">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${active ? "bg-white text-black" : complete ? "bg-black text-white" : "bg-neutral-200 text-neutral-600"}`}>
                      {complete ? "✓" : index + 1}
                    </span>
                    <span>{step.label}</span>
                  </span>
                  <span className={`mt-1 hidden truncate text-[11px] lg:block ${active ? "text-white/70" : "text-neutral-500"}`}>{step.hint}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {error ? <p id="project-wizard-error" role="alert" aria-live="assertive" className="mx-5 mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 sm:mx-7">{error}</p> : null}
      {duplicateNameWarning ? <p id="project-wizard-duplicate" role="status" className="mx-5 mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 sm:mx-7">A project with this name already exists. Choose a distinct name before saving.</p> : null}
      {draftContextConflict ? <p role="status" className="mx-5 mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 sm:mx-7">A saved draft from another template was kept aside. The selected template is shown as its own starting point.</p> : null}
      <form id="project-creator" ref={formRef} action={action} noValidate onSubmit={submit} onInput={handleInput} onChange={handleInput} aria-describedby={describedBy} className="space-y-4 p-5 sm:p-7">
        <div className="mx-auto max-w-4xl">{panelChildren(children, activeStep)}</div>
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
              <ProjectSubmitButton locked={submitLocked} onSettled={() => setSubmitLocked(false)} />
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

function ProjectSubmitButton({ locked, onSettled }: { locked: boolean; onSettled: () => void }) {
  const { pending } = useFormStatus();
  const previousPending = useRef(false);
  useEffect(() => {
    if (previousPending.current && !pending) onSettled();
    previousPending.current = pending;
  }, [onSettled, pending]);
  const disabled = pending || locked;
  return (
    <button type="submit" disabled={disabled} aria-busy={pending} className="min-h-11 rounded-full bg-black px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-60">
      {pending ? "Creating…" : locked ? "Saving…" : "Create project"}
    </button>
  );
}
