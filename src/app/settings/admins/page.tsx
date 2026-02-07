import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
import { ADMIN_ROLE_LABELS, ADMIN_ROLE_DESCRIPTIONS, type AdminRole } from "@/lib/adminRoles";
import { fetchAdminAccounts, logAdminActivity } from "@/lib/adminQueries";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdminContext } from "@/lib/adminAuth";
import { AdminRoleEditor } from "@/components/AdminRoleEditor";

const roleMatrix: { role: AdminRole; permissions: string[] }[] = [
  {
    role: "super_admin",
    permissions: [
      "Everything",
      "Admin assignments",
      "Admin activity log",
      "All dashboard sections",
    ],
  },
  {
    role: "user_auth_admin",
    permissions: ["User verification", "Agent profiles", "Verification approvals"],
  },
  {
    role: "user_support_admin",
    permissions: ["Support tickets", "User escalations"],
  },
  {
    role: "developers_admin",
    permissions: ["Developers", "Projects", "Developer actions"],
  },
  {
    role: "listing_admin",
    permissions: ["Listings", "Properties", "Renewals"],
  },
  {
    role: "deals_admin",
    permissions: ["Deals pipeline", "Sales claims", "Payment approvals"],
  },
  {
    role: "marketing_admin",
    permissions: ["Notifications", "Gifts", "Tiers", "Badges", "Content"],
  },
];

async function inviteAdminAction(formData: FormData) {
  "use server";
  const admin = await requireAdminContext();
  const email = formData.get("email")?.toString().toLowerCase().trim();
  const password = formData.get("password")?.toString();
  const displayName = formData.get("displayName")?.toString().trim() || null;
  const roles = formData.getAll("roles").map((r) => r.toString()) as AdminRole[];
  const developerIds = formData.getAll("developerIds").map((r) => r.toString());

  if (!email || !password) return;

  const { data: userData, error: createUserError } = await supabaseServer.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createUserError || !userData?.user?.id) {
    console.error("Failed to create admin auth user", createUserError);
    return;
  }

  const permissions = {
    display_name: displayName,
    email,
    developer_ids: developerIds,
  };

  const legacyRole = roles.includes("super_admin") ? "super_admin" : roles.length ? "admin" : "reviewer";

  const { error: insertError } = await supabaseServer.from("admins").insert({
    id: userData.user.id,
    role: legacyRole,
    roles,
    permissions,
    assigned_by: admin.adminId,
    is_active: true,
  });

  if (insertError) {
    console.error("Failed to create admin record", insertError);
    await supabaseServer.auth.admin.deleteUser(userData.user.id);
    return;
  }

  await logAdminActivity({
    adminId: admin.adminId,
    action: "admin.invite",
    resourceType: "admins",
    resourceId: userData.user.id,
    metadata: { email, roles },
  });
}


export default async function AdminsPage() {
  const ui = await buildAdminUi(["super_admin"]);
  const admins = await fetchAdminAccounts();
  const { data: developers } = await supabaseServer.from("developers").select("id, name").order("name");

  return (
    <AdminLayout
      title="Admins"
      description="Assign roles, stack permissions, and manage admin access."
      actions={<span className="text-xs uppercase tracking-[0.3em] text-slate-400">Super admin</span>}
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <article className="rounded-2xl border border-white/5 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Total admins</p>
              <p className="mt-2 text-2xl font-semibold text-white">{admins.length}</p>
            </article>
            <article className="rounded-2xl border border-white/5 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Active</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {admins.filter((a) => a.status === "active").length}
              </p>
            </article>
            <article className="rounded-2xl border border-white/5 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Suspended</p>
              <p className="mt-2 text-2xl font-semibold text-rose-300">
                {admins.filter((a) => a.status === "suspended").length}
              </p>
            </article>
          </section>

          <section className="rounded-3xl border border-white/5 bg-white/5 p-6">
            <table className="w-full text-left text-sm text-slate-200">
              <thead className="text-xs uppercase tracking-[0.3em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Admin</th>
                  <th className="px-4 py-3">Roles</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last active</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => (
                  <tr key={admin.id} className="border-b border-white/5">
                    <td className="px-4 py-4">
                      <p className="font-semibold text-white">{admin.display_name ?? "Admin"}</p>
                      <p className="text-xs text-slate-400">{admin.email ?? ""}</p>
                    </td>
                <td className="px-4 py-4">
                  <AdminRoleEditor
                    adminId={admin.id}
                    roles={admin.roles ?? []}
                    developerIds={admin.developer_ids ?? null}
                    developers={(developers ?? []) as { id: string; name: string | null }[]}
                  />
                </td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs ${
                          admin.status === "suspended"
                            ? "bg-rose-500/20 text-rose-200"
                            : "bg-white/10 text-white"
                        }`}
                      >
                        {admin.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-300">
                      {admin.created_at ? new Date(admin.created_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
                {!admins.length && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-400">
                      No admins found yet. Add admins in the database or use the invite workflow.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <article className="rounded-3xl border border-white/5 bg-white/5 p-6">
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Role matrix</p>
              <div className="mt-4 space-y-4 text-sm text-slate-300">
                {roleMatrix.map((role) => (
                  <div key={role.role} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-white">{ADMIN_ROLE_LABELS[role.role]}</p>
                    <p className="text-xs text-slate-500">{ADMIN_ROLE_DESCRIPTIONS[role.role]}</p>
                    <p className="mt-2 text-xs text-slate-500">Permissions:</p>
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
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Invite new admin</p>
              <form action={inviteAdminAction} className="mt-4 space-y-4 text-sm text-slate-300">
                <div>
                  <label className="text-xs text-slate-500">Email</label>
                  <input
                    name="email"
                    placeholder="name@brixeler.com"
                    required
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Temporary password</label>
                  <input
                    name="password"
                    type="password"
                    required
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Display name</label>
                  <input
                    name="displayName"
                    placeholder="Admin name"
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Assign roles</label>
                  <div className="mt-2 grid gap-2 text-xs text-slate-300">
                    {Object.entries(ADMIN_ROLE_LABELS).map(([role, label]) => (
                      <label key={role} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
                        <input type="checkbox" name="roles" value={role} className="h-4 w-4" />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Developer scope (optional)</label>
                  <div className="mt-2 grid gap-2 text-xs text-slate-300">
                    {(developers ?? []).map((dev) => (
                      <label key={dev.id} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
                        <input type="checkbox" name="developerIds" value={dev.id} className="h-4 w-4" />
                        <span>{dev.name ?? dev.id}</span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Only used for Developers admin role.</p>
                </div>
                <button className="rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-emerald-950">
                  Create admin
                </button>
              </form>
            </article>
          </section>
        </>
      )}
    </AdminLayout>
  );
}
