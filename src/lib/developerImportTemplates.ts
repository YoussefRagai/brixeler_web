/**
 * Browser-safe parsing helpers shared by the project template workspace and
 * the per-project inventory grid. Keep the field names here aligned with the
 * server import actions; the browser should only normalize presentation.
 */

export type DeveloperTemplateKind = "unit_types" | "inventory";

export type ImportedVariant = {
  bedrooms?: number;
  bathrooms?: number;
  hasGarden?: boolean;
  hasRoof?: boolean;
  areaMin?: number;
  areaMax?: number;
  price?: number;
  downPayment?: number;
  installmentYears?: number;
  stockCount?: number;
  description?: string;
  amenities: string[];
};

export type ImportedType = {
  baseType: string;
  finishingStatus?: string;
  description?: string;
  variants: ImportedVariant[];
};

export const UNIT_TYPE_AMENITY_COLUMNS: Array<{ label: string; slug: string }> = [
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

export const INVENTORY_TEMPLATE_COLUMNS = [
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

/**
 * Columns accepted by import_developer_inventory_rows. This is intentionally
 * broader than the editable grid export: new rows need the server-required
 * property type, description, and photo fields as well as price and area.
 */
export const INVENTORY_IMPORT_TEMPLATE_COLUMNS = [
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
  "bedrooms",
  "bathrooms",
  "down_payment_percentage",
  "monthly_installment",
  "installment_years",
  "delivery_date",
  "finishing_status",
  "floor_plan_url",
  "video_tour_url",
  "amenities",
  "sale_type",
  "inventory_notes",
] as const;

export const INVENTORY_HEADER_ALIASES: Record<string, string> = {
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

export const toStringValue = (value: unknown) => (value == null ? "" : String(value).trim());

export const normalizeHeader = (value: unknown) =>
  toStringValue(value)
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

export const normalizeBoolean = (value: unknown) => {
  const raw = toStringValue(value).toLowerCase();
  return ["yes", "y", "true", "1"].includes(raw);
};

export const normalizeNumber = (value: unknown) => {
  if (value == null || value === "") return undefined;
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : undefined;
};

export function parseUnitTypeWorkbookRows(rows: Array<Array<unknown>>): ImportedType[] {
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => toStringValue(header));
  const indexFor = (name: string) => headers.indexOf(name);
  const baseTypeIndex = indexFor("Base Type");
  const finishingIndex = indexFor("Finishing Status");
  const typeDescriptionIndex = indexFor("Type Description");
  const bedroomsIndex = indexFor("Bedrooms");
  const bathroomsIndex = indexFor("Bathrooms");
  const areaMinIndex = indexFor("Area Min (m²)");
  const areaMaxIndex = indexFor("Area Max (m²)");
  const priceIndex = indexFor("Price (EGP)");
  const downPaymentIndex = indexFor("Down Payment (%)");
  const installmentYearsIndex = indexFor("Installment Years");
  const stockCountIndex = indexFor("Stock Count");
  const variantDescriptionIndex = indexFor("Variant Description");
  const amenityIndices = UNIT_TYPE_AMENITY_COLUMNS.map((amenity) => ({
    slug: amenity.slug,
    index: indexFor(amenity.label),
  }));

  const groups = new Map<string, ImportedType>();
  rows.slice(1).forEach((row) => {
    const baseType = toStringValue(row[baseTypeIndex]);
    if (!baseType) return;
    const finishingStatus = toStringValue(row[finishingIndex]) || undefined;
    const description = toStringValue(row[typeDescriptionIndex]) || undefined;
    const key = `${baseType}||${finishingStatus ?? ""}||${description ?? ""}`;
    const amenities = amenityIndices
      .filter((item) => item.index >= 0 && normalizeBoolean(row[item.index]))
      .map((item) => item.slug);
    const variant: ImportedVariant = {
      bedrooms: normalizeNumber(row[bedroomsIndex]),
      bathrooms: normalizeNumber(row[bathroomsIndex]),
      hasGarden: amenities.includes("garden"),
      hasRoof: amenities.includes("roof"),
      areaMin: normalizeNumber(row[areaMinIndex]),
      areaMax: normalizeNumber(row[areaMaxIndex]),
      price: normalizeNumber(row[priceIndex]),
      downPayment: normalizeNumber(row[downPaymentIndex]),
      installmentYears: normalizeNumber(row[installmentYearsIndex]),
      stockCount: normalizeNumber(row[stockCountIndex]),
      description: toStringValue(row[variantDescriptionIndex]) || undefined,
      amenities,
    };
    const existing = groups.get(key);
    if (existing) existing.variants.push(variant);
    else groups.set(key, { baseType, finishingStatus, description, variants: [variant] });
  });
  return Array.from(groups.values());
}

export function parseCsv(text: string): string[][] {
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
    } else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

export function workbookRowsToInventoryObjects(rows: Array<Array<unknown>>): Array<Record<string, unknown>> {
  if (rows.length < 2) return [];
  const keys = rows[0].map((header) => INVENTORY_HEADER_ALIASES[normalizeHeader(header)] ?? normalizeHeader(header));
  return rows.slice(1).map((values) =>
    Object.fromEntries(keys.map((key, index) => [key, values[index] == null ? "" : values[index]])),
  );
}

export function csvRowsToInventoryObjects(text: string) {
  return workbookRowsToInventoryObjects(parseCsv(text));
}
