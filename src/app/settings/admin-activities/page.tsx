import Link from "next/link";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
import { fetchAdminAccounts, fetchAdminActivityPage } from "@/lib/adminQueries";
import { ADMIN_ROLE_LABELS, isAdminRole } from "@/lib/adminRoles";

const RESOURCE_OPTIONS = ["admins", "admin_export", "developer_accounts", "properties", "deals", "support_tickets"];

function stringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safePage(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function queryHref(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  return `/settings/admin-activities?${query.toString()}`;
}

function readableAction(action: string) {
  return action
    .replaceAll("_", " ")
    .replaceAll(".", " · ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readableResource(resource: string | null) {
  return resource ? resource.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Platform";
}

function readableRole(role: string) {
  return isAdminRole(role) ? ADMIN_ROLE_LABELS[role] : readableResource(role);
}

function readableDetails(metadata: Record<string, unknown> | null) {
  if (!metadata) return "No additional details";
  const details: string[] = [];
  if (typeof metadata.reason === "string" && metadata.reason.trim()) details.push(`Reason: ${metadata.reason.trim()}`);
  if (Array.isArray(metadata.previous_roles) && Array.isArray(metadata.roles)) {
    const previous = metadata.previous_roles.filter((role): role is string => typeof role === "string").map(readableRole).join(", ") || "none";
    const next = metadata.roles.filter((role): role is string => typeof role === "string").map(readableRole).join(", ") || "none";
    details.push(`Roles: ${previous} → ${next}`);
  } else if (Array.isArray(metadata.roles)) {
    details.push(`Roles: ${metadata.roles.filter((role): role is string => typeof role === "string").map(readableRole).join(", ") || "none"}`);
  }
  if (typeof metadata.previous_status === "string" && typeof metadata.status === "string") details.push(`Status: ${metadata.previous_status} → ${metadata.status}`);
  else if (typeof metadata.status === "string") details.push(`Status: ${metadata.status}`);
  if (typeof metadata.type === "string") details.push(`Type: ${metadata.type}`);
  if (typeof metadata.format === "string") details.push(`Format: ${metadata.format.toUpperCase()}`);
  if (typeof metadata.rows === "number") details.push(`${metadata.rows.toLocaleString()} rows`);
  if (Array.isArray(metadata.developer_ids)) details.push(`Developer scope: ${metadata.developer_ids.length ? `${metadata.developer_ids.length} selected` : "all"}`);
  return details.length ? details.join(" · ") : "Updated configuration";
}

export default async function AdminActivitiesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const ui = await buildAdminUi(["super_admin"]);
  const params = (await searchParams) ?? {};
  const filters = {
    adminId: stringParam(params.adminId),
    action: stringParam(params.action),
    resourceType: stringParam(params.resource),
    from: stringParam(params.from),
    to: stringParam(params.to),
  };
  const page = safePage(stringParam(params.page));
  const [admins, activityPage] = ui.hasAccess
    ? await Promise.all([fetchAdminAccounts(), fetchAdminActivityPage({ ...filters, page, pageSize: 30 })])
    : [[], { entries: [], total: 0, page, pageSize: 30, hasNext: false }];

  const baseParams = {
    adminId: filters.adminId ?? undefined,
    action: filters.action ?? undefined,
    resource: filters.resourceType ?? undefined,
    from: filters.from ?? undefined,
    to: filters.to ?? undefined,
  };

  return (
    <AdminLayout
      title="Admin activities"
      description="Readable, filterable audit history for privileged changes and exports."
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <>
          <section className="rounded-3xl border border-black/5 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-neutral-500">Audit filters</p><p className="mt-1 text-sm text-neutral-600">IDs are intentionally omitted from the display; use the readable resource and admin labels to review changes.</p></div>
              <span className="rounded-full border border-black/10 px-3 py-1 text-xs text-neutral-500">{activityPage.total.toLocaleString()} matching events</span>
            </div>
            <form className="mt-4 flex flex-wrap items-end gap-3" role="search">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Admin<select name="adminId" defaultValue={filters.adminId ?? ""} className="mt-1 min-h-10 min-w-48 rounded-xl border border-black/10 bg-neutral-50 px-3 py-2 text-sm font-normal normal-case tracking-normal text-neutral-900"><option value="">All admins</option>{admins.map((admin) => <option key={admin.id} value={admin.id}>{admin.display_name ?? admin.email ?? "Admin"}</option>)}</select></label>
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Action<input name="action" defaultValue={filters.action ?? ""} placeholder="e.g. admin.login" className="mt-1 min-h-10 min-w-52 rounded-xl border border-black/10 bg-neutral-50 px-3 py-2 text-sm font-normal normal-case tracking-normal text-neutral-900" /></label>
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Resource<select name="resource" defaultValue={filters.resourceType ?? ""} className="mt-1 min-h-10 rounded-xl border border-black/10 bg-neutral-50 px-3 py-2 text-sm font-normal normal-case tracking-normal text-neutral-900"><option value="">All resources</option>{RESOURCE_OPTIONS.map((resource) => <option key={resource} value={resource}>{readableResource(resource)}</option>)}</select></label>
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">From<input name="from" type="date" defaultValue={filters.from ?? ""} className="mt-1 min-h-10 rounded-xl border border-black/10 bg-neutral-50 px-3 py-2 text-sm font-normal normal-case tracking-normal text-neutral-900" /></label>
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">To<input name="to" type="date" defaultValue={filters.to ?? ""} className="mt-1 min-h-10 rounded-xl border border-black/10 bg-neutral-50 px-3 py-2 text-sm font-normal normal-case tracking-normal text-neutral-900" /></label>
              <button type="submit" className="min-h-10 rounded-full bg-black px-4 py-2 text-sm font-semibold text-white">Filter</button>
              <Link href="/settings/admin-activities" className="min-h-10 rounded-full border border-black/10 px-4 py-2 text-sm leading-6 text-neutral-700">Clear</Link>
            </form>
          </section>
          <section className="overflow-hidden rounded-3xl border border-black/5 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm text-neutral-800">
                <thead className="bg-neutral-50 text-xs uppercase tracking-[0.25em] text-neutral-500"><tr><th className="px-4 py-3">Timestamp</th><th className="px-4 py-3">Admin</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Resource</th><th className="px-4 py-3">Details</th></tr></thead>
                <tbody>
                  {activityPage.entries.map((entry) => <tr key={entry.id} className="border-t border-black/5 align-top"><td className="whitespace-nowrap px-4 py-4 text-xs text-neutral-500">{new Date(entry.created_at).toLocaleString()}</td><td className="px-4 py-4 font-medium">{entry.admin_name ?? "Unknown admin"}</td><td className="px-4 py-4 font-medium">{readableAction(entry.action)}</td><td className="px-4 py-4 text-neutral-600">{readableResource(entry.resource_type)}</td><td className="max-w-md px-4 py-4 text-xs leading-5 text-neutral-600">{readableDetails(entry.metadata)}</td></tr>)}
                  {!activityPage.entries.length ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-neutral-500">No admin activity matches these filters.</td></tr> : null}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-black/5 px-5 py-4 text-sm text-neutral-600"><span>Page {activityPage.page} · {activityPage.pageSize} events per page</span><div className="flex gap-2">{activityPage.page > 1 ? <Link href={queryHref({ ...baseParams, page: String(activityPage.page - 1) })} className="rounded-full border border-black/10 px-3 py-1.5">Previous</Link> : null}{activityPage.hasNext ? <Link href={queryHref({ ...baseParams, page: String(activityPage.page + 1) })} className="rounded-full border border-black/10 px-3 py-1.5">Next</Link> : null}</div></div>
          </section>
        </>
      )}
    </AdminLayout>
  );
}
