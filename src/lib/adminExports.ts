import { strToU8, zipSync } from "fflate";
import { supabaseServer } from "./supabaseServer";

export type AdminExportType = "dashboard" | "agents" | "deals" | "properties" | "commissions";
export type ExportRow = Record<string, string | number | boolean | null>;

export async function loadAdminExportRows(type: AdminExportType): Promise<ExportRow[]> {
  if (type === "agents") {
    const { data, error } = await supabaseServer
      .from("users_profile")
      .select("id, display_name, phone, verification_status, account_status, total_deals, total_earnings, total_referrals, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as ExportRow[];
  }
  if (type === "commissions") {
    const { data, error } = await supabaseServer
      .from("deals")
      .select("deal_reference, agent_id, property_name, developer_name, status, sale_amount, commission_rate, estimated_commission, actual_commission, paid_at")
      .order("submitted_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as ExportRow[];
  }
  if (type === "deals") {
    const { data, error } = await supabaseServer
      .from("deals")
      .select("deal_reference, agent_id, property_name, developer_name, client_name, unit_code, sale_amount, status, submitted_at, updated_at, is_demo")
      .order("submitted_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as ExportRow[];
  }
  if (type === "properties") {
    const { data, error } = await supabaseServer
      .from("properties")
      .select("id, property_name, developer_id, project_id, property_type, sale_type, price, approval_status, is_active, is_demo, demo_batch, published_at, expires_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as ExportRow[];
  }

  const [{ count: agents }, { count: properties }, { count: pending }, { data: deals }] = await Promise.all([
    supabaseServer.from("users_profile").select("id", { count: "exact", head: true }),
    supabaseServer.from("properties").select("id", { count: "exact", head: true }).eq("approval_status", "approved").eq("is_active", true),
    supabaseServer.from("properties").select("id", { count: "exact", head: true }).eq("approval_status", "pending"),
    supabaseServer.from("deals").select("sale_amount, status"),
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
