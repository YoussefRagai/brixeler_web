"use client";

import { Check, LoaderCircle } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { DeveloperMediaField } from "@/components/DeveloperMediaField";
import { DeveloperPhaseMerchandisingFields } from "@/components/DeveloperPhaseMerchandisingFields";
import type { DeveloperProjectPhase } from "@/lib/developerQueries";

export type DeveloperPhaseAction = (formData: FormData) => void | Promise<void>;

type PhaseFormDisclosureProps = {
  id: string;
  initialOpen?: boolean;
  className?: string;
  children: ReactNode;
};

type PhaseFormTriggerProps = {
  targetId: string;
  initialOpen?: boolean;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
};

const eventName = (kind: "open" | "close", id: string) => `brixeler:phase-form:${kind}:${id}`;

function emitFormEvent(kind: "open" | "close", id: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(eventName(kind, id)));
}

const PhaseFormCloseContext = createContext<(() => void) | null>(null);

export function DeveloperPhaseFormTrigger({
  targetId,
  initialOpen = false,
  className,
  children,
  ariaLabel,
}: PhaseFormTriggerProps) {
  const [expanded, setExpanded] = useState(initialOpen);

  useEffect(() => {
    const handleOpen = () => setExpanded(true);
    const handleClose = () => setExpanded(false);
    window.addEventListener(eventName("open", targetId), handleOpen);
    window.addEventListener(eventName("close", targetId), handleClose);
    return () => {
      window.removeEventListener(eventName("open", targetId), handleOpen);
      window.removeEventListener(eventName("close", targetId), handleClose);
    };
  }, [targetId]);

  return (
    <button
      type="button"
      className={className}
      aria-controls={targetId}
      aria-expanded={expanded}
      aria-label={ariaLabel ? (expanded ? ariaLabel.replace(/^Open /, "Close ") : ariaLabel) : undefined}
      data-phase-form-trigger={targetId}
      onClick={() => {
        if (expanded) {
          if (document.getElementById(targetId)?.querySelector("[aria-busy=\"true\"]")) return;
          emitFormEvent("close", targetId);
          return;
        }
        emitFormEvent("open", targetId);
      }}
    >
      {children}
    </button>
  );
}

export function DeveloperPhaseFormDisclosure({
  id,
  initialOpen = false,
  className,
  children,
}: PhaseFormDisclosureProps) {
  const [open, setOpen] = useState(initialOpen);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(initialOpen);

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    const handleClose = () => setOpen(false);
    window.addEventListener(eventName("open", id), handleOpen);
    window.addEventListener(eventName("close", id), handleClose);
    return () => {
      window.removeEventListener(eventName("open", id), handleOpen);
      window.removeEventListener(eventName("close", id), handleClose);
    };
  }, [id]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        const focusTarget = panelRef.current?.querySelector<HTMLElement>("[data-phase-form-focus]");
        focusTarget?.focus({ preventScroll: true });
      });
    } else if (wasOpen.current) {
      document.querySelector<HTMLElement>(`[data-phase-form-trigger="${id}"]`)?.focus();
    }
    wasOpen.current = open;
  }, [id, open]);

  const closeForm = () => {
    setOpen(false);
    emitFormEvent("close", id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    if (event.currentTarget.querySelector("[aria-busy=\"true\"]")) return;
    closeForm();
  };

  return (
    <div
      id={id}
      ref={panelRef}
      className={className}
      hidden={!open}
      onKeyDown={handleKeyDown}
    >
      <PhaseFormCloseContext.Provider value={closeForm}>{children}</PhaseFormCloseContext.Provider>
    </div>
  );
}

export function DeveloperPhaseFormCancelButton({
  children = "Cancel",
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const closeForm = useContext(PhaseFormCloseContext);
  const { pending } = useFormStatus();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() => {
        closeForm?.();
      }}
    >
      {children}
    </button>
  );
}

export function DeveloperPhaseFormSubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? <><LoaderCircle aria-hidden="true" size={14} className="animate-spin" /> {pendingLabel}</> : children}
    </button>
  );
}

type DeveloperPhaseFormProps = {
  projectId: string;
  action: DeveloperPhaseAction;
  mode: "create" | "edit";
  defaultOrder?: number;
  phase?: DeveloperProjectPhase;
  statusLabel?: string;
  statusTone?: string;
};

