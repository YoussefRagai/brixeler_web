"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ImportOption = { id: string; name: string };

type ImportError = { row: number; errors: string[] };

type ImportPreview = {
  totalRows: number;
  validRows: Array<{ row: number; property_name: string; project_id: string | null; developer_id: string | null }>;
  invalidRows: ImportError[];
  parseErrors: string[];
};

type ImportResponse = ImportPreview & {
  mode?: "preview" | "commit";
  imported?: number;
  demoBatch?: string | null;
  pending?: boolean;
  isActive?: boolean;
  error?: string;
};

export function PropertyCsvImportPanel({
  developers,
  projects,
}: {
  developers: ImportOption[];
  projects: Array<ImportOption & { developerId: string | null }>;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [developerId, setDeveloperId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [isDemo, setIsDemo] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);

  const visibleProjects = useMemo(
    () => projects.filter((project) => !developerId || project.developerId === developerId),
    [developerId, projects],
  );

  const runImport = async (mode: "preview" | "commit") => {
    if (!file) {
      setError("Choose a CSV file before previewing the import.");
      return;
    }
    setBusy(mode);
    setError(null);
    setMessage(null);
    const body = new FormData();
    body.set("file", file);
    body.set("mode", mode);
    body.set("developerId", developerId);
    body.set("projectId", projectId);
    body.set("isDemo", String(isDemo));
    try {
      const response = await fetch("/api/properties/import", { method: "POST", body });
      const result = (await response.json().catch(() => ({}))) as ImportResponse;
      if (mode === "preview" || result.mode === "preview") {
        setPreview({
          totalRows: result.totalRows ?? 0,
          validRows: result.validRows ?? [],
          invalidRows: result.invalidRows ?? [],
          parseErrors: result.parseErrors ?? [],
        });
      }
      if (!response.ok) {
        setError(result.error ?? "Unable to process the CSV import.");
        return;
      }
      if (mode === "commit") {
        setMessage(
          `${result.imported ?? 0} listing${result.imported === 1 ? "" : "s"} imported as pending and hidden from mobile until approval.${
            result.demoBatch ? ` Demo batch: ${result.demoBatch}.` : ""
          }`,
        );
        setPreview(null);
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      }
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const previewHasErrors = Boolean(preview?.parseErrors.length || preview?.invalidRows.length);

  return (
    <section className="rounded-3xl border border-black/5 bg-white p-5 shadow-xl shadow-black/5" aria-labelledby="property-import-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Bulk import listings</p>
          <h2 id="property-import-title" className="mt-1 text-lg font-semibold text-neutral-900">Preview before anything is saved</h2>
          <p className="mt-2 max-w-3xl text-xs text-neutral-600">
            CSV columns: property_name, price, unit_area, property_type, description, photos. Separate three or more photo URLs with |.
            Optional developer_id/project_id columns override the defaults below. Imports are pending and inactive until review.
          </p>
        </div>
        <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-800">Dry run first</span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 md:col-span-2 lg:col-span-1">
          CSV file
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
              setMessage(null);
              setError(null);
            }}
            className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-neutral-900"
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Developer association
          <select
            value={developerId}
            onChange={(event) => {
              setDeveloperId(event.target.value);
              if (projectId && !projects.some((project) => project.id === projectId && project.developerId === event.target.value)) setProjectId("");
              setPreview(null);
            }}
            className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-neutral-900"
          >
            <option value="">Choose from CSV columns</option>
            {developers.map((developer) => <option key={developer.id} value={developer.id}>{developer.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Project association
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-neutral-900"
          >
            <option value="">Optional project</option>
            {visibleProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          <input type="checkbox" checked={isDemo} onChange={(event) => setIsDemo(event.target.checked)} className="h-4 w-4 accent-amber-700" />
          Mark import as demo data
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={!file || busy !== null} onClick={() => runImport("preview")} className="min-h-11 rounded-full bg-black px-5 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50">
          {busy === "preview" ? "Checking…" : "Preview / dry run"}
        </button>
        {preview && !previewHasErrors ? (
          <button type="button" disabled={busy !== null || !preview.validRows.length} onClick={() => runImport("commit")} className="min-h-11 rounded-full bg-emerald-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
            {busy === "commit" ? "Importing…" : `Import ${preview.validRows.length} valid row${preview.validRows.length === 1 ? "" : "s"}`}
          </button>
        ) : null}
        {preview ? <span className="text-xs text-neutral-600">Dry run: {preview.validRows.length} valid of {preview.totalRows} row{preview.totalRows === 1 ? "" : "s"}.</span> : null}
      </div>

      {message ? <p role="status" className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p> : null}
      {error ? <p role="alert" className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p> : null}

      {preview ? (
        <div className="mt-4 rounded-2xl border border-black/10 bg-neutral-50 p-4">
          {preview.parseErrors.length ? (
            <div className="space-y-1 text-sm text-rose-800">
              {preview.parseErrors.map((item) => <p key={item}>{item}</p>)}
            </div>
          ) : null}
          {preview.invalidRows.length ? (
            <div className="mt-2 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-800">Row-level errors</p>
              {preview.invalidRows.map((item) => (
                <div key={`${item.row}-${item.errors.join("|")}`} className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs text-rose-800">
                  <span className="font-semibold">Row {item.row}:</span> {item.errors.join(" ")}
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-emerald-800">All rows passed format, media, association, and duplicate checks.</p>}
          {preview.validRows.length ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {preview.validRows.slice(0, 12).map((row) => <p key={row.row} className="rounded-xl border border-black/5 bg-white px-3 py-2 text-xs text-neutral-700">Row {row.row}: {row.property_name}</p>)}
              {preview.validRows.length > 12 ? <p className="px-3 py-2 text-xs text-neutral-500">+ {preview.validRows.length - 12} more valid rows</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
