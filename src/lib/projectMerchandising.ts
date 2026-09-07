export type DownPaymentStage = { percent: number; after_months: number };

/** Stages are additional payments after the initial booking percentage. */
export function validateDownPaymentSchedule(initial: number | null | undefined, value: unknown): DownPaymentStage[] {
  if (initial != null && (!Number.isFinite(initial) || initial < 0 || initial > 100)) throw new Error("Initial down payment must be between 0 and 100%.");
  if (!Array.isArray(value) || value.length > 12) throw new Error("Use no more than 12 additional down payments.");
  let total = initial ?? 0;
  let previousMonth = 0;
  return value.map((stage) => {
    if (!stage || typeof stage !== "object" || typeof stage.percent !== "number" || !Number.isFinite(stage.percent) || stage.percent <= 0 || stage.percent > 100) throw new Error("Each additional down payment needs a percentage greater than 0 and at most 100.");
    if (!Number.isInteger(stage.after_months) || stage.after_months <= previousMonth || stage.after_months > 1200) throw new Error("Additional down payments must have increasing months after booking (1–1200).");
    previousMonth = stage.after_months;
    total += stage.percent;
    if (total > 100 + 0.000001) throw new Error("Initial and additional down payments cannot total more than 100%.");
    return { percent: stage.percent, after_months: stage.after_months };
  });
}

export function parseDownPaymentStages(form: FormData, prefix: string, initial: number | null): DownPaymentStage[] {
  const stages: DownPaymentStage[] = [];
  for (let index = 0; index < 12; index++) {
    const percent = form.get(`${prefix}StagePercent_${index}`)?.toString().trim() ?? "";
    const month = form.get(`${prefix}StageMonth_${index}`)?.toString().trim() ?? "";
    if (!percent && !month) continue;
    if (!percent || !month) throw new Error("Enter both the percentage and month for each additional payment.");
    stages.push({ percent: Number(percent), after_months: Number(month) });
  }
  return validateDownPaymentSchedule(initial, stages);
}

export function parseLineItems(raw: string, label: string): string[] {
  const items = [...new Set(raw.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))];
  if (items.length > 50 || items.some((item) => item.length > 300)) throw new Error(`${label}: use up to 50 lines, each no longer than 300 characters.`);
  return items;
}

export function validDeliveryDate(value: string): boolean {
  return !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
}
