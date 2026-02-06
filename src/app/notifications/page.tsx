import { AdminLayout } from "@/components/AdminLayout";

const segments = [
  { label: "All Agents", value: "2,047" },
  { label: "Verified", value: "1,872" },
  { label: "New this week", value: "112" },
];

export default function NotificationsPage() {
  return (
    <AdminLayout
      title="Notifications"
      description="Broadcast product updates, payouts, and PRD volume releases."
      actions={
        <button className="rounded-full border border-black/10 px-5 py-2 text-sm text-black hover:bg-black hover:text-white transition">
          View history
        </button>
      }
    >
      <section className="grid gap-4 sm:grid-cols-3">
        {segments.map((segment) => (
          <article key={segment.label} className="rounded-2xl border border-black/5 bg-white p-4 shadow-md">
            <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">
              {segment.label}
            </p>
            <p className="mt-2 text-2xl font-semibold text-[#050505]">{segment.value}</p>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-black/5 bg-white p-6 shadow-lg">
        <form className="space-y-6">
          <div>
            <label className="text-xs uppercase tracking-[0.3em] text-neutral-500">
              Recipient
            </label>
            <select className="mt-2 w-full rounded-2xl border border-black/10 bg-[#f7f7f7] px-4 py-3 text-sm text-[#050505]">
              <option>All verified agents</option>
              <option>Agents without deals</option>
              <option>Agents waiting for payment</option>
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-[0.3em] text-neutral-500">
                Title
              </label>
              <input
                className="mt-2 w-full rounded-2xl border border-black/10 bg-[#f7f7f7] px-4 py-3 text-sm text-[#050505]"
                placeholder="Commission batch released"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.3em] text-neutral-500">
                Channel
              </label>
              <select className="mt-2 w-full rounded-2xl border border-black/10 bg-[#f7f7f7] px-4 py-3 text-sm text-[#050505]">
                <option>In-app + Push</option>
                <option>Email only</option>
                <option>SMS</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.3em] text-neutral-500">
              Message
            </label>
            <textarea
              className="mt-2 min-h-[160px] w-full rounded-2xl border border-black/10 bg-[#f7f7f7] px-4 py-3 text-sm text-[#050505]"
              placeholder="Let agents know about PRD volume 4 analytics, exports, and new AI insights."
            />
          </div>
          <div className="flex gap-4">
            <button className="rounded-full border border-black/10 px-5 py-2 text-sm text-[#050505] hover:bg-black hover:text-white transition">
              Schedule
            </button>
            <button className="keep-white rounded-full bg-black px-5 py-2 text-sm font-semibold text-white">
              Send notification
            </button>
          </div>
        </form>
      </section>
    </AdminLayout>
  );
}
