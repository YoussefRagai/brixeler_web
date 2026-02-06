import { AdminLayout } from "@/components/AdminLayout";

const amenities = ["Infinity pool", "Clubhouse", "Smart locks", "Concierge"];
const propertyTypes = ["Apartment", "Villa", "Townhouse", "Chalet"];

export default function ContentPage() {
  return (
    <AdminLayout
      title="Content management"
      description="Manage amenities, property types, and FAQ content."
      actions={
        <button className="rounded-full border border-white/10 px-5 py-2 text-sm text-white/80 hover:bg-white/10">
          Publish changes
        </button>
      }
    >
      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-3xl border border-white/5 bg-white/5 p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
            Amenities
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {amenities.map((amenity) => (
              <span key={amenity} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/80">
                {amenity}
              </span>
            ))}
          </div>
        </article>
        <article className="rounded-3xl border border-white/5 bg-white/5 p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
            Property types
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {propertyTypes.map((type) => (
              <span key={type} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/80">
                {type}
              </span>
            ))}
          </div>
        </article>
      </section>
    </AdminLayout>
  );
}
