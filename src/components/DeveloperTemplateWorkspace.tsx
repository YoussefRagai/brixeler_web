"use client";

import { useActionState, useMemo, useRef, useState, type ChangeEvent } from "react";
import { readSheet } from "read-excel-file/browser";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { FeedbackBanner } from "@/components/FeedbackBanner";
import { ProjectWorkflowSubmitButton } from "@/components/ProjectWorkflowSubmitButton";
import {
  csvRowsToInventoryObjects,
  parseUnitTypeWorkbookRows,
  workbookRowsToInventoryObjects,
  type DeveloperTemplateKind,
  type ImportedType,
} from "@/lib/developerImportTemplates";

export type TemplateWorkspaceProject = {
  id: string;
  name: string;
  phases: Array<{ id: string; name: string; phaseOrder: number }>;
};

export type InventoryImportResult = {
  error?: string;
  rowErrors?: Array<{ row: number; errors: string[] }>;
};

type ServerAction = (formData: FormData) => void | Promise<void>;
type InventoryImportAction = (formData: FormData) => void | Promise<void | InventoryImportResult>;

type Props = {
  projects: readonly TemplateWorkspaceProject[];
  templatePaths: Record<DeveloperTemplateKind, string>;
  typeImportAction: ServerAction;
  inventoryImportAction: InventoryImportAction;
};

const templateOptions: Array<{ value: DeveloperTemplateKind; label: string; description: string }> = [
  {
    value: "unit_types",
    label: "Unit types + variants",
    description: "Groups rows by base type and creates commercial variants.",
  },
  {
    value: "inventory",
    label: "Individual units",
    description: "Creates or updates row-level inventory in the selected phase.",
  },
];

