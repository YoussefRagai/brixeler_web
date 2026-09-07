"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { AlertCircle, ArrowUpRight, Building2, CheckCircle2, ChevronDown, Layers3, MoreHorizontal, Plus, Search, Smartphone } from "lucide-react";

export type DeveloperPortfolioProject = {
  id: string;
  name: string;
  imageUrl: string | null;
  logoUrl: string | null;
  launchStatus: "new_release" | "upcoming" | "live";
  publicationLabel: string;
  publicationState: "published" | "attention" | "review";
  readiness: number;
  phases: number;
  inventoryCount: number;
  inventoryLabel: string;
  summary: string;
  nextAction: string;
  blocker: string | null;
  updatedLabel: string;
  isDemo: boolean;
};

type Props = { projects: DeveloperPortfolioProject[]; canCreateProjects: boolean; archived: boolean };

const statusOptions = [
  { value: "all", label: "All projects" },
  { value: "new_release", label: "New release" },
  { value: "upcoming", label: "Upcoming" },
  { value: "live", label: "Live" },
] as const;

export function DeveloperProjectPortfolioBoard({ projects, canCreateProjects, archived }: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof statusOptions)[number]["value"]>("all");
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(projects[0]?.id ?? null);
  const visibleProjects = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return projects.filter((project) => (status === "all" || project.launchStatus === status) && (!needle || `${project.name} ${project.summary}`.toLocaleLowerCase().includes(needle)));
  }, [projects, query, status]);
  const attentionProjects = projects.filter((project) => project.blocker).slice(0, 2);

  return (
    <section aria-label="Project portfolio" className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative block min-w-0 sm:w-72">
            <span className="sr-only">Search projects</span>
            <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" className="h-10 w-full rounded-xl border border-black/10 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-black/30 focus:ring-2 focus:ring-[#dff579]/70" />
          </label>
          <label>
            <span className="sr-only">Filter by launch status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as (typeof statusOptions)[number]["value"])} className="h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-medium text-neutral-700 outline-none transition focus:border-black/30 sm:w-auto">
              {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Link href={archived ? "/developer/projects" : "/developer/projects?status=archived"} className="inline-flex h-10 items-center rounded-xl border border-black/10 bg-white px-3 text-sm font-semibold text-neutral-700 transition hover:border-black/25 hover:bg-neutral-50">{archived ? "Active projects" : "Archived"}</Link>
          {canCreateProjects && !archived ? <Link href="/developer/projects?create=1" className="inline-flex h-10 items-center gap-2 rounded-xl bg-black px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"><Plus aria-hidden="true" size={16} /> Add project</Link> : null}
        </div>
      </div>

      {!archived && attentionProjects.length ? (
        <div className="grid gap-2 rounded-2xl border border-amber-200 bg-[#fff9e9] p-2.5 md:grid-cols-[auto_1fr_1fr] md:items-center">
          <div className="flex items-center gap-2 px-2 py-1 text-xs font-bold uppercase tracking-[0.16em] text-amber-800"><AlertCircle aria-hidden="true" size={15} /> Needs attention</div>
          {attentionProjects.map((project) => <button key={project.id} type="button" onClick={() => setExpandedProjectId(project.id)} className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-white/85 px-3 py-2 text-left text-xs text-neutral-700 transition hover:bg-white"><span className="min-w-0 truncate"><strong className="font-semibold text-neutral-950">{project.name}</strong> · {project.blocker}</span><span className="shrink-0 font-semibold text-amber-800">Review</span></button>)}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm shadow-black/[0.03]">
        <div className="hidden grid-cols-[minmax(260px,1.5fr)_130px_150px_130px_88px] items-center gap-4 border-b border-black/5 bg-neutral-50/80 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-400 lg:grid"><span>Project</span><span>Status</span><span>Mobile readiness</span><span>Inventory</span><span className="text-right">Actions</span></div>
        {visibleProjects.map((project) => {
          const expanded = expandedProjectId === project.id;
          return (
            <article key={project.id} className="border-b border-black/5 last:border-b-0">
              <div className="grid grid-cols-2 gap-3 px-3 py-3 sm:px-4 lg:grid-cols-[minmax(260px,1.5fr)_130px_150px_130px_88px] lg:items-center lg:gap-4">
                <button type="button" onClick={() => setExpandedProjectId(expanded ? null : project.id)} aria-expanded={expanded} className="col-span-2 flex min-w-0 items-center gap-3 text-left lg:col-span-1">
                  <ProjectThumbnail project={project} />
                  <span className="min-w-0"><span className="flex min-w-0 items-center gap-2"><span className="truncate text-sm font-semibold text-neutral-950">{project.name}</span>{project.isDemo ? <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-800">Demo</span> : null}</span><span className="mt-0.5 block truncate text-xs text-neutral-500">{project.summary}</span></span>
                </button>
                <div className="order-2 flex items-center gap-2 lg:order-none lg:block"><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-400 lg:hidden">Status</span><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${project.publicationState === "published" ? "bg-emerald-100 text-emerald-800" : project.publicationState === "attention" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>{project.publicationLabel}</span></div>
                <div className="order-4 col-span-2 lg:order-none lg:col-span-1"><div className="flex items-center justify-between text-xs"><span className="text-neutral-500">{project.readiness}%</span><span className="text-[10px] text-neutral-400">mobile</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100"><span className={`block h-full rounded-full ${project.readiness >= 80 ? "bg-[#9fbd27]" : project.readiness >= 50 ? "bg-amber-400" : "bg-rose-400"}`} style={{ width: `${project.readiness}%` }} /></div></div>
                <div className="order-3 flex items-center justify-end gap-1 text-xs lg:order-none lg:block"><span className="font-semibold text-neutral-800">{project.inventoryCount}</span><span className="ml-1 text-neutral-500">{project.inventoryLabel}</span></div>
                <div className="order-5 col-span-2 flex items-center justify-end gap-1 lg:order-none lg:col-span-1">
                  <Link href={`/developer/projects/${project.id}?section=overview#project-overview`} className="inline-flex h-8 items-center gap-1 rounded-lg bg-black px-2.5 text-xs font-semibold text-white hover:bg-neutral-800">Open <ArrowUpRight aria-hidden="true" size={13} /></Link>
                  <details className="relative"><summary aria-label={`More actions for ${project.name}`} className="grid size-8 cursor-pointer list-none place-items-center rounded-lg border border-black/10 text-neutral-500 hover:bg-neutral-50 hover:text-black"><MoreHorizontal aria-hidden="true" size={16} /></summary><div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-black/10 bg-white p-1.5 text-xs shadow-xl"><Link className="block rounded-lg px-3 py-2 hover:bg-neutral-50" href={`/developer/projects/${project.id}?section=inventory#project-inventory`}>Manage inventory</Link><Link className="block rounded-lg px-3 py-2 hover:bg-neutral-50" href={`/developer/projects/${project.id}?section=settings#project-settings`}>Project settings</Link></div></details>
                  <button type="button" onClick={() => setExpandedProjectId(expanded ? null : project.id)} aria-label={expanded ? `Collapse ${project.name}` : `Expand ${project.name}`} className="grid size-8 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-50 hover:text-black"><ChevronDown aria-hidden="true" size={16} className={`transition ${expanded ? "rotate-180" : ""}`} /></button>
                </div>
              </div>
              {expanded ? <div className="grid auto-cols-[82%] grid-flow-col gap-2 overflow-x-auto border-t border-black/5 bg-[#fafafa] px-3 py-3 sm:px-4 md:grid-flow-row md:grid-cols-3 md:auto-cols-auto"><CompactMetric icon={<Layers3 size={16} />} label="Release phases" value={`${project.phases} phase${project.phases === 1 ? "" : "s"}`} note={project.phases ? "Structured and ready to update" : "Create the first release phase"} /><CompactMetric icon={<Building2 size={16} />} label="Inventory" value={`${project.inventoryCount} ${project.inventoryLabel}`} note="Open the grid for prices and availability" /><CompactMetric icon={project.blocker ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />} label={project.blocker ? "Next action" : "Mobile status"} value={project.nextAction} note={project.blocker ?? project.updatedLabel} attention={Boolean(project.blocker)} /></div> : null}
            </article>
          );
        })}
        {!visibleProjects.length ? <div className="grid min-h-48 place-items-center px-6 text-center"><div><Smartphone className="mx-auto text-neutral-300" size={28} /><p className="mt-3 text-sm font-semibold text-neutral-800">No projects found</p><p className="mt-1 text-xs text-neutral-500">Try a different search or status filter.</p></div></div> : null}
      </div>
    </section>
  );
}

function ProjectThumbnail({ project }: { project: DeveloperPortfolioProject }) {
  const src = project.logoUrl ?? project.imageUrl;
  // Project media is hosted on developer-provided/CDN origins that are intentionally not restricted to Next image domains.
  // eslint-disable-next-line @next/next/no-img-element
  return <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-black/5 bg-[#eff6d2] text-sm font-bold text-[#35420d]">{src ? <img src={src} alt="" className="h-full w-full object-cover" /> : project.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>;
}

function CompactMetric({ icon, label, value, note, attention = false }: { icon: ReactNode; label: string; value: string; note: string; attention?: boolean }) {
  return <div className={`rounded-xl border p-3 ${attention ? "border-amber-200 bg-[#fff9e9]" : "border-black/5 bg-white"}`}><div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] ${attention ? "text-amber-800" : "text-neutral-400"}`}>{icon}{label}</div><p className="mt-2 truncate text-sm font-semibold text-neutral-950">{value}</p><p className="mt-0.5 line-clamp-1 text-xs text-neutral-500">{note}</p></div>;
}
