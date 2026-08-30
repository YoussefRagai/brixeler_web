import Link from "next/link";
import { revalidatePath } from "next/cache";
import {
  ArrowUpRight,
  CalendarClock,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Eye,
  FileCheck2,
  MessageCircle,
  Plus,
  Radio,
} from "lucide-react";
import { DeveloperLayout } from "@/components/DeveloperLayout";
import {
  DeveloperNotificationInbox,
  type MarkNotificationReadAction,
  type NotificationActionState,
} from "@/components/DeveloperNotificationInbox";
import { currentDeveloperImpersonation, hasDeveloperCapability, requireDeveloperCapability, requireDeveloperSession } from "@/lib/developerAuth";
import {
  fetchDeveloperListings,
  fetchDeveloperProfile,
  fetchDeveloperProjects,
  fetchDeveloperResales,
  fetchDeveloperStats,
  type DeveloperListing,
} from "@/lib/developerQueries";
import { fetchDeveloperFunnel, fetchDeveloperSalesLeads, type DeveloperFunnel, type DeveloperSalesLead } from "@/lib/developerSalesOps";
import { supabaseServer } from "@/lib/supabaseServer";

type DeveloperProject = {
  id: string;
  name: string;
  description?: string | null;
  approval_status?: string | null;
  rejection_reason?: string | null;
  launch_status?: string | null;
  project_unit_types?: Array<unknown> | null;
};

type QueueItem = {
  id: string;
  kind: "request" | "project" | "listing" | "renewal";
  title: string;
  detail: string;
  ageDays: number;
  ageLabel?: string;
  actionLabel: string;
  href: string;
  priority: number;
};

