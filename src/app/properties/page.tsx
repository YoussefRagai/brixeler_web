import Link from "next/link";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { PropertyApprovalQueue, type PropertyApprovalEntry, type PropertyChecklistItem } from "@/components/PropertyApprovalQueue";
import { PropertyCsvImportPanel } from "@/components/PropertyCsvImportPanel";
import { buildAdminUi } from "@/lib/adminUi";
import { requireAdminRole } from "@/lib/adminAuth";
import { logAdminActivity } from "@/lib/adminQueries";
import { supabaseServer } from "@/lib/supabaseServer";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const PROPERTY_PAGE_SIZE = 25;
const PROJECT_PAGE_SIZE = 20;
const PROPERTY_TABS = ["proposed", "requested", "rejected"] as const;
const PROJECT_STATUSES = ["review", "pending", "rejected", "approved", "all"] as const;

type PropertyTab = (typeof PROPERTY_TABS)[number];
type ProjectStatus = (typeof PROJECT_STATUSES)[number];

type DeveloperRelation = { name: string | null; is_active?: boolean | null };
type ProjectRelation = {
  id: string;
  name: string | null;
  approval_status: string | null;
  lifecycle_state: string | null;
  published_at: string | null;
  developers: DeveloperRelation | DeveloperRelation[] | null;
};

type PropertyQueueRow = {
  id: string;
  property_name: string | null;
  unit_area: number | null;
  price: number | null;
  approval_status: string | null;
  rejection_reason: string | null;
  listed_by_agent_id: string | null;
  developer_id: string | null;
  project_id: string | null;
  created_at: string | null;
  description: string | null;
  photos: string[] | null;
  bedrooms: number | null;
  bathrooms: number | null;
  property_type: string | null;
  amenities: string[] | null;
  is_demo: boolean | null;
  is_active: boolean | null;
  expires_at: string | null;
  published_at: string | null;
  developers: DeveloperRelation | DeveloperRelation[] | null;
  developer_projects: ProjectRelation | ProjectRelation[] | null;
};

type ProjectQueueRow = {
  id: string;
  developer_id: string | null;
  name: string;
  description: string | null;
  location: string | null;
  hero_media: Record<string, unknown> | null;
  project_types: string[] | null;
  inventory_url: string | null;
  approval_status: string | null;
  rejection_reason: string | null;
  lifecycle_state: string | null;
  published_at: string | null;
  is_demo: boolean | null;
  updated_at: string | null;
  developers: DeveloperRelation | DeveloperRelation[] | null;
};

type ProjectUnitRow = {
  id: string;
  project_id: string;
  label: string | null;
  min_price: number | null;
  unit_area_min: number | null;
  description: string | null;
  hero_image_url: string | null;
};

type PageResult<T> = {
  entries: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  error: string | null;
};

type ProjectChecklist = {
  items: Array<{ label: string; ready: boolean }>;
  issues: string[];
  ready: boolean;
  heroImageUrl: string | null;
};

function one<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function safePage(value: string | undefined, fallback = 1) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : fallback;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function isHttpUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function listingChecklist(property: PropertyQueueRow, project: ProjectRelation | null): PropertyChecklistItem[] {
  const photos = property.photos ?? [];
  const distinctPhotos = new Set(photos.map((photo) => photo.trim().toLowerCase()).filter(Boolean));
  const associationReady = Boolean(property.listed_by_agent_id || property.developer_id || property.project_id);
  const developerReady = !property.developer_id || one(property.developers)?.is_active === true;
  const projectReady = !property.project_id || Boolean(
    project &&
      project.approval_status === "approved" &&
      project.lifecycle_state === "published" &&
      project.published_at,
  );
  return [
    { key: "identity", label: "Name, type, and active association", ready: Boolean(property.property_name?.trim() && property.property_type && associationReady && developerReady) },
    { key: "commercial", label: "Price and unit area", ready: Number(property.price) >= 100000 && Number(property.unit_area) >= 10 },
    { key: "description", label: "Mobile description", ready: Boolean(property.description?.trim()) },
    { key: "media", label: "Three unique http(s) photos", ready: photos.length >= 3 && distinctPhotos.size === photos.length && photos.every((photo) => isHttpUrl(photo)) },
    { key: "project", label: "Linked project is approved and published", ready: projectReady },
  ];
}

