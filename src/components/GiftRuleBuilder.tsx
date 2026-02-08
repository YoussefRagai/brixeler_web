"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const metrics = [
  { value: "deals_count", label: "Deals count" },
  { value: "deals_volume", label: "Deals volume" },
  { value: "revenue", label: "Revenue" },
  { value: "referrals", label: "Referrals" },
  { value: "claim_acceptance", label: "Claim acceptance rate" },
  { value: "listings_count", label: "Listings count" },
];

const timeWindows = [
  { value: "all_time", label: "All time" },
  { value: "last_30d", label: "Last 30 days" },
  { value: "last_90d", label: "Last 90 days" },
  { value: "quarter", label: "This quarter" },
  { value: "year", label: "This year" },
];

const operators = [
  { value: ">=", label: "≥" },
  { value: "<=", label: "≤" },
  { value: "between", label: "Between" },
  { value: "top_n", label: "Top N" },
  { value: "top_percent", label: "Top %" },
];

type GiftOption = { id: string; title: string };

type PreviewResult = { count: number; sample: string[] };

export function GiftRuleBuilder({ gifts }: { gifts: GiftOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [giftId, setGiftId] = useState<string>(gifts[0]?.id ?? "");
  const [metric, setMetric] = useState<string>(metrics[0].value);
  const [timeWindow, setTimeWindow] = useState<string>(timeWindows[0].value);
  const [operator, setOperator] = useState<string>(operators[0].value);
  const [valueSingle, setValueSingle] = useState<string>("");
  const [valueMin, setValueMin] = useState<string>("");
  const [valueMax, setValueMax] = useState<string>("");
  const [filtersJson, setFiltersJson] = useState<string>("{}");
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const giftOptions = useMemo(() => gifts, [gifts]);

  const buildPayload = () => ({
    gift_id: giftId,
    metric,
    time_window: timeWindow,
    operator,
    value_single: valueSingle ? Number(valueSingle) : null,
    value_min: valueMin ? Number(valueMin) : null,
    value_max: valueMax ? Number(valueMax) : null,
    filters: filtersJson ? JSON.parse(filtersJson) : {},
  });

  const handlePreview = async () => {
    setPreviewError(null);
    setActionMessage(null);
    try {
      const payload = buildPayload();
      const res = await fetch("/api/admin/gifts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Preview failed");
      }
      const data = (await res.json()) as PreviewResult;
      setPreviewResult(data);
    } catch (error) {
      setPreviewError((error as Error).message);
      setPreviewResult(null);
    }
  };

  const handleCreate = async () => {
    setPreviewError(null);
    setActionMessage(null);
    try {
      const payload = buildPayload();
      const res = await fetch("/api/admin/gifts/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to create rule");
      }
      setActionMessage("Rule created.");
      startTransition(() => router.refresh());
    } catch (error) {
      setPreviewError((error as Error).message);
    }
  };

  return (
    <div className="rounded-3xl border border-black/5 bg-white px-8 py-8 shadow-xl shadow-black/5">
      <div className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">Rule builder</p>
        <h3 className="text-2xl font-semibold text-[#050505]">Create a gift rule</h3>
        <p className="text-sm text-neutral-500">Define who qualifies before you publish a gift.</p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="text-sm text-neutral-500">
          Gift
          <select
            value={giftId}
            onChange={(event) => setGiftId(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[#050505]"
          >
            {giftOptions.map((gift) => (
              <option key={gift.id} value={gift.id}>
                {gift.title}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-neutral-500">
          Metric
          <select
            value={metric}
            onChange={(event) => setMetric(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[#050505]"
          >
            {metrics.map((metricOption) => (
              <option key={metricOption.value} value={metricOption.value}>
                {metricOption.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-neutral-500">
          Window
          <select
            value={timeWindow}
            onChange={(event) => setTimeWindow(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[#050505]"
          >
            {timeWindows.map((windowOption) => (
              <option key={windowOption.value} value={windowOption.value}>
                {windowOption.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-neutral-500">
          Operator
          <select
            value={operator}
            onChange={(event) => setOperator(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[#050505]"
          >
            {operators.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
        </label>

        {operator === "between" ? (
          <div className="flex gap-3">
            <label className="flex-1 text-sm text-neutral-500">
              Min
              <input
                value={valueMin}
                onChange={(event) => setValueMin(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[#050505]"
                placeholder="0"
                type="number"
              />
            </label>
            <label className="flex-1 text-sm text-neutral-500">
              Max
              <input
                value={valueMax}
                onChange={(event) => setValueMax(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[#050505]"
                placeholder="100"
                type="number"
              />
            </label>
          </div>
        ) : (
          <label className="text-sm text-neutral-500">
            Value
            <input
              value={valueSingle}
              onChange={(event) => setValueSingle(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[#050505]"
              placeholder="10"
              type="number"
            />
          </label>
        )}

        <label className="text-sm text-neutral-500 md:col-span-2">
          Filters (JSON)
          <textarea
            value={filtersJson}
            onChange={(event) => setFiltersJson(event.target.value)}
            rows={3}
            className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[#050505]"
          />
        </label>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handlePreview}
          className="rounded-full border border-black/10 px-5 py-2 text-sm font-semibold text-[#050505] hover:bg-black/5"
        >
          Preview
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={isPending}
          className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-black/10 hover:bg-black/90 disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Save rule"}
        </button>
        {actionMessage ? <span className="text-xs text-emerald-600">{actionMessage}</span> : null}
        {previewError ? <span className="text-xs text-red-500">{previewError}</span> : null}
      </div>

      {previewResult ? (
        <div className="mt-6 rounded-2xl border border-black/5 bg-black/5 px-4 py-3 text-xs text-neutral-600">
          <p>
            Users affected: <span className="font-semibold text-[#050505]">{previewResult.count}</span>
          </p>
          <p className="mt-1 text-[11px] text-neutral-500">
            Sample: {previewResult.sample?.length ? previewResult.sample.join(", ") : "No sample"}
          </p>
        </div>
      ) : null}
    </div>
  );
}
