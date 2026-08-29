function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function conflictText(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    return text || null;
  }
  if (!isRecord(value)) return null;
  for (const key of ["message", "reason", "label", "conflict_reason"]) {
    const text = conflictText(value[key]);
    if (text) return text;
  }
  return null;
}

/**
 * Flattens both the legacy string/array response and the Growth SQL response:
 * { conflicts: { count }, recipients: [{ conflicts: [{ message }] }] }.
 */
export function normalizePreviewConflictMessages(value: unknown): string[] {
  const messages: string[] = [];
  const visit = (candidate: unknown) => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    const direct = conflictText(candidate);
    if (direct) {
      messages.push(direct);
      return;
    }
    if (!isRecord(candidate)) return;
    for (const key of ["conflicts", "conflict", "warnings", "items", "details"]) {
      if (key in candidate) visit(candidate[key]);
    }
    const count = Number(candidate.count);
    if (Number.isFinite(count) && count > 0 && !messages.length) {
      messages.push(`${count} conflict${count === 1 ? "" : "s"} detected in preview.`);
    }
  };
  visit(value);
  return [...new Set(messages)];
}

/** Stable JSON-like serialization for matching a preview to its exact payload. */
export function stablePreviewFingerprint(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? String(value);
  if (Array.isArray(value)) return `[${value.map(stablePreviewFingerprint).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stablePreviewFingerprint(record[key])}`)
    .join(",")}}`;
}