async function loadPropertyQueue(tab: PropertyTab, page: number, search: string): Promise<PageResult<PropertyApprovalEntry>> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { entries: [], total: 0, page, pageSize: PROPERTY_PAGE_SIZE, hasNext: false, error: null };
  }

  let query = supabaseServer
    .from("properties")
    .select(
      "id, property_name, unit_area, price, approval_status, rejection_reason, listed_by_agent_id, developer_id, project_id, created_at, description, photos, bedrooms, bathrooms, property_type, amenities, is_demo, is_active, expires_at, published_at, developers(name, is_active), developer_projects(id, name, approval_status, lifecycle_state, published_at, developers(name, is_active))",
      { count: "exact" },
    );
  if (tab === "proposed") query = query.eq("approval_status", "pending").is("rejection_reason", null);
  if (tab === "requested") query = query.eq("approval_status", "pending").not("rejection_reason", "is", null);
  if (tab === "rejected") query = query.eq("approval_status", "rejected");
  if (search) query = query.ilike("property_name", `%${escapeLike(search)}%`);

  const offset = (page - 1) * PROPERTY_PAGE_SIZE;
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(offset, offset + PROPERTY_PAGE_SIZE - 1);
  if (error) return { entries: [], total: 0, page, pageSize: PROPERTY_PAGE_SIZE, hasNext: false, error: error.message };

  const rows = (data ?? []) as unknown as PropertyQueueRow[];
  const agentIds = Array.from(new Set(rows.map((row) => row.listed_by_agent_id).filter(Boolean))) as string[];
  const { data: agents } = agentIds.length
    ? await supabaseServer.from("users_profile").select("id, display_name").in("id", agentIds)
    : { data: [] };
  const agentMap = new Map((agents ?? []).map((agent) => [agent.id, agent.display_name ?? "Agent"]));

  const entries = rows.map((property) => {
    const project = one(property.developer_projects);
    const checklist = listingChecklist(property, project);
    return {
      id: property.id,
      name: property.property_name ?? "Listing",
      area: `${property.unit_area ?? "—"} m²`,
      price: property.price ? `${property.price}` : "—",
      status: property.approval_status ?? "pending",
      rejectionReason: property.rejection_reason ?? null,
      submittedBy: property.listed_by_agent_id ? agentMap.get(property.listed_by_agent_id) ?? "Agent" : "Developer",
      submittedAt: property.created_at ? new Date(property.created_at).toLocaleString() : "—",
      description: property.description ?? null,
      photos: property.photos ?? [],
      bedrooms: property.bedrooms ?? null,
      bathrooms: property.bathrooms ?? null,
      unitArea: property.unit_area ?? null,
      propertyType: property.property_type ?? null,
      amenities: property.amenities ?? [],
      isDemo: Boolean(property.is_demo),
      isActive: property.is_active !== false,
      expiresAt: property.expires_at,
      publishedAt: property.published_at,
      developerName: one(project?.developers)?.name ?? one(property.developers)?.name ?? null,
      projectName: project?.name ?? null,
      projectApprovalStatus: project?.approval_status ?? null,
      projectLifecycleState: project?.lifecycle_state ?? null,
      publicationChecklist: checklist,
      qualityIssues: checklist.filter((item) => !item.ready).map((item) => item.label),
    } satisfies PropertyApprovalEntry;
  });
  const total = count ?? entries.length;
  return { entries, total, page, pageSize: PROPERTY_PAGE_SIZE, hasNext: offset + entries.length < total, error: null };
}

function projectHeroImage(media: Record<string, unknown> | null) {
  if (!media) return null;
  if (typeof media.heroImageUrl === "string" && isHttpUrl(media.heroImageUrl)) return media.heroImageUrl;
  if (typeof media.hero_image_url === "string" && isHttpUrl(media.hero_image_url)) return media.hero_image_url;
  if (Array.isArray(media.images)) {
    const image = media.images.find((value): value is string => typeof value === "string" && isHttpUrl(value));
    return image ?? null;
  }
  return null;
}

function projectChecklist(project: ProjectQueueRow, units: ProjectUnitRow[]): ProjectChecklist {
  const heroImageUrl = projectHeroImage(project.hero_media);
  const unitReady = units.length > 0 && units.every((unit) => Boolean(
    unit.label?.trim() && Number(unit.min_price) >= 100000 && Number(unit.unit_area_min) >= 10 && unit.description?.trim(),
  ));
  const items = [
    { label: "Project name and description", ready: Boolean(project.name.trim() && project.description?.trim()) },
    { label: "Location and property types", ready: Boolean(project.location?.trim() && project.project_types?.length) },
    { label: "Hero media for mobile preview", ready: Boolean(heroImageUrl) },
    { label: "At least one complete unit type", ready: unitReady },
    { label: "Active developer association", ready: Boolean(project.developer_id && one(project.developers)?.is_active === true) },
  ];
  return { items, issues: items.filter((item) => !item.ready).map((item) => item.label), ready: items.every((item) => item.ready), heroImageUrl };
}

