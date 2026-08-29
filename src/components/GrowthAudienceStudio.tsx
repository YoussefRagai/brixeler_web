"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { stablePreviewFingerprint } from "@/lib/growthPreview";

type Condition = {
  id: string;
  field: string;
  operator: string;
  value: string;
  mode: "include" | "exclude";
};

type PreviewRecipient = { id: string; name?: string | null; display_name?: string | null; avatarUrl?: string | null; reason?: string | null };
type Preview = { count: number; recipients?: PreviewRecipient[]; sample?: Array<string | PreviewRecipient>; excludedCount?: number; warnings?: string[]; conflicts?: string[] };

const fields = [
  ["verification_status", "Verification status"],
  ["deals_count", "Deals closed"],
  ["deals_volume", "Deal volume"],
  ["revenue", "Revenue generated"],
  ["referrals", "Successful referrals"],
  ["listings_count", "Listings created"],
  ["tier_id", "Current tier"],
  ["developer_name", "Developer name"],
  ["project_id", "Project"],
  ["property_type", "Property type"],
] as const;

const operators = [
  ["eq", "is"],
  ["neq", "is not"],
  ["gte", "is at least"],
  ["lte", "is at most"],
  ["contains", "contains"],
  ["in", "is one of"],
] as const;

const newCondition = (): Condition => ({ id: crypto.randomUUID(), field: "verification_status", operator: "eq", value: "verified", mode: "include" });

