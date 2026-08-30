import Link from "next/link";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
import {
  fetchPropertyRenewalRequestPage,
  type PropertyRenewalRequest,
} from "@/lib/developerQueries";
import { PropertyRenewalQueue, type PropertyRenewalEntry } from "@/components/PropertyRenewalQueue";
import { supabaseServer } from "@/lib/supabaseServer";

const RENEWAL_STATUSES = ["pending", "rejected", "approved", "auto_expired"] as const;
type RenewalStatus = (typeof RENEWAL_STATUSES)[number];

type SearchParams = {
  q?: string;
  status?: string;
  page?: string;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function relatedName(value: { name?: string | null } | { name?: string | null }[] | null | undefined) {
  return Array.isArray(value) ? value[0]?.name ?? null : value?.name ?? null;
}

function parseStatus(value?: string): RenewalStatus {
  return RENEWAL_STATUSES.includes(value as RenewalStatus) ? (value as RenewalStatus) : "pending";
}

export default async function PropertyRenewalsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const ui = await buildAdminUi(["listing_admin"]);
  const params = (await searchParams) ?? {};
  const activeStatus = parseStatus(params.status);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const search = params.q?.trim() ?? "";
  const empty = { requests: [], total: 0, page, pageSize: 25, hasNext: false, error: null };
  const results = ui.hasAccess
    ? await Promise.all(
        RENEWAL_STATUSES.map((status) =>
          fetchPropertyRenewalRequestPage(status, {
            page: status === activeStatus ? page : 1,
            pageSize: 25,
            search,
          }),
        ),
      )
    : RENEWAL_STATUSES.map(() => empty);
  const resultByStatus = Object.fromEntries(
    RENEWAL_STATUSES.map((status, index) => [status, results[index]]),
  ) as Record<RenewalStatus, (typeof results)[number]>;
  const activeResult = resultByStatus[activeStatus];
  const agentNames = await loadAgentNames(activeResult.requests);
  const entries = loadRenewalEntries(activeResult.requests, agentNames);

  const pageHref = (nextPage: number, nextStatus = activeStatus) => {
    const query = new URLSearchParams();
    if (search) query.set("q", search);
    query.set("status", nextStatus);
    query.set("page", String(nextPage));
    return `/properties/renewals?${query.toString()}`;
  };
  const counts = Object.fromEntries(
    RENEWAL_STATUSES.map((status) => [status, resultByStatus[status].total]),
  ) as Record<RenewalStatus, number>;

  return (
    <AdminLayout
      title="Listing renewals"
      description="Review pending requests and retain approved, rejected, and auto-expired renewal history."
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <section className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-white sm:p-6">
          <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Renewal operations</p>
              <p className="text-lg text-white">Request history and decisions</p>
            </div>
            <form method="get" className="flex w-full flex-wrap gap-2 sm:w-auto">
              <input
                name="q"
                defaultValue={search}
                placeholder="Search listings"
                aria-label="Search renewal listings"
                className="min-h-11 min-w-56 flex-1 rounded-full border border-white/10 bg-black/20 px-4 text-sm text-white placeholder:text-slate-500 sm:flex-none"
              />
              <input type="hidden" name="status" value={activeStatus} />
              <button type="submit" className="min-h-11 rounded-full bg-white px-4 text-xs font-semibold text-black">
                Search
              </button>
            </form>
          </header>
          {activeResult.error ? (
            <div role="alert" className="mb-4 rounded-2xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              Unable to load renewal history: {activeResult.error}
            </div>
          ) : null}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <span>{activeResult.total} request{activeResult.total === 1 ? "" : "s"} · page {activeResult.page}</span>
            <div className="flex gap-2">
              {activeResult.page > 1 ? (
                <Link href={pageHref(activeResult.page - 1)} className="min-h-10 rounded-full border border-white/10 px-3 py-2 text-white/80">
                  Previous
                </Link>
              ) : null}
              {activeResult.hasNext ? (
                <Link href={pageHref(activeResult.page + 1)} className="min-h-10 rounded-full border border-white/10 px-3 py-2 text-white/80">
                  Next
                </Link>
              ) : null}
            </div>
          </div>
          <PropertyRenewalQueue
            entries={entries}
            activeStatus={activeStatus}
            counts={counts}
            search={search}
          />
        </section>
      )}
    </AdminLayout>
  );
}

async function loadAgentNames(requests: PropertyRenewalRequest[]) {
  const ids = [...new Set(
    requests
      .filter((request) => (request.source ?? request.requested_by_role) === "agent")
      .map((request) => request.requested_by_id)
      .filter((id): id is string => Boolean(id)),
  )];
  if (!ids.length || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return new Map<string, string>();
  }
  const { data } = await supabaseServer.from("users_profile").select("id, display_name").in("id", ids);
  return new Map(
    ((data ?? []) as Array<{ id: string; display_name: string | null }>).map((profile) => [
      profile.id,
      profile.display_name?.trim() || "Agent",
    ]),
  );
}

function loadRenewalEntries(
  requests: PropertyRenewalRequest[],
  agentNames: Map<string, string>,
): PropertyRenewalEntry[] {
  return requests.map((request) => {
    const property = request.property;
    const source = request.source ?? request.requested_by_role ?? "unknown";
    const developerName = relatedName(property?.developers) ?? relatedName(property?.developer_projects);
    const requester = source === "agent"
      ? (request.requested_by_id ? agentNames.get(request.requested_by_id) : null) ?? "Agent"
      : source === "developer"
        ? developerName ?? "Developer"
        : source === "admin"
          ? "Admin"
          : "Unknown requester";
    return {
      id: property?.id ?? request.id,
      requestId: request.id,
      name: property?.property_name ?? "Listing",
      area: property?.unit_area ? `${property.unit_area} m²` : "—",
      price: property?.price ? `EGP ${Number(property.price).toLocaleString()}` : "—",
      status: request.status ?? "pending",
      rejectionReason: request.rejection_reason ?? request.notes ?? null,
      submittedBy: requester,
      submittedAt: formatDate(request.requested_at),
      reviewedAt: formatDate(request.reviewed_at),
      source,
      currentExpiresAt: formatDate(request.current_expires_at ?? property?.expires_at),
      proposedExpiresAt: formatDate(request.proposed_expires_at),
      projectName: developerName,
      description: property?.description ?? null,
      photos: property?.photos ?? [],
      bedrooms: property?.bedrooms ?? null,
      bathrooms: property?.bathrooms ?? null,
      unitArea: property?.unit_area ?? null,
      propertyType: property?.property_type ?? null,
      amenities: property?.amenities ?? [],
    };
  });
}
