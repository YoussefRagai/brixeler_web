import { revalidatePath } from "next/cache";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { AdminDevelopersTable } from "@/components/AdminDevelopersTable";
import { AdminLayout } from "@/components/AdminLayout";
import { requireAdminContext } from "@/lib/adminAuth";
import { buildAdminUi } from "@/lib/adminUi";
import { fetchAdminActivity, logAdminActivity } from "@/lib/adminQueries";
import { findAuthUserByEmail, sendDeveloperPortalInvite } from "@/lib/developerAccountInvites";
import { supabaseServer } from "@/lib/supabaseServer";

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

type DeveloperMember = {
  id: string;
  developer_id: string;
  auth_user_id: string;
  email: string | null;
  full_name: string | null;
  status: string | null;
  invited_at: string | null;
  invitation_sent_at: string | null;
  activated_at: string | null;
  revoked_at: string | null;
  last_login: string | null;
};

type DeveloperActivity = {
  id: string;
  action: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  resource_id: string | null;
};

async function getDeveloperData(developerIds?: string[] | null): Promise<{
  developers: Developer[];
  properties: Property[];
  projects: DeveloperProject[];
  accounts: DeveloperMember[];
  activity: DeveloperActivity[];
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
  const accountsQuery = supabaseServer
    .from("developer_accounts")
    .select("id, developer_id, auth_user_id, email, full_name, status, invited_at, invitation_sent_at, activated_at, revoked_at, last_login")
    .order("invitation_sent_at", { ascending: false });

  if (developerIds && developerIds.length) {
    developersQuery.in("id", developerIds);
    propertiesQuery.in("developer_id", developerIds);
    projectsQuery.in("developer_id", developerIds);
    accountsQuery.in("developer_id", developerIds);
  }

  const [{ data: developers }, { data: properties }, { data: projects }, { data: accounts }, activityRaw] = await Promise.all([
    developersQuery,
    propertiesQuery,
    projectsQuery,
    accountsQuery,
    fetchAdminActivity(250),
  ]);

  const enrichedAccounts: DeveloperMember[] = [];
  for (const account of accounts ?? []) {
    let authEmail = account.email ?? null;
    if (!authEmail && account.auth_user_id) {
      const { data: userData } = await supabaseServer.auth.admin.getUserById(account.auth_user_id);
      authEmail = userData?.user?.email ?? null;
    }
    enrichedAccounts.push({
      ...(account as Omit<DeveloperMember, "email">),
      email: authEmail,
    });
  }

  const activity = activityRaw
    .filter((entry) => entry.action.startsWith("developer_account."))
    .filter((entry) => {
      if (!developerIds?.length) return true;
      const developerId = String(entry.metadata?.developer_id ?? "");
      return developerIds.includes(developerId);
    })
    .map((entry) => ({
      id: entry.id,
      action: entry.action,
      created_at: entry.created_at,
      metadata: entry.metadata ?? null,
      resource_id: entry.resource_id ?? null,
    }));

  return {
    developers: (developers ?? []) as Developer[],
    properties: (properties ?? []) as Property[],
    projects: (projects ?? []) as DeveloperProject[],
    accounts: enrichedAccounts,
    activity,
  };
}

async function inviteDeveloperMember(formData: FormData) {
  "use server";
  const admin = await requireAdminContext();
  const allowedDeveloperIds = admin.roles.includes("super_admin") ? [] : admin.developerIds ?? [];
  const existingDeveloperId = formData.get("existingDeveloperId")?.toString() || "";
  const developerNameInput = formData.get("developerName")?.toString().trim() || "";
  const contactEmail = formData.get("contactEmail")?.toString().trim() || null;
  const contactPhone = formData.get("contactPhone")?.toString().trim() || null;
  const memberEmail = formData.get("memberEmail")?.toString().toLowerCase().trim();

  if (!memberEmail) return;

  let developerId = existingDeveloperId;
  let developerName = developerNameInput;

  if (!developerId) {
    if (allowedDeveloperIds.length) return;
    if (!developerName) return;
    const { data: existing } = await supabaseServer
      .from("developers")
      .select("id, name")
      .eq("name", developerName)
      .maybeSingle();
    if (existing?.id) {
      developerId = existing.id;
      developerName = existing.name ?? developerName;
      await supabaseServer
        .from("developers")
        .update({ contact_email: contactEmail, contact_phone: contactPhone })
        .eq("id", developerId);
    } else {
      const { data: created, error: createError } = await supabaseServer
        .from("developers")
        .insert({ name: developerName, contact_email: contactEmail, contact_phone: contactPhone })
        .select("id, name")
        .single();
      if (createError || !created?.id) {
        console.error("Failed to create developer", createError);
        return;
      }
      developerId = created.id;
      developerName = created.name ?? developerName;
    }
  } else {
    if (allowedDeveloperIds.length && !allowedDeveloperIds.includes(developerId)) return;
    const { data: developer } = await supabaseServer.from("developers").select("name").eq("id", developerId).maybeSingle();
    developerName = developer?.name ?? developerName;
    if (contactEmail || contactPhone) {
      await supabaseServer
        .from("developers")
        .update({ contact_email: contactEmail, contact_phone: contactPhone })
        .eq("id", developerId);
    }
  }

  if (!developerId || !developerName) return;

  const existingAuthUser = await findAuthUserByEmail(memberEmail);
  if (existingAuthUser?.id) {
    const { data: otherMembership } = await supabaseServer
      .from("developer_accounts")
      .select("id, developer_id, status")
      .eq("auth_user_id", existingAuthUser.id)
      .neq("developer_id", developerId)
      .in("status", ["pending", "active"])
      .limit(1)
      .maybeSingle();

    if (otherMembership?.id) {
      console.error("Developer member already belongs to another developer", otherMembership);
      return;
    }
  }

  const { data: existingMembership } = await supabaseServer
    .from("developer_accounts")
    .select("id, auth_user_id, status")
    .eq("developer_id", developerId)
    .eq(existingAuthUser?.id ? "auth_user_id" : "email", existingAuthUser?.id ?? memberEmail)
    .limit(1)
    .maybeSingle();

  if (existingMembership?.id && existingMembership.status === "active") {
    console.error("Developer member already has active access");
    return;
  }

  const { authUserId, error: inviteError } = await sendDeveloperPortalInvite({
    email: memberEmail,
    developerId,
    developerName,
  });

  if (inviteError) {
    console.error("Failed to invite developer member", inviteError);
    return;
  }

  const timestamp = new Date().toISOString();
  if (existingMembership?.id) {
    await supabaseServer
      .from("developer_accounts")
      .update({
        auth_user_id: authUserId ?? existingMembership.auth_user_id,
        email: memberEmail,
        status: "pending",
        invited_by_admin_id: admin.adminId,
        invitation_sent_at: timestamp,
        revoked_at: null,
      })
      .eq("id", existingMembership.id);
  } else if (authUserId) {
    const { error: insertError } = await supabaseServer.from("developer_accounts").insert({
      developer_id: developerId,
      auth_user_id: authUserId,
      email: memberEmail,
      status: "pending",
      invited_at: timestamp,
      invitation_sent_at: timestamp,
      invited_by_admin_id: admin.adminId,
    });
    if (insertError) {
      console.error("Failed to create developer member", insertError);
      return;
    }
  }

  await logAdminActivity({
    adminId: admin.adminId,
    action: existingMembership?.id ? "developer_account.resend_invite" : "developer_account.invite",
    resourceType: "developer_accounts",
    resourceId: authUserId ?? existingMembership?.id ?? null,
    metadata: { developer_id: developerId, developer_name: developerName, email: memberEmail },
  });

  revalidatePath("/developers");
}

