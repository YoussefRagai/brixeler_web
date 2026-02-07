import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { AdminDevelopersTable } from "@/components/AdminDevelopersTable";
import { supabaseServer } from "@/lib/supabaseServer";
import { buildAdminUi } from "@/lib/adminUi";
import { revalidatePath } from "next/cache";
import { requireAdminContext } from "@/lib/adminAuth";
import { logAdminActivity } from "@/lib/adminQueries";

type Developer = {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  logo_url: string | null;
};

type Property = {
  id: string;
  property_name: string;
  developer_id: string | null;
  approval_status?: string | null;
};

type DeveloperProject = {
  id: string;
  developer_id: string;
  name: string;
  created_at: string | null;
};

type DeveloperAccount = {
  id: string;
  developer_id: string;
  auth_user_id: string;
  last_login: string | null;
  email: string | null;
};

async function getDeveloperData(developerIds?: string[] | null): Promise<{
  developers: Developer[];
  properties: Property[];
  projects: DeveloperProject[];
  accounts: DeveloperAccount[];
}> {
  const developersQuery = supabaseServer
    .from("developers")
    .select("id, name, contact_email, contact_phone, logo_url")
    .order("name");
  const propertiesQuery = supabaseServer
    .from("properties")
    .select("id, property_name, developer_id, approval_status")
    .order("property_name")
    .limit(500);
  const projectsQuery = supabaseServer
    .from("developer_projects")
    .select("id, developer_id, name, created_at")
    .order("name")
    .limit(500);
  const accountsQuery = supabaseServer.from("developer_accounts").select("id, developer_id, auth_user_id, last_login");

  if (developerIds && developerIds.length) {
    developersQuery.in("id", developerIds);
    propertiesQuery.in("developer_id", developerIds);
    projectsQuery.in("developer_id", developerIds);
    accountsQuery.in("developer_id", developerIds);
  }

  const [{ data: developers }, { data: properties }, { data: projects }, { data: accounts }] = await Promise.all([
    developersQuery,
    propertiesQuery,
    projectsQuery,
    accountsQuery,
  ]);

  const enrichedAccounts: DeveloperAccount[] = [];
  if (accounts?.length) {
    for (const account of accounts) {
      const { data: userData } = await supabaseServer.auth.admin.getUserById(account.auth_user_id);
      enrichedAccounts.push({
        id: account.id,
        developer_id: account.developer_id,
        auth_user_id: account.auth_user_id,
        last_login: account.last_login,
        email: userData?.user?.email ?? null,
      });
    }
  }

  return {
    developers: (developers ?? []) as Developer[],
    properties: (properties ?? []) as Property[],
    projects: (projects ?? []) as DeveloperProject[],
    accounts: enrichedAccounts,
  };
}

async function createDeveloperLogin(formData: FormData) {
  "use server";
  const admin = await requireAdminContext();
  const allowedDeveloperIds: string[] | null =
    admin.roles.includes("super_admin") || !admin.developerIds?.length ? null : admin.developerIds;
  const existingDeveloperId = formData.get("existingDeveloperId")?.toString() || "";
  const developerName = formData.get("developerName")?.toString().trim();
  const contactEmail = formData.get("contactEmail")?.toString().trim() || null;
  const contactPhone = formData.get("contactPhone")?.toString().trim() || null;
  const loginEmail = formData.get("loginEmail")?.toString().toLowerCase().trim();
  const tempPassword = formData.get("tempPassword")?.toString();

  if (!loginEmail || !tempPassword) {
    return;
  }

  let developerId = existingDeveloperId;

  if (!developerId) {
    if (allowedDeveloperIds) return;
    if (!developerName) return;
    const { data: existing } = await supabaseServer
      .from("developers")
      .select("id")
      .eq("name", developerName)
      .maybeSingle();
    if (existing?.id) {
      if (allowedDeveloperIds && !allowedDeveloperIds.includes(existing.id)) return;
      developerId = existing.id;
      await supabaseServer
        .from("developers")
        .update({ contact_email: contactEmail, contact_phone: contactPhone })
        .eq("id", developerId);
    } else {
      const { data: created, error: createError } = await supabaseServer
        .from("developers")
        .insert({ name: developerName, contact_email: contactEmail, contact_phone: contactPhone })
        .select("id")
        .single();
      if (createError || !created?.id) {
        console.error("Failed to create developer", createError);
        return;
      }
      developerId = created.id;
    }
  } else if (contactEmail || contactPhone) {
    if (allowedDeveloperIds && !allowedDeveloperIds.includes(developerId)) return;
    await supabaseServer
      .from("developers")
      .update({ contact_email: contactEmail, contact_phone: contactPhone })
      .eq("id", developerId);
  }

  const { data: userData, error: createUserError } = await supabaseServer.auth.admin.createUser({
    email: loginEmail,
    password: tempPassword,
    email_confirm: true,
  });
  if (createUserError || !userData?.user?.id) {
    console.error("Failed to create developer auth user", createUserError);
    return;
  }

  const { error: accountError } = await supabaseServer
    .from("developer_accounts")
    .insert({ developer_id: developerId, auth_user_id: userData.user.id });
  if (accountError) {
    console.error("Failed to provision developer account", accountError);
    await supabaseServer.auth.admin.deleteUser(userData.user.id);
    return;
  }

  await logAdminActivity({
    adminId: admin.adminId,
    action: "developer_account.create",
    resourceType: "developer_accounts",
    resourceId: userData.user.id,
    metadata: { developer_id: developerId, email: loginEmail },
  });

  revalidatePath("/developers");
}

