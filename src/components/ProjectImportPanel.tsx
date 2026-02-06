"use client";

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

type ImportedVariant = {
  bedrooms?: number;
  bathrooms?: number;
  areaMin?: number;
  areaMax?: number;
  price?: number;
  downPayment?: number;
  installmentYears?: number;
  stockCount?: number;
  description?: string;
  amenities: string[];
};

type ImportedType = {
  baseType: string;
  finishingStatus?: string;
  description?: string;
  variants: ImportedVariant[];
};

type Props = {
  projectId: string;
  onImportAction: (formData: FormData) => void;
};

const AMENITY_COLUMNS: Array<{ label: string; slug: string }> = [
  { label: "Garden?", slug: "garden" },
  { label: "Has Roof?", slug: "roof" },
  { label: "Bicycle Lanes?", slug: "bicycle" },
  { label: "Disability Support?", slug: "accessibility" },
  { label: "Jogging Trail?", slug: "jogging" },
  { label: "Outdoor Pools?", slug: "pools" },
  { label: "Mosque?", slug: "mosque" },
  { label: "Sports Clubs?", slug: "sports" },
  { label: "Business Hub?", slug: "business" },
  { label: "Commercial Strip?", slug: "commercial" },
  { label: "Medical Center?", slug: "medical" },
  { label: "Schools?", slug: "schools" },
  { label: "Underground Parking?", slug: "parking" },
  { label: "Clubhouse?", slug: "clubhouse" },
  { label: "Terrace?", slug: "terrace" },
  { label: "Sea View?", slug: "sea_view" },
];

const normalizeBool = (value: unknown) => {
  if (value == null) return false;
  const raw = String(value).trim().toLowerCase();
  return ["yes", "y", "true", "1"].includes(raw);
};

const normalizeNumber = (value: unknown) => {
  if (value == null || value === "") return undefined;
  const num = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(num) ? num : undefined;
};

const toStringValue = (value: unknown) => {
  if (value == null) return "";
  return String(value).trim();
};

function parseWorkbook(buffer: ArrayBuffer): ImportedType[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets["Import"] ?? workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as Array<Array<unknown>>;
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => toStringValue(header));
  const idx = (name: string) => headers.indexOf(name);

  const baseTypeIdx = idx("Base Type");
  const finishingIdx = idx("Finishing Status");
  const typeDescIdx = idx("Type Description");
  const bedroomsIdx = idx("Bedrooms");
  const bathroomsIdx = idx("Bathrooms");
  const areaMinIdx = idx("Area Min (m²)");
  const areaMaxIdx = idx("Area Max (m²)");
  const priceIdx = idx("Price (EGP)");
  const downIdx = idx("Down Payment (%)");
  const yearsIdx = idx("Installment Years");
  const stockIdx = idx("Stock Count");
  const variantDescIdx = idx("Variant Description");

  const amenityIndices = AMENITY_COLUMNS.map((amenity) => ({
    slug: amenity.slug,
    index: idx(amenity.label),
  }));

  const groups = new Map<string, ImportedType>();

  rows.slice(1).forEach((row) => {
    const baseType = toStringValue(row[baseTypeIdx]);
    if (!baseType) return;
    const finishingStatus = toStringValue(row[finishingIdx]) || undefined;
    const description = toStringValue(row[typeDescIdx]) || undefined;
    const key = `${baseType}||${finishingStatus ?? ""}||${description ?? ""}`;

    const amenities = amenityIndices
      .filter((item) => item.index >= 0 && normalizeBool(row[item.index]))
      .map((item) => item.slug);

    const variant: ImportedVariant = {
      bedrooms: normalizeNumber(row[bedroomsIdx]),
      bathrooms: normalizeNumber(row[bathroomsIdx]),
      areaMin: normalizeNumber(row[areaMinIdx]),
      areaMax: normalizeNumber(row[areaMaxIdx]),
      price: normalizeNumber(row[priceIdx]),
      downPayment: normalizeNumber(row[downIdx]),
      installmentYears: normalizeNumber(row[yearsIdx]),
      stockCount: normalizeNumber(row[stockIdx]),
      description: toStringValue(row[variantDescIdx]) || undefined,
      amenities,
    };

    const existing = groups.get(key);
    if (existing) {
      existing.variants.push(variant);
    } else {
      groups.set(key, {
        baseType,
        finishingStatus,
        description,
        variants: [variant],
      });
    }
  });

  return Array.from(groups.values());
}

export function ProjectImportPanel({ projectId, onImportAction }: Props) {
  const [imports, setImports] = useState<ImportedType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseWorkbook(buffer);
      if (!parsed.length) {
        setError("No rows found in the template.");
        setImports([]);
        return;
      }
      setError(null);
      setImports(parsed);
    } catch (err) {
      setError((err as Error).message ?? "Failed to read file.");
      setImports([]);
    }
  };

  const totalVariants = useMemo(
    () => imports.reduce((sum, item) => sum + item.variants.length, 0),
    [imports],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-full border border-black/10 px-4 py-2 text-xs font-semibold text-neutral-600 hover:border-black/30 hover:text-black"
          onClick={() => inputRef.current?.click()}
        >
          Upload import file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={handleFileChange}
        />
        {imports.length ? (
          <span className="text-xs text-neutral-500">
            Loaded {imports.length} types · {totalVariants} variants
          </span>
        ) : null}
      </div>
      {error ? <p className="text-xs text-rose-500">{error}</p> : null}
      {imports.length ? (
        <div className="space-y-3 rounded-3xl border border-black/5 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Imported preview</p>
              <p className="text-sm text-neutral-600">
                Review the imported types below. Click save to create them, then add images if needed.
              </p>
            </div>
            <button
              type="button"
              className="text-xs text-neutral-400 hover:text-neutral-700"
              onClick={() => setImports([])}
            >
              Clear
            </button>
          </div>
          <div className="space-y-3">
            {imports.map((item, index) => (
              <div key={`${item.baseType}-${index}`} className="rounded-2xl border border-black/5 bg-neutral-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{item.baseType}</p>
                    {item.finishingStatus ? (
                      <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                        {item.finishingStatus.replace(/_/g, " ")}
                      </p>
                    ) : null}
                    {item.description ? (
                      <p className="text-xs text-neutral-500">{item.description}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-neutral-500">
                      {item.variants.length} variants imported
                    </p>
                  </div>
                  <form action={onImportAction}>
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="payload" value={JSON.stringify(item)} />
                    <button className="rounded-full bg-black px-3 py-1 text-xs font-semibold text-white" type="submit">
                      Save type + variants
                    </button>
                  </form>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-600">
                  {item.variants.map((variant, variantIndex) => (
                    <span
                      key={`${item.baseType}-${index}-${variantIndex}`}
                      className="rounded-full border border-black/10 px-3 py-1"
                    >
                      {[
                        variant.bedrooms != null ? `${variant.bedrooms}BR` : "?BR",
                        variant.bathrooms != null ? `${variant.bathrooms}BA` : "?BA",
                        variant.areaMin ? `${variant.areaMin}m²` : "Area TBD",
                        variant.price ? `EGP ${variant.price.toLocaleString()}` : "Price TBD",
                      ].join(" · ")}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
