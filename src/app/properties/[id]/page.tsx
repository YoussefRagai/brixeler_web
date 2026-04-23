import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
import { supabaseServer } from "@/lib/supabaseServer";

const formatCurrency = (value?: number | string | null) => {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (!numeric || Number.isNaN(numeric)) return "—";
  return numeric.toLocaleString("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  });
};

const formatTimestamp = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

async function loadProperty(id: string) {
  const { data: property } = await supabaseServer
    .from("properties")
    .select("id, property_name, unit_area, price, approval_status, listed_by_agent_id, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!property) return null;

  const { data: agent } = property.listed_by_agent_id
    ? await supabaseServer.from("users_profile").select("display_name").eq("id", property.listed_by_agent_id).maybeSingle()
    : { data: null };

  return {
    id: property.id,
    name: property.property_name ?? "Property",
    area: property.unit_area ? `${property.unit_area} m²` : "—",
    price: formatCurrency(property.price),
    status: property.approval_status ?? "pending",
    agent: agent?.display_name ?? "—",
    date: formatTimestamp(property.created_at),
  };
}

export default async function PropertyDetailPage({ params }: { params: { id: string } }) {
  const ui = await buildAdminUi(["listing_admin"]);
  const property = await loadProperty(params.id);
  if (!property) return notFound();

  return (
    <AdminLayout
      title={property.name}
      description={`${property.area} • ${property.price}`}
      actions={
        <Link
          href="/properties"
          className="rounded-full border border-white/10 px-5 py-2 text-sm text-white/80 hover:bg-white/10"
        >
          Back to queue
        </Link>
      }
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <section className="rounded-3xl border border-white/5 bg-white/5 p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Submission</p>
          <p className="text-lg text-slate-300">
            Submitted by {property.agent} on {property.date}
          </p>
          <div className="mt-4 space-y-2 text-sm text-slate-300">
            <p>
              Status: <span className="text-emerald-300">{property.status}</span>
            </p>
            <p>Price: {property.price}</p>
            <p>Area: {property.area}</p>
          </div>
        </section>
      )}
    </AdminLayout>
  );
}
