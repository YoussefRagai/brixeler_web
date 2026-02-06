import Link from "next/link";
import { AdminLayout } from "@/components/AdminLayout";
import { propertyRows } from "@/data/mock";

export default function PropertiesPage() {
  return (
    <AdminLayout
      title="Property operations"
      description="Moderate listings, monitor inquiry velocity, and spotlight launches."
      actions={
        <button className="rounded-full border border-white/10 px-5 py-2 text-sm text-white/80 hover:bg-white/10">
          Bulk import
        </button>
      }
    >
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
          <div className="flex gap-3 text-sm">
            <button className="rounded-full border border-white/10 px-4 py-2 text-white/80">
              Filters
            </button>
            <button className="rounded-full border border-emerald-400 px-4 py-2 text-emerald-200">
              Auto-approve config
            </button>
          </div>
        </header>
        <div className="mt-6 space-y-4">
          {propertyRows.map((property) => (
            <article
              key={property.id}
              className="rounded-2xl border border-white/5 bg-black/20 p-4 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-white">{property.name}</p>
                  <p className="text-slate-400">
                    {property.area} · {property.price}
                  </p>
                </div>
                <span
                  className="rounded-full border border-white/10 px-3 py-1 text-xs"
                  data-status={property.status}
                >
                  {property.status}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-slate-400">
                <p>Submitted by: {property.agent}</p>
                <p>Received: {property.date}</p>
              </div>
              <Link
                href={`/properties/${property.id}`}
                className="mt-3 inline-flex rounded-full border border-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
              >
                Review details
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/5 bg-white/5 p-6">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
              Spotlight
            </p>
            <p className="text-lg text-slate-300">Featured launches</p>
          </div>
          <button className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/80">
            Update carousel
          </button>
        </header>
        <div className="grid gap-4 md:grid-cols-2">
          {propertyRows.slice(0, 2).map((property) => (
            <article
              key={`spotlight-${property.id}`}
              className="rounded-2xl border border-white/5 bg-gradient-to-br from-slate-900/60 to-slate-900/20 p-4"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                {property.area}
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {property.name}
              </p>
              <p className="text-slate-400">{property.price}</p>
              <p className="mt-4 text-xs text-slate-500">
                Conversion uplift +18% when pinned
              </p>
            </article>
          ))}
        </div>
      </section>
    </AdminLayout>
  );
}
