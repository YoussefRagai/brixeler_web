import { strToU8, zipSync } from "fflate";
import { supabaseServer } from "./supabaseServer";
import { hasAdminRole, type AdminRole } from "./adminRoles";

export type AdminExportType = "dashboard" | "agents" | "deals" | "properties" | "commissions";
export type ExportRow = Record<string, string | number | boolean | null>;
export type AdminExportFilters = {
  from?: string;
  to?: string;
  status?: string;
  demo?: "all" | "production" | "demo";
};

export const ADMIN_EXPORT_DEFINITIONS: Record<AdminExportType, {
  label: string;
  description: string;
  requiredRoles: AdminRole[];
  sensitivity: string;
}> = {
  dashboard: {
    label: "Dashboard",
    description: "Current operational counts and pipeline snapshot.",
    requiredRoles: ["super_admin"],
    sensitivity: "Internal summary",
  },
  agents: {
    label: "Agents",
    description: "Agent directory, verification, and performance fields.",
    requiredRoles: ["super_admin", "user_auth_admin"],
    sensitivity: "Confidential people data",
  },
  deals: {
    label: "Deals",
    description: "Deal pipeline records, clients, and sale amounts.",
    requiredRoles: ["super_admin", "deals_admin"],
    sensitivity: "Highly confidential financial data",
  },
  properties: {
    label: "Properties",
    description: "Property inventory, approval, and publication state.",
    requiredRoles: ["super_admin", "listing_admin"],
    sensitivity: "Operational inventory data",
  },
  commissions: {
    label: "Commissions",
    description: "Commission rates, estimates, and payment state.",
    requiredRoles: ["super_admin", "deals_admin"],
    sensitivity: "Highly confidential financial data",
  },
};

export function canExportType(roles: AdminRole[], type: AdminExportType) {
  return hasAdminRole(roles, ADMIN_EXPORT_DEFINITIONS[type].requiredRoles);
}