export function DeveloperTemplateWorkspace({ projects, templatePaths, typeImportAction, inventoryImportAction }: Props) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [phaseId, setPhaseId] = useState(projects[0]?.phases[0]?.id ?? "");
  const [templateKind, setTemplateKind] = useState<DeveloperTemplateKind>("unit_types");
  const [fileName, setFileName] = useState("");
  const [unitTypes, setUnitTypes] = useState<ImportedType[]>([]);
  const [inventoryRows, setInventoryRows] = useState<Array<Record<string, unknown>>>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [inventoryState, submitInventoryAction] = useActionState<InventoryImportResult | null, FormData>(
    async (_previousState, formData) => {
      const result = await inventoryImportAction(formData);
      return result ?? null;
    },
    null,
  );

  const selectedProject = useMemo(() => projects.find((project) => project.id === projectId), [projectId, projects]);
  const phases = selectedProject?.phases ?? [];
  const canUpload = Boolean(projectId && phaseId);
  const selectedTemplate = templateOptions.find((option) => option.value === templateKind) ?? templateOptions[0];

  const handleProjectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextProjectId = event.target.value;
    setProjectId(nextProjectId);
    setPhaseId(projects.find((project) => project.id === nextProjectId)?.phases[0]?.id ?? "");
    setUnitTypes([]);
    setInventoryRows([]);
    setFileName("");
    setFileError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleTemplateKindChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setTemplateKind(event.target.value as DeveloperTemplateKind);
    setUnitTypes([]);
    setInventoryRows([]);
    setFileName("");
    setFileError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFileError(null);
    setUnitTypes([]);
    setInventoryRows([]);
    if (!canUpload) {
      setFileError("Choose a project and release phase before selecting a file.");
      return;
    }
    try {
      const rows = file.name.toLowerCase().endsWith(".xlsx")
        ? ((await readSheet(file, "Import").catch(async () => readSheet(file))) as Array<Array<unknown>>)
        : null;
      const parsed = templateKind === "unit_types"
        ? parseUnitTypeWorkbookRows(rows ?? [])
        : rows
          ? workbookRowsToInventoryObjects(rows)
          : csvRowsToInventoryObjects(await file.text());
      if (!parsed.length) {
        throw new Error("No import rows found. Add real records to the Import sheet and upload again.");
      }
      if (templateKind === "unit_types") setUnitTypes(parsed as ImportedType[]);
      else setInventoryRows(parsed as Array<Record<string, unknown>>);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Unable to read this workbook.");
    }
  };

  return (
    <section id="templates-imports" className="scroll-mt-24 rounded-3xl border border-black/5 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="templates-imports-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Templates & imports</p>
          <h2 id="templates-imports-title" className="mt-1 text-xl font-semibold tracking-tight text-neutral-950">Start with a clean workbook</h2>
          <p className="mt-1 text-sm leading-6 text-neutral-500">Download the blank template before you create a project, or upload a completed workbook into a specific project phase.</p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Blank import templates">
          <a href={templatePaths.unit_types} download className="inline-flex min-h-10 items-center gap-2 rounded-full bg-black px-4 py-2 text-xs font-semibold text-white transition hover:bg-neutral-800">
            <Download aria-hidden="true" size={15} /> Download blank template (unit types)
          </a>
          <a href={templatePaths.inventory} download className="inline-flex min-h-10 items-center gap-2 rounded-full border border-black/15 bg-white px-4 py-2 text-xs font-semibold text-neutral-800 transition hover:border-black/35">
            <Download aria-hidden="true" size={15} /> Download blank template (individual units)
          </a>
        </div>
      </div>

      <details className="mt-5 rounded-2xl border border-black/10 bg-neutral-50">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-neutral-900">
          Upload a filled template <span className="font-normal text-neutral-500">· choose a project, phase, and workbook</span>
        </summary>
        <div className="grid gap-4 border-t border-black/5 p-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="rounded-2xl border border-[#dceaa3] bg-[#f7fbe7] p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-[#405000]"><FileSpreadsheet aria-hidden="true" size={18} /></span>
              <div>
                <p className="text-sm font-semibold text-[#405000]">Two templates, two supported imports</p>
                <p className="mt-1 text-xs leading-5 text-[#52630c]">Instructions are on their own sheet. The Import sheet is intentionally blank, so no sample units can be created by accident.</p>
              </div>
            </div>
            <p className="mt-4 text-xs leading-5 text-[#52630c]">Use the matching blank workbook above, then review parsed records here before saving. Server validation still runs before anything is written.</p>
          </div>

          <div className="rounded-2xl border border-black/10 bg-white p-4">
            <div className="flex items-center gap-2"><Upload aria-hidden="true" size={16} className="text-neutral-500" /><p className="text-sm font-semibold text-neutral-900">Upload into a selected workspace</p></div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-semibold text-neutral-600">Project
                <select value={projectId} onChange={handleProjectChange} disabled={!projects.length} className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm font-normal">
                  {!projects.length ? <option value="">Create a project first</option> : null}
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-neutral-600">Release phase
                <select value={phaseId} onChange={(event) => setPhaseId(event.target.value)} disabled={!phases.length} className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm font-normal">
                  {!phases.length ? <option value="">Create a phase first</option> : null}
                  {phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.phaseOrder}. {phase.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-neutral-600">Template type
                <select value={templateKind} onChange={handleTemplateKindChange} className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm font-normal">
                  {templateOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
            <p className="mt-2 text-xs text-neutral-500">{selectedTemplate.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" disabled={!canUpload} onClick={() => inputRef.current?.click()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-black/15 bg-white px-4 py-2 text-xs font-semibold text-neutral-800 transition hover:border-black/35 disabled:cursor-not-allowed disabled:opacity-50">Choose .xlsx{templateKind === "inventory" ? " or .csv" : ""}</button>
              <input ref={inputRef} type="file" className="hidden" accept={templateKind === "inventory" ? ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"} onChange={handleFileChange} />
              {fileName ? <span className="max-w-full truncate text-xs text-neutral-600">{fileName}</span> : <span className="text-xs text-neutral-400">No file selected</span>}
            </div>
            {!projects.length ? <p className="mt-3 text-xs text-neutral-500">Download the template now. Create a project and phase before uploading records.</p> : null}
            {fileError ? <div className="mt-3"><FeedbackBanner tone="error" message={fileError} compact /></div> : null}
            {inventoryState?.error ? <div className="mt-3"><FeedbackBanner tone="error" message={inventoryState.error} compact /></div> : null}
          </div>
        </div>
      </details>

      {unitTypes.length ? (
        <div className="mt-4 rounded-2xl border border-black/10 bg-neutral-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Unit type preview</p><p className="mt-1 text-sm text-neutral-600">{unitTypes.length} types · {unitTypes.reduce((sum, item) => sum + item.variants.length, 0)} variants parsed for the selected phase.</p></div><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-800">Ready to review</span></div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {unitTypes.map((item, index) => <div key={`${item.baseType}-${index}`} className="rounded-xl border border-black/10 bg-white p-3"><p className="text-sm font-semibold text-neutral-900">{item.baseType}</p><p className="mt-1 text-xs text-neutral-500">{item.variants.length} variant{item.variants.length === 1 ? "" : "s"}{item.finishingStatus ? ` · ${item.finishingStatus.replaceAll("_", " ")}` : ""}</p><form action={typeImportAction} className="mt-3"><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="phaseId" value={phaseId} /><input type="hidden" name="payload" value={JSON.stringify(item)} /><ProjectWorkflowSubmitButton primary pendingLabel="Saving…">Save type + variants</ProjectWorkflowSubmitButton></form></div>)}
          </div>
        </div>
      ) : null}

      {inventoryRows.length ? (
        <div className="mt-4 rounded-2xl border border-black/10 bg-neutral-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Individual unit preview</p><p className="mt-1 text-sm text-neutral-600">{inventoryRows.length} rows parsed for the selected phase. Existing IDs update rows; blank IDs create pending rows.</p></div><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-800">Ready to review</span></div>
          {inventoryState?.rowErrors?.length ? <div className="mt-3 space-y-1 text-xs text-rose-700" role="alert">{inventoryState.rowErrors.map((row) => <p key={row.row}>Row {row.row}: {row.errors.join(" · ")}</p>)}</div> : null}
          <form action={submitInventoryAction} className="mt-3"><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="phaseId" value={phaseId} /><input type="hidden" name="rows" value={JSON.stringify(inventoryRows)} /><input type="hidden" name="dryRun" value="false" /><ProjectWorkflowSubmitButton primary pendingLabel="Importing…">Import individual units</ProjectWorkflowSubmitButton></form>
        </div>
      ) : null}
    </section>
  );
}
