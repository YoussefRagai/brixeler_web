import { CalendarDays, Layers3, Plus, RotateCcw } from "lucide-react";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import {
  DeveloperPhaseForm,
  DeveloperPhaseFormDisclosure,
  DeveloperPhaseFormTrigger,
  type DeveloperPhaseAction,
} from "@/components/DeveloperPhaseForm";
import type { DeveloperProjectPhase } from "@/lib/developerQueries";

// Media inputs stay in the client form shell (DeveloperMediaField / phaseHeroImageUrl) so this board can remain server-rendered.
type PhaseBoardProps = {
  projectId: string;
  phases: DeveloperProjectPhase[];
  selectedPhaseId?: string | null;
  inventoryCounts?: Record<string, number>;
  unitTypeSummaries?: { phase_id: string; label: string; min_price: number; unit_area_min?: number | null; archived_at?: string | null }[];
  hrefForInventory?: (phaseId: string) => string;
  createAction: DeveloperPhaseAction;
  updateAction: DeveloperPhaseAction;
  archiveAction: DeveloperPhaseAction;
  restoreAction: DeveloperPhaseAction;
  hrefForPhase: (phaseId?: string | null) => string;
  phaseForm?: "create" | "edit" | null;
  canManagePhases?: boolean;
};

const launchStatusLabel = (value?: string | null) => {
  if (value === "live") return "Live release";
  if (value === "new_launch" || value === "new_release") return "New release";
  return "Upcoming";
};

const salesStatusLabel = (value?: string | null) => value === "selling" ? "Currently selling" : value === "sold_out" ? "Sold out" : value === "paused" ? "Sales paused" : "Upcoming";
const salesStatusTone = (value?: string | null) => value === "selling" ? "border-emerald-300 bg-emerald-50" : value === "sold_out" ? "border-neutral-300 bg-neutral-100" : value === "paused" ? "border-amber-200 bg-amber-50" : "border-sky-200 bg-sky-50";

const phaseStatus = (phase: DeveloperProjectPhase) => {
  if (phase.archived_at || phase.lifecycle_state === "archived") return "Archived";
  if (phase.approval_status === "rejected") return "Changes requested";
  if (phase.approval_status === "approved" && phase.lifecycle_state === "published" && phase.published_at) return "Published with project";
  return "Draft · project review required";
};

const phaseStatusTone = (phase: DeveloperProjectPhase) => {
  if (phase.archived_at || phase.lifecycle_state === "archived") return "bg-neutral-200 text-neutral-700";
  if (phase.approval_status === "rejected") return "bg-rose-100 text-rose-800";
  if (phase.approval_status === "approved" && phase.lifecycle_state === "published" && phase.published_at) return "bg-emerald-100 text-emerald-800";
  return "bg-amber-100 text-amber-800";
};

