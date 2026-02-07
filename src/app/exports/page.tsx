import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";

const logs = [
  { id: "exp-001", type: "Deals CSV", range: "Nov 1 - Nov 18", initiatedBy: "Laila Samir", status: "Ready" },
  { id: "exp-002", type: "Commissions XLSX", range: "Oct 1 - Oct 31", initiatedBy: "Finance Bot", status: "Expired" },
];

export default async function ExportsPage() {
  const ui = await buildAdminUi(["super_admin"]);
  return (
    <AdminLayout
      title="Exports & archives"
      description="Generate CSV / XLSX datasets with PRD Volume 4 telemetry."
      actions={
        <button className="rounded-full bg-white/90 px-5 py-2 text-sm font-semibold text-slate-900">
          Start export
        </button>
      }
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <section className="rounded-3xl border border-white/5 bg-white/5 p-6">
        <table className="w-full text-left text-sm text-slate-200">
          <thead className="text-xs uppercase tracking-[0.3em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Export</th>
              <th className="px-4 py-3">Date range</th>
              <th className="px-4 py-3">Initiated by</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-white/5">
                <td className="px-4 py-4 font-semibold text-white">{log.type}</td>
                <td className="px-4 py-4 text-slate-300">{log.range}</td>
                <td className="px-4 py-4 text-slate-300">{log.initiatedBy}</td>
                <td className="px-4 py-4 text-emerald-300">{log.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-xs text-slate-500">
          Exports expire after 5 days. Re-run to get fresh CSV/XLSX copies.
        </p>
        </section>
      )}
    </AdminLayout>
  );
}
