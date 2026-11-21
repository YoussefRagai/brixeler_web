"use client";

import { useMemo, useRef, useState } from "react";
import { readSheet } from "read-excel-file/browser";
import { FeedbackBanner } from "@/components/FeedbackBanner";
import {
  parseUnitTypeWorkbookRows,
  type ImportedType,
} from "@/lib/developerImportTemplates";

type Props = {
  projectId: string;
  phaseId?: string | null;
  onImportAction: (formData: FormData) => void;
};

export function ProjectImportPanel({ projectId, phaseId, onImportAction }: Props) {
  const [imports, setImports] = useState<ImportedType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const rows = (await readSheet(file, "Import").catch(async () => readSheet(file))) as Array<Array<unknown>>;
      const parsed = parseUnitTypeWorkbookRows(rows);
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
      {error ? <FeedbackBanner tone="error" message={error} compact /> : null}
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
                    {phaseId ? <input type="hidden" name="phaseId" value={phaseId} /> : null}
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
