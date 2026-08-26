"use client";

import { useMemo, useState } from "react";

const filterOptions = [
  { key: "developer_name", label: "Developer name", placeholder: "e.g. Palm Hills" },
  { key: "developer_id", label: "Developer ID", placeholder: "Paste the developer UUID" },
  { key: "project_id", label: "Project ID", placeholder: "Paste the project UUID" },
  { key: "property_type", label: "Property type", placeholder: "e.g. Villa" },
] as const;

type FilterKey = (typeof filterOptions)[number]["key"];

export function RuleFilterBuilder({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [filterKey, setFilterKey] = useState<FilterKey>("developer_name");
  const [filterValue, setFilterValue] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const parsed = useMemo(() => {
    try {
      const candidate = value ? JSON.parse(value) : {};
      return candidate && typeof candidate === "object" && !Array.isArray(candidate)
        ? (candidate as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }, [value]);

  const addFilter = () => {
    const trimmed = filterValue.trim();
    if (!trimmed) return;
    const next = { ...(parsed ?? {}), [filterKey]: trimmed };
    onChange(JSON.stringify(next, null, 2));
    setFilterValue("");
  };

  const removeFilter = (key: string) => {
    if (!parsed) return;
    const next = { ...parsed };
    delete next[key];
    onChange(JSON.stringify(next, null, 2));
  };

  return (
    <div className="rounded-2xl border border-black/10 bg-neutral-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500">Optional audience filters</p>
          <p className="mt-1 text-sm text-neutral-600">Narrow this rule to an existing developer, project, or property type.</p>
        </div>
        <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-neutral-500">No filter = everyone</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_auto]">
        <label className="text-sm text-neutral-600">
          Field
          <select value={filterKey} onChange={(event) => setFilterKey(event.target.value as FilterKey)} className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900">
            {filterOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </label>
        <label className="text-sm text-neutral-600">
          Matches
          <input value={filterValue} onChange={(event) => setFilterValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addFilter(); } }} placeholder={filterOptions.find((option) => option.key === filterKey)?.placeholder} className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900" />
        </label>
        <button type="button" onClick={addFilter} className="min-h-11 self-end rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition-colors hover:border-black/35 hover:bg-neutral-100">Add filter</button>
      </div>
      {parsed && Object.keys(parsed).length ? (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Active filters">
          {Object.entries(parsed).map(([key, filter]) => (
            <button key={key} type="button" onClick={() => removeFilter(key)} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs text-neutral-700 transition-colors hover:border-rose-300 hover:text-rose-700">
              {filterOptions.find((option) => option.key === key)?.label ?? key}: {String(filter)} <span aria-hidden="true" className="ml-1">×</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-4 border-t border-black/10 pt-3">
        <button type="button" onClick={() => setAdvancedOpen((current) => !current)} aria-expanded={advancedOpen} className="text-xs font-semibold text-neutral-600 underline decoration-black/20 underline-offset-4 hover:text-black">
          {advancedOpen ? "Hide advanced JSON" : "Advanced JSON"}
        </button>
        {advancedOpen ? (
          <label className="mt-3 block text-sm text-neutral-600">
            Edit the filter object directly
            <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} spellCheck={false} className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 font-mono text-xs text-neutral-900" aria-invalid={parsed === null} />
            {parsed === null ? <span className="mt-1 block text-xs text-rose-600">Use a valid JSON object, for example {`{"property_type":"Villa"}`}.</span> : null}
          </label>
        ) : null}
      </div>
    </div>
  );
}
