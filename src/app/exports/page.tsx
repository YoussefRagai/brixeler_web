import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
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
};

export default async function ExportsPage() {
  const ui = await buildAdminUi(["super_admin"]);
  const { data } = ui.hasAccess
    ? await supabaseServer
        .from("admin_export_jobs")
        .select("id, export_type, file_format, status, row_count, file_name, expires_at, created_at, is_demo")
        .order("created_at", { ascending: false })
        .limit(30)
    : { data: [] };
  const logs = (data ?? []) as ExportJob[];

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
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {["dashboard", "agents", "deals", "properties", "commissions"].map((type) => (
              <article key={type} className="rounded-3xl border border-black/5 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-neutral-500">{type}</p>
                <p className="mt-2 text-sm text-neutral-600">Current live snapshot</p>
                <div className="mt-4 flex gap-2">
                  <a href={`/api/admin/exports/download?type=${type}&format=csv`} className="rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white">CSV</a>
                  <a href={`/api/admin/exports/download?type=${type}&format=xlsx`} className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold">XLSX</a>
                </div>
              </article>
            ))}
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
                    <td className="px-4 py-4 uppercase">{log.file_format}</td>
                    <td className="px-4 py-4">{log.row_count}</td>
                    <td className="px-4 py-4">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="px-4 py-4 capitalize">{new Date(log.expires_at) < new Date() ? "expired" : log.status}</td>
                  </tr>
                ))}
                {!logs.length ? <tr><td colSpan={5} className="px-4 py-8 text-center text-neutral-500">No exports have been generated.</td></tr> : null}
              </tbody>
            </table>
            <p className="border-t border-black/5 px-5 py-4 text-xs text-neutral-500">Export metadata expires after five days. Downloading again always creates a fresh snapshot.</p>
          </section>
        </>
      )}
    </AdminLayout>
  );
}