function filterDate(value: string | undefined, end = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  if (date.toISOString().slice(0, 10) !== value) return undefined;
  if (end) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

export function normalizeExportFilters(filters: Partial<AdminExportFilters>): AdminExportFilters {
  const demo = filters.demo === "production" || filters.demo === "demo" ? filters.demo : "all";
  return {
    from: filterDate(filters.from),
    to: filterDate(filters.to, true),
    status: typeof filters.status === "string" && /^[a-z_ ]{1,40}$/i.test(filters.status) ? filters.status : undefined,
    demo,
  };
}

function applyDateFilters<T extends { gte(column: string, value: string): T; lt(column: string, value: string): T }>(query: T, column: string, filters: AdminExportFilters) {
  let next = query;
  if (filters.from) next = next.gte(column, filters.from);
  if (filters.to) next = next.lt(column, filters.to);
  return next;
}

function applyDemoFilter<T extends { eq(column: string, value: boolean): T }>(query: T, filters: AdminExportFilters) {
  if (filters.demo === "production") return query.eq("is_demo", false);
  if (filters.demo === "demo") return query.eq("is_demo", true);
  return query;
}

export async function loadAdminExportRows(type: AdminExportType, rawFilters: AdminExportFilters = {}): Promise<ExportRow[]> {
  const filters = normalizeExportFilters(rawFilters);
  if (type === "agents") {
    let query = supabaseServer
      .from("users_profile")
      .select("id, display_name, phone, verification_status, account_status, total_deals, total_earnings, total_referrals, created_at")
      .order("created_at", { ascending: false });
    query = applyDateFilters(query, "created_at", filters);
    if (filters.status) query = query.eq("account_status", filters.status);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ExportRow[];
  }
  if (type === "commissions") {
    let query = supabaseServer
      .from("deals")
      .select("deal_reference, agent_id, property_name, developer_name, status, sale_amount, commission_rate, estimated_commission, actual_commission, paid_at")
      .order("submitted_at", { ascending: false });
    query = applyDateFilters(query, "submitted_at", filters);
    if (filters.status) query = query.eq("status", filters.status);
    query = applyDemoFilter(query, filters);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ExportRow[];
  }
  if (type === "deals") {
    let query = supabaseServer
      .from("deals")
      .select("deal_reference, agent_id, property_name, developer_name, client_name, unit_code, sale_amount, status, submitted_at, updated_at, is_demo")
      .order("submitted_at", { ascending: false });
    query = applyDateFilters(query, "submitted_at", filters);
    if (filters.status) query = query.eq("status", filters.status);
    query = applyDemoFilter(query, filters);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ExportRow[];
  }
  if (type === "properties") {
    let query = supabaseServer
      .from("properties")
      .select("id, property_name, developer_id, project_id, property_type, sale_type, price, approval_status, is_active, is_demo, demo_batch, published_at, expires_at")
      .order("created_at", { ascending: false });
    query = applyDateFilters(query, "created_at", filters);
    if (filters.status) query = query.eq("approval_status", filters.status);
    query = applyDemoFilter(query, filters);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ExportRow[];
  }

  let agentsQuery = supabaseServer.from("users_profile").select("id", { count: "exact", head: true });
  let propertiesQuery = supabaseServer.from("properties").select("id", { count: "exact", head: true }).eq("approval_status", "approved").eq("is_active", true);
  let pendingQuery = supabaseServer.from("properties").select("id", { count: "exact", head: true }).eq("approval_status", "pending");
  let dealsQuery = supabaseServer.from("deals").select("sale_amount, status, is_demo");
  agentsQuery = applyDateFilters(agentsQuery, "created_at", filters);
  propertiesQuery = applyDateFilters(propertiesQuery, "created_at", filters);
  pendingQuery = applyDateFilters(pendingQuery, "created_at", filters);
  dealsQuery = applyDateFilters(dealsQuery, "submitted_at", filters);
  propertiesQuery = applyDemoFilter(propertiesQuery, filters);
  pendingQuery = applyDemoFilter(pendingQuery, filters);
  if (filters.status) dealsQuery = dealsQuery.eq("status", filters.status);
  dealsQuery = applyDemoFilter(dealsQuery, filters);
  const [{ count: agents }, { count: properties }, { count: pending }, { data: deals }] = await Promise.all([
    agentsQuery,
    propertiesQuery,
    pendingQuery,
    dealsQuery,
  ]);
  const dealRows = deals ?? [];
  return [{
    generated_at: new Date().toISOString(),
    agents: agents ?? 0,
    active_properties: properties ?? 0,
    pending_properties: pending ?? 0,
    deals: dealRows.length,
    pipeline_value: dealRows.reduce((sum, deal) => sum + Number(deal.sale_amount ?? 0), 0),
    paid_deals: dealRows.filter((deal) => deal.status === "paid").length,
  }];
}

function columnsFor(rows: ExportRow[]) {
  const keys = new Set<string>();
  rows.forEach((row) => Object.keys(row).forEach((key) => keys.add(key)));
  return [...keys];
}

function displayValue(value: ExportRow[string]) {
  return value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
}

function csvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function buildCsv(rows: ExportRow[]) {
  const columns = columnsFor(rows);
  return [columns, ...rows.map((row) => columns.map((column) => displayValue(row[column])))]
    .map((line) => line.map(csvCell).join(","))
    .join("\r\n");
}

function xmlEscape(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function columnName(index: number) {
  let name = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  }
  return name;
}

export function buildXlsx(rows: ExportRow[]) {
  const columns = columnsFor(rows);
  const matrix = [columns, ...rows.map((row) => columns.map((column) => displayValue(row[column])))];
  const sheetRows = matrix.map((row, rowIndex) =>
    `<row r="${rowIndex + 1}">${row.map((value, columnIndex) =>
      `<c r="${columnName(columnIndex)}${rowIndex + 1}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`
    ).join("")}</row>`
  ).join("");
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Brixeler export" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`),
  };
  return zipSync(files, { level: 6 });
}