function phaseHeroImage(phase?: DeveloperProjectPhase) {
  const media = phase?.hero_media;
  if (!media || typeof media !== "object") return "";
  const candidate = media.heroImageUrl ?? media.hero_image_url;
  return typeof candidate === "string" ? candidate : "";
}

export function DeveloperPhaseForm({
  projectId,
  action,
  mode,
  defaultOrder = 1,
  phase,
  statusLabel,
  statusTone,
}: DeveloperPhaseFormProps) {
  const editing = mode === "edit";
  const currentHero = phaseHeroImage(phase);

  return (
    <form
      action={action}
      className="space-y-4 rounded-2xl border border-black/10 bg-neutral-50 p-4 sm:p-5"
      onInvalid={(event) => {
        const target = event.target as HTMLElement;
        const details = target.closest("details");
        if (details instanceof HTMLDetailsElement) details.open = true;
        requestAnimationFrame(() => target.focus({ preventScroll: false }));
      }}
    >
      <input type="hidden" name="projectId" value={projectId} />
      {editing && phase ? <input type="hidden" name="phaseId" value={phase.id} /> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-neutral-500">{editing ? "Edit release phase" : "New release phase"}</p>
          <p className="mt-1 text-sm leading-5 text-neutral-600">{editing ? "Update the release details before sending the project back for review." : "Start with the release basics. You can add facilities and media when ready."}</p>
        </div>
        {statusLabel && statusTone ? <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusTone}`}>{statusLabel}</span> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Phase name <span aria-hidden="true">*</span></span>
          <input data-phase-form-focus className="min-h-10 rounded-xl border border-black/10 bg-white px-3" name="phaseName" required maxLength={160} defaultValue={phase?.name ?? ""} placeholder="Phase 2 · Garden collection" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Order <span aria-hidden="true">*</span></span>
          <input className="min-h-10 rounded-xl border border-black/10 bg-white px-3" name="phaseOrder" type="number" min="1" step="1" required defaultValue={phase?.phase_order ?? defaultOrder} />
        </label>
      </div>

      <fieldset className="rounded-xl border border-black/10 bg-white/70 p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Optional timing & sales</legend>
        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-neutral-700">Launch status</span>
            <select className="min-h-10 rounded-xl border border-black/10 bg-white px-3" name="phaseLaunchStatus" defaultValue={phase?.launch_status ?? "upcoming"}>
              <option value="upcoming">Upcoming</option>
              <option value="new_launch">New release</option>
              <option value="live">Live release</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-neutral-700">Launch date</span>
            <input className="min-h-10 rounded-xl border border-black/10 bg-white px-3" name="phaseLaunchDate" type="date" defaultValue={phase?.launch_date?.slice(0, 10) ?? ""} />
          </label>
        </div>
      </fieldset>

      <DeveloperPhaseMerchandisingFields phase={phase} compact />

      <details className="rounded-xl border border-black/10 bg-white/70 p-3">
        <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.2em] text-neutral-600">Optional copy & media</summary>
        <div className="mt-3 space-y-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-neutral-700">Phase brief</span>
            <textarea className="min-h-20 rounded-xl border border-black/10 bg-white px-3 py-2" name="phaseDescription" maxLength={2000} defaultValue={phase?.description ?? ""} placeholder="What opens in this release, and what should agents know?" />
          </label>
          <DeveloperMediaField label="Phase cover image" description="Optional. Upload a file or paste an http(s) image URL." fileName="phaseHeroImage" urlName="phaseHeroImageUrl" accept="image/*" defaultUrl={editing ? currentHero : undefined} currentValue={editing ? currentHero : null} />
        </div>
      </details>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-3">
        <span className="text-xs text-neutral-500">All optional values are kept when their sections are collapsed.</span>
        <div className="flex flex-wrap items-center gap-2">
          <DeveloperPhaseFormCancelButton className="inline-flex min-h-10 items-center rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:border-black/30">Cancel</DeveloperPhaseFormCancelButton>
          <DeveloperPhaseFormSubmitButton pendingLabel={editing ? "Saving…" : "Creating…"} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60">
            <Check aria-hidden="true" size={14} /> {editing ? "Save phase" : "Create phase"}
          </DeveloperPhaseFormSubmitButton>
        </div>
      </div>
    </form>
  );
}