export function DeveloperProjectPhaseBoard({
  projectId,
  phases,
  selectedPhaseId,
  inventoryCounts = {},
  unitTypeSummaries = [],
  hrefForInventory,
  createAction,
  updateAction,
  archiveAction,
  restoreAction,
  hrefForPhase,
  phaseForm,
  canManagePhases = true,
}: PhaseBoardProps) {
  const activePhases = phases.filter((phase) => !phase.archived_at && phase.lifecycle_state !== "archived").sort((a, b) => a.phase_order - b.phase_order);
  const archivedPhases = phases.filter((phase) => phase.archived_at || phase.lifecycle_state === "archived").sort((a, b) => a.phase_order - b.phase_order);
  const selectedPhase = activePhases.find((phase) => phase.id === selectedPhaseId) ?? activePhases[0] ?? null;

  return (
    <section id="project-phases" className="scroll-mt-24 rounded-3xl border border-black/5 bg-white p-4 sm:p-5" aria-label="Project release phases">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
            <Layers3 aria-hidden="true" size={15} /> Release phases
          </div>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-neutral-950">Phases & availability</h3>
          <p className="mt-1 text-sm leading-6 text-neutral-500">Manage each release, its facilities and inventory. Changes require project review.</p>
        </div>
        {canManagePhases ? <DeveloperPhaseFormTrigger
          targetId="new-project-phase"
          initialOpen={phaseForm === "create"}
          ariaLabel="Open new release phase form"
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800"
        ><Plus aria-hidden="true" size={15} /> Add phase</DeveloperPhaseFormTrigger> : null}
      </div>

      {canManagePhases ? <DeveloperPhaseFormDisclosure id="new-project-phase" initialOpen={phaseForm === "create"} className="mt-4">
        <DeveloperPhaseForm projectId={projectId} action={createAction} mode="create" defaultOrder={Math.max(0, ...phases.map((phase) => phase.phase_order)) + 1} />
      </DeveloperPhaseFormDisclosure> : null}

      {activePhases.length ? (
        <nav aria-label="Release phases" className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {activePhases.map((phase) => {
            const active = selectedPhase?.id === phase.id;
            return (
              <a key={phase.id} href={hrefForPhase(phase.id)} className={`rounded-2xl border p-3 text-left text-neutral-800 transition ${salesStatusTone(phase.sales_status)} ${active ? "ring-2 ring-neutral-900 ring-offset-2" : "hover:brightness-95"}`} aria-current={active ? "page" : undefined}>
                <div className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-sm font-semibold"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/70 text-xs text-neutral-600">{phase.phase_order}</span><span className="truncate">{phase.name}</span></span>
                  {phase.is_default ? <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-neutral-500">Default</span> : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-600">
                  <span className="font-semibold">{salesStatusLabel(phase.sales_status)}</span>
                  <span>·</span>
                  <span>{inventoryCounts[phase.id] ?? 0} unit types</span>
                </div>
              </a>
            );
          })}
        </nav>
      ) : (
        <p className="mt-5 rounded-2xl border border-dashed border-black/15 bg-neutral-50 p-4 text-sm text-neutral-500">No active release phases yet. Add the first phase to unlock phase-scoped inventory.</p>
      )}

      {selectedPhase ? (
        <div className="mt-4 space-y-3 rounded-2xl border border-black/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-neutral-900">{selectedPhase.name} <span className="font-normal text-neutral-500">· {launchStatusLabel(selectedPhase.launch_status)}{selectedPhase.delivery_date ? ` · Delivery ${selectedPhase.delivery_date.slice(0, 10)}` : ""}</span></div>
            <div className="flex flex-wrap items-center gap-3">
              {canManagePhases ? <DeveloperPhaseFormTrigger targetId={`edit-project-phase-${selectedPhase.id}`} initialOpen={phaseForm === "edit"} className="text-xs font-semibold underline underline-offset-4">Edit phase</DeveloperPhaseFormTrigger> : null}
              {hrefForInventory ? <a href={hrefForInventory(selectedPhase.id)} className="text-xs font-semibold underline underline-offset-4">{(inventoryCounts[selectedPhase.id] ?? 0) > 0 ? "Open phase inventory →" : "Next: add phase inventory →"}</a> : null}
            </div>
          </div>
          {selectedPhase.facilities?.length ? <p className="line-clamp-2 text-xs leading-5 text-neutral-600"><span className="font-semibold">Facilities:</span> {selectedPhase.facilities.join(" · ")}</p> : null}
          {selectedPhase.selling_points?.length ? <p className="line-clamp-2 text-xs leading-5 text-neutral-600"><span className="font-semibold">Highlights:</span> {selectedPhase.selling_points.join(" · ")}</p> : null}
          {selectedPhase.masterplan_url && /^https?:\/\//i.test(selectedPhase.masterplan_url) ? <a href={selectedPhase.masterplan_url} target="_blank" rel="noopener noreferrer" className="inline-block text-xs font-semibold underline underline-offset-4">Open phase masterplan ↗</a> : null}
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {unitTypeSummaries.filter((type) => type.phase_id === selectedPhase.id && !type.archived_at).map((type, index) => (
              <div key={`${type.label}-${index}`} className="rounded-xl bg-neutral-50 px-3 py-2">
                <p className="truncate text-xs font-semibold text-neutral-900">{type.label}</p>
                <p className="mt-1 text-xs text-neutral-500">{type.min_price > 0 ? `From EGP ${type.min_price.toLocaleString("en-US")}` : "Price not set"}{type.unit_area_min && type.unit_area_min > 0 ? ` · From ${type.unit_area_min.toLocaleString("en-US")} m²` : ""}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {selectedPhase && canManagePhases ? <DeveloperPhaseFormDisclosure id={`edit-project-phase-${selectedPhase.id}`} initialOpen={phaseForm === "edit"} className="mt-5">
        <DeveloperPhaseForm
          key={selectedPhase.id}
          projectId={projectId}
          action={updateAction}
          mode="edit"
          phase={selectedPhase}
          statusLabel={phaseStatus(selectedPhase)}
          statusTone={phaseStatusTone(selectedPhase)}
        />
        {!selectedPhase.is_default ? <form action={archiveAction} className="mt-2 flex justify-end"><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="phaseId" value={selectedPhase.id} /><ConfirmSubmitButton className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50" confirmMessage="Archive this phase? Its unit inventory will be retained but hidden from active phase views." pendingLabel="Archiving…">Archive phase</ConfirmSubmitButton></form> : <p className="mt-2 text-right text-xs text-neutral-500">Default phase stays available for compatibility.</p>}
      </DeveloperPhaseFormDisclosure> : null}

      {archivedPhases.length ? (
        <details className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
          <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.25em] text-neutral-600">Archived phases · {archivedPhases.length}</summary>
          <div className="mt-3 space-y-2">
            {archivedPhases.map((phase) => (
              <div key={phase.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-neutral-50 p-3">
                <div className="flex min-w-0 items-center gap-2"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-600">{phase.phase_order}</span><span className="truncate text-sm font-semibold text-neutral-800">{phase.name}</span><span className="rounded-full bg-neutral-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">Archived</span></div>
                {canManagePhases ? <form action={restoreAction}><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="phaseId" value={phase.id} /><ConfirmSubmitButton className="inline-flex min-h-9 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 disabled:opacity-50" confirmMessage="Restore this phase to active inventory? It will return to draft review." pendingLabel="Restoring…"><RotateCcw aria-hidden="true" size={13} /> Restore</ConfirmSubmitButton></form> : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

export function PhaseDateIcon() {
  return <CalendarDays aria-hidden="true" size={14} />;
}
