"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MobilePreviewButton } from "@/components/MobilePreviewButton";

type WizardAction = (formData: FormData) => void | Promise<void>;

const steps = [
  { id: "basics", label: "Basics", hint: "Name, location & story" },
  { id: "commercial", label: "Commercial", hint: "Plans & pricing" },
  { id: "launch", label: "Launch", hint: "Types & timing" },
  { id: "media", label: "Media", hint: "Files & inventory" },
  { id: "amenities", label: "Amenities", hint: "Shared features" },
] as const;

export function ProjectWizard({ action, children }: { action: WizardAction; children: ReactNode }) {
  const [activeStep, setActiveStep] = useState(0);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    const savedStep = Number(window.localStorage.getItem("brixeler-project-wizard-step"));
    if (!Number.isInteger(savedStep) || savedStep < 0 || savedStep >= steps.length) return;
    const restore = window.setTimeout(() => setActiveStep(savedStep), 0);
    return () => window.clearTimeout(restore);
  }, []);

  const changeStep = (nextStep: number) => {
    const boundedStep = Math.max(0, Math.min(nextStep, steps.length - 1));
    setActiveStep(boundedStep);
    window.localStorage.setItem("brixeler-project-wizard-step", String(boundedStep));
    window.requestAnimationFrame(() => {
      document.querySelector(`[data-wizard-panel="${steps[boundedStep].id}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  };

  const moveForward = () => {
    const activePanel = formRef.current?.querySelector(`[data-wizard-panel="${steps[activeStep].id}"]`);
    const controls = Array.from(activePanel?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea") ?? []);
    const invalidControl = controls.find((control) => !control.checkValidity());
    if (invalidControl) {
      invalidControl.reportValidity();
      return;
    }
    changeStep(activeStep + 1);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    if (!formRef.current?.reportValidity()) {
      event.preventDefault();
      return;
    }
    window.localStorage.removeItem("brixeler-project-wizard-step");
  };

  return (
    <div className="project-wizard" data-active-step={steps[activeStep].id}>
      <div className="mb-5 rounded-2xl border border-black/10 bg-neutral-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500">Setup progress</p>
            <p className="mt-1 text-sm text-neutral-600">Your current step is remembered in this browser while you work.</p>
          </div>
          <span className="dashboard-number shrink-0 text-sm font-semibold text-neutral-900">{activeStep + 1} / {steps.length}</span>
        </div>
        <ol className="mt-4 grid gap-2 sm:grid-cols-5" aria-label="Project setup steps">
          {steps.map((step, index) => {
            const active = index === activeStep;
            const complete = index < activeStep;
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => changeStep(index)}
                  aria-current={active ? "step" : undefined}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/60 ${
                    active ? "border-black bg-black text-white" : "border-black/10 bg-white text-neutral-700 hover:border-black/30"
                  }`}
                >
                  <span className="flex items-center gap-2 text-xs font-semibold">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${active ? "bg-white text-black" : complete ? "bg-black text-white" : "bg-neutral-200 text-neutral-600"}`}>
                      {complete ? "✓" : index + 1}
                    </span>
                    {step.label}
                  </span>
                  <span className={`mt-1 block truncate text-[11px] ${active ? "text-white/70" : "text-neutral-500"}`}>{step.hint}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <form id="project-creator" ref={formRef} action={action} encType="multipart/form-data" onSubmit={submit} className="space-y-4">
        {children}
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
              <button type="submit" className="min-h-11 rounded-full bg-black px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800">
                Create project
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
