import { NextRequest, NextResponse } from "next/server";
import { getAdminContextFromRequest } from "@/lib/adminAuth";
import { buildCsv, buildXlsx, canExportType, loadAdminExportRows, normalizeExportFilters, ADMIN_EXPORT_DEFINITIONS, type AdminExportType } from "@/lib/adminExports";
import { logAdminActivity } from "@/lib/adminQueries";
import { supabaseServer } from "@/lib/supabaseServer";

const TYPES = new Set<AdminExportType>(["dashboard", "agents", "deals", "properties", "commissions"]);

export async function GET(request: NextRequest) {
  const admin = await getAdminContextFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const typeParam = request.nextUrl.searchParams.get("type") as AdminExportType | null;
  const format = request.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  if (!typeParam || !TYPES.has(typeParam)) return NextResponse.json({ error: "Invalid export type" }, { status: 400 });
  if (!canExportType(admin.roles, typeParam)) return NextResponse.json({ error: "You do not have access to this export" }, { status: 403 });

  const rawFilters = {
    from: request.nextUrl.searchParams.get("from") ?? undefined,
    to: request.nextUrl.searchParams.get("to") ?? undefined,
    status: request.nextUrl.searchParams.get("status") ?? undefined,
    demo: request.nextUrl.searchParams.get("demo") as "all" | "production" | "demo" | undefined,
  };
  const filters = normalizeExportFilters(rawFilters);

  try {
    const rows = await loadAdminExportRows(typeParam, rawFilters);
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `brixeler-${typeParam}-${stamp}.${format}`;
    const body = format === "xlsx" ? buildXlsx(rows) : new TextEncoder().encode(buildCsv(rows));
    const { data: job, error: jobError } = await supabaseServer
      .from("admin_export_jobs")
      .insert({
        created_by: admin.adminId,
        export_type: typeParam,
        file_format: format,
        filters,
        status: "ready",
        row_count: rows.length,
        file_name: fileName,
      })
      .select("id")
      .single();
    if (jobError || !job?.id) {
      console.error("Failed to record admin export", jobError);
      return NextResponse.json({ error: "Export could not be recorded" }, { status: 500 });
    }
    await logAdminActivity({
      adminId: admin.adminId,
      action: "admin_export_downloaded",
      resourceType: "admin_export",
      resourceId: job.id,
      metadata: {
        type: typeParam,
        format,
        rows: rows.length,
        filters,
        sensitivity: ADMIN_EXPORT_DEFINITIONS[typeParam].sensitivity,
      },
    });
    return new NextResponse(Buffer.from(body), {
      headers: {
        "Content-Type": format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
        "X-Export-Sensitivity": ADMIN_EXPORT_DEFINITIONS[typeParam].sensitivity,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
