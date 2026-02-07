import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
import { fetchPropertyRenewalRequests, type PropertyRenewalRequest } from "@/lib/developerQueries";
import { PropertyRenewalQueue, type PropertyRenewalEntry } from "@/components/PropertyRenewalQueue";
import { supabaseServer } from "@/lib/supabaseServer";

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function PropertyRenewalsPage() {
  const ui = await buildAdminUi(["listing_admin"]);
  const pendingRequests = await fetchPropertyRenewalRequests("pending");
  const entries = await loadRenewalEntries(pendingRequests);

  return (
    <AdminLayout
      title="Listing renewals"
      description="Review agent and developer renewal requests—only approved listings remain visible for 90 days."
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Pending workflow
              </p>
              <p className="text-lg text-white">Renewal approvals</p>
            </div>
            <p className="text-xs text-slate-400">
              Showing {entries.length} request{entries.length === 1 ? "" : "s"}
            </p>
          </header>
          <PropertyRenewalQueue entries={entries} />
        </section>
      )}
    </AdminLayout>
  );
}

async function loadRenewalEntries(requests: PropertyRenewalRequest[]): Promise<PropertyRenewalEntry[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return requests.map((request) => ({
      id: request.property_id ?? request.id,
      requestId: request.id,
      name: request.property?.property_name ?? "Listing",
      area: request.property?.unit_area ? `${request.property.unit_area} m²` : "—",
      price: request.property?.price ? `${request.property.price}` : "—",
      status: request.status ?? "pending",
      rejectionReason: request.notes ?? null,
      submittedBy: request.requested_by_role ?? "—",
      submittedAt: formatDate(request.requested_at),
      description: request.property?.description ?? null,
      photos: request.property?.photos ?? [],
      bedrooms: request.property?.bedrooms ?? null,
      bathrooms: request.property?.bathrooms ?? null,
      unitArea: request.property?.unit_area ?? null,
      propertyType: request.property?.property_type ?? null,
      amenities: request.property?.amenities ?? [],
    }));
  }

  const propertyIds = requests.map((request) => request.property_id).filter(Boolean) as string[];
  const { data: properties } = propertyIds.length
    ? await supabaseServer
        .from("properties")
        .select("id, property_name, unit_area, price, description, photos, bedrooms, bathrooms, property_type, amenities")
        .in("id", propertyIds)
    : { data: [] };
  const propertyMap = new Map((properties ?? []).map((property: any) => [property.id, property]));

  return requests.map((request) => {
    const property = request.property_id ? propertyMap.get(request.property_id) : request.property;
    return {
      id: request.property_id ?? request.id,
      requestId: request.id,
      name: property?.property_name ?? "Listing",
      area: property?.unit_area ? `${property.unit_area} m²` : "—",
      price: property?.price ? `${property.price}` : "—",
      status: request.status ?? "pending",
      rejectionReason: request.notes ?? null,
      submittedBy: request.requested_by_role ?? "—",
      submittedAt: formatDate(request.requested_at),
      description: property?.description ?? null,
      photos: property?.photos ?? [],
      bedrooms: property?.bedrooms ?? null,
      bathrooms: property?.bathrooms ?? null,
      unitArea: property?.unit_area ?? null,
      propertyType: property?.property_type ?? null,
      amenities: property?.amenities ?? [],
    } as PropertyRenewalEntry;
  });
}