export default async function DeveloperDashboardPage({ searchParams }: { searchParams?: Promise<{ project?: string }> }) {
  const session = await requireDeveloperSession();
  const search = (await searchParams) ?? {};
  const projectId = typeof search.project === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(search.project) ? search.project : null;
  const canViewContacts = hasDeveloperCapability(session.role, "view_contacts");
  // Project managers may use the non-contact analytics surface only after a
  // project scope is selected. The portfolio-wide metrics RPC has no account
  // scope, so never call it for a project manager or render it as a fallback.
  const canViewAnalytics = hasDeveloperCapability(session.role, "view_analytics")
    && (session.role === "developer_super_admin" || Boolean(projectId));
  const canViewPortfolioMetrics = session.role === "developer_super_admin";
  // Sales managers use the dedicated contacts and inventory tracks; the
  // overview must not become an alternate inventory-management surface.
  const canViewPortfolio = session.role !== "sales_manager";
  const [stats, resales, projects, profile, impersonation, notificationResult, listings, contactRequests, projectDatesResult] = await Promise.all([
    canViewPortfolioMetrics ? fetchDeveloperStats(session.developerId) : Promise.resolve(emptyDashboardStats()),
    canViewPortfolio ? fetchDeveloperResales(session.developerId) : Promise.resolve([] as DeveloperListing[]),
    canViewPortfolio ? fetchDeveloperProjects(session.developerId, { limit: 50 }) : Promise.resolve([]),
    fetchDeveloperProfile(session.developerId),
    currentDeveloperImpersonation(),
    canViewContacts ? supabaseServer
      .from("developer_notifications")
      .select("id, title, message, is_read, created_at, action_url")
      .eq("developer_id", session.developerId)
      .order("created_at", { ascending: false })
      .limit(10) : Promise.resolve({ data: [], error: null }),
    canViewPortfolio ? fetchDeveloperListings(session.developerId, { limit: 100 }) : Promise.resolve([] as DeveloperListing[]),
    canViewContacts ? fetchDeveloperSalesLeads(session.developerId, { limit: 100 }).then((result) => result.data) : Promise.resolve([] as DeveloperSalesLead[]),
    canViewPortfolio ? supabaseServer.from("developer_projects").select("id, updated_at").eq("developer_id", session.developerId) : Promise.resolve({ data: [], error: null }),
  ]);
  const funnelResult = canViewAnalytics ? await fetchDeveloperFunnel(session.developerId, session.accountId, projectId) : { data: null, error: null };

  const developerListings = listings.filter((listing) => !listing.listed_by_agent_id && !listing.archived_at);
  const agentResales = resales.filter((listing) => Boolean(listing.listed_by_agent_id));
  const projectRecords = projects as DeveloperProject[];
  const projectUpdatedAt = new Map((projectDatesResult.data ?? []).map((project) => [project.id, project.updated_at]));
  const queue = buildActionQueue({
    contactRequests,
    listings: developerListings,
    projects: projectRecords,
    projectUpdatedAt,
  });
  const metrics = canViewPortfolio ? getDisplayMetrics(stats, developerListings, contactRequests) : { active: 0, hidden: 0, pending: 0, inquiries: contactRequests.length };
  const salesSlaAttention = contactRequests.filter((lead) => isSlaOverdue(lead.sla_due_at, lead.status)).length;
  const developerNotifications = (notificationResult.data ?? []) as Array<{
    id: string;
    title: string;
    message: string;
    is_read: boolean;
    created_at: string;
    action_url?: string | null;
  }>;

  return (
    <DeveloperLayout
      title="Developer overview"
      description="Portfolio pulse across listings, inquiries, and launch activity."
      impersonation={impersonation}
    >
      <section className="relative overflow-hidden rounded-3xl bg-[#101110] p-6 text-white sm:p-8">
        <div className="absolute -right-24 -top-32 size-80 rounded-full border border-white/10" aria-hidden="true" />
        <div className="absolute -right-2 -top-10 size-44 rounded-full border border-white/10" aria-hidden="true" />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.38fr)] lg:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">Partner command center</p>
            <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              {profile?.name ? `Keep ${profile.name} moving.` : "Keep your portfolio moving."}
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/65">
              Start with the oldest action, keep your public identity current, and follow every request through to a clear next step.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link href="/developer/profile" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#d6e87a] px-5 text-sm font-semibold text-[#28300c] transition hover:bg-[#e5f39b]">
                Review public profile <ArrowUpRight aria-hidden="true" size={16} />
              </Link>
              {canViewContacts ? <Link href="/developer/contacts" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 px-5 text-sm font-semibold text-white transition hover:border-white/45 hover:bg-white/10">
                View sales leads <ArrowUpRight aria-hidden="true" size={16} />
              </Link> : null}
              {canViewContacts ? <Link href="/developer/activity" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 px-5 text-sm font-semibold text-white transition hover:border-white/45 hover:bg-white/10">
                View activity <ArrowUpRight aria-hidden="true" size={16} />
              </Link> : null}
              {canViewPortfolio ? <Link href="/developer/listings/new?saleType=resale" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 px-5 text-sm font-semibold text-white transition hover:border-white/45 hover:bg-white/10">
                <Plus aria-hidden="true" size={16} /> Add resale
              </Link> : null}
              <Link href="/developer/support" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 px-5 text-sm font-semibold text-white transition hover:border-white/45 hover:bg-white/10">
                Get support <ArrowUpRight aria-hidden="true" size={16} />
              </Link>
              {session.role === "developer_super_admin" ? <Link href="/developer/integrations" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 px-5 text-sm font-semibold text-white transition hover:border-white/45 hover:bg-white/10">
                Integrations <ArrowUpRight aria-hidden="true" size={16} />
              </Link> : null}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
            <div className="flex items-center gap-3">
              <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white p-2 text-black">
                {profile?.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.logo_url} alt="" className="h-full w-full object-contain" />
                ) : (
                  <Radio aria-hidden="true" size={18} />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Public identity</p>
                <p className="mt-1 truncate text-sm font-semibold text-white">{profile?.name ?? "Add your developer name"}</p>
              </div>
            </div>
            <p className="mt-4 border-t border-white/10 pt-3 text-xs leading-5 text-white/55">Public changes are staged for review before agents see them.</p>
          </div>
        </div>
      </section>

      {canViewPortfolio ? <section aria-label="Portfolio metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard href="/developer/listings?view=developer" icon={<Eye aria-hidden="true" size={17} />} label="Live inventory" value={metrics.active} detail="Visible to agents" tone="green" />
        <MetricCard href="/developer/listings?view=developer" icon={<ClipboardCheck aria-hidden="true" size={17} />} label="Needs review" value={metrics.pending} detail="Pending or changes requested" tone="amber" />
        <MetricCard href={canViewContacts ? "/developer/contacts" : "/developer/projects"} icon={<MessageCircle aria-hidden="true" size={17} />} label="Open requests" value={metrics.inquiries} detail="Agent conversations" tone="ink" />
        <MetricCard href="/developer/listings?view=developer" icon={<Radio aria-hidden="true" size={17} />} label="Hidden inventory" value={metrics.hidden} detail="Not visible to agents" tone="purple" />
      </section> : canViewContacts ? <section aria-label="Sales metrics" className="grid gap-3 sm:grid-cols-2"><MetricCard href="/developer/contacts?status=new" icon={<MessageCircle aria-hidden="true" size={17} />} label="New leads" value={contactRequests.filter((lead) => lead.status === "new").length} detail="Requests awaiting first action" tone="ink" /><MetricCard href="/developer/contacts?age=sla_overdue" icon={<CalendarClock aria-hidden="true" size={17} />} label="SLA attention" value={salesSlaAttention} detail="Open leads past due" tone="amber" /></section> : null}

      {funnelResult.data ? <DeveloperFunnelPanel funnel={funnelResult.data} projectId={projectId} /> : canViewAnalytics ? <section className="dashboard-panel rounded-3xl border border-black/5 bg-white p-5 sm:p-6"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Demand funnel</p><p className="mt-2 text-sm text-neutral-600">Funnel data is not available for this scope yet.</p></section> : null}
      <section className={`grid gap-4 ${canViewContacts ? "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]" : "lg:grid-cols-1"}`}>
        <ActionQueue items={queue} />
        {canViewContacts ? <DeveloperNotificationInbox
          notifications={developerNotifications}
          loadError={Boolean(notificationResult.error)}
          action={markDeveloperNotificationReadAction as MarkNotificationReadAction}
        /> : null}
      </section>

      {canViewPortfolio ? <section className="grid gap-4 lg:grid-cols-2">
        <article className="dashboard-panel overflow-hidden rounded-3xl border border-black/5 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/5 p-5 sm:p-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Agent resales</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#050505]">Latest submissions</h2>
              <p className="mt-1 text-sm text-neutral-500">Read-only inventory submitted by app agents.</p>
            </div>
            <Link href="/developer/listings?view=agent" className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-600 underline-offset-4 hover:text-black hover:underline">View all <ArrowUpRight aria-hidden="true" size={14} /></Link>
          </div>
          <div className="divide-y divide-black/5">
            {!agentResales.length ? (
              <p className="px-5 py-7 text-sm text-neutral-500 sm:px-6">No agent resale submissions yet.</p>
            ) : agentResales.slice(0, 5).map((listing) => <ResaleRow key={listing.id} listing={listing} />)}
          </div>
        </article>

        <article className="dashboard-panel overflow-hidden rounded-3xl border border-black/5 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/5 p-5 sm:p-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Projects</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#050505]">Launch portfolio</h2>
              <p className="mt-1 text-sm text-neutral-500">Publication state and content readiness.</p>
            </div>
            <Link href="/developer/projects" className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-600 underline-offset-4 hover:text-black hover:underline">Manage <ArrowUpRight aria-hidden="true" size={14} /></Link>
          </div>
          <div className="divide-y divide-black/5">
            {!projectRecords.length ? (
              <div className="px-5 py-7 sm:px-6">
                <p className="text-sm font-semibold text-neutral-800">No projects yet</p>
                <p className="mt-1 text-sm text-neutral-500">Add a launch brief and assets for agents.</p>
              </div>
            ) : projectRecords.slice(0, 4).map((project) => <ProjectRow key={project.id} project={project} />)}
          </div>
        </article>
      </section> : null}
    </DeveloperLayout>
  );
}

