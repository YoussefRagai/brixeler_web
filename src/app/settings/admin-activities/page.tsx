import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
import { fetchAdminActivity } from "@/lib/adminQueries";

export default async function AdminActivitiesPage() {
  const ui = await buildAdminUi(["super_admin"]);
  const activity = await fetchAdminActivity(200);

  return (
    <AdminLayout
      title="Admin activities"
      description="Audit log of admin actions and changes across the platform."
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
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Admin</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Resource</th>
                <th className="px-4 py-3">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {activity.map((entry) => (
                <tr key={entry.id} className="border-b border-white/5">
                  <td className="px-4 py-4 text-xs text-slate-400">
                    {new Date(entry.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-white">{entry.admin_name ?? entry.admin_id}</p>
                  </td>
                  <td className="px-4 py-4 text-white">{entry.action}</td>
                  <td className="px-4 py-4 text-slate-300">
                    {entry.resource_type ?? "—"} {entry.resource_id ? `(${entry.resource_id})` : ""}
                  </td>
                  <td className="px-4 py-4 text-xs text-slate-400">
                    {entry.metadata ? JSON.stringify(entry.metadata) : "—"}
                  </td>
                </tr>
              ))}
              {!activity.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-400">
                    No admin activity logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </AdminLayout>
  );
}