export default async function DevelopersPage() {
  const adminContext = await buildAdminUi(["developers_admin"]);
  const allowedDeveloperIds = adminContext.roles.includes("super_admin") ? null : adminContext.context?.developerIds ?? null;
  const { developers, properties, projects, accounts } = await getDeveloperData(allowedDeveloperIds);

  const listingsCountMap = properties.reduce<Record<string, number>>((acc, property) => {
    if (property.developer_id) {
      acc[property.developer_id] = (acc[property.developer_id] ?? 0) + 1;
    }
    return acc;
  }, {});

  const projectCountMap = projects.reduce<Record<string, number>>((acc, project) => {
    acc[project.developer_id] = (acc[project.developer_id] ?? 0) + 1;
    return acc;
  }, {});

  const accountMap = accounts.reduce<Record<string, DeveloperAccount>>((acc, account) => {
    acc[account.developer_id] = account;
    return acc;
  }, {});

  const tableRows = developers.map((developer) => ({
    id: developer.id,
    name: developer.name,
    contact_email: developer.contact_email,
    contact_phone: developer.contact_phone,
    logo_url: developer.logo_url,
    projectsCount: projectCountMap[developer.id] ?? 0,
    listingsCount: listingsCountMap[developer.id] ?? 0,
    portalEmail: accountMap[developer.id]?.email ?? null,
    lastLogin: accountMap[developer.id]?.last_login ?? null,
  }));

  return (
    <AdminLayout
      title="Developer management"
      description="Control developer onboarding and portal access."
      actions={
        <a
          href="#developer-invite"
          className="rounded-full border border-white/10 px-5 py-2 text-sm text-white/80 hover:bg-white/10"
        >
          Invite developer
        </a>
      }
      navItems={adminContext.navItems}
      meta={adminContext.meta}
    >
      {!adminContext.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <div className="space-y-6">
          <AdminDevelopersTable developers={tableRows} projects={projects} properties={properties} />

          <section id="developer-invite" className="rounded-3xl border border-white/5 bg-white/5 p-6">
            <header className="mb-4">
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Create developer login</p>
              <p className="text-slate-300">
                Provision partners with access to the developer portal. Temporary passwords should be rotated after first login.
              </p>
            </header>
            <form
              action={createDeveloperLogin}
              className="grid gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white md:grid-cols-2"
            >
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-[0.3em] text-slate-500">Existing developer</span>
                <select name="existingDeveloperId" className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-white">
                  <option value="">Create new</option>
                  {developers.map((developer) => (
                    <option key={developer.id} value={developer.id}>
                      {developer.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-[0.3em] text-slate-500">Developer name</span>
                <input
                  name="developerName"
                  placeholder="Atlas Developments"
                  className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-white"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-[0.3em] text-slate-500">Contact email</span>
                <input
                  type="email"
                  name="contactEmail"
                  placeholder="partners@developer.com"
                  className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-white"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-[0.3em] text-slate-500">Contact phone</span>
                <input
                  name="contactPhone"
                  placeholder="+20 100 000 0000"
                  className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-white"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-[0.3em] text-slate-500">Portal email</span>
                <input
                  type="email"
                  name="loginEmail"
                  required
                  placeholder="login@developer.com"
                  className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-white"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-[0.3em] text-slate-500">Temporary password</span>
                <input
                  name="tempPassword"
                  required
                  minLength={8}
                  placeholder="Temporary password"
                  className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-white"
                />
              </label>
              <div className="space-y-2 md:col-span-2">
                <button type="submit" className="w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-slate-100">
                  Provision access
                </button>
                <p className="text-xs text-slate-400">
                  Selecting an existing developer updates their contact info and creates a portal login. Leave blank to onboard a new partner.
                </p>
              </div>
            </form>
          </section>
        </div>
      )}
    </AdminLayout>
  );
}
