import { AdminLayout } from "@/components/AdminLayout";
import { agentRows } from "@/data/mock";

export default function AgentsPage() {
  return (
    <AdminLayout
      title="Agents"
      description="Manage verification, commission tiers, referrals, and account health."
      actions={
        <button className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900">
          Add admin note
        </button>
      }
    >
      <section className="rounded-3xl border border-white/5 bg-white/5 p-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
              Roster
            </p>
            <p className="text-lg text-slate-300">Agent directory</p>
          </div>
          <div className="flex gap-3 text-sm">
            <button className="rounded-full border border-white/10 px-4 py-2 text-white/80 hover:bg-white/10">
              Export CSV
            </button>
            <button className="rounded-full border border-emerald-400 px-4 py-2 text-emerald-200">
              Filter: Verified
            </button>
          </div>
        </header>
        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-[0.2em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Deals</th>
                <th className="px-4 py-3">Earnings</th>
                <th className="px-4 py-3">Commission</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agentRows.map((agent) => (
                <tr
                  key={agent.id}
                  className="border-b border-white/5 text-slate-200"
                >
                  <td className="px-4 py-4 font-medium text-white">
                    {agent.name}
                  </td>
                  <td className="px-4 py-4 text-slate-400">{agent.phone}</td>
                  <td className="px-4 py-4">{agent.deals}</td>
                  <td className="px-4 py-4">{agent.earnings}</td>
                  <td className="px-4 py-4">{agent.commission}</td>
                  <td className="px-4 py-4">
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs">
                      {agent.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <button className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/10">
                      Open profile
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminLayout>
  );
}
