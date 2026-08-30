import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
import { canExportType, ADMIN_EXPORT_DEFINITIONS, normalizeExportFilters, type AdminExportFilters, type AdminExportType } from "@/lib/adminExports";
import { supabaseServer } from "@/lib/supabaseServer";

type ExportJob = {
  id: string;
  export_type: string;
  file_format: string;
  status: string;
  row_count: number;
  file_name: string;
  expires_at: string;
  created_at: string;
  is_demo: boolean;
  filters: AdminExportFilters;
};

const EXPORT_TYPES: AdminExportType[] = ["dashboard", "agents", "deals", "properties", "commissions"];

function stringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function exportHref(type: AdminExportType, format: "csv" | "xlsx", filters: AdminExportFilters) {
  const params = new URLSearchParams({ type, format });
  if (filters.from) params.set("from", filters.from.slice(0, 10));
  if (filters.to) {
    const date = new Date(filters.to);
    date.setUTCDate(date.getUTCDate() - 1);
    params.set("to", date.toISOString().slice(0, 10));
  }
  if (filters.status) params.set("status", filters.status);
  if (filters.demo && filters.demo !== "all") params.set("demo", filters.demo);
  return `/api/admin/exports/download?${params.toString()}`;
}

export default async function ExportsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const ui = await buildAdminUi(["super_admin", "user_auth_admin", "deals_admin", "listing_admin"]);
  const params = (await searchParams) ?? {};
  const filters = normalizeExportFilters({
    from: stringParam(params.from),
    to: stringParam(params.to),
    status: stringParam(params.status),
    demo: stringParam(params.demo) as AdminExportFilters["demo"],
  });
  const permittedTypes = EXPORT_TYPES.filter((type) => canExportType(ui.roles, type));
  const { data } = ui.hasAccess
    ? await supabaseServer
        .from("admin_export_jobs")
        .select("id, export_type, file_format, status, row_count, file_name, expires_at, created_at, is_demo, filters")
        .order("created_at", { ascending: false })
        .limit(30)
    : { data: [] };
  const logs = ((data ?? []) as ExportJob[]).filter((log) => permittedTypes.includes(log.export_type as AdminExportType));

  return (
    <AdminLayout
      title="Exports & archives"
      description="Download current operational datasets and retain an auditable export history."
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <>
          {params.error ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{stringParam(params.error)}</div> : null}
          <section className="rounded-3xl border border-black/5 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-neutral-500">Scope the snapshot</p><p className="mt-1 text-sm text-neutral-600">Filters are stored with the export and every download is recorded in the admin activity log.</p></div>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-800">Confidential operational data</span>
            </div>
            <form className="mt-4 flex flex-wrap items-end gap-3" role="search">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">From<input name="from" type="date" defaultValue={filters.from?.slice(0, 10)} className="mt-1 min-h-10 rounded-xl border border-black/10 bg-neutral-50 px-3 py-2 text-sm font-normal normal-case tracking-normal text-neutral-900" /></label>
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">To<input name="to" type="date" defaultValue={filters.to ? (() => { const date = new Date(filters.to); date.setUTCDate(date.getUTCDate() - 1); return date.toISOString().slice(0, 10); })() : undefined} className="mt-1 min-h-10 rounded-xl border border-black/10 bg-neutral-50 px-3 py-2 text-sm font-normal normal-case tracking-normal text-neutral-900" /></label>
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Status<select name="status" defaultValue={filters.status ?? ""} className="mt-1 min-h-10 rounded-xl border border-black/10 bg-neutral-50 px-3 py-2 text-sm font-normal normal-case tracking-normal text-neutral-900"><option value="">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="paid">Paid</option><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Data scope<select name="demo" defaultValue={filters.demo ?? "all"} className="mt-1 min-h-10 rounded-xl border border-black/10 bg-neutral-50 px-3 py-2 text-sm font-normal normal-case tracking-normal text-neutral-900"><option value="all">Production + demo</option><option value="production">Production only</option><option value="demo">Demo only</option></select></label>
              <button type="submit" className="min-h-10 rounded-full bg-black px-4 py-2 text-sm font-semibold text-white">Apply filters</button>
              <a href="/exports" className="min-h-10 rounded-full border border-black/10 px-4 py-2 text-sm leading-6 text-neutral-700">Clear</a>
            </form>
          </section>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {permittedTypes.map((type) => {
              const definition = ADMIN_EXPORT_DEFINITIONS[type];
              return <article key={type} className="rounded-3xl border border-black/5 bg-white p-5"><div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.25em] text-neutral-500">{definition.label}</p><span className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] text-neutral-600">{definition.sensitivity}</span></div><p className="mt-2 text-sm text-neutral-600">{definition.description}</p><div className="mt-4 flex gap-2"><a href={exportHref(type, "csv", filters)} className="rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white">CSV</a><a href={exportHref(type, "xlsx", filters)} className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold">XLSX</a></div></article>;
            })}
          </section>
          <section className="overflow-hidden rounded-3xl border border-black/5 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs uppercase tracking-[0.25em] text-neutral-500">
                <tr><th className="px-4 py-3">Export</th><th className="px-4 py-3">Format</th><th className="px-4 py-3">Rows</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Status</th></tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-black/5">
                    <td className="px-4 py-4 font-semibold">{log.file_name}{log.is_demo ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] text-amber-800">DEMO</span> : null}</td>
                    <td className="px-4 py-4 uppercase">{log.file_format}<p className="mt-1 text-[10px] font-normal normal-case text-neutral-500">{log.filters?.demo === "production" ? "Production only" : log.filters?.demo === "demo" ? "Demo only" : "Production + demo"}</p></td>
                    <td className="px-4 py-4">{log.row_count}</td>
                    <td className="px-4 py-4">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="px-4 py-4 capitalize">{new Date(log.expires_at) < new Date() ? "expired" : log.status}</td>
                  </tr>
                ))}
                {!logs.length ? <tr><td colSpan={5} className="px-4 py-8 text-center text-neutral-500">No exports have been generated.</td></tr> : null}
              </tbody>
            </table>
            <p className="border-t border-black/5 px-5 py-4 text-xs text-neutral-500">Export metadata expires after five days. Downloading again always creates a fresh, role-scoped snapshot. Client names, phone numbers, and financial fields are confidential.</p>
          </section>
        </>
      )}
    </AdminLayout>
  );
}
