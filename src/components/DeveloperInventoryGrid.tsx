"use client";

import { useActionState, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ProjectWorkflowSubmitButton } from "@/components/ProjectWorkflowSubmitButton";
import { readSheet } from "read-excel-file/browser";
import type {
  DeveloperInventoryAvailability,
  DeveloperInventoryRow,
  DeveloperInventorySavedFilter,
} from "@/lib/developerQueries";

type ServerAction = (formData: FormData) => void | Promise<void>;

type ImportActionResult = {
  error?: string;
  rowErrors?: Array<{ row: number; errors: string[] }>;
  revision?: number;
};

type ImportServerAction = (formData: FormData) => void | Promise<void | ImportActionResult>;

type EditableInventory = Pick<
  DeveloperInventoryRow,
  "id" | "property_name" | "inventory_code" | "building" | "floor_number" | "unit_number" | "property_type" | "description" | "photos" | "price" | "unit_area" | "availability_state" | "price_effective_from" | "publication_status"
> & {
  hold_expires_at?: string | null;
  holder_type?: string | null;
  holder_reference?: string | null;
};

type Props = {
  projectId: string;
  phaseId: string | null;
  phaseName?: string;
  rows: DeveloperInventoryRow[];
  savedFilters?: DeveloperInventorySavedFilter[];
  bulkUpdateAction: ServerAction;
  importAction: ImportServerAction;
  holdAction: ServerAction;
  releaseHoldAction: ServerAction;
  saveFilterAction?: ServerAction;
};

const AVAILABILITY_STATES: DeveloperInventoryAvailability[] = [
  "available",
  "held",
  "reserved",
  "contracted",
  "sold",
  "released",
];

const CSV_COLUMNS = [
  "id",
  "property_name",
  "property_type",
  "description",
  "photos",
  "inventory_code",
  "building",
  "floor_number",
  "unit_number",
  "price",
  "unit_area",
  "availability_state",
  "price_effective_from",
] as const;

const emptyValue = (value: unknown) => (value == null ? "" : String(value));

const normalizeHeader = (value: unknown) =>
  emptyValue(value)
    .trim()
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const HEADER_ALIASES: Record<string, string> = {
  id: "id",
  property_id: "id",
  unit_id: "id",
  name: "property_name",
  property_name: "property_name",
  unit_name: "property_name",
  inventory_code: "inventory_code",
  code: "inventory_code",
  building: "building",
  floor: "floor_number",
  floor_number: "floor_number",
  unit_number: "unit_number",
  unit: "unit_number",
  price: "price",
  price_egp: "price",
  price_egp_: "price",
  unit_area: "unit_area",
  unit_area_m: "unit_area",
  unit_area_m2: "unit_area",
  photos: "photos",
  photo_urls: "photos",
  sale_type: "sale_type",
  down_payment_percentage: "down_payment_percentage",
  monthly_installment: "monthly_installment",
  installment_years: "installment_years",
  delivery_date: "delivery_date",
  finishing_status: "finishing_status",
  floor_plan_url: "floor_plan_url",
  video_tour_url: "video_tour_url",
  amenities: "amenities",
  availability: "availability_state",
  availability_state: "availability_state",
  state: "availability_state",
  price_effective_from: "price_effective_from",
  effective_from: "price_effective_from",
  hold_expires_at: "hold_expires_at",
  hold_expiry: "hold_expires_at",
  holder_type: "holder_type",
  holder_reference: "holder_reference",
};

// Keep this list in sync with public.property_type. The import RPC normalizes
// values to lower case before checking the enum, so the browser does too.
const PROPERTY_TYPE_VALUES = new Set([
  "apartment",
  "villa",
  "twinhouse",
  "townhouse",
  "duplex",
  "penthouse",
  "chalet",
  "studio",
  "cabin",
  "office",
  "clinic",
  "retail",
  "serviced_studio",
  "branded_apartment",
  "branded_villa",
  "luxury_apartment",
  "ultra_luxury_apartment",
  "ultra_luxury_villa",
  "one_story_villa",
  "pharmacy",
  "serviced_apartment",
  "loft",
]);

