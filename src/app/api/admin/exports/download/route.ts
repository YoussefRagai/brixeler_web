import { NextRequest, NextResponse } from "next/server";
import { getAdminContextFromRequest } from "@/lib/adminAuth";
import { hasAdminRole } from "@/lib/adminRoles";
import { buildCsv, buildXlsx, loadAdminExportRows, type AdminExportType } from "@/lib/adminExports";
import { logAdminActivity } from "@/lib/adminQueries";
import { supabaseServer } from "@/lib/supabaseServer";

const TYPES = new Set<AdminExportType>(["dashboard", "agents", "deals", "properties", "commissions"]);

export async function GET(request: NextRequest) {
  const admin = await getAdminContextFromRequest(request);
  if (!admin || !hasAdminRole(admin.roles, ["super_admin", "user_auth_admin", "deals_admin", "listing_admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const typeParam = request.nextUrl.searchParams.get("type") as AdminExportType | null;
  const format = request.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  if (!typeParam || !TYPES.has(typeParam)) return NextResponse.json({ error: "Invalid export type" }, { status: 400 });

  try {
    const rows = await loadAdminExportRows(typeParam);
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `brixeler-${typeParam}-${stamp}.${format}`;
    const body = format === "xlsx" ? buildXlsx(rows) : new TextEncoder().encode(buildCsv(rows));
    const { data: job } = await supabaseServer
      .from("admin_export_jobs")
      .insert({
        created_by: admin.adminId,
        export_type: typeParam,
        file_format: format,
        status: "ready",
        row_count: rows.length,
        file_name: fileName,
      })
      .select("id")
      .single();
    await logAdminActivity({ adminId: admin.adminId, action: "admin_export_downloaded", resourceType: "admin_export", resourceId: job?.id, metadata: { type: typeParam, format, rows: rows.length } });
    return new NextResponse(Buffer.from(body), {
      headers: {
        "Content-Type": format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