function MetricCard({
  href,
  icon,
  label,
  value,
  detail,
  tone,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: number;
  detail: string;
  tone: "green" | "amber" | "ink" | "purple";
}) {
  const toneClass = {
    green: "bg-[#f1f5d9] text-[#4c5d11]",
    amber: "bg-[#fff3ec] text-[#8d482c]",
    ink: "bg-[#eef0f0] text-[#273234]",
    purple: "bg-[#f2f1fb] text-[#4d477f]",
  }[tone];
  return (
    <Link href={href} className="dashboard-kpi group rounded-3xl border border-black/5 bg-white p-5 transition hover:-translate-y-0.5 hover:border-black/15 hover:shadow-lg hover:shadow-black/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <span className={`grid size-9 place-items-center rounded-xl ${toneClass}`}>{icon}</span>
        <ArrowUpRight aria-hidden="true" size={16} className="text-neutral-300 transition group-hover:text-black" />
      </div>
      <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">{label}</p>
      <p className="dashboard-number mt-1 text-3xl font-semibold leading-none tracking-tight text-[#050505]">{value}</p>
      <p className="mt-2 text-xs text-neutral-500">{detail}</p>
    </Link>
  );
}

function DeveloperFunnelPanel({ funnel, projectId }: { funnel: DeveloperFunnel; projectId: string | null }) {
  const stages = [
    { label: "Views", value: funnel.views, tone: "bg-[#eef0f0]" },
    { label: "Saves", value: funnel.saves, tone: "bg-[#f2f1fb]" },
    { label: "Enquiries", value: funnel.enquiries, tone: "bg-[#fff3ec]" },
    ...(funnel.reservationsAvailable && funnel.reservations != null ? [{ label: "Reservations", value: funnel.reservations, tone: "bg-[#f1f5d9]" }] : []),
  ];
  return <section className="dashboard-panel rounded-3xl border border-black/5 bg-white p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Demand funnel {projectId ? "· project scope" : "· portfolio"}</p><p className="mt-1 text-sm text-neutral-600">Observed demand from the shared mobile counters and operational rows.</p></div><span className="rounded-full bg-neutral-100 px-3 py-1.5 text-[11px] font-semibold text-neutral-600">No estimates</span></div><div className={`mt-5 grid gap-3 ${stages.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>{stages.map((stage) => <div key={stage.label} className={`rounded-2xl p-4 ${stage.tone}`}><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500">{stage.label}</p><p className="dashboard-number mt-2 text-2xl font-semibold leading-none text-[#050505]">{stage.value.toLocaleString()}</p></div>)}</div>{!funnel.reservationsAvailable ? <p className="mt-4 text-xs text-neutral-500">Reservations are not shown for a project filter because the legacy reservation stage does not carry a project identifier.</p> : null}<p className="mt-4 text-[11px] text-neutral-400">Sources: {funnel.sourceNotes.join(" · ")}</p></section>;
}

