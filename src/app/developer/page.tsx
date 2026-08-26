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
      description="Welcome back. Track agent activity, deal velocity, and live demand for your launches."
      impersonation={impersonation}
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

      <section className="rounded-3xl border border-black/5 bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Inbox</p>
            <p className="text-base text-neutral-700">Agent requests and workflow updates</p>
          </div>
          <span className="rounded-full bg-black px-3 py-1 text-xs font-semibold text-white">
            {developerNotifications.filter((item) => !item.is_read).length} unread
          </span>
        </div>
        <div className="mt-4 divide-y divide-black/5">
          {developerNotifications.map((item) => (
            <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-semibold text-black">{item.title}</p>
                <p className="text-sm text-neutral-600">{item.message}</p>
                <p className="mt-1 text-xs text-neutral-400">{new Date(item.created_at).toLocaleString()}</p>
              </div>
              {!item.is_read ? (
                <form action={markDeveloperNotificationReadAction}>
                  <input type="hidden" name="notificationId" value={item.id} />
                  <button type="submit" className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold">Mark read</button>
                </form>
              ) : <span className="text-xs text-neutral-400">Read</span>}
            </div>
          ))}
          {!developerNotifications.length ? <p className="py-4 text-sm text-neutral-500">No notifications yet.</p> : null}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { label: "EOIs", value: stats.eois },
          { label: "CILs", value: stats.cils },
          { label: "Reservations", value: stats.reservations },
          { label: "Sales claims", value: stats.salesClaims },
          { label: "Stage shifts · 30d", value: stats.stageShifts },
          { label: "Deals this month", value: stats.dealsThisMonth },
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
                <p className="flex items-center gap-2 font-semibold text-[#050505]">
                  {listing.name}
                  {listing.is_demo ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                      Demo
                    </span>
                  ) : null}
                </p>
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

async function markDeveloperNotificationReadAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperSession();
  const notificationId = formData.get("notificationId")?.toString();
  if (!notificationId) return;
  await supabaseServer.from("developer_notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", notificationId).eq("developer_id", session.developerId);
  revalidatePath("/developer");
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="rounded-3xl border border-black/5 bg-white p-5">
      <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-[#050505]">{value}</p>
    </article>
  );
}
