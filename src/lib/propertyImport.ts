export const PROPERTY_TYPE_VALUES = [
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
] as const;

export const FINISHING_STATUS_VALUES = [
  "not_finished",
  "semi_finished",
  "finished",
  "furnished",
  "flexi_finished",
] as const;

export type PropertyImportRow = Record<string, string>;

export type ParsedPropertyCsv = {
  headers: string[];
  rows: PropertyImportRow[];
  errors: string[];
};

export type PropertyImportError = {
  row: number;
  errors: string[];
};

export type ValidatedPropertyImportRow = {
  row: number;
  property_name: string;
  price: number;
  unit_area: number;
  property_type: (typeof PROPERTY_TYPE_VALUES)[number];
  description: string;
  photos: string[];
  amenities: string[];
  bedrooms: number | null;
  bathrooms: number | null;
  sale_type: "developer_sale" | "resale";
  down_payment_percentage: number | null;
  monthly_installment: number | null;
  installment_years: number | null;
  finishing_status: string | null;
  delivery_date: string | null;
  floor_plan_url: string | null;
  video_tour_url: string | null;
  developer_id: string | null;
  project_id: string | null;
};

const REQUIRED_HEADERS = ["property_name", "price", "unit_area", "property_type", "photos"] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value: string) => UUID_PATTERN.test(value.trim());

export const normalizeCsvHeader = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

export const splitDelimitedValues = (value: string | undefined | null) =>
  String(value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

/** Parse RFC-4180-style comma-separated data without adding a dependency to the dashboard. */
export function parsePropertyCsv(text: string): ParsedPropertyCsv {
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const errors: string[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) matrix.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += character;
  }

  if (quoted) errors.push("CSV contains an unmatched quote.");
  row.push(cell);
  if (row.some((value) => value.trim())) matrix.push(row);

  const headers = (matrix.shift() ?? []).map(normalizeCsvHeader);
  const uniqueHeaders = new Set(headers.filter(Boolean));
  if (!headers.length || headers.some((header) => !header)) errors.push("CSV must start with a header row.");
  if (uniqueHeaders.size !== headers.filter(Boolean).length) errors.push("CSV headers must be unique.");
  for (const header of REQUIRED_HEADERS) {
    if (!uniqueHeaders.has(header)) errors.push(`Missing required column: ${header}.`);
  }

  const rows = matrix.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? "").trim()])),
  );
  return { headers, rows, errors };
}

const parseNumber = (value: string | undefined | null) => {
  if (!value?.trim()) return null;
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const parseOptionalNonNegativeNumber = (value: string | undefined | null) => {
  const parsed = parseNumber(value);
  return parsed != null && parsed >= 0 ? parsed : null;
};

const parseOptionalInteger = (value: string | undefined | null) => {
  const parsed = parseNumber(value);
  return parsed != null && Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};

const isHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const isIsoDate = (value: string) => {
  if (!value) return true;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
};

export function validatePropertyImportRows(
  rows: PropertyImportRow[],
  defaults: { developerId?: string | null; projectId?: string | null } = {},
) {
  const validRows: ValidatedPropertyImportRow[] = [];
  const invalidRows: PropertyImportError[] = [];
  const seenKeys = new Map<string, number>();

  rows.forEach((row, index) => {
    const line = index + 2;
    const errors: string[] = [];
    const propertyName = row.property_name?.trim() ?? "";
    const propertyType = row.property_type?.trim().toLowerCase() ?? "";
    const price = parseNumber(row.price);
    const unitArea = parseNumber(row.unit_area);
    const photos = splitDelimitedValues(row.photos);
    const uniquePhotos = new Set(photos.map((photo) => photo.toLowerCase()));
    const developerId = row.developer_id?.trim() || defaults.developerId?.trim() || null;
    const projectId = row.project_id?.trim() || defaults.projectId?.trim() || null;
    const bedrooms = parseOptionalInteger(row.bedrooms);
    const bathrooms = parseOptionalInteger(row.bathrooms);
    const downPayment = parseOptionalNonNegativeNumber(row.down_payment_percentage);
    const monthlyInstallment = parseOptionalNonNegativeNumber(row.monthly_installment);
    const installmentYears = parseOptionalInteger(row.installment_years);

    if (!propertyName) errors.push("Property name is required.");
    if (price == null || price < 100000) errors.push("Price must be at least EGP 100,000.");
    if (unitArea == null || unitArea < 10) errors.push("Unit area must be at least 10 m².");
    if (!(PROPERTY_TYPE_VALUES as readonly string[]).includes(propertyType)) errors.push("Property type is not supported.");
    if (!row.description?.trim()) errors.push("Description is required for mobile publication.");
    if (photos.length < 3) errors.push("At least three photos are required.");
    if (uniquePhotos.size !== photos.length) errors.push("Photo URLs must be unique within a listing.");
    if (photos.some((photo) => !isHttpUrl(photo))) errors.push("Every photo must be an http(s) URL.");
    if (row.bedrooms?.trim() && bedrooms == null) errors.push("Bedrooms must be a non-negative integer.");
    if (row.bathrooms?.trim() && bathrooms == null) errors.push("Bathrooms must be a non-negative integer.");
    if (row.down_payment_percentage?.trim() && (downPayment == null || downPayment > 100)) errors.push("Down payment must be between 0 and 100%.");
    if (row.monthly_installment?.trim() && monthlyInstallment == null) errors.push("Monthly installment must be non-negative.");
    if (row.installment_years?.trim() && installmentYears == null) errors.push("Installment years must be a non-negative integer.");
    if (row.delivery_date?.trim() && !isIsoDate(row.delivery_date.trim())) errors.push("Delivery date must be a valid date.");
    if (row.finishing_status?.trim() && !(FINISHING_STATUS_VALUES as readonly string[]).includes(row.finishing_status.trim().toLowerCase())) {
      errors.push("Finishing status is not supported.");
    }
    if (developerId && !isUuid(developerId)) errors.push("Developer ID must be a valid UUID.");
    if (projectId && !isUuid(projectId)) errors.push("Project ID must be a valid UUID.");
    if (!developerId && !projectId) errors.push("Associate every imported listing with a developer or project.");

    if (price != null && unitArea != null) {
      const duplicateKey = [propertyName.toLowerCase(), projectId ?? "", unitArea, price].join("|");
      const firstLine = seenKeys.get(duplicateKey);
      if (firstLine) errors.push(`Duplicate row: the same listing appears on row ${firstLine}.`);
      else seenKeys.set(duplicateKey, line);
    }

    if (errors.length) {
      invalidRows.push({ row: line, errors });
      return;
    }

    validRows.push({
      row: line,
      property_name: propertyName,
      price: price as number,
      unit_area: unitArea as number,
      property_type: propertyType as (typeof PROPERTY_TYPE_VALUES)[number],
      description: row.description.trim(),
      photos,
      amenities: splitDelimitedValues(row.amenities),
      bedrooms,
      bathrooms,
      sale_type: row.sale_type?.trim().toLowerCase() === "resale" ? "resale" : "developer_sale",
      down_payment_percentage: downPayment,
      monthly_installment: monthlyInstallment,
      installment_years: installmentYears,
      finishing_status: row.finishing_status?.trim().toLowerCase() || null,
      delivery_date: row.delivery_date?.trim() || null,
      floor_plan_url: row.floor_plan_url?.trim() || null,
      video_tour_url: row.video_tour_url?.trim() || null,
      developer_id: developerId,
      project_id: projectId,
    });
  });

  return { validRows, invalidRows };
}
