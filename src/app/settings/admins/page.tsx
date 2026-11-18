import { revalidatePath } from "next/cache";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
import { ADMIN_ROLE_LABELS, ADMIN_ROLE_DESCRIPTIONS, isAdminRole, type AdminRole } from "@/lib/adminRoles";
import { fetchAdminAccounts, logAdminActivity } from "@/lib/adminQueries";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAdminRole } from "@/lib/adminAuth";
import { AdminRoleEditor } from "@/components/AdminRoleEditor";
import { createAdminPortalInvite } from "@/lib/adminAccountInvites";
import { AdminInviteForm, type AdminInviteActionState } from "@/components/AdminInviteForm";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIVILEGED_SESSION_MAX_AGE_MS = 15 * 60 * 1000;

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

function inviteError(message: string): AdminInviteActionState {
  return { status: "error", message };
}

async function inviteAdminAction(_previousState: AdminInviteActionState, formData: FormData): Promise<AdminInviteActionState> {
  "use server";
  const admin = await requireAdminRole(["super_admin"]);
  if (!admin?.adminId) return inviteError("Access denied.");
  if (Date.now() - admin.session.issuedAt > PRIVILEGED_SESSION_MAX_AGE_MS) {
    return inviteError("Sign out and sign back in to verify your identity before inviting an administrator.");
  }
  const email = formData.get("email")?.toString().toLowerCase().trim();
  const displayName = formData.get("displayName")?.toString().trim() || null;
  const rawRoles = formData.getAll("roles").map((r) => r.toString());
  const roles = [...new Set(rawRoles.filter((role): role is AdminRole => isAdminRole(role)))];
  const developerIds = [...new Set(formData.getAll("developerIds").map((r) => r.toString()))];

  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return inviteError("Enter a valid admin email address.");
  }
  if (!roles.length || rawRoles.length !== roles.length) {
    return inviteError("Choose at least one supported admin role.");
  }
  if (displayName && displayName.length > 200) {
    return inviteError("Display name must be 200 characters or fewer.");
  }
  if (developerIds.some((id) => !UUID_PATTERN.test(id))) {
    return inviteError("Developer scope contains an invalid identifier.");
  }
  if (developerIds.length && !roles.some((role) => role === "developers_admin" || role === "super_admin")) {
    return inviteError("Company assignments require the Developers admin or Super admin role.");
  }
  if (developerIds.length) {
    const { data: scopedDevelopers, error: scopeError } = await supabaseServer
      .from("developers")
      .select("id")
      .in("id", developerIds);
    if (scopeError || scopedDevelopers?.length !== developerIds.length) {
      return inviteError("One or more selected developers could not be found.");
    }
  }

  let result;
  try {
    result = await createAdminPortalInvite({ email, displayName, roles, developerIds, assignedBy: admin.adminId });
  } catch (error) {
    console.error("Staff admin invitation could not be confirmed", error);
    return inviteError("We could not confirm the invitation. Review the admin list before retrying.");
  }
  if (result.authUserId === null) return inviteError(result.error);

  await logAdminActivity({
    adminId: admin.adminId,
    action: result.created ? "admin.invite" : "admin.resend_invite",
    resourceType: "admins",
    resourceId: result.authUserId,
    metadata: { email, roles },
  });
  revalidatePath("/settings/admins");
  revalidatePath("/admins");
  return { status: "success", message: result.message };
}


export default async function AdminsPage() {
  const ui = await buildAdminUi(["super_admin"]);
  const [admins, { data: developers }] = ui.hasAccess
    ? await Promise.all([fetchAdminAccounts(), supabaseServer.from("developers").select("id, name").order("name")])
    : [[], { data: null }];

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
                    status={admin.status}
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
                      {admin.last_active_at ? new Date(admin.last_active_at).toLocaleString() : "Never"}
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
              <AdminInviteForm developers={developers ?? []} action={inviteAdminAction} />
            </article>
          </section>
        </>
      )}
    </AdminLayout>
  );
}