const FINISHING_STATUS_VALUES = new Set([
  "not_finished",
  "semi_finished",
  "finished",
  "furnished",
  "flexi_finished",
]);

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function workbookRowsToObjects(rows: Array<Array<unknown>>): Array<Record<string, unknown>> {
  if (rows.length < 2) return [];
  const keys = rows[0].map((header) => HEADER_ALIASES[normalizeHeader(header)] ?? normalizeHeader(header));
  return rows.slice(1).map((values) =>
    Object.fromEntries(
      keys.map((key, index) => [key, values[index] == null ? "" : values[index]]),
    ),
  );
}

function csvRowsToObjects(text: string) {
  const rows = parseCsv(text);
  return workbookRowsToObjects(rows);
}

const toEditable = (row: DeveloperInventoryRow): EditableInventory => ({
  id: row.id,
  property_name: row.property_name,
  property_type: row.property_type,
  description: row.description,
  photos: row.photos,
  inventory_code: row.inventory_code,
  building: row.building,
  floor_number: row.floor_number,
  unit_number: row.unit_number,
  price: row.price,
  unit_area: row.unit_area,
  availability_state: row.availability_state,
  price_effective_from: row.price_effective_from,
  publication_status: row.publication_status,
  hold_expires_at: row.active_hold?.expires_at ?? null,
  holder_type: row.active_hold?.holder_type ?? "internal",
  holder_reference: row.active_hold?.holder_reference ?? null,
});

const formatDateTime = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
};

/** Convert a browser-local datetime value before a server action parses it as timestamptz. */
const normalizeDateTimeForServer = (value: unknown) => {
  const text = emptyValue(value).trim();
  if (!text || /(?:z|[+-]\d{2}:?\d{2})$/i.test(text)) return text;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
};

