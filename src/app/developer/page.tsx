import Link from "next/link";
import { DeveloperLayout } from "@/components/DeveloperLayout";
import { currentDeveloperImpersonation, requireDeveloperSession } from "@/lib/developerAuth";
import {
  fetchDeveloperProfile,
  fetchDeveloperProjects,
  fetchDeveloperResales,
  fetchDeveloperStats,
} from "@/lib/developerQueries";
import { supabaseServer } from "@/lib/supabaseServer";
import { revalidatePath } from "next/cache";

export default async function DeveloperDashboardPage() {
  const session = await requireDeveloperSession();
  const [stats, resales, projects, profile, impersonation, notificationResult] = await Promise.all([
    fetchDeveloperStats(session.developerId),
    fetchDeveloperResales(session.developerId),
    fetchDeveloperProjects(session.developerId),
    fetchDeveloperProfile(session.developerId),
    currentDeveloperImpersonation(),
    supabaseServer.from("developer_notifications").select("id, title, message, is_read, created_at").eq("developer_id", session.developerId).order("created_at", { ascending: false }).limit(10),
  ]);
  const developerNotifications = notificationResult.data ?? [];

  return (
    <DeveloperLayout
      title="Developer overview"
      description="Portfolio pulse across listings, inquiries, and launch activity."
      impersonation={impersonation}
    >
      <section className="dashboard-panel rounded-3xl border border-black/5 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Partner workspace</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-[#050505]">
              {profile?.name ?? "Developer partner"} command center
            </h2>
            <p className="mt-1 text-sm text-neutral-500">Keep launch content current and follow demand from first inquiry to sale.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-black/10 bg-neutral-50">
              {profile?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.logo_url} alt={`${profile?.name ?? "Developer"} logo`} className="h-11 w-11 object-contain" />
              ) : (
                <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">Logo</span>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-panel rounded-3xl border border-black/5 bg-white p-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Portfolio snapshot</p>
            <p className="mt-1 text-sm text-neutral-600">Inventory health and pipeline signals</p>
          </div>
        </header>
        <div className="dashboard-stat-grid dashboard-stat-grid--four mt-4 grid grid-cols-2 gap-y-4 md:grid-cols-4">
          <SnapshotMetric label="Active listings" value={stats.listings} />
          <SnapshotMetric label="Hidden" value={stats.hidden} />
          <SnapshotMetric label="Pending review" value={stats.pending} />
          <SnapshotMetric label="New inquiries" value={stats.inquiries} />
        </div>
        <div className="mt-4 border-t border-black/5 pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-400">Pipeline · 30 days</p>
          <div className="dashboard-stat-grid dashboard-stat-grid--three mt-3 grid grid-cols-2 gap-y-4 md:grid-cols-3">
            {[
              { label: "EOIs", value: stats.eois },
              { label: "CILs", value: stats.cils },
              { label: "Reservations", value: stats.reservations },
              { label: "Sales claims", value: stats.salesClaims },
              { label: "Stage shifts", value: stats.stageShifts },
              { label: "Deals this month", value: stats.dealsThisMonth },
            ].map((metric) => (
              <SnapshotMetric key={metric.label} label={metric.label} value={metric.value} />
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <article className="dashboard-panel rounded-3xl border border-black/5 bg-white p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Inbox</p>
              <p className="mt-1 text-sm text-neutral-600">Agent requests and workflow updates</p>
            </div>
            <span className="rounded-full bg-black px-2.5 py-1 text-[11px] font-semibold text-white">
              {developerNotifications.filter((item) => !item.is_read).length} unread
            </span>
          </div>
          <div className="mt-3 divide-y divide-black/5">
            {developerNotifications.map((item) => (
              <div key={item.id} className="dashboard-list-row flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-black">{item.title}</p>
                  <p className="truncate text-xs text-neutral-600">{item.message}</p>
                  <p className="mt-1 text-[11px] text-neutral-400">{new Date(item.created_at).toLocaleString()}</p>
                </div>
                {!item.is_read ? (
                  <form action={markDeveloperNotificationReadAction}>
                    <input type="hidden" name="notificationId" value={item.id} />
                    <button type="submit" className="rounded-full border border-black/10 px-2.5 py-1 text-[11px] font-semibold">Mark read</button>
                  </form>
                ) : <span className="text-[11px] text-neutral-400">Read</span>}
              </div>
            ))}
            {!developerNotifications.length ? <p className="py-4 text-sm text-neutral-500">No notifications yet.</p> : null}
          </div>
        </article>

        <article className="dashboard-panel rounded-3xl border border-black/5 bg-white p-6">
          <header className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Resales</p>
              <p className="mt-1 text-sm text-neutral-600">Latest agent submissions</p>
            </div>
            <Link href="/developer/listings" className="text-xs font-semibold text-neutral-600 underline-offset-4 hover:text-black hover:underline">View all</Link>
          </header>
          <div className="mt-3 divide-y divide-black/5">
            {!resales.length && (
              <p className="py-4 text-sm text-neutral-500">No resale units yet. Agent submissions will appear here.</p>
            )}
            {resales.slice(0, 5).map((listing) => (
              <div key={listing.id} className="dashboard-list-row flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate text-sm font-semibold text-[#050505]">
                    {listing.name}
                    {listing.is_demo ? (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                        Demo
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-neutral-500">
                    {listing.status} · {listing.visibility} · {listing.updated_at ? new Date(listing.updated_at).toLocaleString() : '—'}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-[#050505]">EGP {listing.price.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="dashboard-panel rounded-3xl border border-black/5 bg-white p-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Projects</p>
            <p className="mt-1 text-sm text-neutral-600">Content that feeds agents</p>
          </div>
          <a href="/developer/projects" className="text-xs font-semibold text-neutral-600 underline-offset-4 hover:text-black hover:underline">Manage projects</a>
        </header>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {projects.slice(0, 4).map((project) => (
            <article key={project.id} className="rounded-2xl border border-black/5 bg-neutral-50/70 p-3">
              <p className="truncate text-sm font-semibold text-[#050505]">{project.name}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-neutral-500">{project.description ?? 'No description yet'}</p>
            </article>
          ))}
          {!projects.length && (
            <p className="rounded-2xl border border-dashed border-black/5 bg-neutral-50/50 p-5 text-sm text-neutral-500 md:col-span-2">
              No projects yet. Use the Projects tab to add launch briefs and assets for agents.
            </p>
          )}
        </div>
      </section>
    </DeveloperLayout>
  );
}

async function markDeveloperNotificationReadAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperSession();
  const notificationId = formData.get("notificationId")?.toString();
  if (!notificationId) return;
  await supabaseServer.from("developer_notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", notificationId).eq("developer_id", session.developerId);
  revalidatePath("/developer");
}

function SnapshotMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">{label}</p>
      <p className="dashboard-number mt-1 text-xl font-semibold leading-none text-[#050505]">{value}</p>
    </div>
  );
}
