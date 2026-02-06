import { DeveloperLayout } from "@/components/DeveloperLayout";
import { requireDeveloperSession } from "@/lib/developerAuth";
import {
  fetchDeveloperProfile,
  fetchDeveloperProjects,
  fetchDeveloperResales,
  fetchDeveloperStats,
} from "@/lib/developerQueries";

export default async function DeveloperDashboardPage() {
  const session = await requireDeveloperSession();
  const [stats, resales, projects, profile] = await Promise.all([
    fetchDeveloperStats(session.developerId),
    fetchDeveloperResales(session.developerId),
    fetchDeveloperProjects(session.developerId),
    fetchDeveloperProfile(session.developerId),
  ]);

  return (
    <DeveloperLayout
      title="Developer overview"
      description="Welcome back. Track agent activity, deal velocity, and live demand for your launches."
    >
      <section className="rounded-3xl border border-black/5 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Welcome</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#050505]">
              {profile?.name ?? "Developer partner"} command center
            </h2>
            <p className="mt-2 max-w-xl text-sm text-neutral-500">
              Monitor agent activity across your projects, keep launch content up to date, and
              see how deals move through the pipeline.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-black/10 bg-neutral-50">
              {profile?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.logo_url} alt={`${profile?.name ?? "Developer"} logo`} className="h-16 w-16 object-contain" />
              ) : (
                <span className="text-xs uppercase tracking-[0.3em] text-neutral-400">Logo</span>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Active listings" value={stats.listings} />
        <StatCard label="Hidden" value={stats.hidden} />
        <StatCard label="Pending review" value={stats.pending} />
        <StatCard label="New inquiries" value={stats.inquiries} />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { label: "EOIs", value: "—" },
          { label: "CILs", value: "—" },
          { label: "Reservations", value: "—" },
          { label: "Sales claims", value: "—" },
          { label: "Stage shifts", value: "—" },
          { label: "Deals this month", value: "—" },
        ].map((metric) => (
          <StatCard key={metric.label} label={metric.label} value={metric.value} />
        ))}
      </section>

      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Resales</p>
            <p className="text-base text-neutral-700">Latest agent submissions</p>
          </div>
        </header>
        <div className="rounded-3xl border border-black/5 bg-white p-4">
          {!resales.length && (
            <p className="text-sm text-neutral-500">No resale units yet. Agent submissions will appear here.</p>
          )}
          {resales.slice(0, 5).map((listing) => (
            <div key={listing.id} className="flex items-center justify-between border-b border-black/5 py-3 last:border-b-0">
              <div>
                <p className="font-semibold text-[#050505]">{listing.name}</p>
                <p className="text-xs text-neutral-500">
                  {listing.status} · {listing.visibility} · {listing.updated_at ? new Date(listing.updated_at).toLocaleString() : '—'}
                </p>
              </div>
              <p className="text-sm font-semibold text-[#050505]">EGP {listing.price.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Projects</p>
            <p className="text-base text-neutral-700">Content that feeds agents</p>
          </div>
        </header>
        <div className="grid gap-4 md:grid-cols-2">
          {projects.slice(0, 4).map((project) => (
            <article key={project.id} className="rounded-2xl border border-black/5 bg-white p-4">
              <p className="text-sm font-semibold text-[#050505]">{project.name}</p>
              <p className="text-sm text-neutral-500">{project.description ?? 'No description yet'}</p>
            </article>
          ))}
          {!projects.length && (
            <p className="rounded-2xl border border-dashed border-black/5 bg-white p-6 text-sm text-neutral-500">
              No projects yet. Use the Projects tab to add launch briefs and assets for agents.
            </p>
          )}
        </div>
      </section>
    </DeveloperLayout>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="rounded-3xl border border-black/5 bg-white p-5">
      <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-[#050505]">{value}</p>
    </article>
  );
}
