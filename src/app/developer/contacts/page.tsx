import Link from "next/link";
import { ArrowLeft, UsersRound } from "lucide-react";
import { DeveloperLayout } from "@/components/DeveloperLayout";
import { DeveloperLeadInbox } from "@/components/DeveloperLeadInbox";
import { currentDeveloperImpersonation, requireDeveloperCapability } from "@/lib/developerAuth";
import { fetchDeveloperCompanyMembers, fetchDeveloperSalesLeads, isDeveloperLeadStatus, type DeveloperLeadStatus } from "@/lib/developerSalesOps";

export const dynamic = "force-dynamic";

type SearchParams = {
  status?: string;
  assignee?: string;
  project?: string;
  age?: string;
  q?: string;
};

function clean(value?: string) { return (value ?? "").trim().slice(0, 160); }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function DeveloperContactsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) ?? {};
  const rawStatus = clean(params.status).toLowerCase();
  const status = rawStatus && rawStatus !== "all" && isDeveloperLeadStatus(rawStatus) ? rawStatus : "all";
  const assigneeValue = clean(params.assignee);
  const assignee = assigneeValue === "unassigned" || UUID_PATTERN.test(assigneeValue) ? assigneeValue || "all" : "all";
  const projectValue = clean(params.project);
  const project = UUID_PATTERN.test(projectValue) ? projectValue : null;
  const rawAge = clean(params.age);
  const age = rawAge === "sla_overdue" || rawAge === "follow_up_due" || rawAge === "unassigned" ? rawAge : "all";
  const query = clean(params.q);
  const session = await requireDeveloperCapability("view_contacts");
  const [leads, members, impersonation] = await Promise.all([
    fetchDeveloperSalesLeads(session.developerId, { status: status as DeveloperLeadStatus | "all", assigneeId: assignee, projectId: project, age, query, limit: 500 }),
    fetchDeveloperCompanyMembers(session.developerId),
    currentDeveloperImpersonation(),
  ]);

  return (
    <DeveloperLayout
      title="Sales leads"
      description="Manage mobile requests from first response through reservation and close."
      impersonation={impersonation}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm text-neutral-500"><UsersRound aria-hidden="true" size={16} /> Tenant-scoped sales workspace <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-700">{leads.data.length} shown</span></div><Link href="/developer" className="inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-xs font-semibold text-neutral-700 hover:border-black/30 hover:text-black"><ArrowLeft aria-hidden="true" size={14} /> Overview</Link></div>
      {leads.error ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">The lead inbox is temporarily unavailable. Refresh to try again.</p> : null}
      <DeveloperLeadInbox initialLeads={leads.data} members={members.data} filters={{ status, assignee, project: project ?? "", age, q: query }} canManage />
    </DeveloperLayout>
  );
}