function emptyDashboardStats() {
  return { listings: 0, hidden: 0, pending: 0, inquiries: 0, eois: 0, cils: 0, reservations: 0, salesClaims: 0, stageShifts: 0, dealsThisMonth: 0 };
}

function ActionQueue({ items }: { items: QueueItem[] }) {
  return (
    <article className="dashboard-panel overflow-hidden rounded-3xl border border-black/5 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#fff3ec] text-[#8d482c]"><CircleAlert aria-hidden="true" size={18} /></div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Action queue</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#050505]">Start with what is aging</h2>
            <p className="mt-1 text-sm text-neutral-500">Open requests, review work, and time-sensitive inventory.</p>
          </div>
        </div>
        <span className="rounded-full bg-[#fff3ec] px-2.5 py-1 text-[11px] font-semibold text-[#8d482c]">{items.length} next actions</span>
      </div>
      <div className="divide-y divide-black/5">
        {items.map((item) => <QueueRow key={`${item.kind}-${item.id}`} item={item} />)}
        {!items.length ? (
          <div className="flex items-start gap-3 px-5 py-7 text-sm text-neutral-600 sm:px-6">
            <Check aria-hidden="true" className="mt-0.5 shrink-0 text-[#718224]" size={17} />
            <div><p className="font-semibold text-neutral-800">You are caught up.</p><p className="mt-1 text-neutral-500">No open review, request, or renewal action needs attention.</p></div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function QueueRow({ item }: { item: QueueItem }) {
  const icon = item.kind === "request" ? <MessageCircle aria-hidden="true" size={16} /> : item.kind === "renewal" ? <CalendarClock aria-hidden="true" size={16} /> : item.kind === "project" ? <FileCheck2 aria-hidden="true" size={16} /> : <ClipboardCheck aria-hidden="true" size={16} />;
  const ageLabel = item.ageLabel ?? (item.ageDays === 0 ? "Today" : item.ageDays === 1 ? "1 day old" : `${item.ageDays} days old`);
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-neutral-100 text-neutral-600">{icon}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#050505]">{item.title}</p>
          <p className="mt-1 line-clamp-1 text-xs text-neutral-500">{item.detail}</p>
          <p className={`mt-1.5 flex items-center gap-1 text-[11px] font-semibold ${item.kind === "renewal" || item.ageDays > 3 ? "text-[#a44d2f]" : "text-neutral-400"}`}><CalendarClock aria-hidden="true" size={12} /> {ageLabel}</p>
        </div>
      </div>
      <Link href={item.href} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1 rounded-full border border-black/10 px-3 py-1.5 text-[11px] font-semibold text-neutral-800 transition hover:border-black/30 hover:bg-neutral-50">Next: {item.actionLabel}<ChevronRight aria-hidden="true" size={14} /></Link>
    </div>
  );
}

function ResaleRow({ listing }: { listing: DeveloperListing }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <p className="flex items-center gap-2 truncate text-sm font-semibold text-[#050505]">
          {listing.name}
          {listing.is_demo ? <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">Demo</span> : null}
        </p>
        <p className="mt-1 truncate text-xs text-neutral-500">{capitalize(listing.status)} · {capitalize(listing.visibility)} · Updated {formatDate(listing.updated_at)}</p>
      </div>
      <div className="shrink-0 text-right"><p className="text-sm font-semibold text-[#050505]">EGP {listing.price.toLocaleString()}</p><p className="mt-1 text-[11px] text-neutral-400">{listing.inquiries} inquiries</p></div>
    </div>
  );
}

function ProjectRow({ project }: { project: DeveloperProject }) {
  const status = projectStatus(project);
  const unitCount = Array.isArray(project.project_unit_types) ? project.project_unit_types.length : 0;
  return (
    <Link href={`/developer/projects?project=${project.id}`} className="group flex items-start justify-between gap-3 px-5 py-4 transition hover:bg-neutral-50 sm:px-6">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[#050505]">{project.name}</p>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-neutral-500">{project.rejection_reason && status === "Changes requested" ? project.rejection_reason : project.description ?? "No description yet"}</p>
        <p className="mt-1.5 text-[11px] text-neutral-400">{unitCount} unit {unitCount === 1 ? "type" : "types"}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${status === "Approved" ? "bg-[#f1f5d9] text-[#4c5d11]" : status === "Changes requested" ? "bg-rose-50 text-rose-700" : "bg-[#fff3ec] text-[#8d482c]"}`}>{status}</span>
    </Link>
  );
}

function getDisplayMetrics(
  stats: Awaited<ReturnType<typeof fetchDeveloperStats>>,
  listings: DeveloperListing[],
  contactRequests: DeveloperSalesLead[],
) {
  const active = listings.filter((listing) => isLiveListing(listing)).length;
  const hidden = listings.filter((listing) => listing.visibility === "hidden").length;
  const pending = listings.filter((listing) => ["pending", "rejected"].includes(listing.status.toLowerCase())).length;
  const inquiries = contactRequests.filter((request) => !["won", "lost"].includes(request.status)).length;
  return {
    active: stats.listings > 0 ? stats.listings : active,
    hidden: stats.hidden > 0 ? stats.hidden : hidden,
    pending: stats.pending > 0 ? stats.pending : pending,
    inquiries: stats.inquiries > 0 ? stats.inquiries : inquiries,
  };
}

function buildActionQueue({
  contactRequests,
  listings,
  projects,
  projectUpdatedAt,
}: {
  contactRequests: DeveloperSalesLead[];
  listings: DeveloperListing[];
  projects: DeveloperProject[];
  projectUpdatedAt: Map<string, string | null>;
}) {
  const queue: QueueItem[] = [];
  for (const request of contactRequests.filter((item) => !["won", "lost"].includes(item.status))) {
    const ageDays = ageInDays(request.created_at);
    const isOverdue = Boolean(request.sla_due_at && new Date(request.sla_due_at).getTime() < Date.now());
    const followUpDue = Boolean(request.next_follow_up_at && new Date(request.next_follow_up_at).getTime() <= Date.now());
    queue.push({
      id: request.id,
      kind: "request",
      title: isOverdue ? `SLA overdue · ${request.requester_display_name}` : followUpDue ? `Follow up with ${request.requester_display_name}` : request.status === "new" ? `Respond to ${request.requester_display_name}` : `Advance ${request.requester_display_name}`,
      detail: `${request.project_name_snapshot}${request.property_name_snapshot ? ` · ${request.property_name_snapshot}` : ""}${request.assigned_to_account_id ? "" : " · Unassigned"}${request.duplicate_of_request_id ? " · Duplicate flagged" : ""}`,
      ageDays,
      actionLabel: isOverdue ? "resolve SLA" : request.status === "new" ? "respond" : "open lead",
      href: `/developer/contacts/${request.id}`,
      priority: isOverdue ? 8 : followUpDue ? 7 : request.status === "new" ? 6 : 5,
    });
  }
  for (const project of projects) {
    const status = String(project.approval_status ?? "").toLowerCase();
    if (status !== "pending" && status !== "rejected") continue;
    queue.push({
      id: project.id,
      kind: "project",
      title: status === "rejected" ? `Update ${project.name}` : `Finish ${project.name}`,
      detail: status === "rejected" ? project.rejection_reason ?? "Admin requested changes before publication." : "Project content is waiting for review.",
      ageDays: ageInDays(projectUpdatedAt.get(project.id) ?? null),
      ageLabel: projectUpdatedAt.get(project.id) ? undefined : "Age unavailable",
      actionLabel: status === "rejected" ? "edit project" : "open review",
      href: `/developer/projects?project=${project.id}`,
      priority: status === "rejected" ? 4 : 3,
    });
  }
  for (const listing of listings) {
    const status = listing.status.toLowerCase();
    if (status === "pending" || status === "rejected") {
      queue.push({
        id: listing.id,
        kind: "listing",
        title: status === "rejected" ? `Update ${listing.name}` : `Review ${listing.name}`,
        detail: status === "rejected" ? "Changes are needed before this inventory can publish." : "Inventory is waiting for admin review.",
        ageDays: ageInDays(listing.updated_at),
        actionLabel: "open listing",
        href: `/developer/listings/${listing.id}`,
        priority: status === "rejected" ? 4 : 3,
      });
      continue;
    }
    if (listing.expires_at && isLiveListing(listing) && new Date(listing.expires_at).getTime() <= Date.now() + 14 * 24 * 60 * 60 * 1000) {
      queue.push({
        id: listing.id,
        kind: "renewal",
        title: `Renew ${listing.name}`,
        detail: `Expires ${formatDate(listing.expires_at)} · ${listing.inquiries} inquiries`,
        ageDays: Math.max(0, ageInDays(listing.expires_at)),
        ageLabel: expiryLabel(listing.expires_at),
        actionLabel: "review expiry",
        href: `/developer/listings/${listing.id}`,
        priority: 2,
      });
    }
  }
  return queue.sort((left, right) => right.priority - left.priority || right.ageDays - left.ageDays).slice(0, 7);
}

function isLiveListing(listing: DeveloperListing) {
  return ["approved", "published", "active"].includes(listing.status.toLowerCase()) && listing.visibility === "public";
}

function projectStatus(project: DeveloperProject) {
  const approval = String(project.approval_status ?? "").toLowerCase();
  if (approval === "rejected") return "Changes requested";
  if (approval === "pending") return "Pending review";
  if (approval === "approved") return "Approved";
  return capitalize(project.launch_status ?? "Draft");
}

function ageInDays(value: string | null) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000)));
}

function isSlaOverdue(value: string | null, status: string) {
  if (!value || ["won", "lost"].includes(status)) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp < Date.now();
}

function expiryLabel(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Expiry date unavailable";
  const days = Math.ceil((timestamp - Date.now()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Expired";
  if (days === 1) return "Expires tomorrow";
  return `Expires in ${days} days`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(timestamp));
}

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ") : "—";
}

async function markDeveloperNotificationReadAction(
  _previousState: NotificationActionState,
  formData: FormData,
): Promise<NotificationActionState> {
  "use server";
  const session = await requireDeveloperCapability("view_contacts");
  const notificationIdValue = formData.get("notificationId");
  const notificationId = typeof notificationIdValue === "string" ? notificationIdValue.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(notificationId)) return { status: "error", message: "This notification could not be identified. Refresh and try again." };

  const { data, error } = await supabaseServer
    .from("developer_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("developer_id", session.developerId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.warn("Unable to mark developer notification as read", error);
    return { status: "error", message: "We couldn’t mark this as read. Try again." };
  }
  revalidatePath("/developer");
  return { status: "success", message: "Marked as read." };
}
