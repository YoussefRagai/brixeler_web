"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowLeft, ArrowRight, Building2, Check, ImageIcon, Landmark, MapPin, Plus, WalletCards } from "lucide-react";
import { MobilePreviewButton } from "@/components/MobilePreviewButton";
import { DeveloperMediaField } from "@/components/DeveloperMediaField";

type ProjectPhase = { id: string; name: string; phase_order: number; archived_at?: string | null; lifecycle_state?: string | null };
type Project = { id: string; name: string; location?: string | null; phases?: ProjectPhase[] };
type ExistingListing = { name: string; price: number; unit_area?: number | null; project_id?: string | null; phase_id?: string | null };
type WizardAction = (formData: FormData) => void | Promise<void>;

const steps = [
  { label: "Project", icon: Building2 },
  { label: "Unit", icon: Landmark },
  { label: "Payment", icon: WalletCards },
  { label: "Media", icon: ImageIcon },
];

const inputClass = "min-h-12 rounded-2xl border border-black/10 bg-neutral-50 px-4 text-sm outline-none transition focus:border-black/30 focus:bg-white focus:ring-4 focus:ring-black/[0.04]";
export const DEVELOPER_LISTING_DRAFT_KEY = "brixeler-developer-listing-draft-v1";

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

function readDraft(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function removeDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Browser storage can be unavailable; clearing remains best effort.
  }
}

