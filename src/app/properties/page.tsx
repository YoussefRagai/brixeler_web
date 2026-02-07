import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { propertyRows } from "@/data/mock";
import { buildAdminUi } from "@/lib/adminUi";
import { supabaseServer } from "@/lib/supabaseServer";
import { PropertyApprovalQueue, type PropertyApprovalEntry } from "@/components/PropertyApprovalQueue";

async function loadPropertyQueue(): Promise<PropertyApprovalEntry[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return propertyRows.map((property) => ({
      id: property.id,
      name: property.name,
      area: property.area,
      price: property.price,
      status: property.status ?? "pending",
      rejectionReason: null,
      submittedBy: property.agent,
      submittedAt: property.date,
    }));
  }

  const { data: properties } = await supabaseServer
    .from("properties")
    .select(
      "id, property_name, unit_area, price, approval_status, rejection_reason, listed_by_agent_id, created_at, description, photos, bedrooms, bathrooms, property_type, amenities",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const agentIds = Array.from(
    new Set((properties ?? []).map((property) => property.listed_by_agent_id).filter(Boolean)),
  ) as string[];
  const { data: agents } = agentIds.length
    ? await supabaseServer.from("users_profile").select("id, display_name").in("id", agentIds)
    : { data: [] };
  const agentMap = new Map((agents ?? []).map((agent) => [agent.id, agent.display_name ?? "Agent"]));

  return (properties ?? []).map((property: any) => ({
    id: property.id,
    name: property.property_name,
    area: `${property.unit_area ?? "—"} m²`,
    price: property.price ? `${property.price}` : "—",
    status: property.approval_status ?? "pending",
    rejectionReason: property.rejection_reason ?? null,
    submittedBy: property.listed_by_agent_id ? agentMap.get(property.listed_by_agent_id) ?? "Agent" : "—",
    submittedAt: property.created_at ? new Date(property.created_at).toLocaleString() : "—",
    description: property.description ?? null,
    photos: property.photos ?? [],
    bedrooms: property.bedrooms ?? null,
    bathrooms: property.bathrooms ?? null,
    unitArea: property.unit_area ?? null,
    propertyType: property.property_type ?? null,
    amenities: property.amenities ?? [],
  })) as PropertyApprovalEntry[];
}

export default async function PropertiesPage() {
  const ui = await buildAdminUi(["listing_admin"]);
  const queue = await loadPropertyQueue();
  return (
    <AdminLayout
      title="Property operations"
      description="Moderate listings, monitor inquiry velocity, and spotlight launches."
      actions={
        <button className="rounded-full border border-white/10 px-5 py-2 text-sm text-white/80 hover:bg-white/10">
          Bulk import
        </button>
      }
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <>
          <section className="rounded-3xl border border-white/5 bg-white/5 p-6">
            <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
              Approval queue
            </p>
            <p className="text-lg text-slate-300">
              Developer + agent submitted listings
            </p>
          </div>
          <div />
        </header>
        <PropertyApprovalQueue entries={queue} />
          </section>
        </>
      )}
    </AdminLayout>
  );
}