async function loadProjectQueue(status: ProjectStatus, page: number, search: string): Promise<PageResult<ProjectQueueRow & { units: ProjectUnitRow[]; checklist: ProjectChecklist }>> {
  let query = supabaseServer
    .from("developer_projects")
    .select("id, developer_id, name, description, location, hero_media, project_types, inventory_url, approval_status, rejection_reason, lifecycle_state, published_at, is_demo, updated_at, developers(name, is_active)", { count: "exact" });
  if (status === "review") query = query.in("approval_status", ["pending", "rejected"]);
  else if (status !== "all") query = query.eq("approval_status", status);
  if (search) query = query.ilike("name", `%${escapeLike(search)}%`);

  const offset = (page - 1) * PROJECT_PAGE_SIZE;
  const { data, count, error } = await query.order("updated_at", { ascending: false }).range(offset, offset + PROJECT_PAGE_SIZE - 1);
  if (error) return { entries: [], total: 0, page, pageSize: PROJECT_PAGE_SIZE, hasNext: false, error: error.message };
  const rows = (data ?? []) as unknown as ProjectQueueRow[];
  const projectIds = rows.map((project) => project.id);
  const { data: unitRows, error: unitError } = projectIds.length
    ? await supabaseServer.from("project_unit_types").select("id, project_id, label, min_price, unit_area_min, description, hero_image_url").in("project_id", projectIds)
    : { data: [], error: null };
  if (unitError) return { entries: [], total: 0, page, pageSize: PROJECT_PAGE_SIZE, hasNext: false, error: unitError.message };
  const unitsByProject = new Map<string, ProjectUnitRow[]>();
  for (const unit of (unitRows ?? []) as ProjectUnitRow[]) {
    const list = unitsByProject.get(unit.project_id) ?? [];
    list.push(unit);
    unitsByProject.set(unit.project_id, list);
  }
  const entries = rows.map((project) => ({ ...project, units: unitsByProject.get(project.id) ?? [], checklist: projectChecklist(project, unitsByProject.get(project.id) ?? []) }));
  const total = count ?? entries.length;
  return { entries, total, page, pageSize: PROJECT_PAGE_SIZE, hasNext: offset + entries.length < total, error: null };
}

async function loadImportOptions() {
  const [{ data: developers }, { data: projects }] = await Promise.all([
    supabaseServer.from("developers").select("id, name").eq("is_active", true).order("name"),
    supabaseServer.from("developer_projects").select("id, name, developer_id").order("name"),
  ]);
  return {
    developers: (developers ?? []).map((developer) => ({ id: developer.id, name: developer.name })),
    projects: (projects ?? []).map((project) => ({ id: project.id, name: project.name, developerId: project.developer_id })),
  };
}