export function DeveloperListingWizard({
  action,
  projects,
  developerId,
  preselectedProjectId,
  preselectedSaleType,
  emphasizeCreateProject,
  existingListings = [],
}: {
  action: WizardAction;
  projects: Project[];
  developerId: string;
  preselectedProjectId: string;
  preselectedSaleType: string;
  emphasizeCreateProject: boolean;
  existingListings?: ExistingListing[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [projectMode, setProjectMode] = useState<"existing" | "new">(emphasizeCreateProject || !projects.length ? "new" : "existing");
  const [selectedProjectId, setSelectedProjectId] = useState(preselectedProjectId);
  const [selectedPhaseId, setSelectedPhaseId] = useState(() => {
    const project = projects.find((candidate) => candidate.id === preselectedProjectId);
    return [...(project?.phases ?? [])]
      .filter((phase) => !phase.archived_at && phase.lifecycle_state !== "archived")
      .sort((a, b) => a.phase_order - b.phase_order)[0]?.id ?? "";
  });
  const [error, setError] = useState("");
  const [draftRestored, setDraftRestored] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const draftKey = `${DEVELOPER_LISTING_DRAFT_KEY}:${developerId}:${preselectedSaleType}`;

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const rawDraft = readDraft(draftKey);
    if (!rawDraft) return;
    try {
      const draft = JSON.parse(rawDraft) as Record<string, DraftValue>;
      const savedProjectMode = draft.__projectMode?.value === "existing" || draft.__projectMode?.value === "new"
        ? draft.__projectMode.value
        : null;
      const restore = window.setTimeout(() => {
        if (savedProjectMode) setProjectMode(savedProjectMode);
          window.requestAnimationFrame(() => {
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
            const restoredProjectId = (form.elements.namedItem("projectId") as HTMLSelectElement | null)?.value ?? "";
            const restoredProject = projects.find((project) => project.id === restoredProjectId);
            const restoredPhaseId = (form.elements.namedItem("phaseId") as HTMLSelectElement | null)?.value ?? "";
            const restoredPhaseIsActive = restoredProject?.phases?.some((phase) => phase.id === restoredPhaseId && !phase.archived_at && phase.lifecycle_state !== "archived");
            const fallbackPhaseId = [...(restoredProject?.phases ?? [])]
              .filter((phase) => !phase.archived_at && phase.lifecycle_state !== "archived")
              .sort((a, b) => a.phase_order - b.phase_order)[0]?.id ?? "";
            setSelectedProjectId(restoredProjectId);
            setSelectedPhaseId(restoredPhaseIsActive ? restoredPhaseId : fallbackPhaseId);
            setDraftRestored(restored);
          });
      }, 0);
      return () => window.clearTimeout(restore);
    } catch {
      removeDraft(draftKey);
    }
  }, [draftKey, projects]);

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
    draft.__projectMode = { value: projectMode };
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // Browser storage can be unavailable or full; the form remains usable.
    }
  };

  const clearDraft = () => {
    removeDraft(draftKey);
    formRef.current?.reset();
    setSelectedProjectId(preselectedProjectId);
    const project = projects.find((candidate) => candidate.id === preselectedProjectId);
    setSelectedPhaseId(
      [...(project?.phases ?? [])]
        .filter((phase) => !phase.archived_at && phase.lifecycle_state !== "archived")
        .sort((a, b) => a.phase_order - b.phase_order)[0]?.id ?? "",
    );
    setDraftRestored(false);
    setError("");
    setDuplicateWarning(false);
  };

  const checkDuplicate = () => {
    if (projectMode !== "existing") {
      setDuplicateWarning(false);
      return;
    }
    const form = formRef.current;
    const name = (form?.elements.namedItem("name") as HTMLInputElement | null)?.value.trim() ?? "";
    const projectId = (form?.elements.namedItem("projectId") as HTMLSelectElement | null)?.value ?? "";
    const phaseId = (form?.elements.namedItem("phaseId") as HTMLSelectElement | null)?.value ?? "";
    const price = Number((form?.elements.namedItem("price") as HTMLInputElement | null)?.value ?? NaN);
    const unitArea = Number((form?.elements.namedItem("unitArea") as HTMLInputElement | null)?.value ?? NaN);
    const normalizedName = name.toLocaleLowerCase().replace(/\s+/g, " ");
    setDuplicateWarning(Boolean(normalizedName && projectId && phaseId && Number.isFinite(price) && Number.isFinite(unitArea) && existingListings.some((listing) => listing.project_id === projectId && listing.phase_id === phaseId && listing.price === price && listing.unit_area === unitArea && listing.name.trim().toLocaleLowerCase().replace(/\s+/g, " ") === normalizedName)));
  };

  const handleInput = () => {
    persistDraft();
    checkDuplicate();
  };

  function advance() {
    const form = formRef.current;
    if (!form) return;
    const activePanel = form.querySelector<HTMLElement>(`section:not([hidden])`);
    const invalidControl = Array.from(activePanel?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea") ?? []).find((control) => !control.checkValidity());
    if (invalidControl) {
      setError("Fix the highlighted field before continuing.");
      invalidControl.focus();
      invalidControl.reportValidity();
      return;
    }
    const requiredByStep: string[][] = [
      projectMode === "existing" ? ["projectId", "phaseId"] : ["createProjectName", "createProjectLocation"],
      ["name", "price", "propertyType", "bedrooms", "bathrooms", "unitArea", "description"],
      ["downPayment", "installmentYears", "finishingStatus"],
    ];
    const missing = (requiredByStep[step] ?? []).find((name) => {
      const field = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
      return !field?.value.trim();
    });
    if (missing) {
      setError("Complete the highlighted step before continuing.");
      const field = form.elements.namedItem(missing) as HTMLElement | null;
      field?.focus();
      return;
    }
    setError("");
    setStep((current) => Math.min(current + 1, steps.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function validateSubmission(event: React.FormEvent<HTMLFormElement>) {
    const form = formRef.current;
    if (!form) return;
    const invalidControl = Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")).find((control) => !control.checkValidity());
    if (invalidControl) {
      event.preventDefault();
      setError("Fix the highlighted field before submitting for review.");
      invalidControl.focus();
      invalidControl.reportValidity();
      return;
    }
    const urls = (form.elements.namedItem("photoUrls") as HTMLTextAreaElement | null)?.value
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean).length ?? 0;
    const files = (form.elements.namedItem("photoFiles") as HTMLInputElement | null)?.files?.length ?? 0;
    if (urls + files >= 3) return;
    event.preventDefault();
    setStep(3);
    setError("Add at least three property photos before submitting.");
    window.requestAnimationFrame(() => (form.elements.namedItem("photoFiles") as HTMLElement | null)?.focus());
  }

  return (
    <form id="developer-listing-creator" ref={formRef} action={action} onSubmit={(event) => { persistDraft(); validateSubmission(event); }} onInput={handleInput} onChange={handleInput} aria-describedby={error ? "listing-wizard-error" : duplicateWarning ? "listing-wizard-duplicate" : undefined} className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-black/5 bg-white shadow-[0_24px_80px_rgba(0,0,0,0.05)]">
      <input type="hidden" name="saleType" value={preselectedSaleType} />
      <div className="border-b border-black/5 bg-neutral-50/70 px-4 py-3 sm:px-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs text-neutral-500">Details are saved in this browser only. Uploads are never saved.</p>
          {draftRestored ? <button type="button" onClick={clearDraft} className="shrink-0 text-xs font-semibold text-neutral-500 underline underline-offset-2 hover:text-black">Clear saved details</button> : null}
        </div>
        <ol className="grid grid-cols-4 gap-1" aria-label="Listing progress">
          {steps.map((item, index) => {
            const Icon = item.icon;
            return (
              <li key={item.label} aria-current={index === step ? "step" : undefined} className={`flex min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-2 text-xs font-semibold sm:justify-start sm:px-3 ${index === step ? "bg-white text-black shadow-sm ring-1 ring-black/5" : index < step ? "text-emerald-700" : "text-neutral-400"}`}>
                <span className={`grid size-7 shrink-0 place-items-center rounded-full ${index < step ? "bg-emerald-100" : index === step ? "bg-black text-white" : "bg-black/5"}`}>
                  {index < step ? <Check aria-hidden="true" size={14} /> : <Icon aria-hidden="true" size={14} />}
                </span>
                <span className="hidden truncate sm:block">{item.label}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="p-5 sm:p-7 lg:p-8">
        <header className="mb-7">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">Step {step + 1} of {steps.length}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-black">{stepTitle(step)}</h2>
          <p className="mt-1 text-sm text-neutral-500">{stepDescription(step)}</p>
        </header>

        {error ? <p id="listing-wizard-error" role="alert" aria-live="assertive" className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p> : null}
        {duplicateWarning ? <p id="listing-wizard-duplicate" role="status" className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">A matching developer resale already exists for this project, price, and area. Review the existing record before submitting another.</p> : null}

        <section hidden={step !== 0} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setProjectMode("existing")} className={`min-h-24 rounded-2xl border p-4 text-left transition ${projectMode === "existing" ? "border-black bg-black text-white" : "border-black/10 bg-neutral-50 hover:border-black/25"}`}>
              <span className="flex items-center gap-2 text-sm font-semibold"><Building2 size={17} /> Existing project</span>
              <span className={`mt-1 block text-xs ${projectMode === "existing" ? "text-white/65" : "text-neutral-500"}`}>Connect this unit to a project already in your workspace.</span>
            </button>
            <button type="button" onClick={() => setProjectMode("new")} className={`min-h-24 rounded-2xl border p-4 text-left transition ${projectMode === "new" ? "border-black bg-black text-white" : "border-black/10 bg-neutral-50 hover:border-black/25"}`}>
              <span className="flex items-center gap-2 text-sm font-semibold"><Plus size={17} /> New project</span>
              <span className={`mt-1 block text-xs ${projectMode === "new" ? "text-white/65" : "text-neutral-500"}`}>Create the project shell without leaving this flow.</span>
            </button>
          </div>
          {projectMode === "existing" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Choose project"><select className={inputClass} name="projectId" value={selectedProjectId} disabled={projectMode !== "existing"} onChange={(event) => {
                const nextProjectId = event.target.value;
                const nextProject = projects.find((project) => project.id === nextProjectId);
                const nextPhaseId = [...(nextProject?.phases ?? [])]
                  .filter((phase) => !phase.archived_at && phase.lifecycle_state !== "archived")
                  .sort((a, b) => a.phase_order - b.phase_order)[0]?.id ?? "";
                setSelectedProjectId(nextProjectId);
                setSelectedPhaseId(nextPhaseId);
                handleInput();
              }}><option value="">Select a project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}{project.location ? ` · ${project.location}` : ""}</option>)}</select></Field>
              {(() => {
                const selectedProject = projects.find((project) => project.id === selectedProjectId);
                const phases = [...(selectedProject?.phases ?? [])]
                  .filter((phase) => !phase.archived_at && phase.lifecycle_state !== "archived")
                  .sort((a, b) => a.phase_order - b.phase_order);
                return phases.length ? (
                  <Field label="Release phase"><select className={inputClass} name="phaseId" value={selectedPhaseId} onChange={(event) => { setSelectedPhaseId(event.target.value); handleInput(); }} required disabled={projectMode !== "existing"}><option value="">Choose a release phase</option>{phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.phase_order}. {phase.name}</option>)}</select></Field>
                ) : <p className="self-end rounded-2xl border border-dashed border-black/15 bg-neutral-50 p-3 text-xs text-neutral-500">This project has no active phase. Add one in the project portal before linking inventory.</p>;
              })()}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Project name" name="createProjectName" placeholder="Palm Gardens Residences" />
              <TextField label="Location" name="createProjectLocation" placeholder="New Cairo" icon={<MapPin size={16} />} />
              <Field label="Short project description" className="sm:col-span-2"><textarea className={`${inputClass} min-h-24 py-3`} name="createProjectDescription" placeholder="A short description for agents browsing the project." /></Field>
            </div>
          )}
        </section>

        <section hidden={step !== 1} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2"><TextField label="Listing title" name="name" placeholder="Palm Gardens · Unit B12" required /><TextField label="Area / location" name="area" placeholder="New Cairo · Golden Square" /></div>
          <div className="grid gap-4 sm:grid-cols-2"><TextField label="Price (EGP)" name="price" type="number" min="100000" placeholder="8500000" required /><SelectField label="Property type" name="propertyType" options={["apartment", "villa", "townhouse", "penthouse", "duplex"]} required /></div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3"><TextField label="Bedrooms" name="bedrooms" type="number" min="0" step="1" placeholder="3" required /><TextField label="Bathrooms" name="bathrooms" type="number" min="0" step="1" placeholder="2" required /><TextField label="Area (m²)" name="unitArea" type="number" min="10" step="1" placeholder="180" className="col-span-2 sm:col-span-1" required /></div>
          <Field label="Unit description"><textarea className={`${inputClass} min-h-28 py-3`} name="description" placeholder="The details an agent needs to understand and pitch this unit." required /></Field>
        </section>

        <section hidden={step !== 2} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3"><TextField label="Down payment (%)" name="downPayment" type="number" min="0" max="100" placeholder="10" /><TextField label="Installment years" name="installmentYears" type="number" min="1" step="1" placeholder="8" /><TextField label="Monthly installment" name="monthlyInstallment" type="number" min="0" placeholder="Optional" /></div>
          <div className="grid gap-4 sm:grid-cols-2"><TextField label="Delivery date" name="deliveryDate" type="date" /><SelectField label="Finishing" name="finishingStatus" options={["finished", "semi_finished", "core_and_shell", "furnished"]} labels={{ finished: "Fully finished", semi_finished: "Semi finished", core_and_shell: "Core & shell", furnished: "Furnished" }} /></div>
          <Field label="Amenities"><textarea className={`${inputClass} min-h-24 py-3`} name="amenities" placeholder="Clubhouse, pool, concierge — separated by commas" /></Field>
        </section>

        <section hidden={step !== 3} className="space-y-5">
          <DeveloperMediaField label="Property photos" description="Add at least three clear property images by dropping files, browsing, or pasting URLs." fileName="photoFiles" urlName="photoUrls" accept="image/*" multiple required />
          <div className="grid gap-4 sm:grid-cols-2">
            <DeveloperMediaField label="Brochure / floor plan" fileName="brochureFile" urlName="brochureUrl" accept="application/pdf,image/*,.xlsx" />
            <DeveloperMediaField label="Video tour" fileName="videoFile" urlName="videoUrl" accept="video/*" />
          </div>
          <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800"><p className="font-semibold">Final review</p><p className="mt-1 text-xs text-emerald-700">Submitting creates a developer-owned resale. It remains pending until the Brixeler team approves it; approval and mobile publication are separate from the launch label.</p><ul className="mt-3 space-y-1 text-xs text-emerald-700"><li>✓ Project ownership and linked project are checked on submit.</li><li>✓ Pricing, area, payment terms, and description are validated.</li><li>✓ Three unique property photos are required before review.</li><li>✓ Publication remains controlled by the Brixeler review workflow.</li></ul></div>
        </section>
      </div>

      <footer className="flex items-center justify-between border-t border-black/5 bg-neutral-50/60 px-5 py-4 sm:px-8">
        <button type="button" onClick={() => setStep((current) => Math.max(current - 1, 0))} disabled={step === 0} className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-neutral-600 disabled:invisible"><ArrowLeft size={16} /> Back</button>
        {step < steps.length - 1 ? <button type="button" onClick={advance} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-black px-5 text-sm font-semibold text-white">Continue <ArrowRight aria-hidden="true" size={16} /></button> : <div className="flex flex-wrap items-center justify-end gap-2"><MobilePreviewButton formId="developer-listing-creator" titleField="name" bodyField="description" typeField="propertyType" label="Preview mobile" /><ListingSubmitButton /></div>}
      </footer>
    </form>
  );
}

function ListingSubmitButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} aria-busy={pending} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-black px-5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60">{pending ? "Submitting…" : "Submit for review"} <ArrowRight aria-hidden="true" size={16} /></button>;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) { return <label className={`flex flex-col gap-1.5 text-sm ${className}`}><span className="text-xs font-semibold text-neutral-600">{label}</span>{children}</label>; }
function TextField({ label, className = "", icon, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; className?: string; icon?: React.ReactNode }) { return <Field label={label} className={className}><span className="relative flex">{icon ? <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400">{icon}</span> : null}<input className={`${inputClass} w-full ${icon ? "pl-11" : ""}`} {...props} /></span></Field>; }
function SelectField({ label, options, labels = {}, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: string[]; labels?: Record<string, string> }) { return <Field label={label}><select className={inputClass} {...props}>{options.map((option) => <option key={option} value={option}>{labels[option] ?? option.replaceAll("_", " ")}</option>)}</select></Field>; }
function stepTitle(step: number) { return ["Where does this resale belong?", "Describe the unit", "Set the commercial terms", "Add media and submit"][step]; }
function stepDescription(step: number) { return ["Use an existing project or create a lightweight project record now.", "Keep the information focused on what agents need to sell it.", "Add the payment and delivery details shown in the mobile app.", "Strong media helps the Brixeler team approve and publish it faster."][step]; }
