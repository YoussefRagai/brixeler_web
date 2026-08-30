import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { DeveloperLayout } from "@/components/DeveloperLayout";
import { DeveloperProjectRequestTabs } from "@/components/DeveloperProjectRequestTabs";
import { DeveloperProjectPhaseBoard } from "@/components/DeveloperProjectPhaseBoard";
import { DeveloperInventoryGrid } from "@/components/DeveloperInventoryGrid";
import { DeveloperPublicationWorkflow } from "@/components/DeveloperPublicationWorkflow";
import { DeveloperActivityTimeline } from "@/components/DeveloperActivityTimeline";
import { DeveloperVersionHistory } from "@/components/DeveloperVersionHistory";
import { DeveloperTemplateManager } from "@/components/DeveloperTemplateManager";
import { DeveloperPublicationFeedbackPanel } from "@/components/DeveloperPublicationFeedbackPanel";
import { DeveloperPriceHistoryPanel } from "@/components/DeveloperPriceHistoryPanel";
import { ProjectImportPanel } from "@/components/ProjectImportPanel";
import { PROJECT_WIZARD_DRAFT_KEY, ProjectWizard } from "@/components/ProjectWizard";
import { LocalStorageCleanup } from "@/components/LocalStorageCleanup";
import { MobilePreviewButton } from "@/components/MobilePreviewButton";
import { DeveloperMediaField } from "@/components/DeveloperMediaField";
import { VariantOutdoorFields } from "@/components/VariantOutdoorFields";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { currentDeveloperImpersonation, hasDeveloperCapability, requireDeveloperCapability, requireDeveloperSession } from "@/lib/developerAuth";
import {
  archiveDeveloperProject,
  archiveDeveloperProjectPhase,
  archiveProjectUnitType,
  archiveProjectUnitVariant,
  createDeveloperProjectPhase,
  fetchDeveloperProfile,
  fetchDeveloperProjectPhases,
  fetchDeveloperProjects,
  importDeveloperProjectInventory,
  restoreDeveloperProjectPhase,
  restoreProjectUnitType,
  restoreProjectUnitVariant,
  restoreDeveloperProject,
  updateDeveloperProjectPhase,
  type DeveloperProjectPhase,
  type LimitedTimeOffer,
  type StructuredPaymentPlan,
  upsertDeveloperProject,
  upsertProjectUnitType,
  upsertProjectUnitVariant,
  bulkUpdateDeveloperInventory,
  cloneDeveloperProjectFromTemplate,
  createDeveloperInventoryHold,
  fetchDeveloperInventoryActivity,
  fetchDeveloperInventoryRows,
  fetchDeveloperInventorySavedFilters,
  fetchDeveloperInventoryVersions,
  fetchDeveloperProjectImpactSummary,
  fetchDeveloperProjectTemplates,
  fetchDeveloperPropertyPriceHistory,
  fetchDeveloperPublicationFeedback,
  importDeveloperInventoryRows,
  markDeveloperProjectReady,
  releaseDeveloperInventoryHold,
  resolveDeveloperPublicationFeedback,
  restoreDeveloperInventoryVersion,
  saveDeveloperInventoryFilter,
  saveDeveloperProjectTemplate,
  submitDeveloperProjectForReview,
} from "@/lib/developerQueries";
import { STORAGE_BUCKETS, isFile, removeUploadedStorageObjects, uploadFileToBucket } from "@/lib/storageServer";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const FINISHING_STATUSES = [
  { value: "finished", label: "Fully finished" },
  { value: "semi_finished", label: "Semi finished" },
  { value: "core_and_shell", label: "Core & shell" },
  { value: "furnished", label: "Furnished" },
];

const PROPERTY_TYPES_BY_CATEGORY = {
  Residential: [
    "Studio",
    "Apt",
    "Apartment",
    "Duplex",
    "Penthouse",
    "Loft",
    "Quadro",
    "Quadhouse",
    "Townhouse",
    "Twinhouse",
    "Challet",
    "Chalet",
    "Villa",
    "Cabin",
    "Family house",
    "Standalone",
  ],
  Commercial: [
    "Office",
    "Retail",
    "Clinic",
    "Pharmacy",
    "Building",
    "Bank",
    "Supermarket",
    "Gas station",
    "Showroom",
    "School",
    "Club",
  ],
} as const;

type PropertyCategory = keyof typeof PROPERTY_TYPES_BY_CATEGORY;
const PROPERTY_CATEGORIES: PropertyCategory[] = ["Residential", "Commercial"];

const normalizeCategory = (value?: string | null): PropertyCategory =>
  value === "Commercial" ? "Commercial" : "Residential";

const inferCategoryFromType = (label?: string | null): PropertyCategory => {
  if (!label) return "Residential";
  return PROPERTY_TYPES_BY_CATEGORY.Commercial.includes(label as (typeof PROPERTY_TYPES_BY_CATEGORY.Commercial)[number])
    ? "Commercial"
    : "Residential";
};

const normalizeTypeForCategory = (category: PropertyCategory, value?: string | null) => {
  const allowed = PROPERTY_TYPES_BY_CATEGORY[category];
  if (value && allowed.some((item) => item === value)) return value;
  return allowed[0];
};

const AMENITIES = [
  { slug: "garden", label: "Garden" },
  { slug: "roof", label: "Has Roof" },
  { slug: "bicycle", label: "Bicycle Lanes" },
  { slug: "accessibility", label: "Disability Support" },
  { slug: "jogging", label: "Jogging Trail" },
  { slug: "pools", label: "Outdoor Pools" },
  { slug: "mosque", label: "Mosque" },
  { slug: "sports", label: "Sports Clubs" },
  { slug: "business", label: "Business Hub" },
  { slug: "commercial", label: "Commercial Strip" },
  { slug: "medical", label: "Medical Center" },
  { slug: "schools", label: "Schools" },
  { slug: "parking", label: "Underground Parking" },
  { slug: "clubhouse", label: "Clubhouse" },
  { slug: "terrace", label: "Terrace" },
  { slug: "sea_view", label: "Sea View" },
];

type CommissionRuleRow = {
  id: string;
  developer_id: string;
  property_id: string | null;
  commission_rate: number | null;
  platform_share: number | null;
};

type ProjectMedia = {
  images?: string[];
  heroImageUrl?: string;
  hero_image_url?: string;
  brochureUrl?: string;
  masterplanUrl?: string;
  [key: string]: unknown;
};

