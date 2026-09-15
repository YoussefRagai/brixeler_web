/** Serialize untrusted text as a literal spreadsheet cell, then apply CSV escaping. */
export function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  // Spreadsheet importers may discard leading whitespace/control characters
  // before recognizing a formula. Keep the original text behind an apostrophe.
  const numeric = typeof value === "number" && Number.isFinite(value);
  const literal = !numeric && /^[\s\u0000-\u001f\u007f]*[=+@-]/u.test(text) ? `'${text}` : text;
  return `"${literal.replaceAll('"', '""')}"`;
}
