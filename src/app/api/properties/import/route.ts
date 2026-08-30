import { NextResponse } from "next/server";
import { getAdminContextFromRequest } from "@/lib/adminAuth";
import { hasAdminRole } from "@/lib/adminRoles";
import { logAdminActivity } from "@/lib/adminQueries";
import {
  isUuid,
  parsePropertyCsv,
  validatePropertyImportRows,
  type ValidatedPropertyImportRow,
} from "@/lib/propertyImport";
import { supabaseServer } from "@/lib/supabaseServer";

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

type ImportRequest = {
  mode: "preview" | "commit";
  isDemo: boolean;
  developerId: string | null;
  projectId: string | null;
};

type AssociationRow = {
  id: string;
  developer_id: string | null;
  name?: string | null;
  is_active?: boolean | null;
};

function parseBoolean(value: FormDataEntryValue | null) {
  return value === "true" || value === "1" || value === "on";
}

function parseRequest(formData: FormData): ImportRequest {
  const modeValue = formData.get("mode")?.toString();
  return {
    mode: modeValue === "commit" ? "commit" : "preview",
    isDemo: parseBoolean(formData.get("isDemo")),
    developerId: formData.get("developerId")?.toString().trim() || null,
    projectId: formData.get("projectId")?.toString().trim() || null,
  };
}

function previewResponse(
  parsed: ReturnType<typeof parsePropertyCsv>,
  validation: ReturnType<typeof validatePropertyImportRows>,
  extraErrors: Array<{ row: number; errors: string[] }> = [],
) {
  const invalidRows = [...validation.invalidRows, ...extraErrors].sort((left, right) => left.row - right.row);
  return {
    totalRows: parsed.rows.length,
    validRows: validation.validRows.filter((row) => !invalidRows.some((invalid) => invalid.row === row.row)),
    invalidRows,
    parseErrors: parsed.errors,
  };
}