export default async function DevelopersPage() {
  const adminContext = await buildAdminUi(["developers_admin"]);
  const allowedDeveloperIds = adminContext.roles.includes("super_admin") ? null : adminContext.context?.developerIds ?? null;
  const { developers, properties, projects, accounts, activity } = await getDeveloperData(allowedDeveloperIds);

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

  const membersByDeveloperId = accounts.reduce<Record<string, DeveloperMember[]>>((acc, member) => {
    acc[member.developer_id] = [...(acc[member.developer_id] ?? []), member];
    return acc;
  }, {});

  const tableRows = developers.map((developer) => {
    const members = membersByDeveloperId[developer.id] ?? [];
    const lastLogin = members
      .map((member) => member.last_login)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

    return {
      id: developer.id,
      name: developer.name,
      contact_email: developer.contact_email,
      contact_phone: developer.contact_phone,
      logo_url: developer.logo_url,
      projectsCount: projectCountMap[developer.id] ?? 0,
      listingsCount: listingsCountMap[developer.id] ?? 0,
      membersCount: members.length,
      activeMembersCount: members.filter((member) => member.status === "active").length,
      lastLogin,
    };
  });

  return (
    <AdminLayout
      title="Developer management"
      description="Control developer onboarding, invitations, access, and portal activity."
      actions={
        <a
          href="#developer-invite"
          className="rounded-full border border-black/10 bg-white px-5 py-2 text-sm text-neutral-700 hover:bg-black/5"
        >
          Invite developer member
        </a>
      }
      navItems={adminContext.navItems}
      meta={adminContext.meta}
    >
      {!adminContext.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <div className="space-y-6">
          <AdminDevelopersTable
            developers={tableRows}
            projects={projects}
            properties={properties}
            members={accounts}
            activity={activity}
            canImpersonate={adminContext.roles.includes("super_admin")}
          />

          <section id="developer-invite" className="rounded-3xl border border-black/5 bg-white p-6 shadow-xl shadow-black/5">
            <header className="mb-4">
              <p className="text-sm uppercase tracking-[0.3em] text-neutral-500">Invite developer member</p>
              <p className="text-neutral-600">
                Send a secure invite email. The member completes their own signup by setting a password and activating access.
              </p>
            </header>
            <form
              action={inviteDeveloperMember}
              className="grid gap-4 rounded-2xl border border-black/10 bg-[#f8f8f8] p-4 text-sm text-neutral-700 md:grid-cols-2"
            >
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Existing developer</span>
                <select name="existingDeveloperId" className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-[#050505]">
                  <option value="">Create new</option>
                  {developers.map((developer) => (
                    <option key={developer.id} value={developer.id}>
                      {developer.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Developer name</span>
                <input
                  name="developerName"
                  placeholder="Atlas Developments"
                  className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-[#050505]"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Contact email</span>
                <input
                  type="email"
                  name="contactEmail"
                  placeholder="partners@developer.com"
                  className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-[#050505]"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Contact phone</span>
                <input
                  name="contactPhone"
                  placeholder="+20 100 000 0000"
                  className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-[#050505]"
                />
              </label>
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Member email</span>
                <input
                  type="email"
                  name="memberEmail"
                  required
                  placeholder="member@developer.com"
                  className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-[#050505]"
                />
              </label>
              <div className="space-y-2 md:col-span-2">
                <button type="submit" className="w-full rounded-full bg-black px-5 py-3 text-sm font-semibold text-white hover:bg-black/90">
                  Send invite
                </button>
                <p className="text-xs text-neutral-500">
                  Selecting an existing developer updates their contact info and attaches the invited member to that developer.
                </p>
              </div>
            </form>
          </section>
        </div>
      )}
    </AdminLayout>
  );
}
