import { AdminLayout } from "@/components/AdminLayout";

const admins = [
  {
    id: "adm-1",
    name: "Laila Samir",
    email: "laila@brixeler.com",
    role: "Super Admin",
    status: "Active",
    lastActive: "2h ago",
  },
  {
    id: "adm-2",
    name: "Karim Fouad",
    email: "karim@brixeler.com",
    role: "Reviewer",
    status: "Active",
    lastActive: "1d ago",
  },
  {
    id: "adm-3",
    name: "Sara Amin",
    email: "sara@brixeler.com",
    role: "Support",
    status: "Suspended",
    lastActive: "Nov 12",
  },
];

const roleMatrix = [
  {
    role: "Super Admin",
    permissions: ["Agents", "Deals", "Properties", "Notifications", "Exports", "Settings"],
  },
  {
    role: "Reviewer",
    permissions: ["Deals", "Properties", "Verification"],
  },
  {
    role: "Support",
    permissions: ["Support tickets", "Notifications"],
  },
];

export default function AdminsPage() {
  return (
    <AdminLayout
      title="Admin roles"
      description="Invite, edit, and revoke access for Brixeler command center."
      actions={
        <button className="rounded-full border border-white/10 px-5 py-2 text-sm text-white/80 hover:bg-white/10">
          Invite admin
        </button>
      }
    >
      <section className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-white/5 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            Total admins
          </p>
          <p className="mt-2 text-2xl font-semibold text-white">{admins.length}</p>
        </article>
        <article className="rounded-2xl border border-white/5 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            Reviewers
          </p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {admins.filter((a) => a.role === "Reviewer").length}
          </p>
        </article>
        <article className="rounded-2xl border border-white/5 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            Suspended
          </p>
          <p className="mt-2 text-2xl font-semibold text-rose-300">
            {admins.filter((a) => a.status === "Suspended").length}
          </p>
        </article>
      </section>

      <section className="rounded-3xl border border-white/5 bg-white/5 p-6">
        <table className="w-full text-left text-sm text-slate-200">
          <thead className="text-xs uppercase tracking-[0.3em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Admin</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last active</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((admin) => (
              <tr key={admin.id} className="border-b border-white/5">
                <td className="px-4 py-4">
                  <p className="font-semibold text-white">{admin.name}</p>
                  <p className="text-xs text-slate-400">{admin.email}</p>
                </td>
                <td className="px-4 py-4">{admin.role}</td>
                <td className="px-4 py-4">
                  <span
                    className={`rounded-full px-3 py-1 text-xs ${
                      admin.status === "Suspended"
                        ? "bg-rose-500/20 text-rose-200"
                        : "bg-white/10 text-white"
                    }`}
                  >
                    {admin.status}
                  </span>
                </td>
                <td className="px-4 py-4 text-slate-300">{admin.lastActive}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-3xl border border-white/5 bg-white/5 p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
            Role matrix
          </p>
          <div className="mt-4 space-y-4 text-sm text-slate-300">
            {roleMatrix.map((role) => (
              <div key={role.role} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-white">{role.role}</p>
                <p className="text-xs text-slate-500">Permissions:</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {role.permissions.map((perm) => (
                    <span key={perm} className="rounded-full border border-white/10 px-3 py-1 text-xs">
                      {perm}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </article>
        <article className="rounded-3xl border border-white/5 bg-white/5 p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
            Invite new admin
          </p>
          <form className="mt-4 space-y-4 text-sm text-slate-300">
            <div>
              <label className="text-xs text-slate-500">Email</label>
              <input
                placeholder="name@brixeler.com"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Role</label>
              <select className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white">
                <option>Super Admin</option>
                <option>Reviewer</option>
                <option>Support</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500">Notes</label>
              <textarea className="mt-2 min-h-[100px] w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white" />
            </div>
            <button className="rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-emerald-950">
              Send invitation
            </button>
          </form>
        </article>
      </section>
    </AdminLayout>
  );
}
