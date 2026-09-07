import { CalendarDays, Check, Layers3, Plus, RotateCcw } from "lucide-react";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { DeveloperMediaField } from "@/components/DeveloperMediaField";
import { DeveloperPhaseMerchandisingFields } from "@/components/DeveloperPhaseMerchandisingFields";
import type { DeveloperProjectPhase } from "@/lib/developerQueries";

type PhaseAction = (formData: FormData) => void | Promise<void>;

type PhaseBoardProps = {
  projectId: string;
  phases: DeveloperProjectPhase[];
  selectedPhaseId?: string | null;
  inventoryCounts?: Record<string, number>;
  unitTypeSummaries?: { phase_id: string; label: string; min_price: number; unit_area_min?: number | null; archived_at?: string | null }[];
  hrefForInventory?: (phaseId: string) => string;
  createAction: PhaseAction;
  updateAction: PhaseAction;
  archiveAction: PhaseAction;
  restoreAction: PhaseAction;
  hrefForPhase: (phaseId?: string | null) => string;
  canManagePhases?: boolean;
};

type PhaseMedia = { heroImageUrl?: string; hero_image_url?: string; [key: string]: unknown };

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

function phaseMedia(phase: DeveloperProjectPhase) {
  return (phase.hero_media && typeof phase.hero_media === "object" ? phase.hero_media : {}) as PhaseMedia;
}

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
  canManagePhases = true,
}: PhaseBoardProps) {
  const activePhases = phases.filter((phase) => !phase.archived_at && phase.lifecycle_state !== "archived").sort((a, b) => a.phase_order - b.phase_order);
  const archivedPhases = phases.filter((phase) => phase.archived_at || phase.lifecycle_state === "archived").sort((a, b) => a.phase_order - b.phase_order);
  const selectedPhase = activePhases.find((phase) => phase.id === selectedPhaseId) ?? activePhases[0] ?? null;
  const selectedMedia = selectedPhase ? phaseMedia(selectedPhase) : {};

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
        {canManagePhases ? <a href="#new-project-phase" className="inline-flex min-h-10 items-center gap-2 rounded-full bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800"><Plus aria-hidden="true" size={15} /> Add phase</a> : null}
      </div>

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
            {hrefForInventory ? <a href={hrefForInventory(selectedPhase.id)} className="text-xs font-semibold underline underline-offset-4">View phase inventory →</a> : null}
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

      {selectedPhase && canManagePhases ? (
        <details className="mt-5 rounded-2xl border border-black/10 bg-neutral-50/80 p-4">
          <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.25em] text-neutral-600">Edit selected phase · {selectedPhase.name}</summary>
          <form key={selectedPhase.id} action={updateAction} className="mt-4 space-y-4">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="phaseId" value={selectedPhase.id} />
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
              <label className="flex flex-col gap-1 text-sm"><span className="text-xs uppercase tracking-[0.25em] text-neutral-500">Phase name</span><input className="min-h-11 rounded-2xl border border-black/10 bg-white px-4" name="phaseName" required maxLength={160} defaultValue={selectedPhase.name} /></label>
              <label className="flex flex-col gap-1 text-sm"><span className="text-xs uppercase tracking-[0.25em] text-neutral-500">Order</span><input className="min-h-11 rounded-2xl border border-black/10 bg-white px-4" name="phaseOrder" type="number" min="1" step="1" required defaultValue={selectedPhase.phase_order} /></label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm"><span className="text-xs uppercase tracking-[0.25em] text-neutral-500">Launch status</span><select className="min-h-11 rounded-2xl border border-black/10 bg-white px-4" name="phaseLaunchStatus" defaultValue={selectedPhase.launch_status ?? "upcoming"}><option value="upcoming">Upcoming</option><option value="new_launch">New release</option><option value="live">Live release</option></select></label>
              <label className="flex flex-col gap-1 text-sm"><span className="text-xs uppercase tracking-[0.25em] text-neutral-500">Launch date</span><input className="min-h-11 rounded-2xl border border-black/10 bg-white px-4" name="phaseLaunchDate" type="date" defaultValue={selectedPhase.launch_date?.slice(0, 10) ?? ""} /></label>
            </div>
            <label className="flex flex-col gap-1 text-sm"><span className="text-xs uppercase tracking-[0.25em] text-neutral-500">Phase brief</span><textarea className="min-h-24 rounded-2xl border border-black/10 bg-white px-4 py-3" name="phaseDescription" maxLength={2000} defaultValue={selectedPhase.description ?? ""} placeholder="What opens in this release, and what should agents know?" /></label>
            <DeveloperMediaField label="Phase cover image" description="The cover shown in the project portal and mobile release preview. An uploaded file takes precedence over a pasted URL." fileName="phaseHeroImage" urlName="phaseHeroImageUrl" accept="image/*" defaultUrl={selectedMedia.heroImageUrl ?? selectedMedia.hero_image_url ?? ""} currentValue={selectedMedia.heroImageUrl ?? selectedMedia.hero_image_url ?? null} />
            <DeveloperPhaseMerchandisingFields phase={selectedPhase} />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-3">
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${phaseStatusTone(selectedPhase)}`}>{phaseStatus(selectedPhase)}</span>
              <div className="flex flex-wrap items-center gap-2">
                {!selectedPhase.is_default ? <span className="text-xs text-neutral-500">Archive from the phase list after saving.</span> : <span className="text-xs text-neutral-500">Default phase stays available for compatibility.</span>}
                <button className="inline-flex min-h-10 items-center gap-2 rounded-full bg-black px-4 py-2 text-xs font-semibold text-white" type="submit"><Check aria-hidden="true" size={14} /> Save phase</button>
              </div>
            </div>
          </form>
          {!selectedPhase.is_default ? <form action={archiveAction} className="mt-2 flex justify-end"><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="phaseId" value={selectedPhase.id} /><ConfirmSubmitButton className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50" confirmMessage="Archive this phase? Its unit inventory will be retained but hidden from active phase views." pendingLabel="Archiving…">Archive phase</ConfirmSubmitButton></form> : null}
        </details>
      ) : null}

      {canManagePhases ? <details id="new-project-phase" className="mt-4 rounded-2xl border border-dashed border-black/15 bg-neutral-50 p-4">
        <summary className="cursor-pointer list-none text-sm font-semibold text-neutral-800">Add a release phase</summary>
        <p className="mt-1 text-xs leading-5 text-neutral-500">New phases start as drafts and are included in the parent project review before mobile publication.</p>
        <form action={createAction} className="mt-4 space-y-4">
          <input type="hidden" name="projectId" value={projectId} />
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <label className="flex flex-col gap-1 text-sm"><span className="text-xs uppercase tracking-[0.25em] text-neutral-500">Phase name</span><input className="min-h-11 rounded-2xl border border-black/10 bg-white px-4" name="phaseName" required maxLength={160} placeholder="Phase 2 · Garden collection" /></label>
            <label className="flex flex-col gap-1 text-sm"><span className="text-xs uppercase tracking-[0.25em] text-neutral-500">Order</span><input className="min-h-11 rounded-2xl border border-black/10 bg-white px-4" name="phaseOrder" type="number" min="1" step="1" placeholder="2" /></label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm"><span className="text-xs uppercase tracking-[0.25em] text-neutral-500">Launch status</span><select className="min-h-11 rounded-2xl border border-black/10 bg-white px-4" name="phaseLaunchStatus" defaultValue="upcoming"><option value="upcoming">Upcoming</option><option value="new_launch">New release</option><option value="live">Live release</option></select></label>
            <label className="flex flex-col gap-1 text-sm"><span className="text-xs uppercase tracking-[0.25em] text-neutral-500">Launch date</span><input className="min-h-11 rounded-2xl border border-black/10 bg-white px-4" name="phaseLaunchDate" type="date" /></label>
          </div>
          <label className="flex flex-col gap-1 text-sm"><span className="text-xs uppercase tracking-[0.25em] text-neutral-500">Phase brief</span><textarea className="min-h-24 rounded-2xl border border-black/10 bg-white px-4 py-3" name="phaseDescription" maxLength={2000} placeholder="What opens in this release, and what should agents know?" /></label>
          <DeveloperMediaField label="Phase cover image" description="Optional now; upload a file or paste an http(s) image URL." fileName="phaseHeroImage" urlName="phaseHeroImageUrl" accept="image/*" />
          <DeveloperPhaseMerchandisingFields />
          <button className="inline-flex min-h-10 items-center gap-2 rounded-full bg-black px-4 py-2 text-xs font-semibold text-white" type="submit"><Plus aria-hidden="true" size={14} /> Create phase</button>
        </form>
      </details> : null}

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