async function validateAssociations(
  rows: ValidatedPropertyImportRow[],
  defaults: { developerId: string | null; projectId: string | null },
) {
  const developerIds = Array.from(new Set(rows.map((row) => row.developer_id).filter(Boolean))) as string[];
  const projectIds = Array.from(new Set(rows.map((row) => row.project_id).filter(Boolean))) as string[];
  const errors: Array<{ row: number; errors: string[] }> = [];

  if (defaults.developerId && !isUuid(defaults.developerId)) {
    errors.push({ row: 0, errors: ["The selected developer ID is invalid."] });
  }
  if (defaults.projectId && !isUuid(defaults.projectId)) {
    errors.push({ row: 0, errors: ["The selected project ID is invalid."] });
  }

  const [{ data: developers, error: developersError }, { data: projects, error: projectsError }] = await Promise.all([
    developerIds.length
      ? supabaseServer.from("developers").select("id, name, is_active").in("id", developerIds)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length
      ? supabaseServer.from("developer_projects").select("id, name, developer_id, lifecycle_state").in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (developersError) errors.push({ row: 0, errors: ["Developer association validation failed. Try the preview again."] });
  if (projectsError) errors.push({ row: 0, errors: ["Project association validation failed. Try the preview again."] });

  const developerMap = new Map(((developers ?? []) as AssociationRow[]).map((developer) => [developer.id, developer]));
  const projectMap = new Map(((projects ?? []) as AssociationRow[]).map((project) => [project.id, project]));

  for (const row of rows) {
    const rowErrors: string[] = [];
    const project = row.project_id ? projectMap.get(row.project_id) : null;
    const developer = row.developer_id ? developerMap.get(row.developer_id) : null;
    if (row.developer_id && !developer) rowErrors.push("Developer was not found.");
    if (developer && developer.is_active === false) rowErrors.push("Developer is inactive.");
    if (row.project_id && !project) rowErrors.push("Project was not found.");
    if (project?.developer_id && row.developer_id && project.developer_id !== row.developer_id) {
      rowErrors.push("Project does not belong to the selected developer.");
    }
    if (project?.developer_id && !row.developer_id) {
      row.developer_id = project.developer_id;
    }
    if (rowErrors.length) errors.push({ row: row.row, errors: rowErrors });
  }
  return errors;
}

async function findDuplicateRows(rows: ValidatedPropertyImportRow[]) {
  const names = Array.from(new Set(rows.map((row) => row.property_name)));
  if (!names.length) return [] as Array<{ row: number; errors: string[] }>;
  const nameFilters = names
    .map((name) => name.replace(/[%,()*]/g, "").trim())
    .filter(Boolean)
    .map((name) => `property_name.ilike.${name}`)
    .join(",");
  if (!nameFilters) return [] as Array<{ row: number; errors: string[] }>;
  const { data, error } = await supabaseServer
    .from("properties")
    .select("property_name, unit_area, price, project_id, approval_status")
    .or(nameFilters);
  if (error) return [{ row: 0, errors: ["Existing-listing duplicate validation failed. Try the preview again."] }];

  const existing = (data ?? []) as Array<{
    property_name: string;
    unit_area: number;
    price: number;
    project_id: string | null;
    approval_status: string | null;
  }>;
  return rows.flatMap((row) => {
    const duplicate = existing.some(
      (candidate) =>
        candidate.property_name.trim().toLowerCase() === row.property_name.trim().toLowerCase() &&
        Number(candidate.unit_area) === row.unit_area &&
        Number(candidate.price) === row.price &&
        candidate.project_id === row.project_id &&
        candidate.approval_status !== "rejected",
    );
    return duplicate ? [{ row: row.row, errors: ["A matching active, pending, or approved listing already exists."] }] : [];
  });
}

export async function POST(request: Request) {
  const admin = await getAdminContextFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminRole(admin.roles, ["listing_admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) {
    return NextResponse.json({ error: "Choose a CSV file." }, { status: 400 });
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return NextResponse.json({ error: "CSV files must be smaller than 5 MB." }, { status: 413 });
  }

  const input = parseRequest(formData);
  if (input.developerId && !isUuid(input.developerId)) {
    return NextResponse.json({ error: "The selected developer is invalid." }, { status: 400 });
  }
  if (input.projectId && !isUuid(input.projectId)) {
    return NextResponse.json({ error: "The selected project is invalid." }, { status: 400 });
  }

  const parsed = parsePropertyCsv(await file.text());
  const validation = validatePropertyImportRows(parsed.rows, {
    developerId: input.developerId,
    projectId: input.projectId,
  });
  const associationErrors = await validateAssociations(validation.validRows, {
    developerId: input.developerId,
    projectId: input.projectId,
  });
  const duplicateErrors = await findDuplicateRows(validation.validRows);
  const preview = previewResponse(parsed, validation, [...associationErrors, ...duplicateErrors]);

  if (input.mode === "preview") {
    return NextResponse.json({ mode: "preview", ...preview });
  }

  if (parsed.errors.length || preview.invalidRows.length || !preview.validRows.length) {
    return NextResponse.json(
      { mode: "preview", ...preview, error: "Fix the row-level errors before importing." },
      { status: 422 },
    );
  }

  const demoBatch = input.isDemo
    ? `property-import-${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`
    : null;
  if (demoBatch) {
    const { error } = await supabaseServer.from("demo_data_batches").insert({
      batch_key: demoBatch,
      label: "Property CSV import",
      created_by: admin.adminId,
      notes: file.name,
      status: "active",
    });
    if (error) return NextResponse.json({ error: "Unable to create the demo import batch." }, { status: 500 });
  }

  const payload = preview.validRows.map((row) => ({
    property_name: row.property_name,
    price: row.price,
    unit_area: row.unit_area,
    property_type: row.property_type,
    description: row.description,
    photos: row.photos,
    cover_photo_url: row.photos[0],
    amenities: row.amenities,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    sale_type: row.sale_type,
    down_payment_percentage: row.down_payment_percentage,
    monthly_installment: row.monthly_installment,
    installment_years: row.installment_years,
    finishing_status: row.finishing_status,
    delivery_date: row.delivery_date,
    floor_plan_url: row.floor_plan_url,
    video_tour_url: row.video_tour_url,
    developer_id: row.developer_id,
    project_id: row.project_id,
    approval_status: "pending",
    // Pending inventory is deliberately not active until an operator approves it.
    is_active: false,
    is_demo: input.isDemo,
    demo_batch: demoBatch,
  }));

  const { data, error } = await supabaseServer.from("properties").insert(payload).select("id");
  if (error) {
    if (demoBatch) await supabaseServer.from("demo_data_batches").delete().eq("batch_key", demoBatch);
    return NextResponse.json({ error: error.message ?? "Unable to import listings." }, { status: 500 });
  }

  await logAdminActivity({
    adminId: admin.adminId,
    action: "property.import",
    resourceType: "properties",
    metadata: { count: data?.length ?? payload.length, demoBatch, fileName: file.name },
  });
  return NextResponse.json({
    mode: "commit",
    imported: data?.length ?? payload.length,
    demoBatch,
    pending: true,
    isActive: false,
  });
}