const toCsvValue = (value: unknown) => {
  const text = emptyValue(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const optionalNumber = (value: unknown) => {
  const text = emptyValue(value).trim();
  if (!text) return null;
  const parsed = Number(text.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const optionalInteger = (value: unknown) => {
  const parsed = optionalNumber(value);
  return parsed == null ? null : Number.isInteger(parsed) ? parsed : Number.NaN;
};

function localErrors(row: unknown, forImport = false) {
  const errors: string[] = [];
  const input = row as EditableInventory & Record<string, unknown>;
  const propertyName = emptyValue(input.property_name).trim();
  const price = optionalNumber(input.price);
  const area = optionalNumber(input.unit_area);
  if (!propertyName) errors.push("Property name is required");
  if (price == null || Number.isNaN(price)) errors.push("Price must be numeric");
  else if (price < 100000) errors.push("Price must be at least EGP 100,000");
  if (area == null || Number.isNaN(area)) errors.push("Unit area must be numeric");
  else if (area < 10) errors.push("Unit area must be at least 10 m²");
  if (forImport) {
    const propertyType = emptyValue(input.property_type).trim().toLowerCase();
    const description = emptyValue(input.description).trim();
    const photos = Array.isArray(input.photos)
      ? input.photos.map((photo) => emptyValue(photo).trim()).filter(Boolean)
      : emptyValue(input.photos).split("|").map((photo) => photo.trim()).filter(Boolean);
    const uniquePhotos = new Set(photos.map((photo) => photo.toLowerCase()));
    if (!PROPERTY_TYPE_VALUES.has(propertyType)) errors.push("Property type is not supported");
    if (!description) errors.push("Description is required");
    if (photos.length < 3) errors.push("At least three photos are required");
    if (uniquePhotos.size !== photos.length) errors.push("Photo URLs must be unique");
    if (photos.some((photo) => {
      try {
        const url = new URL(photo);
        return url.protocol !== "http:" && url.protocol !== "https:";
      } catch {
        return true;
      }
    })) errors.push("Every photo must use an http(s) URL");

    const saleType = emptyValue(input.sale_type).trim().toLowerCase();
    if (saleType && saleType !== "developer_sale" && saleType !== "resale") errors.push("Sale type must be developer_sale or resale");

    const bedrooms = optionalInteger(input.bedrooms);
    if (bedrooms != null && (Number.isNaN(bedrooms) || bedrooms < 0 || bedrooms > 20)) errors.push("Bedrooms must be a whole number from 0 to 20");
    const bathrooms = optionalInteger(input.bathrooms);
    if (bathrooms != null && (Number.isNaN(bathrooms) || bathrooms < 0 || bathrooms > 20)) errors.push("Bathrooms must be a whole number from 0 to 20");
    const floor = optionalInteger(input.floor_number);
    if (floor != null && (Number.isNaN(floor) || floor < -10 || floor > 1000)) errors.push("Floor number must be a whole number");
    const installmentYears = optionalInteger(input.installment_years);
    if (installmentYears != null && (Number.isNaN(installmentYears) || installmentYears < 0 || installmentYears > 100)) errors.push("Installment years must be a whole number from 0 to 100");
    const downPayment = optionalNumber(input.down_payment_percentage);
    if (downPayment != null && (Number.isNaN(downPayment) || downPayment < 0 || downPayment > 100)) errors.push("Down payment must be between 0 and 100");
    const monthlyInstallment = optionalNumber(input.monthly_installment);
    if (monthlyInstallment != null && (Number.isNaN(monthlyInstallment) || monthlyInstallment < 0)) errors.push("Monthly installment must be zero or more");
    const deliveryDate = emptyValue(input.delivery_date).trim();
    if (deliveryDate && Number.isNaN(Date.parse(deliveryDate))) errors.push("Delivery date must be a valid date");
    const effectiveDate = emptyValue(input.price_effective_from).trim();
    if (effectiveDate && Number.isNaN(Date.parse(effectiveDate))) errors.push("Price effective date must be a valid timestamp");
    const finishingStatus = emptyValue(input.finishing_status).trim().toLowerCase();
    if (finishingStatus && !FINISHING_STATUS_VALUES.has(finishingStatus)) errors.push("Finishing status is not supported");
  }
  const availabilityState = emptyValue(input.availability_state).trim().toLowerCase() as DeveloperInventoryAvailability;
  if (!AVAILABILITY_STATES.includes(availabilityState)) errors.push("Availability state is invalid");
  if (availabilityState === "held") {
    const expiresAt = input.hold_expires_at ? new Date(String(input.hold_expires_at)) : null;
    if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) errors.push("Held units need a future expiry");
  }
  return errors;
}

export function DeveloperInventoryGrid({
  projectId,
  phaseId,
  rows,
  phaseName,
  savedFilters = [],
  bulkUpdateAction,
  importAction,
  holdAction,
  releaseHoldAction,
  saveFilterAction,
}: Props) {
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState<"all" | DeveloperInventoryAvailability>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, Partial<EditableInventory>>>({});
  const [showLocalChecks, setShowLocalChecks] = useState(false);
  const [importRows, setImportRows] = useState<Array<Record<string, unknown>>>([]);
  const [importErrors, setImportErrors] = useState<Array<{ row: number; errors: string[] }>>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [filterName, setFilterName] = useState("");
  const [importRevision, setImportRevision] = useState(0);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [serverImportState, submitImportAction] = useActionState<ImportActionResult | null, FormData>(
    async (_previousState, formData) => {
      const result = await importAction(formData);
      return result ? { ...result, revision: Number(formData.get("importRevision") ?? 0) } : null;
    },
    null,
  );
  const currentServerImportState = serverImportState?.revision === importRevision ? serverImportState : null;
  const displayedImportErrors = currentServerImportState?.rowErrors ?? importErrors;
  const displayedFileError = currentServerImportState?.error ?? fileError;

  const editedRows = useMemo(
    () => rows.map((row) => ({ ...toEditable(row), ...(edits[row.id] ?? {}) })),
    [edits, rows],
  );
  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return editedRows.filter((row) => {
      const matchesAvailability = availability === "all" || row.availability_state === availability;
      if (!matchesAvailability) return false;
      if (!needle) return true;
      return [row.property_name, row.inventory_code, row.building, row.unit_number, row.id]
        .some((value) => emptyValue(value).toLowerCase().includes(needle));
    });
  }, [availability, editedRows, search]);
  const selectedRows = editedRows.filter((row) => selectedIds.includes(row.id));
  const selectedRowsForSave = selectedRows.map((row) => ({
    ...row,
    price_effective_from: normalizeDateTimeForServer(row.price_effective_from),
  }));
  const selectedErrors = selectedRows.flatMap((row) => localErrors(row).map((message) => ({ id: row.id, message })));

  const updateEdit = (id: string, field: keyof EditableInventory, value: string) => {
    setSelectedIds((current) => current.includes(id) ? current : [...current, id]);
    setShowLocalChecks(false);
    setEdits((current) => ({ ...current, [id]: { ...(current[id] ?? {}), [field]: value } }));
  };

  const toggleAllVisible = () => {
    const visibleIds = visibleRows.map((row) => row.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((current) => allSelected ? current.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...current, ...visibleIds])));
  };

  const runLocalChecks = () => setShowLocalChecks(true);

  const exportCsv = () => {
    const header = CSV_COLUMNS.join(",");
    const body = editedRows.map((row) => CSV_COLUMNS.map((column) => toCsvValue(column === "photos" && Array.isArray(row[column]) ? row[column].join("|") : row[column])).join(","));
    const blob = new Blob([[header, ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "developer-inventory.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const validateImportRows = (candidateRows: Array<Record<string, unknown>>) => {
    const errors = candidateRows.flatMap((row, index) => {
      const editable = {
        id: emptyValue(row.id),
        property_name: emptyValue(row.property_name),
        property_type: emptyValue(row.property_type),
        description: emptyValue(row.description),
        photos: Array.isArray(row.photos)
          ? row.photos.filter((value): value is string => typeof value === "string")
          : emptyValue(row.photos).split("|").filter(Boolean),
        inventory_code: emptyValue(row.inventory_code),
        building: emptyValue(row.building),
        floor_number: emptyValue(row.floor_number),
        unit_number: emptyValue(row.unit_number),
        price: emptyValue(row.price),
        unit_area: emptyValue(row.unit_area),
        availability_state: (emptyValue(row.availability_state || "available").toLowerCase() as DeveloperInventoryAvailability),
        price_effective_from: emptyValue(row.price_effective_from),
        publication_status: null,
        hold_expires_at: emptyValue(row.hold_expires_at),
        holder_type: emptyValue(row.holder_type),
        holder_reference: emptyValue(row.holder_reference),
        sale_type: emptyValue(row.sale_type),
        bedrooms: row.bedrooms,
        bathrooms: row.bathrooms,
        down_payment_percentage: row.down_payment_percentage,
        monthly_installment: row.monthly_installment,
        installment_years: row.installment_years,
        delivery_date: row.delivery_date,
        finishing_status: row.finishing_status,
      };
      const rowErrors = localErrors(editable, true);
      return rowErrors.length ? [{ row: index + 2, errors: rowErrors }] : [];
    });
    setImportErrors(errors);
    return errors;
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportRevision((current) => current + 1);
    setFileError(null);
    try {
      const candidateRows = file.name.toLowerCase().endsWith(".xlsx")
        ? workbookRowsToObjects((await readSheet(file, "Import").catch(async () => readSheet(file))) as Array<Array<unknown>>)
        : csvRowsToObjects(await file.text());
      if (!candidateRows.length) throw new Error("No inventory rows found in this file.");
      setImportRows(candidateRows);
      validateImportRows(candidateRows);
    } catch (error) {
      setImportRows([]);
      setImportErrors([]);
      setFileError(error instanceof Error ? error.message : "Unable to read this file.");
    }
  };

  const applySavedFilter = (filter: DeveloperInventorySavedFilter) => {
    const value = filter.filter as { search?: string; availability?: "all" | DeveloperInventoryAvailability };
    setSearch(value.search ?? "");
    setAvailability(value.availability ?? "all");
  };

  return (
    <section id="project-inventory" className="scroll-mt-24 rounded-3xl border border-black/5 bg-white p-4 sm:p-5" aria-label="Searchable inventory grid">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Inventory operations</p>
          <h3 className="mt-1 text-lg font-semibold text-neutral-950">Individual units</h3>
          <p className="mt-1 max-w-2xl text-xs text-neutral-500">Edit a row to select it for saving. Changes are checked before they are saved and still require moderation.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportCsv} className="rounded-full border border-black/10 px-3 py-2 text-xs font-semibold text-neutral-700 hover:border-black/30">Export CSV</button>
          <button type="button" onClick={() => importInputRef.current?.click()} className="rounded-full border border-black/10 px-3 py-2 text-xs font-semibold text-neutral-700 hover:border-black/30">Import CSV/XLSX</button>
          <input ref={importInputRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={handleImportFile} />
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_auto]">
        <label className="text-xs font-semibold text-neutral-600">
          Search inventory
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, code, building, unit…" className="mt-1 w-full rounded-xl border border-black/10 bg-[#fafafa] px-3 py-2 text-sm font-normal outline-none focus:border-black/30" />
        </label>
        <label className="text-xs font-semibold text-neutral-600">
          Availability
          <select value={availability} onChange={(event) => setAvailability(event.target.value as "all" | DeveloperInventoryAvailability)} className="mt-1 w-full rounded-xl border border-black/10 bg-[#fafafa] px-3 py-2 text-sm font-normal">
            <option value="all">All states</option>
            {AVAILABILITY_STATES.map((state) => <option key={state} value={state}>{state.replace(/_/g, " ")}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="button" onClick={runLocalChecks} disabled={!selectedIds.length} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Check changes</button>
          {saveFilterAction ? (
            <form action={saveFilterAction} className="flex items-center gap-1">
              <input type="hidden" name="projectId" value={projectId} />
              {phaseId ? <input type="hidden" name="phaseId" value={phaseId} /> : null}
              <input type="hidden" name="filter" value={JSON.stringify({ search, availability })} />
              <input name="name" aria-label="Saved filter name" value={filterName} onChange={(event) => setFilterName(event.target.value)} placeholder="Save filter as…" className="w-32 rounded-xl border border-black/10 px-2 py-2 text-xs" />
              <ProjectWorkflowSubmitButton pendingLabel="Saving…">Save filter</ProjectWorkflowSubmitButton>
            </form>
          ) : null}
        </div>
      </div>

      {savedFilters.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-neutral-500">Saved filters</span>
          {savedFilters.map((filter) => <button key={filter.id} type="button" onClick={() => applySavedFilter(filter)} className="rounded-full border border-black/10 px-3 py-1 text-neutral-600 hover:border-black/30">{filter.name}</button>)}
        </div>
      ) : null}

      {selectedIds.length ? (
        <div className="mt-4 rounded-2xl border border-black/10 bg-neutral-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-neutral-800">{selectedIds.length} selected · review changes before saving</p>
                <form action={bulkUpdateAction} onSubmit={(event) => {
                  const rowsField = event.currentTarget.elements.namedItem("rows");
                  if (!(rowsField instanceof HTMLInputElement)) return;
                  const rowsAtSubmit = selectedRows.map((row) => {
                    const effectiveInput = document.getElementById(`price-effective-${row.id}`);
                    return {
                      ...row,
                      price_effective_from: normalizeDateTimeForServer(effectiveInput instanceof HTMLInputElement ? effectiveInput.value : row.price_effective_from),
                    };
                  });
                  rowsField.value = JSON.stringify(rowsAtSubmit);
                }} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="projectId" value={projectId} />
              {phaseId ? <input type="hidden" name="phaseId" value={phaseId} /> : null}
              <input type="hidden" name="rows" value={JSON.stringify(selectedRowsForSave)} />
              <input type="hidden" name="dryRun" value="false" />
              <ProjectWorkflowSubmitButton primary disabled={!phaseId || selectedErrors.length > 0} pendingLabel="Saving…">Save selected changes</ProjectWorkflowSubmitButton>
            </form>
          </div>
          {showLocalChecks && selectedErrors.length ? <div className="mt-2 text-xs text-rose-700">{selectedErrors.map((error) => <p key={`${error.id}-${error.message}`}>Row {error.id.slice(0, 8)}: {error.message}</p>)}</div> : null}
          {showLocalChecks && !selectedErrors.length ? <p className="mt-2 text-xs text-emerald-700">Local checks passed. Save when ready; the server will validate again before writing.</p> : null}
        </div>
      ) : null}

      {displayedFileError ? <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{displayedFileError}</p> : null}
      {importRows.length ? (
        <div className="mt-4 rounded-2xl border border-black/10 bg-neutral-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Import preview</p><p className="mt-1 text-xs text-neutral-600">{importRows.length} rows parsed. Invalid rows remain visible and will not be committed.</p></div>
            <div className="flex flex-wrap gap-2">
                <form action={submitImportAction}>
                <input type="hidden" name="projectId" value={projectId} />
                {phaseId ? <input type="hidden" name="phaseId" value={phaseId} /> : null}
                <input type="hidden" name="importRevision" value={importRevision} />
                <input type="hidden" name="rows" value={JSON.stringify(importRows)} />
                <input type="hidden" name="dryRun" value="false" />
                <ProjectWorkflowSubmitButton primary disabled={!phaseId || Boolean(displayedImportErrors.length)} pendingLabel="Importing…">Import pending rows</ProjectWorkflowSubmitButton>
              </form>
            </div>
          </div>
          {displayedImportErrors.length ? <div className="mt-2 space-y-1 text-xs text-rose-700">{displayedImportErrors.map((error) => <p key={error.row}>Row {error.row}: {error.errors.join(" · ")}</p>)}</div> : <p className="mt-2 text-xs text-emerald-700">All local checks passed. Server will validate duplicates and constraints before saving.</p>}
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-black/10">
        <table className="min-w-[1040px] w-full border-collapse text-left text-xs">
          <thead className="bg-neutral-50 text-[10px] uppercase tracking-[0.16em] text-neutral-500">
            <tr>
              <th className="w-10 px-3 py-3"><input type="checkbox" checked={visibleRows.length > 0 && visibleRows.every((row) => selectedIds.includes(row.id))} onChange={toggleAllVisible} aria-label="Select visible inventory" /></th>
              <th className="px-3 py-3">Unit</th><th className="px-3 py-3">Code / location</th><th className="px-3 py-3">Price</th><th className="px-3 py-3">Area</th><th className="px-3 py-3">Availability</th><th className="px-3 py-3">Effective from</th><th className="px-3 py-3">Hold</th><th className="px-3 py-3">Publication</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const original = rows.find((item) => item.id === row.id);
              const hold = original?.active_hold;
              const rowError = showLocalChecks ? localErrors(row) : [];
              return (
                <tr key={row.id} className="border-t border-black/5 align-top">
                  <td className="px-3 py-3"><input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => setSelectedIds((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} aria-label={`Select ${row.property_name}`} /></td>
                  <td className="px-3 py-3"><input aria-label={`Unit name for ${row.property_name}`} value={row.property_name} onChange={(event) => updateEdit(row.id, "property_name", event.target.value)} className="w-44 rounded-lg border border-black/10 px-2 py-1.5 text-sm" /><p className="mt-1 text-[10px] text-neutral-400">{row.id.slice(0, 8)}</p></td>
                  <td className="space-y-1 px-3 py-3"><input aria-label={`Inventory code for ${row.property_name}`} value={emptyValue(row.inventory_code)} onChange={(event) => updateEdit(row.id, "inventory_code", event.target.value)} placeholder="Inventory code" className="w-28 rounded-lg border border-black/10 px-2 py-1.5" /><div className="flex gap-1"><input aria-label={`Building for ${row.property_name}`} value={emptyValue(row.building)} onChange={(event) => updateEdit(row.id, "building", event.target.value)} placeholder="Building" className="w-20 rounded-lg border border-black/10 px-2 py-1.5" /><input aria-label={`Unit number for ${row.property_name}`} value={emptyValue(row.unit_number)} onChange={(event) => updateEdit(row.id, "unit_number", event.target.value)} placeholder="Unit" className="w-20 rounded-lg border border-black/10 px-2 py-1.5" /></div></td>
                  <td className="px-3 py-3"><input aria-label={`Price in EGP for ${row.property_name}`} type="number" min="100000" step="0.01" value={row.price} onChange={(event) => updateEdit(row.id, "price", event.target.value)} className="w-32 rounded-lg border border-black/10 px-2 py-1.5" /></td>
                  <td className="px-3 py-3"><input aria-label={`Area in square metres for ${row.property_name}`} type="number" min="10" step="0.01" value={row.unit_area} onChange={(event) => updateEdit(row.id, "unit_area", event.target.value)} className="w-24 rounded-lg border border-black/10 px-2 py-1.5" /></td>
                  <td className="px-3 py-3"><select aria-label={`Availability for ${row.property_name}`} value={row.availability_state} onChange={(event) => updateEdit(row.id, "availability_state", event.target.value)} className="rounded-lg border border-black/10 px-2 py-1.5"><option value="available">available</option>{AVAILABILITY_STATES.filter((state) => state !== "available").map((state) => <option key={state} value={state}>{state}</option>)}</select>{row.availability_state === "held" ? <input id={`hold-expiry-${row.id}`} form={`hold-form-${row.id}`} name="expiresAtLocal" aria-label={`Hold expiry for ${row.property_name}`} type="datetime-local" value={formatDateTime(row.hold_expires_at)} onChange={(event) => updateEdit(row.id, "hold_expires_at", event.target.value)} className="mt-1 rounded-lg border border-black/10 px-2 py-1.5" /> : null}{rowError.length ? <p className="mt-1 max-w-36 text-[10px] text-rose-700">{rowError.join(" · ")}</p> : null}</td>
                      <td className="px-3 py-3"><input id={`price-effective-${row.id}`} aria-label={`Price effective date for ${row.property_name}`} type="datetime-local" value={formatDateTime(row.price_effective_from)} onChange={(event) => updateEdit(row.id, "price_effective_from", event.target.value)} className="rounded-lg border border-black/10 px-2 py-1.5" /></td>
                      <td className="px-3 py-3">{hold ? <div className="space-y-1"><p className="text-amber-800">Until {new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" }).format(new Date(hold.expires_at))}</p><form action={releaseHoldAction}><input type="hidden" name="projectId" value={projectId} />{phaseId ? <input type="hidden" name="phaseId" value={phaseId} /> : null}<input type="hidden" name="holdId" value={hold.id} /><ProjectWorkflowSubmitButton pendingLabel="Releasing…">Release hold</ProjectWorkflowSubmitButton></form></div> : row.availability_state === "held" ? <form id={`hold-form-${row.id}`} action={holdAction} onSubmit={(event) => { const local = event.currentTarget.elements.namedItem("expiresAtLocal") ?? document.getElementById(`hold-expiry-${row.id}`); const target = event.currentTarget.elements.namedItem("expiresAt"); if (local instanceof HTMLInputElement && target instanceof HTMLInputElement) target.value = normalizeDateTimeForServer(local.value); }} className="space-y-1"><input type="hidden" name="projectId" value={projectId} />{phaseId ? <input type="hidden" name="phaseId" value={phaseId} /> : null}<input type="hidden" name="propertyId" value={row.id} /><input type="hidden" name="expiresAt" value={normalizeDateTimeForServer(row.hold_expires_at)} /><input aria-label={`Holder reference for ${row.property_name}`} name="holderReference" placeholder="Holder reference" className="w-28 rounded-lg border border-black/10 px-2 py-1.5" /><ProjectWorkflowSubmitButton pendingLabel="Creating hold…">Create hold</ProjectWorkflowSubmitButton></form> : <span className="text-neutral-400">—</span>}</td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${row.publication_status === "published" ? "bg-emerald-100 text-emerald-800" : row.publication_status === "changes_requested" ? "bg-rose-100 text-rose-800" : "bg-neutral-100 text-neutral-600"}`}>{(row.publication_status ?? "draft").replace(/_/g, " ")}</span></td>
                </tr>
              );
            })}
            {!visibleRows.length ? <tr><td colSpan={9} className="px-3 py-10 text-center text-sm text-neutral-500">No inventory matches this search and filter.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-neutral-500">Publication here is the unit record status, not confirmation that customers can see it. Project and phase approval still apply.</p>
      <p className="mt-2 text-[11px] text-neutral-400">Showing {visibleRows.length} of {editedRows.length} active developer units · changes apply only to {phaseName || "the selected phase"}.</p>
    </section>
  );
}
