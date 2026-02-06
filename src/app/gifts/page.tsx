import { AdminLayout } from "@/components/AdminLayout";

const roadmapItems = [
  {
    title: "Tiered rewards",
    description:
      "Configure seasonal incentives by tier, deal volume, or developer partner. Track claimed perks and inventory.",
  },
  {
    title: "Eligibility engine",
    description:
      "Define rules that auto-tag agents when they qualify for gifts (e.g., 3 paid sales in 60 days, team referrals, etc.).",
  },
  {
    title: "Logistics & fulfillment",
    description:
      "Coordinate shipping details, pickup windows, or digital redemption codes directly from the admin workspace.",
  },
];

export default function GiftsPage() {
  return (
    <AdminLayout
      title="Gifts"
      description="Design perks and monitor eligibility across the Brixeler network."
      actions={
        <button className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-black/10 hover:bg-black/90">
          Create reward
        </button>
      }
    >
      <section className="rounded-3xl border border-black/5 bg-white px-8 py-10 shadow-xl shadow-black/5">
        <div className="flex flex-col gap-3">
          <p className="text-sm uppercase tracking-[0.4em] text-neutral-400">Program status</p>
          <h2 className="text-3xl font-semibold text-[#050505]">Agent gifting hub is under construction</h2>
          <p className="text-neutral-500">
            Product and Partnerships are finalizing the first drop of experiences, merch kits, and travel rewards. Once ready,
            this panel will let you publish gift catalogs, cap allocations, and monitor redemption activity.
          </p>
        </div>
      </section>

      <section className="grid gap-6 rounded-3xl border border-dashed border-black/10 bg-white/40 px-8 py-8 shadow-inner shadow-white">
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.4em] text-neutral-500">Next up</p>
          <h3 className="text-2xl font-semibold text-[#050505]">Roadmap milestones</h3>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {roadmapItems.map((item) => (
            <div key={item.title} className="rounded-2xl border border-black/5 bg-white px-5 py-6 shadow">
              <h4 className="text-lg font-semibold text-[#050505]">{item.title}</h4>
              <p className="mt-2 text-sm text-neutral-500">{item.description}</p>
            </div>
          ))}
        </div>
      </section>
    </AdminLayout>
  );
}