const parseOptionalNumber = (value?: string | null) => {
  if (!value || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseProjectTypes = (value?: string | null) =>
  Array.from(
    new Set(
      (value ?? "")
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );

const PAYMENT_FREQUENCIES = ["Quarterly", "Monthly", "Semi-annual", "Annual"];
const INVENTORY_TEMPLATE_PATH = "/templates/developer-project-import.xlsx";
const PROJECT_STATUS_OPTIONS = [
  { value: "new_release", label: "New Release" },
  { value: "upcoming", label: "Upcoming" },
  { value: "live", label: "Live" },
] as const;

type ProjectStatusKey = (typeof PROJECT_STATUS_OPTIONS)[number]["value"];

const normalizeLaunchStatus = (value?: string | null): ProjectStatusKey => {
  if (value === "new_release" || value === "new_launch") return "new_release";
  if (value === "upcoming") return "upcoming";
  return "live";
};

const getLaunchStatusLabel = (value?: string | null) =>
  PROJECT_STATUS_OPTIONS.find((option) => option.value === normalizeLaunchStatus(value))?.label ?? "Live";

type ProjectPublicationInput = {
  approval_status?: string | null;
  lifecycle_state?: string | null;
  published_at?: string | null;
  publication_status?: string | null;
};

type ProjectReadinessInput = ProjectPublicationInput & {
  name?: string | null;
  description?: string | null;
  location?: string | null;
  project_types?: string[] | null;
  hero_media?: ProjectMedia | null;
  project_unit_types?: Array<{
    label?: string | null;
    min_price?: number | null;
    unit_area_min?: number | null;
    description?: string | null;
    archived_at?: string | null;
  }> | null;
  quality_score?: number | null;
  quality_issues?: string[] | null;
};

type WorkspaceSection = "overview" | "inventory" | "commercial" | "requests" | "settings";

const getProjectPublicationStatus = (project: ProjectPublicationInput) => {
  if (project.lifecycle_state === "archived") return { label: "Archived", tone: "bg-neutral-200 text-neutral-700" };
  if (project.publication_status === "published") return { label: "Published to mobile", tone: "bg-emerald-100 text-emerald-800" };
  if (project.publication_status === "changes_requested") return { label: "Changes requested", tone: "bg-rose-100 text-rose-800" };
  if (project.publication_status === "submitted") return { label: "Submitted for review", tone: "bg-amber-100 text-amber-800" };
  if (project.publication_status === "ready") return { label: "Ready to submit", tone: "bg-blue-100 text-blue-800" };
  if (project.approval_status === "approved" && project.lifecycle_state === "published" && project.published_at) {
    return { label: "Published to mobile", tone: "bg-emerald-100 text-emerald-800" };
  }
  if (project.approval_status === "rejected") return { label: "Changes requested", tone: "bg-rose-100 text-rose-800" };
  if (project.approval_status === "approved") return { label: "Approved · awaiting publish", tone: "bg-blue-100 text-blue-800" };
  return { label: "Pending review", tone: "bg-amber-100 text-amber-800" };
};

const getProjectReadiness = (project: ProjectReadinessInput) => {
  const heroMedia = project.hero_media ?? null;
  const hasHero = Boolean(
    heroMedia?.heroImageUrl ||
      heroMedia?.hero_image_url ||
      (Array.isArray(heroMedia?.images) && heroMedia.images.length),
  );
  const unitTypes = (project.project_unit_types ?? []).filter((unit) => !unit.archived_at);
  const checks = [
    ["Project name", Boolean(project.name?.trim())],
    ["Description", Boolean(project.description?.trim())],
    ["Location", Boolean(project.location?.trim())],
    ["Project type", Boolean(project.project_types?.length)],
    ["Hero media", hasHero],
    ["Unit inventory", unitTypes.length > 0],
    ["Unit details", unitTypes.length > 0 && unitTypes.every((unit) => Boolean(unit.label?.trim()) && Number(unit.min_price) >= 100000 && Number(unit.unit_area_min) >= 10 && Boolean(unit.description?.trim()))],
  ] as const;
  const complete = checks.filter(([, value]) => value).length;
  const score = project.quality_score != null && Number.isFinite(Number(project.quality_score))
    ? Math.max(0, Math.min(100, Number(project.quality_score)))
    : Math.round((complete / checks.length) * 100);
  const missing = checks.filter(([, value]) => !value).map(([label]) => label);
  return { score, missing, hasHero };
};

const normalizeProjectName = (value?: string | null) => value?.trim().toLocaleLowerCase().replace(/\s+/g, " ") ?? "";

const decodeFeedback = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeHttpMediaUrl = (value?: string | null) => {
  const raw = value?.trim() ?? "";
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
};

const parseHttpMediaUrls = (value: FormDataEntryValue | null, label: string, limit: number) => {
  const rawValues = typeof value === "string" ? value.split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean) : [];
  if (rawValues.length > limit) throw new Error(`${label} accepts no more than ${limit} URLs.`);
  return rawValues.map((entry) => {
    const normalized = normalizeHttpMediaUrl(entry);
    if (!normalized) throw new Error(`${label} must contain only valid http(s) URLs.`);
    return normalized;
  });
};

const shouldShowInventoryUnitType = (unit: {
  archived_at?: string | null;
  project_unit_variants?: Array<{ archived_at?: string | null }> | null;
}, showArchived: boolean) => showArchived
  ? Boolean(unit.archived_at || unit.project_unit_variants?.some((variant) => variant.archived_at))
  : !unit.archived_at;

const toPlanNumber = (value?: string | null) => {
  if (!value || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isExcelTemplateFile = (file: File) => file.name.trim().toLowerCase().endsWith(".xlsx");

const asStructuredPlans = (value: unknown): StructuredPaymentPlan[] =>
  Array.isArray(value)
    ? value.filter((item): item is StructuredPaymentPlan => Boolean(item) && typeof item === "object")
    : [];

const asLimitedTimeOffers = (value: unknown): LimitedTimeOffer[] =>
  Array.isArray(value)
    ? value.filter((item): item is LimitedTimeOffer => Boolean(item) && typeof item === "object")
    : [];

const formatPlanSummary = (plan: StructuredPaymentPlan) => {
  const down = plan.down_payment_percent != null ? `${plan.down_payment_percent}% upfront` : null;
  const years = plan.installment_years != null ? `rest over ${plan.installment_years} years` : null;
  const frequency = plan.payment_frequency ? `${plan.payment_frequency.toLowerCase()} payments` : null;
  const discount = plan.discount_percent ? `${plan.discount_percent}% discount` : null;
  return [plan.title, down, years, frequency, discount].filter(Boolean).join(" · ");
};

export default async function DeveloperProjectsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    project?: string | string[];
    unitType?: string | string[];
    variants?: string | string[];
    variant?: string | string[];
    create?: string | string[];
    step?: string | string[];
    template?: string | string[];
    status?: string | string[];
    error?: string | string[];
    success?: string | string[];
    draft?: string | string[];
    section?: string | string[];
    settings?: string | string[];
    inventory?: string | string[];
    phase?: string | string[];
  }>;
}) {
  const session = await requireDeveloperSession();
  const canManageProjects = hasDeveloperCapability(session.role, "manage_projects");
  const canManageInventory = hasDeveloperCapability(session.role, "manage_inventory");
  const [projects, profile, commissionRules, impersonation] = await Promise.all([
    fetchDeveloperProjects(session.developerId),
    fetchDeveloperProfile(session.developerId),
    supabaseServer
      .from("developer_commission_rules")
      .select("id, developer_id, property_id, commission_rate, platform_share")
      .eq("developer_id", session.developerId),
    currentDeveloperImpersonation(),
  ]);
  const resolvedSearchParams = (await searchParams) ?? {};
  const activeProjectId =
    typeof resolvedSearchParams?.project === "string" ? resolvedSearchParams.project : null;
  const showCreateWizard =
    typeof resolvedSearchParams?.create === "string" ? resolvedSearchParams.create === "1" : false;
  const setupStep =
    typeof resolvedSearchParams?.step === "string" ? resolvedSearchParams.step : null;
  const focusUnitTypeId =
    typeof resolvedSearchParams?.unitType === "string" ? resolvedSearchParams.unitType : null;
  const showVariantWizard =
    typeof resolvedSearchParams?.variants === "string" ? resolvedSearchParams.variants === "1" : false;
  const focusVariantId =
    typeof resolvedSearchParams?.variant === "string" ? resolvedSearchParams.variant : null;
  const requestedPhaseId =
    typeof resolvedSearchParams?.phase === "string" ? resolvedSearchParams.phase : null;
  const templateProjectId =
    typeof resolvedSearchParams?.template === "string" ? resolvedSearchParams.template : null;
  const selectedStatus =
    typeof resolvedSearchParams?.status === "string"
      ? normalizeLaunchStatus(resolvedSearchParams.status)
      : null;
  const pageError =
    typeof resolvedSearchParams?.error === "string" ? decodeFeedback(resolvedSearchParams.error) : null;
  const pageSuccess =
    typeof resolvedSearchParams?.success === "string" ? decodeFeedback(resolvedSearchParams.success) : null;
  const clearProjectDraft = resolvedSearchParams?.draft === "clear";
  const requestedSection = typeof resolvedSearchParams?.section === "string" ? resolvedSearchParams.section : null;
  const requestedWorkspaceSection: WorkspaceSection = requestedSection === "inventory" || requestedSection === "commercial" || requestedSection === "settings"
    ? requestedSection
    : "overview";
  const workspaceSection: WorkspaceSection = canManageProjects ? requestedWorkspaceSection : "inventory";
  if (!canManageInventory) redirect("/developer?error=Inventory+access+is+not+enabled+for+this+role");
  if (showCreateWizard && !canManageProjects) redirect("/developer/projects?section=inventory&error=Only+project+managers+and+developer+super+admins+can+create+projects");
  const showProjectSettings = workspaceSection === "settings" || resolvedSearchParams?.settings === "1";
  const showArchivedProjects = resolvedSearchParams?.status === "archived";
  const showArchivedInventory = resolvedSearchParams?.inventory === "archived";
  const templateProject =
    showCreateWizard && templateProjectId
      ? projects.find((project) => project.id === templateProjectId)
      : undefined;
  const templatePlanDefaults = asStructuredPlans(templateProject?.payment_plan_templates).slice(0, 3);
  const templateOfferDefaults = asLimitedTimeOffers(templateProject?.limited_time_offers).slice(0, 1);
  const statusFilteredProjects = showArchivedProjects
    ? projects.filter((project) => project.lifecycle_state === "archived")
    : projects.filter((project) => project.lifecycle_state !== "archived")
      .filter((project) => selectedStatus ? normalizeLaunchStatus(project.launch_status) === selectedStatus : true);
  const selectedProjectId =
    activeProjectId && projects.some((project) => project.id === activeProjectId)
      ? activeProjectId
      : null;
  const selectedProject = selectedProjectId
    ? projects.find((project) => project.id === selectedProjectId)
    : undefined;
  const selectedProjectPhases = (selectedProject?.developer_project_phases ?? []) as DeveloperProjectPhase[];
  const activeProjectPhases = selectedProjectPhases
    .filter((phase) => !phase.archived_at && phase.lifecycle_state !== "archived")
    .sort((a, b) => a.phase_order - b.phase_order);
  const selectedPhaseId = requestedPhaseId && activeProjectPhases.some((phase) => phase.id === requestedPhaseId)
    ? requestedPhaseId
    : activeProjectPhases[0]?.id ?? null;
  const selectedPhase = activeProjectPhases.find((phase) => phase.id === selectedPhaseId) ?? null;
  const inventoryCounts = selectedProjectPhases.reduce<Record<string, number>>((counts, phase) => {
    counts[phase.id] = (selectedProject?.project_unit_types ?? []).filter((unit) => unit.phase_id === phase.id && !unit.archived_at).length;
    return counts;
  }, {});
  const selectedProjectUnitTypes = selectedProject?.project_unit_types?.filter((unit) =>
    (!selectedPhaseId || unit.phase_id === selectedPhaseId) && shouldShowInventoryUnitType(unit, showArchivedInventory),
  ) ?? [];
  const projectCommissionRule = selectedProjectId
    ? ((commissionRules.data ?? []) as CommissionRuleRow[]).find((rule) => rule.property_id === selectedProjectId)
    : undefined;
  const visibleProjects = selectedProjectId
    ? projects.filter((project) => project.id === selectedProjectId)
    : statusFilteredProjects;
  const resolvedUnitTypeId =
    showVariantWizard && selectedProjectUnitTypes.length
      ? (focusUnitTypeId &&
          selectedProjectUnitTypes.some((unit) => unit.id === focusUnitTypeId)
          ? focusUnitTypeId
          : selectedProjectUnitTypes[0].id)
      : null;
  const modalUnitTypeId = focusUnitTypeId ?? resolvedUnitTypeId ?? null;
  const resolvedUnitType =
    modalUnitTypeId && selectedProject
      ? selectedProjectUnitTypes.find((unit) => unit.id === modalUnitTypeId)
      : undefined;
  const resolvedVariant =
    focusVariantId && resolvedUnitType
      ? resolvedUnitType.project_unit_variants?.find((variant) => variant.id === focusVariantId)
      : undefined;
  const projectGridClass = selectedProjectId ? "grid gap-4" : "grid gap-4 md:grid-cols-2";
  const duplicateProjectIds = new Set(
    projects
      .filter((project) => project.lifecycle_state !== "archived")
      .map((project) => normalizeProjectName(project.name))
      .filter((name, index, names) => name && names.indexOf(name) !== index),
  );
  const selectedReadiness = selectedProject ? getProjectReadiness(selectedProject) : null;
  const selectedPublication = selectedProject ? getProjectPublicationStatus(selectedProject) : null;
  const selectedHeroMedia = selectedProject?.hero_media as ProjectMedia | null | undefined;
  const selectedHeroImage = selectedHeroMedia?.heroImageUrl ?? selectedHeroMedia?.hero_image_url ?? (Array.isArray(selectedHeroMedia?.images) ? selectedHeroMedia.images[0] : null) ?? null;
  const [inventoryRows, impactSummary, projectFeedback, allProjectVersions, projectActivity, savedInventoryFilters, projectTemplates, priceHistory] = selectedProjectId
    ? await Promise.all([
        fetchDeveloperInventoryRows(session.developerId, selectedProjectId, selectedPhaseId),
        fetchDeveloperProjectImpactSummary(session.developerId, selectedProjectId),
        fetchDeveloperPublicationFeedback(session.developerId, selectedProjectId),
        fetchDeveloperInventoryVersions(session.developerId, { limit: 120 }),
        fetchDeveloperInventoryActivity(session.developerId, selectedProjectId, { limit: 60 }),
        fetchDeveloperInventorySavedFilters(session.developerId, session.accountId),
        fetchDeveloperProjectTemplates(session.developerId),
        fetchDeveloperPropertyPriceHistory(session.developerId, selectedProjectId, selectedPhaseId),
      ])
    : [[], null, [], [], [], [], [], []];
  const workspaceEntityIds = new Set([
    ...(selectedProjectId ? [selectedProjectId] : []),
    ...selectedProjectPhases.map((phase) => phase.id),
    ...((selectedProject?.project_unit_types ?? []).flatMap((unit) => [unit.id, ...(unit.project_unit_variants ?? []).map((variant) => variant.id)])),
    ...inventoryRows.map((row) => row.id),
  ]);
  const projectVersions = allProjectVersions.filter((version) => workspaceEntityIds.has(version.entity_id));

  return (
    <DeveloperLayout
      title={selectedProjectId && selectedProject ? selectedProject.name : "Projects"}
      description={selectedProjectId ? "Project portal · phases, inventory, and publication" : "Keep launch briefs, media, and talking points up to date for agents."}
      impersonation={impersonation}
    >
      {clearProjectDraft ? <LocalStorageCleanup storageKey={`${PROJECT_WIZARD_DRAFT_KEY}:${session.developerId}`} /> : null}
      {pageError ? (
        <div role="alert" aria-live="assertive" className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {pageError}
        </div>
      ) : null}
      {pageSuccess ? (
        <div role="status" aria-live="polite" className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {pageSuccess}
        </div>
      ) : null}

      {showCreateWizard ? (
        <section className="mx-auto w-full max-w-6xl">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4 px-1">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">New project</p>
              <h2 className="mt-1 text-xl font-semibold text-neutral-900">Create a launch</h2>
              <p className="mt-1 text-sm text-neutral-500">Start with the essentials, then add inventory after creation.</p>
            </div>
            <Link
              href="/developer/projects"
              className="rounded-full border border-black/10 px-3 py-1 text-xs text-neutral-600 hover:border-black/30 hover:text-black"
            >
              Cancel
            </Link>
          </div>
          <div>
            <ProjectWizard
              action={upsertProjectAction}
              developerId={session.developerId}
              existingProjectNames={projects.filter((project) => project.lifecycle_state !== "archived").map((project) => project.name)}
            >
              <div data-wizard-panel="basics" className="space-y-4">
              {projects.length ? (
                <details className="rounded-2xl border border-black/10 bg-neutral-50 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-neutral-700">Copy settings from an existing project</summary>
                  <p className="mt-2 text-xs text-neutral-500">Copies commercial settings and amenities. You can edit everything before saving.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {projects.slice(0, 6).map((project) => (
                      <a
                        key={project.id}
                        href={`/developer/projects?create=1&template=${project.id}`}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                          templateProject?.id === project.id
                            ? "border-black bg-black text-white"
                            : "border-black/10 text-neutral-600 hover:border-black/30 hover:text-black"
                        }`}
                      >
                        {project.name}
                      </a>
                    ))}
                  </div>
                </details>
              ) : null}
              <Field label="Project name" name="name" placeholder="Marina Vista Residences" required defaultValue={templateProject?.name ? `${templateProject.name} Copy` : ""} />
              <Field
                as="textarea"
                label="Description"
                name="description"
                placeholder="Key highlights, payment terms, delivery date..."
                defaultValue={templateProject?.description ?? ""}
              />
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Field label="Acres" name="acres" type="number" min="0" step="0.01" placeholder="120" defaultValue={templateProject?.acres ?? ""} />
                <Field label="Footprint (%)" name="footprint" type="number" min="0" step="0.01" placeholder="18" defaultValue={templateProject?.footprint ?? ""} />
                <Field label="Maintenance" name="maintenance" type="number" min="0" step="0.01" placeholder="8" defaultValue={templateProject?.maintenance ?? ""} />
                <Field label="CH fees" name="chFees" type="number" min="0" step="0.01" placeholder="250000" defaultValue={templateProject?.ch_fees ?? ""} />
              </div>
              <Field label="Location" name="location" placeholder="North Coast, Ras El Hekma" defaultValue={templateProject?.location ?? ""} />
              </div>
              <div data-wizard-panel="commercial" className="space-y-4">
              <div className="rounded-2xl border border-black/10 bg-neutral-50 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Original payment plans</p>
                <p className="mt-1 text-xs text-neutral-500">
                  Reusable plans for this project. Start prices on property types should reflect the original plan.
                </p>
                <div className="mt-4 space-y-3">
                  {[0, 1, 2].map((index) => {
                    const plan = templatePlanDefaults[index];
                    return (
                      <details key={`plan-${index}`} open={index === 0} className="rounded-2xl border border-black/10 bg-white p-3">
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Plan {index + 1}{index > 0 ? " · optional" : ""}</summary>
                        <div className="mt-3 grid gap-3 md:grid-cols-4">
                          <Field label="Title" name={`paymentPlanTitle_${index}`} placeholder="Original plan" defaultValue={plan?.title ?? ""} />
                          <Field label="Down payment %" name={`paymentPlanDown_${index}`} type="number" min="0" max="100" step="0.01" placeholder="10" defaultValue={plan?.down_payment_percent ?? ""} />
                          <Field label="Installment years" name={`paymentPlanYears_${index}`} type="number" min="1" step="1" placeholder="8" defaultValue={plan?.installment_years ?? ""} />
                          <Field label="Discount %" name={`paymentPlanDiscount_${index}`} type="number" min="0" max="100" step="0.01" placeholder="0" defaultValue={plan?.discount_percent ?? ""} />
                        </div>
                        <label className="mt-3 flex flex-col gap-1 text-sm">
                          <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Payment frequency</span>
                          <select
                            className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
                            name={`paymentPlanFrequency_${index}`}
                            defaultValue={plan?.payment_frequency ?? "Quarterly"}
                          >
                            {PAYMENT_FREQUENCIES.map((frequency) => (
                              <option key={frequency} value={frequency}>
                                {frequency}
                              </option>
                            ))}
                          </select>
                        </label>
                      </details>
                    );
                  })}
                </div>
              </div>
              <details className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Add a limited-time offer · optional</summary>
                <p className="mt-1 text-xs text-amber-700/80">
                  Example: Ramadan offer or developer anniversary pricing that temporarily replaces the original plan.
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-5">
                  <Field label="Offer title" name="offerTitle_0" placeholder="Ramadan offer" defaultValue={templateOfferDefaults[0]?.offer_title ?? ""} />
                  <Field label="Down payment %" name="offerDown_0" type="number" min="0" max="100" step="0.01" placeholder="5" defaultValue={templateOfferDefaults[0]?.down_payment_percent ?? ""} />
                  <Field label="Installment years" name="offerYears_0" type="number" min="1" step="1" placeholder="10" defaultValue={templateOfferDefaults[0]?.installment_years ?? ""} />
                  <Field label="Discount %" name="offerDiscount_0" type="number" min="0" max="100" step="0.01" placeholder="15" defaultValue={templateOfferDefaults[0]?.discount_percent ?? ""} />
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Payment frequency</span>
                    <select
                      className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
                      name="offerFrequency_0"
                      defaultValue={templateOfferDefaults[0]?.payment_frequency ?? "Quarterly"}
                    >
                      {PAYMENT_FREQUENCIES.map((frequency) => (
                        <option key={frequency} value={frequency}>
                          {frequency}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </details>
              </div>
              <div data-wizard-panel="launch" className="space-y-4">
              <Field
                as="textarea"
                label="Types"
                name="projectTypes"
                rows={2}
                placeholder="Apartment, Duplex, Townhouse"
                defaultValue={templateProject?.project_types?.join(", ") ?? ""}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Launch status</span>
                  <select
                    className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
                    name="launchStatus"
                    defaultValue={normalizeLaunchStatus(templateProject?.launch_status)}
                  >
                    {PROJECT_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Field label="Launch date" name="launchDate" type="date" defaultValue={templateProject?.launch_date?.slice?.(0, 10) ?? ""} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="EOI value (Apt)"
                  name="eoiValueApt"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="100000"
                  defaultValue={templateProject?.eoi_value_apt ?? ""}
                />
                <Field
                  label="EOI value (Villa)"
                  name="eoiValueVilla"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="250000"
                  defaultValue={templateProject?.eoi_value_villa ?? ""}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Commission rate (%)"
                  name="commissionRate"
                  placeholder="2.50"
                />
                <Field
                  label="Platform share (%)"
                  name="platformShare"
                  placeholder="0.25"
                />
              </div>
              </div>
              <div data-wizard-panel="media" className="grid gap-4 md:grid-cols-2">
              <DeveloperMediaField label="Project logo" description="Used in this project's portal header." fileName="project_logo" urlName="project_logo_url" accept="image/*" />
              <DeveloperMediaField label="Project images" description="Upload, drop, or paste image URLs to build the project gallery." fileName="project_images" urlName="project_image_urls" accept="image/*" multiple />
              <DeveloperMediaField label="Project brochure (PDF)" fileName="project_brochure" urlName="project_brochure_url" accept="application/pdf" />
              <DeveloperMediaField label="Masterplan" fileName="project_masterplan" urlName="project_masterplan_url" accept="application/pdf,image/*" />
              <DeveloperMediaField label="Voice notes" fileName="voice_notes" urlName="voice_note_urls" accept="audio/*" multiple />
              <DeveloperMediaField label="Project videos" fileName="project_videos" urlName="project_video_urls" accept="video/*" multiple />
              <DeveloperMediaField label="Inventory template" description="Upload the filled Brixeler .xlsx template or paste a hosted file URL." fileName="project_inventory" urlName="project_inventory_url" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
              </div>
              <div data-wizard-panel="amenities" className="space-y-4">
              <div className="rounded-2xl border border-black/10 bg-neutral-50 p-3">
                <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Add amenities</p>
                <p className="mt-1 text-xs text-neutral-500">
                  Select all amenities that are shared across this project.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {AMENITIES.map((amenity) => (
                    <label key={amenity.slug} className="cursor-pointer">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        name="projectAmenities"
                        value={amenity.slug}
                        defaultChecked={templateProject?.amenities?.includes(amenity.slug) ?? false}
                      />
                      <span className="rounded-full border border-black/10 px-3 py-1 text-xs text-neutral-600 transition peer-checked:border-black peer-checked:bg-black peer-checked:text-white hover:border-black/30">
                        {amenity.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <p className="font-semibold">Final review before submission</p>
                <p className="mt-1 text-xs text-emerald-800">Your project will be saved as a draft and sent for review. Launch status is only a marketing label; publication to mobile happens after approval.</p>
                <ul className="mt-3 grid gap-1 text-xs text-emerald-800 sm:grid-cols-2">
                  <li>✓ Project copy and location</li>
                  <li>✓ Commercial terms and payment plans</li>
                  <li>✓ Launch timing and project types</li>
                  <li>✓ Media and shared amenities</li>
                </ul>
              </div>
              </div>
            </ProjectWizard>
          </div>
        </section>
      ) : null}

      {setupStep === "types" && selectedProjectId ? (
        <section className="rounded-3xl border border-black/5 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Next step</p>
              <p className="text-base font-semibold text-neutral-900">Add property types</p>
              <p className="text-sm text-neutral-600">
                Choose how you want to populate property types and variants for this project.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-black/10 bg-neutral-50 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Fill on website</p>
              <p className="mt-2 text-sm text-neutral-600">
                Add property types directly in the dashboard. Variants stay optional for advanced inventory.
              </p>
              <a
                href={`/developer/projects?project=${selectedProjectId}`}
                className="mt-4 inline-flex rounded-full border border-black/10 px-4 py-2 text-xs font-semibold text-neutral-700 hover:border-black/30 hover:text-black"
              >
                Open property type cards
              </a>
            </div>
            <div className="rounded-3xl border border-black/10 bg-neutral-50 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Import from Excel</p>
              <p className="mt-2 text-sm text-neutral-600">
                Download the template, fill it, then upload to auto-create types and variants.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <a
                  href={INVENTORY_TEMPLATE_PATH}
                  download
                  className="rounded-full border border-black/10 px-4 py-2 text-xs font-semibold text-neutral-600 hover:border-black/30 hover:text-black"
                >
                  Download template
                </a>
                <ProjectImportPanel projectId={selectedProjectId} phaseId={selectedPhaseId} onImportAction={importTypeWithVariantsAction} />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {!showCreateWizard && setupStep !== "types" && selectedProjectId ? (
        <section className="space-y-4">
          <header id="project-overview" className="scroll-mt-24 rounded-3xl border border-black/5 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">Project workspace</p>
                  {selectedPublication ? <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${selectedPublication.tone}`}>{selectedPublication.label}</span> : null}
                  {selectedProject?.is_demo ? <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-800">Demo</span> : null}
                </div>
                <h2 className="mt-1 truncate text-xl font-semibold tracking-tight text-[#050505]">
                  {selectedProject?.name ?? "Project analytics"}
                </h2>
                <p className="mt-1 line-clamp-2 max-w-3xl text-sm text-neutral-500">
                  {selectedProject?.description ?? "Live telemetry for the selected project."}
                </p>
                {selectedProject?.rejection_reason ? <p className="mt-2 text-xs text-rose-700">Reviewer note: {selectedProject.rejection_reason}</p> : null}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1.5 font-semibold text-neutral-700">Launch status: {getLaunchStatusLabel(selectedProject?.launch_status)}</span>
                  {selectedProject?.launch_date ? <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1.5 text-neutral-600">Launch date: {selectedProject.launch_date.slice(0, 10)}</span> : null}
                  {selectedReadiness ? <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1.5 font-semibold text-neutral-700">Mobile readiness: {selectedReadiness.score}%</span> : null}
                </div>
              </div>
              <div className="flex max-w-full flex-wrap items-center justify-end gap-2 sm:gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-black/10 bg-neutral-50">
                  {selectedProject?.project_logo_url ?? profile?.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedProject?.project_logo_url ?? profile!.logo_url!}
                      alt={`${selectedProject?.name ?? profile?.name ?? "Developer"} logo`}
                      className="h-10 w-10 object-contain"
                    />
                  ) : (
                    <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Logo</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <MobilePreviewButton
                    formId={`project-preview-${selectedProjectId}`}
                    titleField="name"
                    bodyField="description"
                    typeField="launchStatus"
                    label="Preview mobile"
                    initialDraft={{
                      title: selectedProject?.name ?? "Project preview",
                      body: selectedProject?.description ?? "Add a project description to preview the mobile card.",
                      type: getLaunchStatusLabel(selectedProject?.launch_status),
                    }}
                    imageUrl={selectedHeroImage}
                  />
                  {canManageProjects && selectedProject?.lifecycle_state === "archived" ? (
                    <form action={restoreProjectAction}>
                      <input type="hidden" name="projectId" value={selectedProjectId} />
                      <ConfirmSubmitButton className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 disabled:opacity-50" confirmMessage="Restore this project to your active workspace? It will return to draft review before becoming visible again." pendingLabel="Restoring…">
                        Restore project
                      </ConfirmSubmitButton>
                    </form>
                  ) : canManageProjects ? (
                    <form action={archiveProjectAction}>
                      <input type="hidden" name="projectId" value={selectedProjectId} />
                      <ConfirmSubmitButton className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50" confirmMessage="Archive this project? Its inventory and leads will be retained and it will be hidden from active workspaces." pendingLabel="Archiving…">
                        Archive project
                      </ConfirmSubmitButton>
                    </form>
                  ) : null}
                  <a href={INVENTORY_TEMPLATE_PATH} download className="hidden rounded-full border border-black/10 px-3 py-2 text-xs font-semibold text-neutral-600 hover:border-black/30 hover:text-black sm:inline-flex">Download template</a>
                  <ProjectImportPanel projectId={selectedProjectId} phaseId={selectedPhaseId} onImportAction={importTypeWithVariantsAction} />
                </div>
              </div>
            </div>
            <nav aria-label="Project sections" className="mt-4 grid grid-cols-2 gap-1 border-t border-black/5 pt-3 text-xs font-semibold sm:flex sm:overflow-x-auto">
              {canManageProjects ? <a className={`rounded-full px-3 py-2 text-center sm:shrink-0 ${workspaceSection === "overview" ? "bg-black text-white" : "text-neutral-600 hover:bg-black/5 hover:text-black"}`} href={`/developer/projects?project=${selectedProjectId}&section=overview#project-overview`}>Overview</a> : null}
              <a className={`rounded-full px-3 py-2 text-center sm:shrink-0 ${workspaceSection === "inventory" ? "bg-black text-white" : "text-neutral-600 hover:bg-black/5 hover:text-black"}`} href={`/developer/projects?project=${selectedProjectId}&section=inventory#project-inventory`}>Inventory</a>
              {canManageProjects ? <a className={`rounded-full px-3 py-2 text-center sm:shrink-0 ${workspaceSection === "commercial" ? "bg-black text-white" : "text-neutral-600 hover:bg-black/5 hover:text-black"}`} href={`/developer/projects?project=${selectedProjectId}&section=commercial#project-commercial`}>Commercial</a> : null}
              {canManageProjects ? <a className={`rounded-full px-3 py-2 text-center sm:shrink-0 ${workspaceSection === "settings" ? "bg-black text-white" : "text-neutral-600 hover:bg-black/5 hover:text-black"}`} href={`/developer/projects?project=${selectedProjectId}&section=settings&settings=1#project-settings`}>Settings</a> : null}
            </nav>
          </header>

          <DeveloperProjectPhaseBoard
            projectId={selectedProjectId}
            phases={selectedProjectPhases}
            selectedPhaseId={selectedPhaseId}
            inventoryCounts={inventoryCounts}
            createAction={createProjectPhaseAction}
            updateAction={updateProjectPhaseAction}
            archiveAction={archiveProjectPhaseAction}
            restoreAction={restoreProjectPhaseAction}
            hrefForPhase={(phaseId) => `/developer/projects/${selectedProjectId}?section=inventory${phaseId ? `&phase=${phaseId}` : ""}#project-phases`}
            canManagePhases={canManageProjects}
          />

          {selectedReadiness ? (
            <DeveloperPublicationWorkflow
              projectId={selectedProjectId}
              status={selectedProject?.publication_status ?? (selectedProject?.approval_status === "rejected" ? "changes_requested" : selectedProject?.approval_status === "approved" ? "approved" : "draft")}
              readiness={selectedReadiness}
              markReadyAction={markProjectReadyAction}
              submitAction={submitProjectForReviewAction}
            />
          ) : null}

          {workspaceSection === "inventory" ? (
            <>
              <DeveloperInventoryGrid
                projectId={selectedProjectId}
                phaseId={selectedPhaseId}
                rows={inventoryRows}
                savedFilters={savedInventoryFilters}
                bulkUpdateAction={bulkInventoryAction}
                importAction={importInventoryRowsAction}
                holdAction={holdInventoryAction}
                releaseHoldAction={releaseInventoryHoldAction}
                saveFilterAction={saveInventoryFilterAction}
              />
              <DeveloperPriceHistoryPanel history={priceHistory} />
            </>
          ) : null}

          {workspaceSection === "overview" || workspaceSection === "settings" ? (
            <>
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Project impact summary">
                {[
                  ["Phases", impactSummary?.phase_count ?? 0],
                  ["Unit types", impactSummary?.unit_type_count ?? 0],
                  ["Inventory rows", impactSummary?.property_count ?? 0],
                  ["Active holds", impactSummary?.active_hold_count ?? 0],
                ].map(([label, value]) => <div key={label} className="rounded-2xl border border-black/5 bg-white p-4"><p className="text-xs uppercase tracking-[0.2em] text-neutral-500">{label}</p><p className="mt-2 text-2xl font-semibold text-neutral-950">{value}</p></div>)}
              </section>
              <div className="grid gap-4 lg:grid-cols-2">
                <DeveloperPublicationFeedbackPanel projectId={selectedProjectId} feedback={projectFeedback} resolveAction={resolveFeedbackAction} />
                <DeveloperActivityTimeline activities={projectActivity} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <DeveloperVersionHistory projectId={selectedProjectId} versions={projectVersions} restoreAction={restoreInventoryVersionAction} />
                <DeveloperTemplateManager
                  projectId={selectedProjectId}
                  projectName={selectedProject!.name}
                  projectPayload={{
                    name: selectedProject!.name,
                    description: selectedProject!.description,
                    location: selectedProject!.location,
                    hero_media: selectedProject!.hero_media,
                    voice_notes: selectedProject!.voice_notes,
                    video_links: selectedProject!.video_links,
                    amenities: selectedProject!.amenities,
                    payment_plans: selectedProject!.payment_plans,
                    payment_plan_templates: selectedProject!.payment_plan_templates,
                    limited_time_offers: selectedProject!.limited_time_offers,
                    launch_status: selectedProject!.launch_status,
                    launch_date: selectedProject!.launch_date,
                    project_types: selectedProject!.project_types,
                    phases: selectedProjectPhases.map((phase) => ({ ...phase, unit_types: (selectedProject!.project_unit_types ?? []).filter((unit) => unit.phase_id === phase.id) })),
                  }}
                  templates={projectTemplates}
                  saveAction={saveProjectTemplateAction}
                  cloneAction={cloneProjectTemplateAction}
                />
              </div>
            </>
          ) : null}

          {selectedReadiness ? (
            <section className="grid gap-4 rounded-3xl border border-black/5 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:p-5" aria-label="Project publication readiness">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Mobile readiness</p>
                  <span className="dashboard-number text-sm font-semibold text-neutral-900">{selectedReadiness.score}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={selectedReadiness.score} aria-label="Mobile readiness score">
                  <span className={`block h-full rounded-full ${selectedReadiness.score >= 80 ? "bg-emerald-500" : selectedReadiness.score >= 50 ? "bg-amber-400" : "bg-rose-400"}`} style={{ width: `${selectedReadiness.score}%` }} />
                </div>
                <p className="mt-2 text-xs text-neutral-500">Completeness is based on the project fields and unit data currently in your workspace.</p>
              </div>
              <div className="rounded-2xl border border-black/10 bg-neutral-50 p-3 text-xs text-neutral-600">
                <p className="font-semibold text-neutral-800">{selectedPublication?.label ?? "Publication status unavailable"}</p>
                <p className="mt-1">Launch status ({getLaunchStatusLabel(selectedProject?.launch_status)}) is a marketing label. Publication is a separate reviewed mobile state.</p>
                {selectedReadiness.missing.length ? <p className="mt-2 text-amber-800">Still needed: {selectedReadiness.missing.join(", ")}</p> : <p className="mt-2 text-emerald-700">All local readiness checks are complete. Submit changes for review when ready.</p>}
              </div>
            </section>
          ) : null}

          <details id="project-settings" open={showProjectSettings} hidden={!showProjectSettings} className="scroll-mt-24 rounded-2xl border border-black/5 bg-neutral-50/80 p-4">
            <summary className="cursor-pointer list-none rounded-full border border-black/10 px-4 py-2 text-xs font-semibold text-neutral-600 hover:border-black/30 hover:text-black">
              Project settings
            </summary>
              <div className="mt-4">
                <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">
                  Edit project details
                </p>
                <form id={`project-preview-${selectedProjectId}`} action={upsertProjectAction} className="mt-4 space-y-4">
                  <input type="hidden" name="projectId" value={selectedProjectId} />
                  <Field label="Project name" name="name" placeholder="Marina Vista Residences" required defaultValue={selectedProject?.name ?? ""} />
                  <Field label="Location" name="location" placeholder="North Coast, Ras El Hekma" defaultValue={selectedProject?.location ?? ""} />
                  <Field
                    as="textarea"
                    label="Description"
                    name="description"
                    placeholder="Key highlights, payment terms, delivery date..."
                    defaultValue={selectedProject?.description ?? ""}
                  />
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Field label="Acres" name="acres" type="number" min="0" step="0.01" placeholder="120" defaultValue={selectedProject?.acres ?? ""} />
                    <Field label="Footprint (%)" name="footprint" type="number" min="0" step="0.01" placeholder="18" defaultValue={selectedProject?.footprint ?? ""} />
                    <Field label="Maintenance" name="maintenance" type="number" min="0" step="0.01" placeholder="8" defaultValue={selectedProject?.maintenance ?? ""} />
                    <Field label="CH fees" name="chFees" type="number" min="0" step="0.01" placeholder="250000" defaultValue={selectedProject?.ch_fees ?? ""} />
                  </div>
                  <div className="rounded-2xl border border-black/10 bg-neutral-50 p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Original payment plans</p>
                    <div className="mt-4 space-y-3">
                      {(() => {
                        const projectPlans = asStructuredPlans(selectedProject?.payment_plan_templates).slice(0, 3);
                        return [0, 1, 2].map((index) => {
                          const plan = projectPlans[index];
                          return (
                            <div key={`edit-plan-${index}`} className="rounded-2xl border border-black/10 bg-white p-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-neutral-400">Plan {index + 1}</p>
                              <div className="mt-3 grid gap-3 md:grid-cols-4">
                                <Field label="Title" name={`paymentPlanTitle_${index}`} placeholder="Original plan" defaultValue={plan?.title ?? ""} />
                                <Field label="Down payment %" name={`paymentPlanDown_${index}`} type="number" min="0" max="100" step="0.01" defaultValue={plan?.down_payment_percent ?? ""} />
                                <Field label="Installment years" name={`paymentPlanYears_${index}`} type="number" min="1" step="1" defaultValue={plan?.installment_years ?? ""} />
                                <Field label="Discount %" name={`paymentPlanDiscount_${index}`} type="number" min="0" max="100" step="0.01" defaultValue={plan?.discount_percent ?? ""} />
                              </div>
                              <label className="mt-3 flex flex-col gap-1 text-sm">
                                <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Payment frequency</span>
                                <select
                                  className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
                                  name={`paymentPlanFrequency_${index}`}
                                  defaultValue={plan?.payment_frequency ?? "Quarterly"}
                                >
                                  {PAYMENT_FREQUENCIES.map((frequency) => (
                                    <option key={frequency} value={frequency}>
                                      {frequency}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-amber-700">Limited-time offer</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-5">
                      {(() => {
                        const offer = asLimitedTimeOffers(selectedProject?.limited_time_offers)[0];
                        return (
                          <>
                            <Field label="Offer title" name="offerTitle_0" placeholder="Sodic 30th birthday" defaultValue={offer?.offer_title ?? ""} />
                            <Field label="Down payment %" name="offerDown_0" type="number" min="0" max="100" step="0.01" defaultValue={offer?.down_payment_percent ?? ""} />
                            <Field label="Installment years" name="offerYears_0" type="number" min="1" step="1" defaultValue={offer?.installment_years ?? ""} />
                            <Field label="Discount %" name="offerDiscount_0" type="number" min="0" max="100" step="0.01" defaultValue={offer?.discount_percent ?? ""} />
                            <label className="flex flex-col gap-1 text-sm">
                              <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Payment frequency</span>
                              <select
                                className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
                                name="offerFrequency_0"
                                defaultValue={offer?.payment_frequency ?? "Quarterly"}
                              >
                                {PAYMENT_FREQUENCIES.map((frequency) => (
                                  <option key={frequency} value={frequency}>
                                    {frequency}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  <Field
                    as="textarea"
                    label="Types"
                    name="projectTypes"
                    rows={2}
                    placeholder="Apartment, Duplex, Townhouse"
                    defaultValue={selectedProject?.project_types?.join(", ") ?? ""}
                  />
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Launch status</span>
                      <select
                        className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
                        name="launchStatus"
                        defaultValue={normalizeLaunchStatus(selectedProject?.launch_status)}
                      >
                        {PROJECT_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Field label="Launch date" name="launchDate" type="date" defaultValue={selectedProject?.launch_date?.slice?.(0, 10) ?? ""} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field
                      label="EOI value (Apt)"
                      name="eoiValueApt"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="100000"
                      defaultValue={selectedProject?.eoi_value_apt ?? ""}
                    />
                    <Field
                      label="EOI value (Villa)"
                      name="eoiValueVilla"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="250000"
                      defaultValue={selectedProject?.eoi_value_villa ?? ""}
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field
                      label="Commission rate (%)"
                      name="commissionRate"
                      placeholder="2.50"
                      defaultValue={
                        projectCommissionRule?.commission_rate != null
                          ? String(projectCommissionRule.commission_rate)
                          : ""
                      }
                    />
                    <Field
                      label="Platform share (%)"
                      name="platformShare"
                      placeholder="0.25"
                      defaultValue={
                        projectCommissionRule?.platform_share != null
                          ? String(projectCommissionRule.platform_share)
                          : ""
                      }
                    />
                  </div>
                  <DeveloperMediaField
                    label="Project logo"
                    description="Shown beside the project name in this portal."
                    fileName="project_logo"
                    urlName="project_logo_url"
                    accept="image/*"
                    currentValue={selectedProject?.project_logo_url ?? null}
                  />
                  <DeveloperMediaField
                    label="Project images"
                    description="Upload, drop, or paste image URLs to refresh the project gallery."
                    fileName="project_images"
                    urlName="project_image_urls"
                    accept="image/*"
                    multiple
                    currentValue={phaseHeroImageFromMedia((selectedProject?.hero_media as ProjectMedia | null) ?? null)}
                  />
                  <DeveloperMediaField label="Project brochure (PDF)" fileName="project_brochure" urlName="project_brochure_url" accept="application/pdf" currentValue={(selectedProject?.hero_media as ProjectMedia | null)?.brochureUrl ?? null} />
                  <DeveloperMediaField label="Masterplan" fileName="project_masterplan" urlName="project_masterplan_url" accept="application/pdf,image/*" />
                  <DeveloperMediaField label="Voice notes" fileName="voice_notes" urlName="voice_note_urls" accept="audio/*" multiple currentValue={selectedProject?.voice_notes?.length ? `${selectedProject.voice_notes.length} existing notes` : null} />
                  <DeveloperMediaField label="Project videos" fileName="project_videos" urlName="project_video_urls" accept="video/*" multiple currentValue={selectedProject?.video_links?.length ? `${selectedProject.video_links.length} existing videos` : null} />
                  <DeveloperMediaField label="Inventory template" description={selectedProject?.inventory_url ? "Replace with a new .xlsx upload or hosted URL. Current template is retained when both stay blank." : "Upload the filled Brixeler .xlsx template or paste a hosted file URL."} fileName="project_inventory" urlName="project_inventory_url" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" currentValue={selectedProject?.inventory_url ? "Current template available" : null} />
                  <div className="rounded-2xl border border-black/10 bg-neutral-50 p-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Add amenities</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      Select all amenities that are shared across this project.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {AMENITIES.map((amenity) => {
                        const isSelected = selectedProject?.amenities?.includes(amenity.slug) ?? false;
                        return (
                          <label key={amenity.slug} className="cursor-pointer">
                            <input
                              type="checkbox"
                              className="peer sr-only"
                              name="projectAmenities"
                              value={amenity.slug}
                              defaultChecked={isSelected}
                            />
                            <span className="rounded-full border border-black/10 px-3 py-1 text-xs text-neutral-600 transition peer-checked:border-black peer-checked:bg-black peer-checked:text-white hover:border-black/30">
                              {amenity.label}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <button className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white" type="submit">
                    Save project
                  </button>
                </form>
              </div>
            </details>
        </section>
      ) : null}

      {showVariantWizard && modalUnitTypeId && selectedProjectId && !showCreateWizard && setupStep !== "types" ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4">
          <a
            href={`/developer/projects?project=${selectedProjectId}`}
            aria-label="Close variant wizard"
            className="absolute inset-0"
          />
          <div className="relative z-10 max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-black/10 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Variant wizard</p>
                <p className="text-base font-semibold text-neutral-900">
                  {resolvedUnitType?.label ?? "Selected property type"}
                </p>
                <p className="text-sm text-neutral-600">
                  Add at least one variant for pricing and size. You can add more variants anytime.
                </p>
                {!resolvedUnitType ? (
                  <p className="mt-1 text-xs text-amber-600">
                    This property type wasn&apos;t loaded yet. You can still add a variant.
                  </p>
                ) : null}
              </div>
              <a
                href={`/developer/projects?project=${selectedProjectId}`}
                className="rounded-full border border-black/10 px-3 py-1 text-xs text-neutral-600 hover:border-black/30 hover:text-black"
              >
                Close
              </a>
            </div>
            <div className="mt-4">
              <VariantForm
                projectId={selectedProjectId}
                unitTypeId={modalUnitTypeId}
                unitTypeCategory={resolvedUnitType?.category}
                unitTypeLabel={resolvedUnitType?.label ?? "Unit type"}
                variant={resolvedVariant}
              />
            </div>
          </div>
        </div>
      ) : null}

      {!showCreateWizard && setupStep !== "types" ? (
        <section className="space-y-3">
        {!selectedProjectId ? <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">
              {showArchivedProjects ? "Archived projects" : selectedStatus ? `${getLaunchStatusLabel(selectedStatus)} projects` : "Projects"}
            </p>
            <p className="text-base text-neutral-700">
              {showArchivedProjects
                ? "Archived projects remain recoverable and are hidden from active workspaces."
                : selectedStatus
                ? `Projects currently marked as ${getLaunchStatusLabel(selectedStatus)}.`
                : "Visible inside the agent workspace"}
            </p>
          </div>
          <a href={showArchivedProjects ? "/developer/projects" : "/developer/projects?status=archived"} className="rounded-full border border-black/10 px-3 py-2 text-xs font-semibold text-neutral-600 hover:border-black/30 hover:text-black">
            {showArchivedProjects ? "View active projects" : "View archived projects"}
          </a>
        </header> : null}
        <div className={projectGridClass}>
          {visibleProjects.map((project) => {
            const inventoryUnitTypes = project.project_unit_types?.filter((unit) =>
              (!selectedProjectId || !selectedPhaseId || unit.phase_id === selectedPhaseId) &&
              shouldShowInventoryUnitType(unit, showArchivedInventory),
            ) ?? [];
            const publicationStatus = getProjectPublicationStatus(project);
            const readiness = getProjectReadiness(project);
            return (
            <article key={project.id} className="rounded-2xl border border-black/5 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Project record{project.is_demo ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold tracking-wider text-amber-800">Demo</span> : null}</p>
                  <h3 className="mt-2 text-lg font-semibold tracking-tight text-neutral-950">{project.name}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${publicationStatus.tone}`}>{publicationStatus.label}</span>
                    <span className="rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-600">Launch: {getLaunchStatusLabel(project.launch_status)}</span>
                    {duplicateProjectIds.has(normalizeProjectName(project.name)) ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-800">Possible duplicate</span> : null}
                  </div>
                  <a href={`/developer/projects/${project.id}?section=overview#project-overview`} className="mt-3 inline-flex rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800">Open workspace</a>
                </div>
                <form action={project.lifecycle_state === "archived" ? restoreProjectAction : archiveProjectAction}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <ConfirmSubmitButton className={`text-xs hover:underline disabled:opacity-50 ${project.lifecycle_state === "archived" ? "text-emerald-700" : "text-amber-700"}`} confirmMessage={project.lifecycle_state === "archived" ? "Restore this project to your active workspace? It will return to draft review." : "Archive this project? Its inventory and leads will be retained and hidden from active workspaces."} pendingLabel={project.lifecycle_state === "archived" ? "Restoring…" : "Archiving…"}>
                    {project.lifecycle_state === "archived" ? "Restore" : "Archive"}
                  </ConfirmSubmitButton>
                </form>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between gap-2 text-xs text-neutral-500"><span>Mobile readiness</span><span className="dashboard-number font-semibold text-neutral-800">{readiness.score}%</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100"><span className={`block h-full rounded-full ${readiness.score >= 80 ? "bg-emerald-500" : readiness.score >= 50 ? "bg-amber-400" : "bg-rose-400"}`} style={{ width: `${readiness.score}%` }} /></div>
              </div>
              <div>
              {(() => {
                const heroMedia = (project.hero_media as ProjectMedia | null) ?? null;
                const imageCount = Array.isArray(heroMedia?.images) ? heroMedia?.images.length : 0;
                const hasBrochure = Boolean(heroMedia?.brochureUrl);
                const hasMasterplan = Boolean(heroMedia?.masterplanUrl);
                return (
                  (imageCount || hasBrochure || hasMasterplan || project.inventory_url || project.voice_notes?.length || project.video_links?.length) ? (
                    <div className="mt-3 space-y-2 text-xs text-neutral-500">
                      {imageCount ? <p>Images: {imageCount}</p> : null}
                      {hasBrochure ? <p>Brochure: uploaded</p> : null}
                      {hasMasterplan ? <p>Masterplan: uploaded</p> : null}
                      {project.inventory_url ? <p>Inventory: uploaded</p> : null}
                      {project.voice_notes?.length ? <p>Voice notes: {project.voice_notes.length}</p> : null}
                      {project.video_links?.length ? <p>Videos: {project.video_links.length}</p> : null}
                    </div>
                  ) : null
                );
              })()}
              <div className="mt-3 grid gap-2 text-xs text-neutral-500 sm:grid-cols-2">
                {project.location ? <p>Location: {project.location}</p> : null}
                {project.acres != null ? <p>Acres: {project.acres}</p> : null}
                {project.footprint != null ? <p>Footprint: {project.footprint}%</p> : null}
                {project.maintenance != null ? <p>Maintenance: {project.maintenance}</p> : null}
                {project.ch_fees != null ? <p>CH fees: {project.ch_fees}</p> : null}
                {project.project_types?.length ? <p>Types: {project.project_types.join(", ")}</p> : null}
                <p>Launch status: {getLaunchStatusLabel(project.launch_status)}</p>
                {project.launch_date ? <p>Launch date: {project.launch_date}</p> : null}
                {project.eoi_value_apt != null ? <p>EOI (Apt): EGP {Number(project.eoi_value_apt).toLocaleString()}</p> : null}
                {project.eoi_value_villa != null ? <p>EOI (Villa): EGP {Number(project.eoi_value_villa).toLocaleString()}</p> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {PROJECT_STATUS_OPTIONS.filter((option) => option.value !== normalizeLaunchStatus(project.launch_status)).map((option) => (
                  <form key={`${project.id}-${option.value}`} action={moveProjectStatusAction}>
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="status" value={option.value} />
                    <button
                      className="rounded-full border border-black/10 px-3 py-1 text-xs text-neutral-600 hover:border-black/30 hover:text-black"
                      type="submit"
                    >
                      Move to {option.label}
                    </button>
                  </form>
                ))}
              </div>
              </div>
              {selectedProjectId ? <>
              <details id={selectedProjectId === project.id ? "project-commercial" : undefined} hidden={selectedProjectId === project.id && workspaceSection !== "overview" && workspaceSection !== "commercial"} className="scroll-mt-24 mt-3 rounded-2xl border border-black/10 bg-neutral-50 p-3" open={workspaceSection === "overview" || workspaceSection === "commercial"}>
                <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">Commercial</summary>
                {asStructuredPlans(project.payment_plan_templates).length ? (
                  <>
                  <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Payment plans</p>
                  <div className="mt-2 space-y-1 text-xs text-neutral-600">
                    {asStructuredPlans(project.payment_plan_templates).slice(0, 3).map((plan, index) => (
                      <p key={`${project.id}-plan-${index}`}>{formatPlanSummary(plan)}</p>
                    ))}
                    {asLimitedTimeOffers(project.limited_time_offers).map((offer, index) => (
                      <p key={`${project.id}-offer-${index}`} className="font-semibold text-amber-700">
                        Limited offer: {formatPlanSummary(offer)}
                      </p>
                    ))}
                  </div>
                  </>
                ) : (
                  <p className="mt-2 text-xs text-neutral-500">No payment plans added yet. Open Settings to add the commercial terms agents should use.</p>
                )}
              </details>
              <div hidden={selectedProjectId === project.id && workspaceSection !== "overview" && workspaceSection !== "inventory"}>
              <DeveloperProjectRequestTabs
                showRequests={false}
                requestCount={0}
                sectionIdSuffix={selectedProjectId ? undefined : project.id}
                initialTab="overview"
                overviewContent={
                  <div className="rounded-2xl border border-dashed border-black/10 bg-neutral-50/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Unit inventory</p>
                        <p className="mt-1 text-sm font-semibold text-neutral-900">{selectedPhase ? `${selectedPhase.phase_order}. ${selectedPhase.name}` : "Choose a release phase"}</p>
                        <p className="mt-1 text-xs text-neutral-500">Every unit type saved here is assigned to this release phase.</p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {!showArchivedInventory ? <a href="#add-property-types" className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold text-neutral-600 hover:border-black/30 hover:text-black">Add unit type</a> : null}
                        <a href={`/developer/projects?project=${project.id}&section=inventory&inventory=${showArchivedInventory ? "active" : "archived"}#project-inventory`} className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold text-neutral-600 hover:border-black/30 hover:text-black">
                          {showArchivedInventory ? "View active inventory" : "View archived inventory"}
                        </a>
                      </div>
                    </div>
                    {inventoryUnitTypes.length ? (
                      <div className="mt-3 space-y-3">
                        {inventoryUnitTypes.map((unit) => (
                          <div key={unit.id} className="rounded-2xl border border-black/5 bg-white p-3 text-sm text-neutral-700">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-[#050505]">{unit.label}</p>
                                {unit.finishing_status ? (
                                  <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">
                                    {unit.finishing_status.replace(/_/g, " ")}
                                  </p>
                                ) : null}
                                <div className="mt-2 flex flex-wrap gap-2 text-xs text-neutral-500">
                                  <span>
                                    Price: EGP {Number(unit.min_price ?? 0).toLocaleString()}
                                    {unit.max_price != null ? ` - ${Number(unit.max_price).toLocaleString()}` : ""}
                                  </span>
                                  {unit.category ? <span>{unit.category}</span> : null}
                                  {unit.unit_area_min != null ? (
                                    <span>
                                      BUA: {unit.unit_area_min}
                                      {unit.unit_area_max && unit.unit_area_max !== unit.unit_area_min ? `-${unit.unit_area_max}` : ""}
                                      m²
                                    </span>
                                  ) : null}
                                  {unit.land_area_min != null ? (
                                    <span>
                                      Land: {unit.land_area_min}
                                      {unit.land_area_max && unit.land_area_max !== unit.land_area_min ? `-${unit.land_area_max}` : ""}
                                      m²
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              {(!showArchivedInventory || unit.archived_at) ? (
                                <form action={unit.archived_at ? restoreUnitTypeAction : archiveUnitTypeAction}>
                                  <input type="hidden" name="projectId" value={project.id} />
                                  <input type="hidden" name="unitTypeId" value={unit.id} />
                                  <ConfirmSubmitButton className={`text-xs hover:underline disabled:opacity-50 ${unit.archived_at ? "text-emerald-700" : "text-amber-700"}`} confirmMessage={unit.archived_at ? "Restore this unit type and its retained variants? It will remain subject to project review." : "Archive this unit type? Its variants will be retained and hidden until you restore it."} pendingLabel={unit.archived_at ? "Restoring…" : "Archiving…"}>
                                    {unit.archived_at ? "Restore" : "Archive"}
                                  </ConfirmSubmitButton>
                                </form>
                              ) : <span className="rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Active type</span>}
                            </div>
                            {unit.project_unit_variants?.filter((variant) => showArchivedInventory ? variant.archived_at : !variant.archived_at).length ? (
                              <div className="mt-3">
                                <div className="flex flex-wrap gap-2">
                                  {unit.project_unit_variants.filter((variant) => showArchivedInventory ? variant.archived_at : !variant.archived_at).map((variant) => (
                                    <a
                                      key={variant.id}
                                      href={`/developer/projects?project=${project.id}&unitType=${unit.id}&variants=1&variant=${variant.id}`}
                                      className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-neutral-700 hover:border-black/30"
                                    >
                                      {formatVariantChip(variant)}
                                    </a>
                                  ))}
                                  {!showArchivedInventory ? <a href={`/developer/projects?project=${project.id}&unitType=${unit.id}&variants=1`} className="rounded-full border border-dashed border-black/20 px-3 py-1 text-xs text-neutral-500 hover:border-black/40 hover:text-neutral-700">+ Add variant</a> : null}
                                </div>
                                <p className="mt-2 text-xs text-neutral-500">
                                  Variants let you add different areas, prices, and payment plans for the same type.
                                </p>
                              </div>
                            ) : (
                              <div className="mt-2 rounded-xl border border-dashed border-black/10 bg-neutral-50 p-3">
                                <p className="text-xs text-neutral-500">
                                  No variants yet. That is fine. Add one only if you need advanced bedroom, payment-plan, or stock variations.
                                </p>
                                  {!showArchivedInventory ? <a href={`/developer/projects?project=${project.id}&unitType=${unit.id}&variants=1`} className="mt-3 inline-flex rounded-full border border-black/10 px-3 py-1 text-xs font-semibold text-neutral-600 hover:border-black/30 hover:text-black">Add first variant</a> : null}
                              </div>
                            )}
                            <details className="mt-3 rounded-xl border border-black/10 bg-neutral-50 p-3">
                              <summary className="text-xs font-semibold text-neutral-600">Edit {unit.label}</summary>
                              <div className="mt-3 space-y-3">
                        <UnitTypeForm projectId={project.id} unitType={unit} phases={selectedProjectPhases} selectedPhaseId={selectedPhaseId} paymentPlanSummary={project.payment_plans ?? null} />
                              </div>
                            </details>
                            {showVariantWizard && resolvedUnitTypeId === unit.id ? (
                              <div className="mt-3 rounded-2xl border border-dashed border-black/10 bg-neutral-50 p-3 text-xs text-neutral-500">
                                Variant wizard open in the modal.
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-neutral-500">{showArchivedInventory ? "No archived unit types in this project." : "No active unit types yet. Add the first commercial range when you are ready."}</p>
                    )}
                    {!showArchivedInventory ? <details id="add-property-types" className="mt-4 rounded-2xl border border-dashed border-black/10 bg-white p-4">
                      <summary className="cursor-pointer text-sm font-semibold text-neutral-700">Add a unit type</summary>
                      <p className="mt-1 text-xs text-neutral-500">Define one commercial range now. Detailed variants remain optional.</p>
                      <div className="mt-4 space-y-3">
                        <UnitTypeForm projectId={project.id} phases={selectedProjectPhases} selectedPhaseId={selectedPhaseId} paymentPlanSummary={project.payment_plans ?? null} />
                      </div>
                    </details> : null}
                  </div>
                }
                requestContent={null}
              />
              </div>
              </> : null}
            </article>
          )})}
          {!visibleProjects.length && (
            <p className="rounded-2xl border border-dashed border-black/5 bg-white p-6 text-sm text-neutral-500">
              {showArchivedProjects ? "No archived projects in this workspace." : "No active projects yet. Use the create action to start your first launch."}
            </p>
          )}
        </div>
        </section>
      ) : null}

    </DeveloperLayout>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; as?: "input" };
type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; as: "textarea" };
type UnitTypeFormProps = {
  projectId: string;
  phases?: DeveloperProjectPhase[];
  selectedPhaseId?: string | null;
  paymentPlanSummary?: string | null;
  unitType?: {
    id: string;
    phase_id?: string | null;
    category?: string | null;
    label: string;
    min_price: number;
    max_price?: number | null;
    unit_area_min?: number | null;
    unit_area_max?: number | null;
    land_area_min?: number | null;
    land_area_max?: number | null;
    finishing_status?: string | null;
    hero_image_url?: string | null;
    description?: string | null;
    archived_at?: string | null;
    archived_by_account_id?: string | null;
    project_unit_variants?: Array<{
      id: string;
      category?: string | null;
      label?: string | null;
      bedrooms?: number | null;
      bathrooms?: number | null;
      has_garden?: boolean | null;
      garden_area_sqm?: number | null;
      has_roof?: boolean | null;
      roof_area_sqm?: number | null;
      finishing_status?: string | null;
      delivery_date?: string | null;
      min_price: number;
      max_price?: number | null;
      unit_area_min?: number | null;
      unit_area_max?: number | null;
      land_area_min?: number | null;
      land_area_max?: number | null;
      layout_options?: string[] | null;
      down_payment_percent?: number | null;
      installment_years?: number | null;
      stock_count?: number | null;
      description?: string | null;
      amenities?: string[] | null;
      archived_at?: string | null;
      archived_by_account_id?: string | null;
    }> | null;
  };
};

function Field(props: InputProps | TextareaProps) {
  const { label, as, ...rest } = props;
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">{label}</span>
      {as === "textarea" ? (
        <textarea
          className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
          rows={(rest as TextareaProps).rows ?? 3}
          {...(rest as TextareaProps)}
        />
      ) : (
        <input
          className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
          {...(rest as InputProps)}
        />
      )}
    </label>
  );
}

function UnitTypeForm({ projectId, phases = [], selectedPhaseId, paymentPlanSummary, unitType }: UnitTypeFormProps) {
  const categoryValue = normalizeCategory(unitType?.category ?? inferCategoryFromType(unitType?.label));
  const baseTypeValue = normalizeTypeForCategory(categoryValue, unitType?.label);
  return (
    <form action={upsertProjectUnitTypeAction} className="space-y-3 text-sm">
      <input type="hidden" name="projectId" value={projectId} />
      {unitType ? <input type="hidden" name="unitTypeId" value={unitType.id} /> : null}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Release phase</span>
        <select className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3" name="phaseId" required defaultValue={unitType?.phase_id ?? selectedPhaseId ?? ""}>
          <option value="">Choose a phase</option>
          {phases.filter((phase) => !phase.archived_at && phase.lifecycle_state !== "archived").sort((a, b) => a.phase_order - b.phase_order).map((phase) => <option key={phase.id} value={phase.id}>{phase.phase_order}. {phase.name}</option>)}
        </select>
        <span className="text-xs text-neutral-500">Inventory is scoped to one phase. Move it by selecting another active phase.</span>
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Category</span>
          <select
            className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
            name="unitCategory"
            defaultValue={categoryValue}
            required
          >
            {PROPERTY_CATEGORIES.map((category) => (
              <option key={`unit-category-${category}`} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Type</span>
          <select
            className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
            name="unitBaseType"
            defaultValue={baseTypeValue}
            required
          >
            {PROPERTY_CATEGORIES.map((category) => (
              <optgroup key={`unit-type-group-${category}`} label={category}>
                {PROPERTY_TYPES_BY_CATEGORY[category].map((type) => (
                  <option key={`${category}-${type}`} value={type}>
                    {type}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field
          label="Min price (EGP)"
          name="unitStartPrice"
          type="number"
          min="1"
          step="1"
          required
          defaultValue={unitType?.min_price ?? undefined}
          placeholder="4500000"
        />
        <Field
          label="Max price (EGP)"
          name="unitMaxPrice"
          type="number"
          min="1"
          step="1"
          defaultValue={unitType?.max_price ?? undefined}
          placeholder="6500000"
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field
          label="Finishing status"
          name="unitFinishing"
          list={`finishing-statuses-${projectId}`}
          defaultValue={unitType?.finishing_status ?? undefined}
          placeholder="finished"
        />
      </div>
      {paymentPlanSummary ? (
        <p className="text-xs text-neutral-500">
          Original plan reference: {paymentPlanSummary}
        </p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <Field
          label="Min BUA (m²)"
          name="unitMinBua"
          type="number"
          min="0"
          step="1"
          defaultValue={unitType?.unit_area_min ?? undefined}
          placeholder="120"
        />
        <Field
          label="Max BUA (m²)"
          name="unitMaxBua"
          type="number"
          min="0"
          step="1"
          defaultValue={unitType?.unit_area_max ?? undefined}
          placeholder="240"
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field
          label="Min land (m²)"
          name="unitMinLand"
          type="number"
          min="0"
          step="1"
          defaultValue={unitType?.land_area_min ?? undefined}
          placeholder="180"
        />
        <Field
          label="Max land (m²)"
          name="unitMaxLand"
          type="number"
          min="0"
          step="1"
          defaultValue={unitType?.land_area_max ?? undefined}
          placeholder="320"
        />
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Hero image</span>
        <input
          className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
          type="file"
          name="unitHeroImage"
          accept="image/*"
        />
        {unitType?.hero_image_url ? (
          <span className="text-xs text-neutral-500">Current: {unitType.hero_image_url}</span>
        ) : null}
      </label>
      <Field
        as="textarea"
        label="Notes"
        name="unitDescription"
        rows={2}
        placeholder="Highlights, payment perks, available views…"
        defaultValue={unitType?.description ?? ""}
      />
      <datalist id={`finishing-statuses-${projectId}`}>
        {FINISHING_STATUSES.map((status) => (
          <option key={status.value} value={status.value}>
            {status.label}
          </option>
        ))}
      </datalist>
      <div className="flex justify-end">
        <button className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white" type="submit">
          {unitType ? "Save changes" : "Add type"}
        </button>
      </div>
    </form>
  );
}

function VariantForm({
  projectId,
  unitTypeId,
  unitTypeCategory,
  unitTypeLabel,
  variant,
}: {
  projectId: string;
  unitTypeId: string;
  unitTypeCategory?: string | null;
  unitTypeLabel: string;
  variant?: {
    id: string;
    category?: string | null;
    label?: string | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    has_garden?: boolean | null;
    garden_area_sqm?: number | null;
    has_roof?: boolean | null;
    roof_area_sqm?: number | null;
    finishing_status?: string | null;
    delivery_date?: string | null;
    min_price: number;
    max_price?: number | null;
    unit_area_min?: number | null;
    unit_area_max?: number | null;
    land_area_min?: number | null;
    land_area_max?: number | null;
    layout_options?: string[] | null;
    down_payment_percent?: number | null;
    installment_years?: number | null;
    stock_count?: number | null;
    description?: string | null;
    amenities?: string[] | null;
    archived_at?: string | null;
    archived_by_account_id?: string | null;
  };
}) {
  const categoryValue = normalizeCategory(variant?.category ?? unitTypeCategory ?? inferCategoryFromType(unitTypeLabel));
  const typeValue = normalizeTypeForCategory(categoryValue, variant?.label ?? unitTypeLabel);
  const finishingValue = variant?.finishing_status ?? "";
  const deliveryDateValue = variant?.delivery_date?.slice?.(0, 10) ?? "";
  const layoutOptionsValue = variant?.layout_options?.join("\n") ?? "";
  return (
    <>
      <form action={upsertProjectUnitVariantAction} className="space-y-3 text-sm">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="unitTypeId" value={unitTypeId} />
        <input type="hidden" name="variantCategory" value={categoryValue} />
        <input type="hidden" name="variantType" value={typeValue} />
        {variant ? <input type="hidden" name="variantId" value={variant.id} /> : null}
        <div className="rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Variant type</p>
          <p className="mt-1 text-sm font-semibold text-neutral-900">{categoryValue} · {typeValue}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field
            label="Bedrooms"
            name="variantBedrooms"
            type="number"
            min="0"
            defaultValue={variant?.bedrooms ?? undefined}
            placeholder="3"
          />
          <Field
            label="Bathrooms"
            name="variantBathrooms"
            type="number"
            min="0"
            defaultValue={variant?.bathrooms ?? undefined}
            placeholder="2"
          />
        </div>
        <VariantOutdoorFields
          defaultHasGarden={Boolean(variant?.has_garden)}
          defaultGardenAreaSqm={variant?.garden_area_sqm ?? null}
          defaultHasRoof={Boolean(variant?.has_roof)}
          defaultRoofAreaSqm={variant?.roof_area_sqm ?? null}
        />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Finishing</span>
            <select
              className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
              name="variantFinishing"
              defaultValue={finishingValue}
            >
              <option value="">Select finishing</option>
              {FINISHING_STATUSES.map((status) => (
                <option key={`variant-finishing-${status.value}`} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Delivery date"
            name="variantDeliveryDate"
            type="date"
            defaultValue={deliveryDateValue}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field
            label="Min price (EGP)"
            name="variantMinPrice"
            type="number"
            min="100000"
            required
            defaultValue={variant ? Number(variant.min_price ?? 0) : undefined}
          />
          <Field
            label="Max price (EGP)"
            name="variantMaxPrice"
            type="number"
            min="100000"
            defaultValue={variant?.max_price ?? undefined}
            placeholder="Optional"
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field
            label="BUA min (m²)"
            name="variantAreaMin"
            type="number"
            min="0"
            step="1"
            defaultValue={variant?.unit_area_min ?? undefined}
            placeholder="120"
          />
          <Field
            label="BUA max (m²)"
            name="variantAreaMax"
            type="number"
            min="0"
            step="1"
            defaultValue={variant?.unit_area_max ?? undefined}
            placeholder="240"
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field
            label="Land min (m²)"
            name="variantLandMin"
            type="number"
            min="0"
            step="1"
            defaultValue={variant?.land_area_min ?? undefined}
            placeholder="Optional"
          />
          <Field
            label="Land max (m²)"
            name="variantLandMax"
            type="number"
            min="0"
            step="1"
            defaultValue={variant?.land_area_max ?? undefined}
            placeholder="Optional"
          />
        </div>
        <Field
          as="textarea"
          label="Layouts with different BUA"
          name="variantLayouts"
          rows={3}
          placeholder={"One layout per line\n120 sqm - Layout A\n145 sqm - Layout B"}
          defaultValue={layoutOptionsValue}
        />
        <Field
          as="textarea"
          label="Notes"
          name="variantDescription"
          rows={2}
          placeholder="Variant notes, phase details, special remarks…"
          defaultValue={variant?.description ?? ""}
        />
        <div className="flex justify-end">
          <button className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white" type="submit">
            {variant ? "Save variant" : "Add variant"}
          </button>
        </div>
      </form>
      {variant ? (
        <form action={variant.archived_at ? restoreVariantAction : archiveVariantAction} className="mt-2 flex justify-end">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="variantId" value={variant.id} />
          <ConfirmSubmitButton className={`text-xs hover:underline disabled:opacity-50 ${variant.archived_at ? "text-emerald-700" : "text-amber-700"}`} confirmMessage={variant.archived_at ? "Restore this variant? It will remain subject to project review." : "Archive this variant? It will be retained and hidden from active inventory."} pendingLabel={variant.archived_at ? "Restoring…" : "Archiving…"}>
            {variant.archived_at ? "Restore variant" : "Archive variant"}
          </ConfirmSubmitButton>
        </form>
      ) : null}
    </>
  );
}

function formatVariantChip(variant: {
  category?: string | null;
  label?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  has_garden?: boolean | null;
  garden_area_sqm?: number | null;
  has_roof?: boolean | null;
  roof_area_sqm?: number | null;
  finishing_status?: string | null;
  delivery_date?: string | null;
  unit_area_min?: number | null;
  unit_area_max?: number | null;
  land_area_min?: number | null;
  land_area_max?: number | null;
  layout_options?: string[] | null;
  min_price: number;
  max_price?: number | null;
  installment_years?: number | null;
  down_payment_percent?: number | null;
  archived_at?: string | null;
}) {
  const kind = variant.label ?? null;
  const beds = variant.bedrooms != null ? `${variant.bedrooms}BR` : "?BR";
  const baths = variant.bathrooms != null ? `${variant.bathrooms}BA` : "?BA";
  const garden = variant.has_garden
    ? `Garden${variant.garden_area_sqm != null ? ` ${Number(variant.garden_area_sqm).toLocaleString()}m²` : ""}`
    : null;
  const roof = variant.has_roof
    ? `Roof${variant.roof_area_sqm != null ? ` ${Number(variant.roof_area_sqm).toLocaleString()}m²` : ""}`
    : null;
  const finishing = variant.finishing_status ? variant.finishing_status.replace(/_/g, " ") : null;
  const delivery = variant.delivery_date ? `Delivery ${variant.delivery_date}` : null;
  const bua = variant.unit_area_min
    ? variant.unit_area_max && variant.unit_area_max !== variant.unit_area_min
      ? `${variant.unit_area_min}-${variant.unit_area_max}m²`
      : `${variant.unit_area_min}m²`
    : "BUA TBD";
  const land = variant.land_area_min
    ? variant.land_area_max && variant.land_area_max !== variant.land_area_min
      ? `Land ${variant.land_area_min}-${variant.land_area_max}m²`
      : `Land ${variant.land_area_min}m²`
    : null;
  const price = Number.isFinite(Number(variant.min_price))
    ? `EGP ${Number(variant.min_price).toLocaleString()}${
        variant.max_price != null ? `-${Number(variant.max_price).toLocaleString()}` : ""
      }`
    : "Price TBD";
  const layouts = variant.layout_options?.length ? `${variant.layout_options.length} layouts` : null;
  return [variant.category, kind, beds, baths, garden, roof, finishing, delivery, bua, land, price, layouts, variant.archived_at ? "Archived" : null]
    .filter(Boolean)
    .join(" · ");
}

async function upsertProjectAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_projects");
  const id = formData.get("projectId")?.toString();
  const name = formData.get("name")?.toString().trim();
  const invalidTarget = id ? `/developer/projects?project=${id}&section=settings` : "/developer/projects?create=1";
  if (!name) {
    redirect(`${invalidTarget}&error=${encodeURIComponent("Add a project name before saving.")}`);
  }
  const description = formData.get("description")?.toString().trim() || undefined;
  const location = formData.get("location")?.toString().trim() || undefined;
  const numberInputs = [
    ["acres", formData.get("acres")?.toString()],
    ["footprint", formData.get("footprint")?.toString()],
    ["maintenance", formData.get("maintenance")?.toString()],
    ["CH fees", formData.get("chFees")?.toString()],
    ["EOI value", formData.get("eoiValueApt")?.toString()],
    ["EOI value", formData.get("eoiValueVilla")?.toString()],
  ] as const;
  const invalidNumber = numberInputs.find(([, raw]) => raw?.trim() && parseOptionalNumber(raw) == null);
  if (invalidNumber) {
    redirect(`${invalidTarget}&error=${encodeURIComponent(`Enter a valid ${invalidNumber[0]}.`)}`);
  }
  const acres = parseOptionalNumber(formData.get("acres")?.toString());
  const footprint = parseOptionalNumber(formData.get("footprint")?.toString());
  const maintenance = parseOptionalNumber(formData.get("maintenance")?.toString());
  const chFees = parseOptionalNumber(formData.get("chFees")?.toString());
  const projectTypes = parseProjectTypes(formData.get("projectTypes")?.toString());
  const launchStatus = normalizeLaunchStatus(formData.get("launchStatus")?.toString().trim() || "live");
  const launchDate = formData.get("launchDate")?.toString().trim() || null;
  const eoiValueApt = parseOptionalNumber(formData.get("eoiValueApt")?.toString());
  const eoiValueVilla = parseOptionalNumber(formData.get("eoiValueVilla")?.toString());
  if (footprint != null && (footprint < 0 || footprint > 100)) {
    redirect(`${invalidTarget}&error=${encodeURIComponent("Footprint must be between 0% and 100%.")}`);
  }
  if ([acres, maintenance, chFees, eoiValueApt, eoiValueVilla].some((value) => value != null && value < 0)) {
    redirect(`${invalidTarget}&error=${encodeURIComponent("Project commercial values cannot be negative.")}`);
  }
  if (launchDate && Number.isNaN(Date.parse(`${launchDate}T00:00:00`))) {
    redirect(`${invalidTarget}&error=${encodeURIComponent("Enter a valid launch date.")}`);
  }
  const commissionRateRaw = formData.get("commissionRate")?.toString() ?? null;
  const platformShareRaw = formData.get("platformShare")?.toString() ?? null;
  const amenities = formData
    .getAll("projectAmenities")
    .map((value) => value.toString())
    .filter(Boolean);
  const paymentPlanTemplates = [0, 1, 2]
    .map((index) => {
      const title = formData.get(`paymentPlanTitle_${index}`)?.toString().trim() || null;
      const downPayment = toPlanNumber(formData.get(`paymentPlanDown_${index}`)?.toString());
      const years = toPlanNumber(formData.get(`paymentPlanYears_${index}`)?.toString());
      const discount = toPlanNumber(formData.get(`paymentPlanDiscount_${index}`)?.toString());
      const frequency = formData.get(`paymentPlanFrequency_${index}`)?.toString().trim() || null;
      if (!title && downPayment == null && years == null && discount == null) return null;
      return {
        title,
        down_payment_percent: downPayment,
        installment_years: years,
        discount_percent: discount,
        payment_frequency: frequency,
      } satisfies StructuredPaymentPlan;
    })
    .filter(Boolean) as StructuredPaymentPlan[];
  const limitedTimeOffers = [0]
    .map((index) => {
      const offerTitle = formData.get(`offerTitle_${index}`)?.toString().trim() || null;
      const downPayment = toPlanNumber(formData.get(`offerDown_${index}`)?.toString());
      const years = toPlanNumber(formData.get(`offerYears_${index}`)?.toString());
      const discount = toPlanNumber(formData.get(`offerDiscount_${index}`)?.toString());
      const frequency = formData.get(`offerFrequency_${index}`)?.toString().trim() || null;
      if (!offerTitle && downPayment == null && years == null && discount == null) return null;
      return {
        offer_title: offerTitle,
        title: offerTitle,
        down_payment_percent: downPayment,
        installment_years: years,
        discount_percent: discount,
        payment_frequency: frequency,
      } satisfies LimitedTimeOffer;
    })
    .filter(Boolean) as LimitedTimeOffer[];
  const paymentPlans =
    paymentPlanTemplates.map((plan) => formatPlanSummary(plan)).filter(Boolean).join("\n") ||
    undefined;
  const projectKey = id || `new-${Date.now()}`;
  const projectBasePath = `developers/${session.developerId}/projects/${projectKey}`;

  const projectLogoFile = formData.get("project_logo");
  const imageFiles = formData.getAll("project_images").filter(isFile) as File[];
  const brochureFile = formData.get("project_brochure");
  const masterplanFile = formData.get("project_masterplan");
  const voiceFiles = formData.getAll("voice_notes").filter(isFile) as File[];
  const videoFiles = formData.getAll("project_videos").filter(isFile) as File[];
  const inventoryFile = formData.get("project_inventory");
  let pastedImageUrls: string[] = [];
  let pastedVoiceUrls: string[] = [];
  let pastedVideoUrls: string[] = [];
  let pastedBrochureUrl: string | null = null;
  let pastedMasterplanUrl: string | null = null;
  let pastedInventoryUrl: string | null = null;
  let pastedProjectLogoUrl: string | null = null;
  try {
    pastedProjectLogoUrl = parseHttpMediaUrls(formData.get("project_logo_url"), "Project logo", 1)[0] ?? null;
    pastedImageUrls = parseHttpMediaUrls(formData.get("project_image_urls"), "Project images", 20);
    pastedVoiceUrls = parseHttpMediaUrls(formData.get("voice_note_urls"), "Voice notes", 10);
    pastedVideoUrls = parseHttpMediaUrls(formData.get("project_video_urls"), "Project videos", 10);
    pastedBrochureUrl = parseHttpMediaUrls(formData.get("project_brochure_url"), "Project brochure", 1)[0] ?? null;
    pastedMasterplanUrl = parseHttpMediaUrls(formData.get("project_masterplan_url"), "Project masterplan", 1)[0] ?? null;
    pastedInventoryUrl = parseHttpMediaUrls(formData.get("project_inventory_url"), "Inventory template", 1)[0] ?? null;
  } catch (error) {
    redirect(`${invalidTarget}&error=${encodeURIComponent(error instanceof Error ? error.message : "Enter valid media URLs.")}`);
  }

  if (isFile(inventoryFile) && !isExcelTemplateFile(inventoryFile)) {
    const target = id ? `/developer/projects?project=${id}` : "/developer/projects?create=1";
    redirect(`${target}&error=${encodeURIComponent("Inventory must be uploaded using the Brixeler .xlsx template.")}`);
  }

  const existingProjects = id ? await fetchDeveloperProjects(session.developerId) : [];
  const existingProject = id ? existingProjects.find((project) => project.id === id) : undefined;
  if (id && !existingProject) {
    redirect(`/developer/projects?error=${encodeURIComponent("Project not found or access denied.")}`);
  }
  const existingHeroMedia =
    existingProject?.hero_media && typeof existingProject.hero_media === "object"
      ? { ...(existingProject.hero_media as ProjectMedia) }
      : {};
  const heroMedia: ProjectMedia = { ...existingHeroMedia };
  let heroMediaUpdated = false;
  let inventoryUrl = existingProject?.inventory_url ?? null;
  let projectLogoUrl = existingProject?.project_logo_url ?? null;
  let voiceNoteUrls: string[] | undefined;
  let videoUrls: string[] | undefined;
  const uploadedObjects: Array<{ bucket: string; url: string }> = [];
  const uploadTracked = async (options: Parameters<typeof uploadFileToBucket>[0]) => {
    const url = await uploadFileToBucket(options);
    uploadedObjects.push({ bucket: options.bucket, url });
    return url;
  };

  try {
    if (isFile(projectLogoFile) || pastedProjectLogoUrl) {
      projectLogoUrl = isFile(projectLogoFile) ? await uploadTracked({
        bucket: STORAGE_BUCKETS.projectImages,
        pathPrefix: `${projectBasePath}/logo`,
        file: projectLogoFile,
      }) : pastedProjectLogoUrl!;
    }
    if (imageFiles.length || pastedImageUrls.length) {
      const imageUrls = [...pastedImageUrls];
      for (const file of imageFiles) {
        imageUrls.push(await uploadTracked({
          bucket: STORAGE_BUCKETS.projectImages,
          pathPrefix: `${projectBasePath}/images`,
          file,
        }));
      }
      heroMedia.images = imageUrls;
      heroMedia.heroImageUrl = imageUrls[0];
      heroMediaUpdated = true;
    }

    if (isFile(brochureFile) || pastedBrochureUrl) {
      const brochureUrl = isFile(brochureFile) ? await uploadTracked({
        bucket: STORAGE_BUCKETS.projectBrochures,
        pathPrefix: `${projectBasePath}/brochure`,
        file: brochureFile,
      }) : pastedBrochureUrl!;
      heroMedia.brochureUrl = brochureUrl;
      heroMediaUpdated = true;
    }

    if (isFile(masterplanFile) || pastedMasterplanUrl) {
      const masterplanUrl = isFile(masterplanFile) ? await uploadTracked({
        bucket: STORAGE_BUCKETS.projectBrochures,
        pathPrefix: `${projectBasePath}/masterplan`,
        file: masterplanFile,
      }) : pastedMasterplanUrl!;
      heroMedia.masterplanUrl = masterplanUrl;
      heroMediaUpdated = true;
    }

    if (voiceFiles.length || pastedVoiceUrls.length) {
      voiceNoteUrls = [...pastedVoiceUrls];
      for (const file of voiceFiles) {
        voiceNoteUrls.push(await uploadTracked({
            bucket: STORAGE_BUCKETS.projectVoiceNotes,
            pathPrefix: `${projectBasePath}/voice-notes`,
            file,
        }));
      }
    }

    if (videoFiles.length || pastedVideoUrls.length) {
      videoUrls = [...pastedVideoUrls];
      for (const file of videoFiles) {
        videoUrls.push(await uploadTracked({
            bucket: STORAGE_BUCKETS.projectVideos,
            pathPrefix: `${projectBasePath}/videos`,
            file,
        }));
      }
    }

    if (isFile(inventoryFile) || pastedInventoryUrl) {
      inventoryUrl = isFile(inventoryFile) ? await uploadTracked({
        bucket: STORAGE_BUCKETS.projectBrochures,
        pathPrefix: `${projectBasePath}/inventory`,
        file: inventoryFile,
      }) : pastedInventoryUrl!;
    }
  } catch (error) {
    await removeUploadedStorageObjects(uploadedObjects);
    const target = id ? `/developer/projects?project=${id}` : "/developer/projects?create=1";
    redirect(`${target}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to upload project media.")}`);
  }

  const { data, error } = await upsertDeveloperProject(session.developerId, {
    id: id || undefined,
    name,
    description,
    location,
    acres,
    footprint,
    maintenance,
    payment_plans: paymentPlans,
    payment_plan_templates: paymentPlanTemplates,
    limited_time_offers: limitedTimeOffers,
    launch_status: launchStatus,
    launch_date: launchDate,
    eoi_value_apt: eoiValueApt,
    eoi_value_villa: eoiValueVilla,
    ch_fees: chFees,
    project_types: projectTypes,
    inventory_url: inventoryUrl,
    project_logo_url: projectLogoUrl,
    hero_media: heroMediaUpdated ? heroMedia : undefined,
    voice_notes: voiceNoteUrls?.length ? voiceNoteUrls : undefined,
    video_links: videoUrls?.length ? videoUrls : undefined,
    amenities: amenities.length ? amenities : undefined,
  });
  if (!error && data?.id) {
    const commissionResult = await upsertProjectCommissionRule({
      developerId: session.developerId,
      projectId: data.id,
      commissionRateRaw,
      platformShareRaw,
    });
    if (commissionResult?.error) {
      redirect(`/developer/projects?project=${data.id}&error=${encodeURIComponent("Project saved, but the commission rule could not be saved. Please retry.")}`);
    }
    redirect(`${projectPortalHref(data.id, "section=inventory")}&draft=clear&success=${encodeURIComponent("Project saved as a draft and submitted for review. Start with Phase 1, then add phase-scoped inventory.")}`);
  }
  if (error) {
    await removeUploadedStorageObjects(uploadedObjects);
    redirect(`/developer/projects?${id ? `project=${id}&` : "create=1&"}error=${encodeURIComponent(error.message)}`);
  }
  if (!data?.id) {
    await removeUploadedStorageObjects(uploadedObjects);
    redirect(`/developer/projects?${id ? `project=${id}&` : "create=1&"}error=${encodeURIComponent("Project could not be saved.")}`);
  }
  revalidatePath("/developer/projects");
}

async function archiveProjectAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_projects");
  const projectId = formData.get("projectId")?.toString();
  if (!projectId) return;
  const { error } = await archiveDeveloperProject(session.developerId, projectId);
  if (error) redirect(`/developer/projects?project=${projectId}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/developer/projects");
  redirect(`/developer/projects?status=archived&success=${encodeURIComponent("Project archived. Inventory and leads were retained.")}`);
}

async function restoreProjectAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_projects");
  const projectId = formData.get("projectId")?.toString();
  if (!projectId) return;
  const { error } = await restoreDeveloperProject(session.developerId, projectId);
  if (error) redirect(`/developer/projects?project=${projectId}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/developer/projects");
  redirect(`/developer/projects?project=${projectId}&success=${encodeURIComponent("Project restored as a draft. Submit it for review when ready.")}`);
}

const projectPortalHref = (projectId: string, query = "") => `/developer/projects/${projectId}${query ? `?${query}` : ""}`;

function phaseHeroImageFromMedia(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const media = value as { heroImageUrl?: unknown; hero_image_url?: unknown };
  return typeof media.heroImageUrl === "string" && media.heroImageUrl.trim()
    ? media.heroImageUrl.trim()
    : typeof media.hero_image_url === "string" && media.hero_image_url.trim()
    ? media.hero_image_url.trim()
    : null;
}

async function uploadPhaseHeroImage(formData: FormData, projectId: string, phaseKey: string) {
  const imageFile = formData.get("phaseHeroImage");
  if (!isFile(imageFile)) return null;
  return uploadFileToBucket({
    bucket: STORAGE_BUCKETS.projectImages,
    pathPrefix: `developers/${phaseKey}/projects/${projectId}/phases`,
    file: imageFile,
  });
}

async function developerProjectUploadPreflight(developerId: string, projectId: string) {
  const { data, error } = await supabaseServer
    .from("developer_projects")
    .select("id")
    .eq("id", projectId)
    .eq("developer_id", developerId)
    .maybeSingle();
  return !error && Boolean(data);
}

function phaseFormValues(formData: FormData) {
  const name = formData.get("phaseName")?.toString().trim() ?? "";
  const description = formData.get("phaseDescription")?.toString().trim() || null;
  const phaseOrderRaw = formData.get("phaseOrder")?.toString().trim() ?? "";
  const phaseOrder = phaseOrderRaw ? Number(phaseOrderRaw) : null;
  const launchStatus = formData.get("phaseLaunchStatus")?.toString().trim() || "upcoming";
  const launchDate = formData.get("phaseLaunchDate")?.toString().trim() || null;
  const pastedHero = formData.get("phaseHeroImageUrl")?.toString().trim() ?? "";
  return { name, description, phaseOrder, launchStatus, launchDate, pastedHero };
}

function validatePhaseForm(values: ReturnType<typeof phaseFormValues>) {
  if (!values.name || values.name.length > 160) return "Add a phase name between 1 and 160 characters.";
  if (values.phaseOrder != null && (!Number.isInteger(values.phaseOrder) || values.phaseOrder <= 0)) return "Phase order must be a whole number greater than zero.";
  if (!["upcoming", "new_launch", "live"].includes(values.launchStatus)) return "Choose a valid phase launch status.";
  if (values.launchDate && Number.isNaN(Date.parse(`${values.launchDate}T00:00:00`))) return "Enter a valid phase launch date.";
  if (values.pastedHero && !normalizeHttpMediaUrl(values.pastedHero)) return "Phase image URLs must use http:// or https://.";
  return null;
}

async function createProjectPhaseAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_projects");
  const projectId = formData.get("projectId")?.toString();
  if (!projectId) return;
  const values = phaseFormValues(formData);
  const validationError = validatePhaseForm(values);
  if (validationError) redirect(`${projectPortalHref(projectId, "section=inventory")}&error=${encodeURIComponent(validationError)}`);
  if (!await developerProjectUploadPreflight(session.developerId, projectId)) {
    redirect(`${projectPortalHref(projectId, "section=inventory")}&error=${encodeURIComponent("Project not found or access denied.")}`);
  }
  const pastedHero = normalizeHttpMediaUrl(values.pastedHero);
  const uploadedObjects: Array<{ bucket: string; url: string }> = [];
  let heroImageUrl = pastedHero;
  try {
    const uploaded = await uploadPhaseHeroImage(formData, projectId, session.developerId);
    if (uploaded) {
      uploadedObjects.push({ bucket: STORAGE_BUCKETS.projectImages, url: uploaded });
      heroImageUrl = uploaded;
    }
  } catch (error) {
    await removeUploadedStorageObjects(uploadedObjects);
    redirect(`${projectPortalHref(projectId, "section=inventory")}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to upload the phase image.")}`);
  }
  const result = await createDeveloperProjectPhase(session.developerId, projectId, session.accountId, {
    name: values.name,
    description: values.description,
    phaseOrder: values.phaseOrder,
    launchStatus: values.launchStatus,
    launchDate: values.launchDate,
    heroMedia: heroImageUrl ? { heroImageUrl } : {},
  });
  if (result.error || !result.data) {
    await removeUploadedStorageObjects(uploadedObjects);
    redirect(`${projectPortalHref(projectId, "section=inventory")}&error=${encodeURIComponent(result.error?.message ?? "Unable to create this release phase.")}`);
  }
  revalidatePath("/developer/projects");
  revalidatePath(`/developer/projects/${projectId}`);
  redirect(`${projectPortalHref(projectId, `section=inventory&phase=${result.data.id}`)}&success=${encodeURIComponent("Release phase created. Add phase-scoped inventory, then submit the project for review.")}`);
}

async function updateProjectPhaseAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_projects");
  const projectId = formData.get("projectId")?.toString();
  const phaseId = formData.get("phaseId")?.toString();
  if (!projectId || !phaseId) return;
  const values = phaseFormValues(formData);
  const validationError = validatePhaseForm(values);
  if (validationError) redirect(`${projectPortalHref(projectId, `section=inventory&phase=${phaseId}`)}&error=${encodeURIComponent(validationError)}`);
  if (!await developerProjectUploadPreflight(session.developerId, projectId)) {
    redirect(`${projectPortalHref(projectId, `section=inventory&phase=${phaseId}`)}&error=${encodeURIComponent("Project not found or access denied.")}`);
  }
  const phases = await fetchDeveloperProjectPhases(session.developerId, projectId);
  const current = phases.find((phase) => phase.id === phaseId);
  if (!current) redirect(`${projectPortalHref(projectId, "section=inventory")}&error=${encodeURIComponent("Phase not found or access denied.")}`);
  const currentHero = phaseHeroImageFromMedia(current.hero_media);
  const pastedHero = normalizeHttpMediaUrl(values.pastedHero);
  const uploadedObjects: Array<{ bucket: string; url: string }> = [];
  let heroImageUrl = pastedHero || currentHero;
  try {
    const uploaded = await uploadPhaseHeroImage(formData, projectId, session.developerId);
    if (uploaded) {
      uploadedObjects.push({ bucket: STORAGE_BUCKETS.projectImages, url: uploaded });
      heroImageUrl = uploaded;
    }
  } catch (error) {
    await removeUploadedStorageObjects(uploadedObjects);
    redirect(`${projectPortalHref(projectId, `section=inventory&phase=${phaseId}`)}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to upload the phase image.")}`);
  }
  const result = await updateDeveloperProjectPhase(session.developerId, phaseId, session.accountId, {
    name: values.name,
    description: values.description,
    phaseOrder: values.phaseOrder,
    launchStatus: values.launchStatus,
    launchDate: values.launchDate,
    heroMedia: heroImageUrl ? { ...(current.hero_media && typeof current.hero_media === "object" ? current.hero_media : {}), heroImageUrl } : {},
  });
  if (result.error || !result.data) {
    await removeUploadedStorageObjects(uploadedObjects);
    redirect(`${projectPortalHref(projectId, `section=inventory&phase=${phaseId}`)}&error=${encodeURIComponent(result.error?.message ?? "Unable to update this release phase.")}`);
  }
  revalidatePath("/developer/projects");
  revalidatePath(`/developer/projects/${projectId}`);
  redirect(`${projectPortalHref(projectId, `section=inventory&phase=${phaseId}`)}&success=${encodeURIComponent("Release phase saved. The project is queued for review again.")}`);
}

async function archiveProjectPhaseAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_projects");
  const projectId = formData.get("projectId")?.toString();
  const phaseId = formData.get("phaseId")?.toString();
  if (!projectId || !phaseId) return;
  const result = await archiveDeveloperProjectPhase(session.developerId, phaseId, session.accountId);
  if (result.error) redirect(`${projectPortalHref(projectId, "section=inventory")}&error=${encodeURIComponent(result.error.message)}`);
  revalidatePath("/developer/projects");
  revalidatePath(`/developer/projects/${projectId}`);
  redirect(`${projectPortalHref(projectId, "section=inventory")}&success=${encodeURIComponent("Release phase archived. Its inventory was retained.")}`);
}

async function restoreProjectPhaseAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_projects");
  const projectId = formData.get("projectId")?.toString();
  const phaseId = formData.get("phaseId")?.toString();
  if (!projectId || !phaseId) return;
  const result = await restoreDeveloperProjectPhase(session.developerId, phaseId, session.accountId);
  if (result.error) redirect(`${projectPortalHref(projectId, "section=inventory")}&error=${encodeURIComponent(result.error.message)}`);
  revalidatePath("/developer/projects");
  revalidatePath(`/developer/projects/${projectId}`);
  redirect(`${projectPortalHref(projectId, `section=inventory&phase=${phaseId}`)}&success=${encodeURIComponent("Release phase restored as a draft. Submit the project for review when ready.")}`);
}

async function moveProjectStatusAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_projects");
  const projectId = formData.get("projectId")?.toString();
  const status = normalizeLaunchStatus(formData.get("status")?.toString());
  if (!projectId) return;
  const { data, error } = await supabaseServer
    .from("developer_projects")
    .update({ launch_status: status, approval_status: "pending", rejection_reason: null, reviewed_by: null, reviewed_at: null })
    .eq("developer_id", session.developerId)
    .eq("id", projectId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    redirect(`/developer/projects?project=${projectId}&error=${encodeURIComponent(error?.message ?? "Project not found or access denied.")}`);
  }
  revalidatePath("/developer/projects");
  redirect(`/developer/projects?status=${status}&project=${projectId}`);
}

async function upsertProjectCommissionRule(input: {
  developerId: string;
  projectId: string;
  commissionRateRaw?: string | null;
  platformShareRaw?: string | null;
}) {
  const commissionRateRaw = input.commissionRateRaw?.trim() ?? "";
  const platformShareRaw = input.platformShareRaw?.trim() ?? "";
  if (!commissionRateRaw && !platformShareRaw) return { error: null };

  const commissionRate = Number(commissionRateRaw);
  if (!Number.isFinite(commissionRate) || commissionRate <= 0) {
    return { error: new Error("Enter a valid commission rate.") };
  }
  const platformShare = platformShareRaw.length ? Number(platformShareRaw) : null;

  const { data: existing, error: lookupError } = await supabaseServer
    .from("developer_commission_rules")
    .select("id")
    .eq("developer_id", input.developerId)
    .eq("property_id", input.projectId)
    .maybeSingle();
  if (lookupError) return { error: lookupError };

  const { error } = await supabaseServer.from("developer_commission_rules").upsert(
    {
      id: existing?.id,
      developer_id: input.developerId,
      property_id: input.projectId,
      commission_rate: commissionRate,
      platform_share: Number.isFinite(platformShare ?? NaN) ? platformShare : null,
    },
    { onConflict: "id" },
  );
  return { error };
}

async function upsertProjectUnitTypeAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const projectId = formData.get("projectId")?.toString();
  const unitTypeId = formData.get("unitTypeId")?.toString() || undefined;
  const phaseId = formData.get("phaseId")?.toString() || undefined;
  const unitCategory = normalizeCategory(formData.get("unitCategory")?.toString());
  const baseTypeRaw = formData.get("unitBaseType")?.toString().trim() || "";
  const baseType = normalizeTypeForCategory(unitCategory, baseTypeRaw);
  if (!projectId) {
    return;
  }
  if (!phaseId) {
    redirect(`/developer/projects?project=${projectId}&section=inventory&error=${encodeURIComponent("Choose a release phase before saving inventory.")}`);
  }

  const readUnitNumber = (field: string, label: string) => {
    const raw = formData.get(field)?.toString().trim();
    if (!raw) return undefined;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      redirect(`/developer/projects?project=${projectId}&section=inventory&error=${encodeURIComponent(`${label} must be zero or more.`)}`);
    }
    return parsed;
  };
  const minPrice = readUnitNumber("unitStartPrice", "Minimum price");
  const maxPrice = readUnitNumber("unitMaxPrice", "Maximum price");
  if (minPrice == null || minPrice <= 0) {
    redirect(`/developer/projects?project=${projectId}&section=inventory&error=${encodeURIComponent("Enter a valid minimum price before saving this unit type.")}`);
  }
  if (maxPrice != null && maxPrice < minPrice) {
    redirect(`/developer/projects?project=${projectId}&section=inventory&error=${encodeURIComponent("Maximum price must be greater than or equal to the minimum.")}`);
  }

  const finishingStatus = formData.get("unitFinishing")?.toString().trim() || undefined;
  const unitAreaMin = readUnitNumber("unitMinBua", "Minimum BUA");
  const unitAreaMax = readUnitNumber("unitMaxBua", "Maximum BUA");
  const landAreaMin = readUnitNumber("unitMinLand", "Minimum land area");
  const landAreaMax = readUnitNumber("unitMaxLand", "Maximum land area");
  if (unitAreaMax != null && unitAreaMin != null && unitAreaMax < unitAreaMin) {
    redirect(`/developer/projects?project=${projectId}&section=inventory&error=${encodeURIComponent("Maximum BUA must be greater than or equal to the minimum.")}`);
  }
  if (landAreaMax != null && landAreaMin != null && landAreaMax < landAreaMin) {
    redirect(`/developer/projects?project=${projectId}&section=inventory&error=${encodeURIComponent("Maximum land area must be greater than or equal to the minimum.")}`);
  }
  if (!await developerProjectUploadPreflight(session.developerId, projectId)) {
    redirect(`/developer/projects?project=${projectId}&section=inventory&error=${encodeURIComponent("Project not found or access denied.")}`);
  }
  const heroImageFile = formData.get("unitHeroImage");
  const description = formData.get("unitDescription")?.toString().trim() || undefined;
  const label: string = baseType;

  const uploadedObjects: Array<{ bucket: string; url: string }> = [];
  let heroImageUrl: string | undefined = undefined;
  let result;
  try {
    if (isFile(heroImageFile)) {
      heroImageUrl = await uploadFileToBucket({
        bucket: STORAGE_BUCKETS.projectUnitImages,
        pathPrefix: `developers/${session.developerId}/projects/${projectId}/unit-types`,
        file: heroImageFile,
      });
      uploadedObjects.push({ bucket: STORAGE_BUCKETS.projectUnitImages, url: heroImageUrl });
    }
    result = await upsertProjectUnitType(session.developerId, projectId, {
      id: unitTypeId,
      phaseId,
      category: unitCategory,
      label,
      minPrice,
      maxPrice,
      unitAreaMin,
      unitAreaMax,
      landAreaMin,
      landAreaMax,
      finishingStatus,
      description,
      heroImageUrl,
    });
  } catch (error) {
    await removeUploadedStorageObjects(uploadedObjects);
    redirect(`/developer/projects?project=${projectId}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to save this unit type.")}`);
  }
  const { data, error } = result;
  if (error) {
    await removeUploadedStorageObjects(uploadedObjects);
    revalidatePath("/developer/projects");
    redirect(`/developer/projects?project=${projectId}&section=inventory&error=${encodeURIComponent(error.message)}`);
  }
  if (!unitTypeId && data?.id) {
    redirect(`/developer/projects?project=${projectId}&section=inventory&success=${encodeURIComponent("Unit type saved. Add variants only when you need more commercial detail.")}`);
  }
  revalidatePath("/developer/projects");
}

async function archiveUnitTypeAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const projectId = formData.get("projectId")?.toString();
  const unitTypeId = formData.get("unitTypeId")?.toString();
  if (!projectId || !unitTypeId) return;
  let result;
  try {
    result = await archiveProjectUnitType(session.developerId, unitTypeId, session.accountId);
  } catch (error) {
    redirect(`/developer/projects?project=${projectId}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to archive this unit type.")}`);
  }
  if (result?.error) {
    redirect(`/developer/projects?project=${projectId}&error=${encodeURIComponent(result.error.message)}`);
  }
  revalidatePath("/developer/projects");
  redirect(`/developer/projects?project=${projectId}&section=inventory&success=${encodeURIComponent("Unit type archived. Its variants were retained.")}`);
}

async function restoreUnitTypeAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const projectId = formData.get("projectId")?.toString();
  const unitTypeId = formData.get("unitTypeId")?.toString();
  if (!projectId || !unitTypeId) return;
  let result;
  try {
    result = await restoreProjectUnitType(session.developerId, unitTypeId);
  } catch (error) {
    redirect(`/developer/projects?project=${projectId}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to restore this unit type.")}`);
  }
  if (result?.error) redirect(`/developer/projects?project=${projectId}&error=${encodeURIComponent(result.error.message)}`);
  revalidatePath("/developer/projects");
  redirect(`/developer/projects?project=${projectId}&section=inventory&inventory=archived&success=${encodeURIComponent("Unit type restored to active inventory.")}`);
}

async function upsertProjectUnitVariantAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const projectId = formData.get("projectId")?.toString();
  const unitTypeId = formData.get("unitTypeId")?.toString();
  const variantId = formData.get("variantId")?.toString() || undefined;
  const variantCategory = normalizeCategory(formData.get("variantCategory")?.toString());
  const variantTypeRaw = formData.get("variantType")?.toString().trim() || "";
  const variantType = normalizeTypeForCategory(variantCategory, variantTypeRaw);
  if (!projectId || !unitTypeId) {
    return;
  }

  const readVariantNumber = (field: string, label: string, allowZero = true) => {
    const raw = formData.get(field)?.toString().trim();
    if (!raw) return undefined;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || (!allowZero && parsed <= 0)) {
      redirect(`/developer/projects?project=${projectId}&section=inventory&error=${encodeURIComponent(`${label} must be a valid ${allowZero ? "zero or more" : "positive"} number.`)}`);
    }
    return parsed;
  };

  const minPrice = readVariantNumber("variantMinPrice", "Minimum price", false);
  if (minPrice == null) {
    redirect(`/developer/projects?project=${projectId}&section=inventory&error=${encodeURIComponent("Enter a valid minimum price before saving this variant.")}`);
  }
  const maxPrice = readVariantNumber("variantMaxPrice", "Maximum price");
  const bedrooms = readVariantNumber("variantBedrooms", "Bedrooms");
  const bathrooms = readVariantNumber("variantBathrooms", "Bathrooms");
  const hasGarden = formData.get("variantHasGarden")?.toString() === "yes";
  const gardenAreaSqm = readVariantNumber("variantGardenAreaSqm", "Garden area");
  const hasRoof = formData.get("variantHasRoof")?.toString() === "yes";
  const roofAreaSqm = readVariantNumber("variantRoofAreaSqm", "Roof area");
  const finishingStatus = formData.get("variantFinishing")?.toString().trim() || undefined;
  const deliveryDate = formData.get("variantDeliveryDate")?.toString().trim() || undefined;
  const areaMin = readVariantNumber("variantAreaMin", "Minimum BUA");
  const areaMax = readVariantNumber("variantAreaMax", "Maximum BUA");
  const landAreaMin = readVariantNumber("variantLandMin", "Minimum land area");
  const landAreaMax = readVariantNumber("variantLandMax", "Maximum land area");
  if (maxPrice != null && maxPrice < minPrice) {
    redirect(`/developer/projects?project=${projectId}&section=inventory&error=${encodeURIComponent("Maximum price must be greater than or equal to the minimum.")}`);
  }
  if (areaMax != null && areaMin != null && areaMax < areaMin) {
    redirect(`/developer/projects?project=${projectId}&section=inventory&error=${encodeURIComponent("Maximum BUA must be greater than or equal to the minimum.")}`);
  }
  if (landAreaMax != null && landAreaMin != null && landAreaMax < landAreaMin) {
    redirect(`/developer/projects?project=${projectId}&section=inventory&error=${encodeURIComponent("Maximum land area must be greater than or equal to the minimum.")}`);
  }
  const layoutOptions = (formData.get("variantLayouts")?.toString() ?? "")
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const description = formData.get("variantDescription")?.toString().trim() || undefined;

  let result;
  try {
    result = await upsertProjectUnitVariant(session.developerId, unitTypeId, {
      id: variantId,
      category: variantCategory,
      label: variantType,
      minPrice,
      maxPrice,
      bedrooms,
      bathrooms,
      hasGarden,
      gardenAreaSqm,
      hasRoof,
      roofAreaSqm,
      finishingStatus,
      deliveryDate,
      unitAreaMin: areaMin,
      unitAreaMax: areaMax,
      landAreaMin,
      landAreaMax,
      layoutOptions,
      description,
    });
  } catch (error) {
    redirect(`/developer/projects?project=${projectId}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to save this variant.")}`);
  }
  if (result?.error) {
    redirect(`/developer/projects?project=${projectId}&section=inventory&error=${encodeURIComponent(result.error.message)}`);
  }
  redirect(`/developer/projects?project=${projectId}&unitType=${unitTypeId}&variants=1&success=${encodeURIComponent("Variant saved to this unit type.")}`);
}

async function archiveVariantAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const projectId = formData.get("projectId")?.toString();
  const variantId = formData.get("variantId")?.toString();
  if (!projectId || !variantId) return;
  let result;
  try {
    result = await archiveProjectUnitVariant(session.developerId, variantId, session.accountId);
  } catch (error) {
    redirect(`/developer/projects?project=${projectId}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to archive this variant.")}`);
  }
  if (result?.error) {
    redirect(`/developer/projects?project=${projectId}&error=${encodeURIComponent(result.error.message)}`);
  }
  revalidatePath("/developer/projects");
  redirect(`/developer/projects?project=${projectId}&section=inventory&inventory=archived&success=${encodeURIComponent("Variant archived and retained.")}`);
}

async function restoreVariantAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const projectId = formData.get("projectId")?.toString();
  const variantId = formData.get("variantId")?.toString();
  if (!projectId || !variantId) return;
  let result;
  try {
    result = await restoreProjectUnitVariant(session.developerId, variantId);
  } catch (error) {
    redirect(`/developer/projects?project=${projectId}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to restore this variant.")}`);
  }
  if (result?.error) redirect(`/developer/projects?project=${projectId}&error=${encodeURIComponent(result.error.message)}`);
  revalidatePath("/developer/projects");
  redirect(`/developer/projects?project=${projectId}&section=inventory&inventory=archived&success=${encodeURIComponent("Variant restored to active inventory.")}`);
}

async function importTypeWithVariantsAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const projectId = formData.get("projectId")?.toString();
  const phaseId = formData.get("phaseId")?.toString() || undefined;
  const payloadRaw = formData.get("payload")?.toString();
  if (!projectId || !payloadRaw) return;
  if (!phaseId) {
    redirect(`/developer/projects?project=${projectId}&section=inventory&error=${encodeURIComponent("Choose a release phase before importing inventory.")}`);
  }

  let payload: {
    baseType: string;
    finishingStatus?: string;
    description?: string;
    variants: Array<{
      bedrooms?: number;
      bathrooms?: number;
      hasGarden?: boolean;
      hasRoof?: boolean;
      areaMin?: number;
      areaMax?: number;
      price?: number;
      downPayment?: number;
      installmentYears?: number;
      stockCount?: number;
      description?: string;
      amenities?: string[];
    }>;
  } | null = null;

  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    return;
  }

  if (!payload?.baseType || !payload.variants?.length) return;

  const strictNumericFields = ["bedrooms", "bathrooms", "areaMin", "areaMax", "downPayment", "installmentYears", "stockCount"] as const;
  const invalidVariant = payload.variants.some((variant) => {
    if (!variant || typeof variant !== "object" || typeof variant.price !== "number" || !Number.isFinite(variant.price) || variant.price <= 0) return true;
    if (strictNumericFields.some((field) => variant[field] != null && (typeof variant[field] !== "number" || !Number.isFinite(variant[field])))) return true;
    if (variant.bedrooms != null && (!Number.isInteger(variant.bedrooms) || variant.bedrooms < 0)) return true;
    if (variant.bathrooms != null && (!Number.isInteger(variant.bathrooms) || variant.bathrooms < 0)) return true;
    if (variant.areaMin != null && variant.areaMin < 0) return true;
    if (variant.areaMax != null && (variant.areaMax < 0 || variant.areaMax < (variant.areaMin ?? 0))) return true;
    if (variant.downPayment != null && (variant.downPayment < 0 || variant.downPayment > 100)) return true;
    if (variant.installmentYears != null && variant.installmentYears <= 0) return true;
    return variant.stockCount != null && (!Number.isInteger(variant.stockCount) || variant.stockCount < 0);
  });
  if (invalidVariant) {
    redirect(`/developer/projects?project=${projectId}&section=inventory&error=${encodeURIComponent("Every imported variant needs a valid price and consistent numeric ranges. No rows were saved.")}`);
  }

  const { data, error } = await importDeveloperProjectInventory(session.developerId, projectId, phaseId, session.accountId, {
    baseType: payload.baseType,
    category: inferCategoryFromType(payload.baseType),
    finishingStatus: payload.finishingStatus,
    description: payload.description,
    variants: payload.variants.map((variant) => ({
      ...variant,
      price: variant.price as number,
    })),
  });
  if (error || !data) {
    redirect(`/developer/projects?project=${projectId}&section=inventory&error=${encodeURIComponent(error?.message ?? "Unable to import this inventory batch. No rows were saved.")}`);
  }

  revalidatePath("/developer/projects");
  redirect(`/developer/projects?project=${projectId}&section=inventory&phase=${phaseId}&success=${encodeURIComponent("Inventory imported atomically to the selected release phase.")}`);
}

function parseJsonObject<T extends Record<string, unknown>>(value: FormDataEntryValue | null): T | null {
  if (typeof value !== "string" || value.length > 1_000_000) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as T : null;
  } catch {
    return null;
  }
}

function parseJsonRows(value: FormDataEntryValue | null): Array<Record<string, unknown>> | null {
  if (typeof value !== "string" || value.length > 1_000_000) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length > 500 || parsed.some((row) => !row || typeof row !== "object" || Array.isArray(row))) return null;
    return parsed as Array<Record<string, unknown>>;
  } catch {
    return null;
  }
}

function inventoryActionError(projectId: string, message: string) {
  return `${projectPortalHref(projectId, "section=inventory")}&error=${encodeURIComponent(message)}`;
}

async function markProjectReadyAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_projects");
  const projectId = formData.get("projectId")?.toString();
  if (!projectId) return;
  const result = await markDeveloperProjectReady(session.developerId, projectId, session.accountId);
  if (result.error) redirect(inventoryActionError(projectId, result.error.message));
  revalidatePath("/developer/projects");
  redirect(`${projectPortalHref(projectId, "section=overview")}&success=${encodeURIComponent("Project marked ready. Review the checklist before submitting.")}`);
}

async function submitProjectForReviewAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_projects");
  const projectId = formData.get("projectId")?.toString();
  if (!projectId) return;
  const result = await submitDeveloperProjectForReview(session.developerId, projectId, session.accountId);
  if (result.error) redirect(inventoryActionError(projectId, result.error.message));
  revalidatePath("/developer/projects");
  redirect(`${projectPortalHref(projectId, "section=overview")}&success=${encodeURIComponent("Project submitted for admin review.")}`);
}

async function bulkInventoryAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const projectId = formData.get("projectId")?.toString();
  const phaseId = formData.get("phaseId")?.toString();
  const rows = parseJsonRows(formData.get("rows"));
  const dryRun = formData.get("dryRun")?.toString() === "true";
  if (!projectId || !phaseId || !rows) {
    if (projectId) redirect(inventoryActionError(projectId, "Select a release phase and provide valid inventory rows."));
    return;
  }
  const result = await bulkUpdateDeveloperInventory(session.developerId, projectId, phaseId, session.accountId, rows, dryRun);
  if (result.error) redirect(inventoryActionError(projectId, result.error.message));
  const errors = Array.isArray(result.data?.errors) ? result.data.errors.length : 0;
  if (errors) redirect(inventoryActionError(projectId, `${errors} inventory row(s) failed validation. No invalid rows were written.`));
  revalidatePath("/developer/projects");
  redirect(`${projectPortalHref(projectId, `section=inventory&phase=${phaseId}`)}&success=${encodeURIComponent(dryRun ? "Dry run passed. Review the rows, then submit again in commit mode." : "Inventory rows saved as pending changes.")}`);
}

async function importInventoryRowsAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const projectId = formData.get("projectId")?.toString();
  const phaseId = formData.get("phaseId")?.toString();
  const rows = parseJsonRows(formData.get("rows"));
  const dryRun = formData.get("dryRun")?.toString() !== "false";
  if (!projectId || !phaseId || !rows) {
    if (projectId) redirect(inventoryActionError(projectId, "Select a release phase and provide valid import rows."));
    return;
  }
  const rowIds = rows.map((row) => typeof row.id === "string" && row.id.trim() ? row.id.trim() : null);
  if (rowIds.some(Boolean) && rowIds.some((id) => !id)) {
    redirect(inventoryActionError(projectId, "Do not mix existing inventory IDs with new import rows."));
  }
  const result = rowIds.every(Boolean)
    ? await bulkUpdateDeveloperInventory(session.developerId, projectId, phaseId, session.accountId, rows, dryRun)
    : await importDeveloperInventoryRows(session.developerId, projectId, phaseId, session.accountId, rows, dryRun);
  if (result.error) redirect(inventoryActionError(projectId, result.error.message));
  const errors = Array.isArray(result.data?.errors) ? result.data.errors.length : 0;
  if (errors) redirect(inventoryActionError(projectId, `${errors} import row(s) failed validation. Fix the row errors and try again.`));
  revalidatePath("/developer/projects");
  redirect(`${projectPortalHref(projectId, `section=inventory&phase=${phaseId}`)}&success=${encodeURIComponent(dryRun ? "Server dry run passed. Submit the import again in commit mode." : "Inventory imported as pending changes.")}`);
}

async function holdInventoryAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const projectId = formData.get("projectId")?.toString();
  const propertyId = formData.get("propertyId")?.toString();
  const expiresAt = formData.get("expiresAt")?.toString();
  const holderType = formData.get("holderType")?.toString() || "internal";
  const holderReference = formData.get("holderReference")?.toString() || null;
  if (!projectId || !propertyId || !expiresAt) {
    if (projectId) redirect(inventoryActionError(projectId, "A future hold expiry is required."));
    return;
  }
  const result = await createDeveloperInventoryHold(session.developerId, propertyId, session.accountId, expiresAt, holderType, holderReference);
  if (result.error) redirect(inventoryActionError(projectId, result.error.message));
  revalidatePath("/developer/projects");
  redirect(`${projectPortalHref(projectId, "section=inventory")}&success=${encodeURIComponent("Inventory hold created atomically.")}`);
}

async function releaseInventoryHoldAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const projectId = formData.get("projectId")?.toString();
  const holdId = formData.get("holdId")?.toString();
  const nextState = formData.get("nextState")?.toString() === "converted" ? "converted" as const : "released" as const;
  if (!projectId || !holdId) return;
  const result = await releaseDeveloperInventoryHold(session.developerId, holdId, session.accountId, nextState);
  if (result.error) redirect(inventoryActionError(projectId, result.error.message));
  revalidatePath("/developer/projects");
  redirect(`${projectPortalHref(projectId, "section=inventory")}&success=${encodeURIComponent(nextState === "converted" ? "Hold converted to contracted inventory." : "Inventory hold released.")}`);
}

async function restoreInventoryVersionAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const projectId = formData.get("projectId")?.toString();
  const versionId = formData.get("versionId")?.toString();
  if (!projectId || !versionId) return;
  const result = await restoreDeveloperInventoryVersion(session.developerId, versionId, session.accountId);
  if (result.error) redirect(inventoryActionError(projectId, result.error.message));
  revalidatePath("/developer/projects");
  redirect(`${projectPortalHref(projectId, "section=overview")}&success=${encodeURIComponent("Version restored to a draft. Review and submit the changes again.")}`);
}

async function saveInventoryFilterAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const projectId = formData.get("projectId")?.toString();
  const name = formData.get("name")?.toString().trim();
  const filter = parseJsonObject(formData.get("filter"));
  if (!projectId || !name || !filter) {
    if (projectId) redirect(inventoryActionError(projectId, "Enter a filter name before saving."));
    return;
  }
  const result = await saveDeveloperInventoryFilter(session.developerId, session.accountId, name, filter);
  if (result.error) redirect(inventoryActionError(projectId, result.error.message));
  revalidatePath("/developer/projects");
  redirect(`${projectPortalHref(projectId, "section=inventory")}&success=${encodeURIComponent("Inventory filter saved.")}`);
}

async function saveProjectTemplateAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_projects");
  const projectId = formData.get("projectId")?.toString();
  const name = formData.get("name")?.toString().trim();
  const description = formData.get("description")?.toString().trim() || null;
  const payload = parseJsonObject(formData.get("payload"));
  if (!projectId || !name || !payload) {
    if (projectId) redirect(inventoryActionError(projectId, "Provide a template name and valid project payload."));
    return;
  }
  const result = await saveDeveloperProjectTemplate(session.developerId, session.accountId, {
    templateType: "project",
    name,
    description,
    payload,
    sourceProjectId: projectId,
  });
  if (result.error) redirect(inventoryActionError(projectId, result.error.message));
  revalidatePath("/developer/projects");
  redirect(`${projectPortalHref(projectId, "section=settings")}&success=${encodeURIComponent("Project template saved.")}`);
}

async function cloneProjectTemplateAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_projects");
  const templateId = formData.get("templateId")?.toString();
  const name = formData.get("name")?.toString().trim() || null;
  if (!templateId) return;
  const result = await cloneDeveloperProjectFromTemplate(session.developerId, session.accountId, templateId, name);
  if (result.error || !result.data) redirect(`/developer/projects?error=${encodeURIComponent(result.error?.message ?? "Unable to clone project template.")}`);
  revalidatePath("/developer/projects");
  redirect(`/developer/projects?project=${result.data}&success=${encodeURIComponent("Project cloned as a draft.")}`);
}

async function resolveFeedbackAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_projects");
  const projectId = formData.get("projectId")?.toString();
  const feedbackId = formData.get("feedbackId")?.toString();
  if (!projectId || !feedbackId) return;
  const result = await resolveDeveloperPublicationFeedback(session.developerId, feedbackId, session.accountId);
  if (result.error) redirect(inventoryActionError(projectId, result.error.message));
  revalidatePath("/developer/projects");
  redirect(`${projectPortalHref(projectId, "section=overview")}&success=${encodeURIComponent("Publication feedback marked resolved.")}`);
}