export function GrowthAudienceStudio() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [description, setDescription] = useState("");
  const [match, setMatch] = useState<"all" | "any">("all");
  const [conditions, setConditions] = useState<Condition[]>([newCondition()]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewFingerprint, setPreviewFingerprint] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const clearPreview = () => {
    setPreview(null);
    setPreviewFingerprint(null);
  };

  const definition = useMemo(() => ({
    match,
    conditions: conditions.map((condition) => ({
      field: condition.field,
      operator: condition.operator,
      value: condition.value,
      mode: condition.mode,
    })),
  }), [conditions, match]);
  const summary = useMemo(() => {
    const phrases = conditions.map((condition) => {
      const field = fields.find(([value]) => value === condition.field)?.[1] ?? condition.field;
      const operator = operators.find(([value]) => value === condition.operator)?.[1] ?? condition.operator;
      return `${condition.mode === "exclude" ? "exclude when" : "when"} ${field.toLowerCase()} ${operator} ${condition.value || "…"}`;
    });
    return `Include agents ${phrases.join(match === "all" ? " and " : " or ")}.`;
  }, [conditions, match]);

  const updateCondition = (id: string, patch: Partial<Condition>) => {
    clearPreview();
    setConditions((current) => current.map((condition) => condition.id === id ? { ...condition, ...patch } : condition));
  };
  const payload = () => ({ name, name_ar: nameAr || null, description: description || null, definition });
  const currentPreviewFingerprint = stablePreviewFingerprint(payload());
  const previewIsFresh = Boolean(preview && previewFingerprint === currentPreviewFingerprint);

  const request = async (mode: "preview" | "save") => {
    setMessage(null);
    if (!name.trim() || conditions.some((condition) => !condition.value.trim())) {
      setMessage("Name the audience and complete every condition first.");
      return;
    }
    const requestPayload = payload();
    const nextPreviewFingerprint = stablePreviewFingerprint(requestPayload);
    if (mode === "save" && (!preview || previewFingerprint !== nextPreviewFingerprint)) {
      setPreview(null);
      setPreviewFingerprint(null);
      setMessage("Refresh the audience preview before saving.");
      return;
    }
    const response = await fetch(mode === "preview" ? "/api/admin/growth/audiences/preview" : "/api/admin/growth/audiences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...requestPayload, lifecycle_state: mode === "save" ? "active" : "draft" }),
    });
    const responseBody = await response.json().catch(() => null) as Preview | { error?: string } | null;
    if (!response.ok) {
      if (mode === "preview") {
        setPreview(null);
        setPreviewFingerprint(null);
      }
      setMessage(responseBody && "error" in responseBody ? responseBody.error || "Request failed." : "Request failed.");
      return;
    }
    if (mode === "preview") {
      if (stablePreviewFingerprint(payload()) !== nextPreviewFingerprint) return;
      setPreview(responseBody as Preview);
      setPreviewFingerprint(nextPreviewFingerprint);
    }
    else {
      setMessage("Audience saved and ready to reuse.");
      startTransition(() => router.refresh());
    }
  };

  return (
    <section className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="audience-builder-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">Shared audience</p>
          <h2 id="audience-builder-title" className="mt-1 text-xl font-semibold text-neutral-950">Build once, reuse everywhere</h2>
          <p className="mt-1 text-sm text-neutral-500">Use this audience for gifts, tiers, badges, notifications, and targeted content.</p>
        </div>
        <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500" htmlFor="audience-match">Match<select id="audience-match" value={match} onChange={(event) => { clearPreview(); setMatch(event.target.value as "all" | "any"); }} className="ml-2 min-h-10 rounded-full border border-black/10 bg-neutral-50 px-3 py-2 text-sm font-normal normal-case tracking-normal text-neutral-900"><option value="all">All conditions</option><option value="any">Any condition</option></select></label>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="text-sm" htmlFor="audience-name"><span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Audience name</span><input id="audience-name" value={name} onChange={(event) => { clearPreview(); setName(event.target.value); }} className="mt-1 min-h-12 w-full rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3" placeholder="High-performing New Cairo agents" /></label>
        <label className="text-sm" htmlFor="audience-name-ar"><span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Arabic name</span><input id="audience-name-ar" dir="rtl" value={nameAr} onChange={(event) => { clearPreview(); setNameAr(event.target.value); }} className="mt-1 min-h-12 w-full rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3 text-right" /></label>
        <label className="text-sm md:col-span-2" htmlFor="audience-description"><span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Internal description</span><input id="audience-description" value={description} onChange={(event) => { clearPreview(); setDescription(event.target.value); }} className="mt-1 min-h-12 w-full rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3" placeholder="Used for quarterly recognition and launch campaigns" /></label>
      </div>

      <div className="mt-6 space-y-3">
        {conditions.map((condition, index) => (
          <fieldset key={condition.id} className="grid gap-3 rounded-2xl border border-black/5 bg-neutral-50 p-4 md:grid-cols-[0.7fr_1.2fr_1fr_1.2fr_auto]">
            <legend className="sr-only">Condition {index + 1}</legend>
        <label className="text-xs font-semibold text-neutral-500">Mode<select aria-label={`Condition ${index + 1} mode`} value={condition.mode} onChange={(event) => updateCondition(condition.id, { mode: event.target.value as Condition["mode"] })} className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-normal text-neutral-900"><option value="include">Include</option><option value="exclude">Exclude</option></select></label>
            <label className="text-xs font-semibold text-neutral-500">Signal<select aria-label={`Condition ${index + 1} signal`} value={condition.field} onChange={(event) => updateCondition(condition.id, { field: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-normal text-neutral-900">{fields.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-xs font-semibold text-neutral-500">Comparison<select aria-label={`Condition ${index + 1} comparison`} value={condition.operator} onChange={(event) => updateCondition(condition.id, { operator: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-normal text-neutral-900">{operators.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-xs font-semibold text-neutral-500">Value<input aria-label={`Condition ${index + 1} value`} value={condition.value} onChange={(event) => updateCondition(condition.id, { value: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-normal text-neutral-900" /></label>
            <button type="button" aria-label={`Remove condition ${index + 1}`} onClick={() => { clearPreview(); setConditions((current) => current.filter((item) => item.id !== condition.id)); }} disabled={conditions.length === 1} className="mt-5 grid h-11 w-11 place-items-center rounded-full border border-black/10 bg-white text-neutral-600 hover:border-rose-200 hover:text-rose-700 disabled:opacity-40"><Trash2 aria-hidden="true" size={16} /></button>
          </fieldset>
        ))}
      </div>
      <button type="button" onClick={() => { clearPreview(); setConditions((current) => [...current, newCondition()]); }} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-sm font-semibold text-neutral-700 hover:border-black/30"><Plus aria-hidden="true" size={16} />Add condition</button>

      <div className="mt-6 rounded-2xl border border-black/5 bg-neutral-950 p-4 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-neutral-400">Rule in plain language</p>
        <p className="mt-2 text-sm leading-6">{summary}</p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => request("preview")} disabled={pending} className="min-h-11 rounded-full border border-black/10 px-5 py-2.5 text-sm font-semibold text-neutral-800 hover:border-black/30">Preview audience</button>
        <button type="button" onClick={() => request("save")} disabled={pending || !previewIsFresh} className="min-h-11 rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40">Save active audience</button>
        <p aria-live="polite" className="text-sm text-neutral-600">{message}</p>
      </div>

      {preview ? (
        <div className="mt-5 rounded-2xl border border-black/5 bg-neutral-50 p-4" aria-live="polite">
          <div className="flex flex-wrap justify-between gap-2"><p className="font-semibold text-neutral-950">{preview.count.toLocaleString("en-EG")} agents qualify</p>{preview.excludedCount != null ? <p className="text-sm text-neutral-500">{preview.excludedCount} excluded</p> : null}</div>
          {preview.warnings?.map((warning) => <p key={warning} className="mt-2 text-sm text-amber-800">{warning}</p>)}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(preview.recipients ?? preview.sample ?? []).slice(0, 8).map((recipient, index) => {
              const row = typeof recipient === "string" ? { id: recipient, name: "Qualified agent" } : recipient;
              return <div key={row.id ?? index} className="rounded-xl border border-black/5 bg-white px-3 py-2"><p className="text-sm font-semibold text-neutral-900">{row.name ?? row.display_name ?? "Qualified agent"}</p>{row.reason ? <p className="text-xs text-neutral-500">{row.reason}</p> : null}</div>;
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