function buildHref(path: string, values: Record<string, string | number | null | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value != null && String(value)) params.set(key, String(value));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export default async function PropertiesPage({ searchParams }: { searchParams?: Promise<{ success?: string; error?: string; propertyStatus?: string; propertyPage?: string; propertySearch?: string; projectStatus?: string; projectPage?: string; projectSearch?: string }> }) {
  const ui = await buildAdminUi(["listing_admin"]);
  const feedback = (await searchParams) ?? {};
  const propertyTab = PROPERTY_TABS.includes(feedback.propertyStatus as PropertyTab) ? feedback.propertyStatus as PropertyTab : "proposed";
  const projectStatus = PROJECT_STATUSES.includes(feedback.projectStatus as ProjectStatus) ? feedback.projectStatus as ProjectStatus : "review";
  const propertyPage = safePage(feedback.propertyPage);
  const projectPage = safePage(feedback.projectPage);
  const propertySearch = feedback.propertySearch?.trim() ?? "";
  const projectSearch = feedback.projectSearch?.trim() ?? "";

  const emptyProperties = { entries: [], total: 0, page: propertyPage, pageSize: PROPERTY_PAGE_SIZE, hasNext: false, error: null } as PageResult<PropertyApprovalEntry>;
  const emptyProjects = { entries: [], total: 0, page: projectPage, pageSize: PROJECT_PAGE_SIZE, hasNext: false, error: null } as PageResult<ProjectQueueRow & { units: ProjectUnitRow[]; checklist: ProjectChecklist }>;
  const [propertyPages, projectQueue, importOptions] = ui.hasAccess
    ? await Promise.all([
        Promise.all(PROPERTY_TABS.map((tab) => loadPropertyQueue(tab, tab === propertyTab ? propertyPage : 1, propertySearch))),
        loadProjectQueue(projectStatus, projectPage, projectSearch),
        loadImportOptions(),
      ])
    : [[emptyProperties, emptyProperties, emptyProperties], emptyProjects, { developers: [], projects: [] }];
  const propertyResults = Object.fromEntries(PROPERTY_TABS.map((tab, index) => [tab, propertyPages[index]])) as Record<PropertyTab, PageResult<PropertyApprovalEntry>>;
  const activePropertyPage = propertyResults[propertyTab];
  const propertyCounts = Object.fromEntries(PROPERTY_TABS.map((tab) => [tab, propertyResults[tab].total])) as Record<PropertyTab, number>;

  return (
    <AdminLayout title="Property operations" description="Moderate listings and developer projects before they become mobile-visible inventory." navItems={ui.navItems} meta={ui.meta}>
      {!ui.hasAccess ? <AdminAccessDenied /> : (
        <>
          {feedback.success ? <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{feedback.success}</div> : null}
          {feedback.error ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{feedback.error}</div> : null}

          <PropertyCsvImportPanel developers={importOptions.developers} projects={importOptions.projects} />

          <section className="rounded-3xl border border-black/5 bg-white p-6 shadow-xl shadow-black/5">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Listing approval queue</p>
                <h2 className="mt-1 text-lg font-semibold text-neutral-900">Agent and developer inventory</h2>
                <p className="mt-1 text-sm text-neutral-600">Publication requires a complete listing, unique media, and an approved linked project.</p>
              </div>
              <form className="flex flex-wrap items-end gap-2" role="search">
                <input type="hidden" name="propertyStatus" value={propertyTab} />
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Search listings
                  <input name="propertySearch" defaultValue={propertySearch} placeholder="Name…" className="mt-1 min-h-11 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-neutral-900" />
                </label>
                <button type="submit" className="min-h-11 rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800">Filter</button>
                <Link href="/properties" className="min-h-11 rounded-full border border-black/10 px-4 py-2 text-sm leading-7 text-neutral-700 hover:border-black/30">Clear</Link>
              </form>
            </header>
            {activePropertyPage.error ? <p role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">Unable to load listings: {activePropertyPage.error}</p> : null}
            <PropertyApprovalQueue entries={activePropertyPage.entries} activeTab={propertyTab} counts={propertyCounts} page={activePropertyPage.page} pageSize={activePropertyPage.pageSize} hasNext={activePropertyPage.hasNext} search={propertySearch} />
          </section>

          <section className="rounded-3xl border border-black/5 bg-white p-6 shadow-xl shadow-black/5">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Developer-project moderation</p>
                <h2 className="mt-1 text-lg font-semibold text-neutral-900">Publication checklist and mobile preview</h2>
                <p className="mt-1 text-sm text-neutral-600">Projects remain out of the mobile catalog until an operator approves complete content.</p>
              </div>
              <form className="flex flex-wrap items-end gap-2" role="search">
                <input type="hidden" name="propertyStatus" value={propertyTab} />
                <input type="hidden" name="propertySearch" value={propertySearch} />
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Search projects
                  <input name="projectSearch" defaultValue={projectSearch} placeholder="Name…" className="mt-1 min-h-11 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-neutral-900" />
                </label>
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Status
                  <select name="projectStatus" defaultValue={projectStatus} className="mt-1 min-h-11 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-neutral-900">
                    <option value="review">Needs review</option><option value="pending">Pending</option><option value="rejected">Rejected</option><option value="approved">Approved</option><option value="all">All projects</option>
                  </select>
                </label>
                <button type="submit" className="min-h-11 rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800">Filter</button>
              </form>
            </header>
            {projectQueue.error ? <p role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">Unable to load projects: {projectQueue.error}</p> : null}
            <div className="mt-5 space-y-4">
              {projectQueue.entries.map((project) => {
                const developer = one(project.developers);
                return (
                  <article key={project.id} className="rounded-2xl border border-black/10 bg-neutral-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-neutral-900">{project.name}</h3>{project.is_demo ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-800">DEMO</span> : null}<span className={`rounded-full px-3 py-1 text-xs font-semibold ${project.approval_status === "approved" ? "bg-emerald-100 text-emerald-800" : project.approval_status === "rejected" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>{project.approval_status ?? "pending"}</span></div>
                        <p className="text-xs text-neutral-500">{developer?.name ?? "Developer"} · {project.location ?? "Location not set"} · {project.units.length} unit type{project.units.length === 1 ? "" : "s"}</p>
                        <p className="mt-2 max-w-3xl text-sm text-neutral-700">{project.description ?? "No description provided."}</p>
                        {project.rejection_reason ? <p className="mt-2 text-xs text-rose-700">Reviewer note: {project.rejection_reason}</p> : null}
                      </div>
                      <div className="w-full max-w-xs rounded-2xl border border-black/10 bg-white p-3 text-xs text-neutral-700 sm:w-64">
                        <p className="font-semibold uppercase tracking-[0.2em] text-neutral-500">Mobile preview</p>
                        {project.checklist.heroImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={project.checklist.heroImageUrl} alt="" className="mt-2 h-24 w-full rounded-xl object-cover" />
                        ) : <div className="mt-2 flex h-24 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500">Hero image needed</div>}
                        <p className="mt-2 font-semibold text-neutral-900">{project.name}</p><p className="text-neutral-500">{project.location ?? "Location pending"}</p><p className="mt-1 line-clamp-2">{project.description ?? "Description pending"}</p>
                      </div>
                    </div>
                    <div className="mt-4 rounded-xl border border-black/10 bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Publication checklist · {project.checklist.ready ? "ready" : `${project.checklist.issues.length} blocker${project.checklist.issues.length === 1 ? "" : "s"}`}</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">{project.checklist.items.map((item) => <p key={item.label} className={item.ready ? "text-xs text-emerald-700" : "text-xs text-rose-700"}>{item.ready ? "✓" : "!"} {item.label}</p>)}</div>
                    </div>
                    {project.approval_status !== "approved" ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                        <form action={moderateProjectAction} className="flex flex-wrap gap-2">
                          <input type="hidden" name="projectId" value={project.id} /><input type="hidden" name="decision" value="approved" />
                          <button type="submit" disabled={!project.checklist.ready} className="min-h-11 rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">Approve for mobile</button>
                          {!project.checklist.ready ? <span className="self-center text-xs text-rose-700">Resolve checklist blockers first.</span> : null}
                        </form>
                        <form action={moderateProjectAction} className="flex flex-wrap gap-2">
                          <input type="hidden" name="projectId" value={project.id} /><input type="hidden" name="decision" value="rejected" />
                          <input name="reason" required minLength={5} placeholder="Required reviewer note" className="min-h-11 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs text-neutral-900" />
                          <button type="submit" className="min-h-11 rounded-full bg-rose-700 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-800">Request changes</button>
                        </form>
                      </div>
                    ) : <p className="mt-3 text-xs text-emerald-700">Published state: {project.lifecycle_state ?? "published"}. Mobile visibility is still filtered by active, non-demo publication rules.</p>}
                  </article>
                );
              })}
              {!projectQueue.entries.length && !projectQueue.error ? <p className="rounded-2xl border border-dashed border-black/10 p-6 text-sm text-neutral-500">No developer projects match this review filter.</p> : null}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-500"><span>{projectQueue.total} project{projectQueue.total === 1 ? "" : "s"}</span><div className="flex gap-2">{projectPage > 1 ? <Link href={buildHref("/properties", { projectStatus, projectSearch, projectPage: projectPage - 1, propertyStatus: propertyTab, propertySearch })} className="rounded-full border border-black/10 px-3 py-2 text-neutral-700">Previous</Link> : null}{projectQueue.hasNext ? <Link href={buildHref("/properties", { projectStatus, projectSearch, projectPage: projectPage + 1, propertyStatus: propertyTab, propertySearch })} className="rounded-full border border-black/10 px-3 py-2 text-neutral-700">Next</Link> : null}</div></div>
          </section>
        </>
      )}
    </AdminLayout>
  );
}

async function moderateProjectAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["listing_admin"]);
  if (!admin) redirect("/properties?error=Access%20denied.");
  const projectId = formData.get("projectId")?.toString().trim();
  const decision = formData.get("decision")?.toString();
  const reason = formData.get("reason")?.toString().trim() || null;
  if (!projectId || (decision !== "approved" && decision !== "rejected")) redirect("/properties?error=Invalid%20project%20review%20request.");
  if (decision === "rejected" && (!reason || reason.length < 5)) redirect("/properties?error=Reviewer%20note%20is%20required.");
  const { error } = await supabaseServer.rpc("review_developer_project", {
    p_project_id: projectId,
    p_admin_id: admin.adminId,
    p_decision: decision,
    p_reason: reason,
  });
  if (error) redirect(`/properties?error=${encodeURIComponent(error.message)}`);
  await logAdminActivity({ adminId: admin.adminId, action: `developer_project.${decision}`, resourceType: "developer_projects", resourceId: projectId, metadata: { reason } });
  revalidatePath("/properties");
  redirect(`/properties?success=${encodeURIComponent(decision === "approved" ? "Project approved for mobile." : "Changes requested from developer.")}`);
}
