import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { propertyRows } from "@/data/mock";
import { buildAdminUi } from "@/lib/adminUi";

export default async function PropertyDetailPage({ params }: { params: { id: string } }) {
  const ui = await buildAdminUi(["listing_admin"]);
  const property = propertyRows.find((row) => row.id === params.id);
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
        <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
          Submission
        </p>
        <p className="text-lg text-slate-300">Submitted by {property.agent} on {property.date}</p>
        <div className="mt-4 space-y-2 text-sm text-slate-300">
          <p>Status: <span className="text-emerald-300">{property.status}</span></p>
          <p>Price: {property.price}</p>
          <p>Area: {property.area}</p>
        </div>
        </section>
      )}
    </AdminLayout>
  );
}
