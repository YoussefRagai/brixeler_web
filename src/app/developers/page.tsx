import { AdminLayout } from "@/components/AdminLayout";
import { supabaseServer } from "@/lib/supabaseServer";
import { revalidatePath } from "next/cache";

type Developer = {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
};

type Property = {
  id: string;
  property_name: string;
  developer_id: string | null;
};

type CommissionRule = {
  id: string;
  developer_id: string;
  property_id: string | null;
  commission_rate: number;
  platform_share: number | null;
  valid_from: string | null;
  valid_to: string | null;
  notes: string | null;
  developers?: { name: string | null }[] | { name: string | null } | null;
  properties?: { property_name: string | null }[] | { property_name: string | null } | null;
};

type DeveloperAccount = {
  id: string;
  developer_id: string;
  auth_user_id: string;
  last_login: string | null;
  email: string | null;
};

async function getDeveloperData(): Promise<{
  developers: Developer[];
  properties: Property[];
  commissionRules: CommissionRule[];
  accounts: DeveloperAccount[];
}> {
  const [{ data: developers }, { data: properties }, { data: commissionRules }, { data: accounts }] = await Promise.all([
    supabaseServer.from("developers").select("id, name, contact_email, contact_phone").order("name"),
    supabaseServer
      .from("properties")
      .select("id, property_name, developer_id")
      .order("property_name")
      .limit(500),
    supabaseServer
      .from("developer_commission_rules")
      .select("id, developer_id, property_id, commission_rate, platform_share, valid_from, valid_to, notes, developers(name), properties(property_name)")
      .order("developer_id"),
    supabaseServer.from("developer_accounts").select("id, developer_id, auth_user_id, last_login"),
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
    commissionRules: (commissionRules ?? []) as CommissionRule[],
    accounts: enrichedAccounts,
  };
}

async function upsertCommissionRule(formData: FormData) {
  "use server";
  const ruleId = formData.get("ruleId")?.toString() || undefined;
  const developerId = formData.get("developerId")?.toString();
  const propertyIdRaw = formData.get("propertyId")?.toString() || "";
  const commissionRate = parseFloat(formData.get("commissionRate")?.toString() ?? "0");
  const platformShare = parseFloat(formData.get("platformShare")?.toString() ?? "0");
  const validFrom = formData.get("validFrom")?.toString() || null;
  const validTo = formData.get("validTo")?.toString() || null;
  const notes = formData.get("notes")?.toString() || null;

  if (!developerId || Number.isNaN(commissionRate)) {
    return;
  }

  const payload = {
    id: ruleId,
    developer_id: developerId,
    property_id: propertyIdRaw.length ? propertyIdRaw : null,
    commission_rate: commissionRate,
    platform_share: Number.isNaN(platformShare) ? 0 : platformShare,
    valid_from: validFrom && validFrom.length ? validFrom : null,
    valid_to: validTo && validTo.length ? validTo : null,
    notes: notes && notes.length ? notes : null,
  };

  await supabaseServer.from("developer_commission_rules").upsert(payload, { onConflict: "id" });
  revalidatePath("/developers");
}

async function deleteCommissionRule(formData: FormData) {
  "use server";
  const ruleId = formData.get("ruleId")?.toString();
  if (!ruleId) return;
  await supabaseServer.from("developer_commission_rules").delete().eq("id", ruleId);
  revalidatePath("/developers");
}

async function createDeveloperLogin(formData: FormData) {
  "use server";
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
    if (!developerName) return;
    const { data: existing } = await supabaseServer.from("developers").select("id").eq("name", developerName).maybeSingle();
    if (existing?.id) {
      developerId = existing.id;
      await supabaseServer.from("developers").update({ contact_email: contactEmail, contact_phone: contactPhone }).eq("id", developerId);
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
    await supabaseServer.from("developers").update({ contact_email: contactEmail, contact_phone: contactPhone }).eq("id", developerId);
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

  revalidatePath("/developers");
}

async function resetDeveloperPassword(formData: FormData) {
  "use server";
  const authUserId = formData.get("authUserId")?.toString();
  const newPassword = formData.get("newPassword")?.toString();
  if (!authUserId || !newPassword) return;
  const { error } = await supabaseServer.auth.admin.updateUserById(authUserId, { password: newPassword });
  if (error) {
    console.error("Failed to reset developer password", error);
  }
  revalidatePath("/developers");
}

async function revokeDeveloperAccess(formData: FormData) {
  "use server";
  const accountId = formData.get("accountId")?.toString();
  const authUserId = formData.get("authUserId")?.toString();
  if (accountId) {
    await supabaseServer.from("developer_accounts").delete().eq("id", accountId);
  }
  if (authUserId) {
    await supabaseServer.auth.admin.deleteUser(authUserId);
  }
  revalidatePath("/developers");
}

export default async function DevelopersPage() {
  const { developers, properties, commissionRules, accounts } = await getDeveloperData();
  const propertyMap = properties.reduce<Record<string, Property>>((acc, property) => {
    acc[property.id] = property;
    return acc;
  }, {});
  const developerMap = developers.reduce<Record<string, Developer>>((acc, dev) => {
    acc[dev.id] = dev;
    return acc;
  }, {});
  const accountMap = accounts.reduce<Record<string, DeveloperAccount>>((acc, account) => {
    acc[account.developer_id] = account;
    return acc;
  }, {});

  const groupedProperties = developers.map((developer) => ({
    ...developer,
    propertyCount: properties.filter((property) => property.developer_id === developer.id).length,
  }));

  return (
    <AdminLayout
      title="Developer management"
      description="Control which developers are onboarded and how commissions are structured per project."
      actions={
        <button className="rounded-full border border-white/10 px-5 py-2 text-sm text-white/80 hover:bg-white/10">
          Invite developer
        </button>
      }
    >
      <section className="rounded-3xl border border-white/5 bg-white/5 p-6">
        <header className="mb-4">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Create developer login</p>
          <p className="text-slate-300">Provision partners with access to the developer portal. Temporary passwords should be rotated after first login.</p>
        </header>
        <form action={createDeveloperLogin} className="grid gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white md:grid-cols-2">
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
          <div className="md:col-span-2 space-y-2">
            <button type="submit" className="w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-slate-100">
              Provision access
            </button>
            <p className="text-xs text-slate-400">
              Selecting an existing developer updates their contact info and creates a portal login. Leave blank to onboard a new partner.
            </p>
          </div>
        </form>
      </section>

      <section className="rounded-3xl border border-white/5 bg-white/5 p-6">
        <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Developers</p>
        <table className="mt-4 w-full text-left text-sm text-slate-200">
          <thead className="text-xs uppercase tracking-[0.3em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Projects</th>
              <th className="px-4 py-3">Portal access</th>
            </tr>
          </thead>
          <tbody>
            {groupedProperties.map((developer) => (
              <tr key={developer.id} className="border-b border-white/5">
                <td className="px-4 py-4 text-white">{developer.name}</td>
                <td className="px-4 py-4 text-slate-300">
                  {developer.contact_email ?? "—"}
                  <br />
                  <span className="text-xs text-slate-500">{developer.contact_phone ?? ""}</span>
                </td>
                <td className="px-4 py-4">{developer.propertyCount}</td>
                <td className="px-4 py-4">
                  {accountMap[developer.id] ? (
                    <div className="space-y-2">
                      <p className="text-white">{accountMap[developer.id].email ?? "Account provisioned"}</p>
                      <p className="text-xs text-slate-500">
                        Last login{" "}
                        {(() => {
                          const lastLogin = accountMap[developer.id].last_login;
                          return lastLogin ? new Date(lastLogin).toLocaleString() : "—";
                        })()}
                      </p>
                      <form action={resetDeveloperPassword} className="flex flex-col gap-2 sm:flex-row">
                        <input type="hidden" name="authUserId" value={accountMap[developer.id].auth_user_id} />
                        <input
                          name="newPassword"
                          minLength={8}
                          placeholder="New password"
                          className="flex-1 rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-white"
                          required
                        />
                        <button type="submit" className="rounded-full border border-white/20 px-4 py-2 text-xs text-white hover:bg-white/10">
                          Update
                        </button>
                      </form>
                      <form action={revokeDeveloperAccess}>
                        <input type="hidden" name="accountId" value={accountMap[developer.id].id} />
                        <input type="hidden" name="authUserId" value={accountMap[developer.id].auth_user_id} />
                        <button
                          type="submit"
                          className="rounded-full border border-red-300/40 px-4 py-2 text-xs text-red-200 hover:bg-red-500/10"
                        >
                          Revoke access
                        </button>
                      </form>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500">No login</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-3xl border border-white/5 bg-white/5 p-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Commission rules</p>
            <p className="text-slate-300">
              Override default agent rates per developer or specific project. Leave project blank for all projects.
            </p>
          </div>
        </header>

        <div className="mt-6 space-y-4">
          {commissionRules.map((rule) => {
            const developerRelation = Array.isArray(rule.developers) ? rule.developers[0] : rule.developers;
            const propertyRelation = Array.isArray(rule.properties) ? rule.properties[0] : rule.properties;
            const developerName = developerRelation?.name ?? developerMap[rule.developer_id]?.name ?? "Developer";
            const propertyName =
              propertyRelation?.property_name ??
              (rule.property_id ? propertyMap[rule.property_id]?.property_name ?? "Project" : "All projects");
            return (
              <form
                key={rule.id}
                action={upsertCommissionRule}
                className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white md:grid-cols-6"
              >
                <input type="hidden" name="ruleId" value={rule.id} />
                <input type="hidden" name="developerId" value={rule.developer_id} />
                <input type="hidden" name="propertyId" value={rule.property_id ?? ""} />
                <div className="md:col-span-2">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{developerName}</p>
                  <p className="text-sm text-slate-200">{propertyName}</p>
                </div>
                <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-slate-500">
                  Commission %
                  <input
                    name="commissionRate"
                    defaultValue={rule.commission_rate}
                    step="0.1"
                    min="0"
                    className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-white"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-slate-500">
                  Brixeler share %
                  <input
                    name="platformShare"
                    defaultValue={rule.platform_share ?? 0}
                    step="0.05"
                    min="0"
                    className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-white"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-slate-500">
                  Valid from
                  <input
                    type="date"
                    name="validFrom"
                    defaultValue={rule.valid_from ?? ""}
                    className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-white"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-slate-500">
                  Valid to
                  <input
                    type="date"
                    name="validTo"
                    defaultValue={rule.valid_to ?? ""}
                    className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-white"
                  />
                </label>
                <div className="md:col-span-6 flex flex-wrap items-center gap-3">
                  <input
                    name="notes"
                    defaultValue={rule.notes ?? ""}
                    placeholder="Notes (optional)"
                    className="flex-1 rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-white"
                  />
                  <button type="submit" className="rounded-full bg-white/90 px-4 py-2 text-xs font-semibold text-black">
                    Save
                  </button>
                  <button
                    formAction={deleteCommissionRule}
                    className="rounded-full border border-white/20 px-4 py-2 text-xs text-white/60 hover:text-white"
                  >
                    Delete
                  </button>
                </div>
              </form>
            );
          })}
        </div>

        <div className="mt-8 rounded-2xl border border-dashed border-white/10 bg-black/10 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Add new rule</p>
          <form action={upsertCommissionRule} className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
              Developer
              <select
                name="developerId"
                className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Select developer
                </option>
                {developers.map((developer) => (
                  <option key={developer.id} value={developer.id}>
                    {developer.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
              Project (optional)
              <select name="propertyId" className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white" defaultValue="">
                <option value="">All projects</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.property_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
              Commission %
              <input
                name="commissionRate"
                step="0.1"
                min="0"
                placeholder="2.75"
                required
                className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
              Brixeler share %
              <input
                name="platformShare"
                step="0.05"
                min="0"
                placeholder="0.25"
                className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
              Valid from
              <input
                type="date"
                name="validFrom"
                className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
              Valid to
              <input
                type="date"
                name="validTo"
                className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="md:col-span-3 flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
              Notes
              <textarea
                name="notes"
                placeholder="Link to contract addendum or payout schedule."
                className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
              />
            </label>
            <div className="md:col-span-3 flex justify-end">
              <button type="submit" className="rounded-full bg-emerald-400 px-6 py-2 text-sm font-semibold text-emerald-950">
                Save rule
              </button>
            </div>
          </form>
        </div>
      </section>
    </AdminLayout>
  );
}
