import { revalidatePath } from "next/cache";
import { DownPaymentStages } from "@/components/DownPaymentStages";
import { parseDownPaymentStages, parseLineItems, validDeliveryDate } from "@/lib/projectMerchandising";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { ArrowLeft, CalendarDays, ChevronRight, CircleAlert, ImagePlus, Layers3, MoreHorizontal, Smartphone } from "lucide-react";
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
import { PROJECT_WIZARD_DRAFT_KEY } from "@/components/ProjectWizard";
import { DeveloperProjectCreateForm } from "@/components/DeveloperProjectCreateForm";
import { LocalStorageCleanup } from "@/components/LocalStorageCleanup";
import { MobilePreviewButton } from "@/components/MobilePreviewButton";
import { DeveloperMediaField } from "@/components/DeveloperMediaField";
import { retainedMediaInput } from "@/lib/mediaEdit";
import { VariantOutdoorFields } from "@/components/VariantOutdoorFields";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { DeveloperProjectPortfolioBoard, type DeveloperPortfolioProject } from "@/components/DeveloperProjectPortfolioBoard";
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
import {
  normalizeProjectInventoryView,
  normalizeProjectWorkspaceSection,
  projectSectionQuery,
  projectSetupAction,
  type ProjectInventoryView,
  type ProjectWorkspaceSection,
} from "@/lib/developerProjectFlow";

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
  { slug: "ev_charger", label: "EV Charger" },
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
  is_demo?: boolean | null;
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

const getProjectPublicationStatus = (project: ProjectPublicationInput, developerIsDemo = false) => {
  if (project.lifecycle_state === "archived") return { label: "Archived", tone: "bg-neutral-200 text-neutral-700" };
  const published = project.is_demo || developerIsDemo
    ? { label: "Published · demo hidden", tone: "bg-amber-100 text-amber-800" }
    : { label: "Published to mobile", tone: "bg-emerald-100 text-emerald-800" };
  if (project.publication_status === "published") return published;
  if (project.publication_status === "changes_requested") return { label: "Changes requested", tone: "bg-rose-100 text-rose-800" };
  if (project.publication_status === "submitted") return { label: "Submitted for review", tone: "bg-amber-100 text-amber-800" };
  if (project.publication_status === "ready") return { label: "Ready to submit", tone: "bg-blue-100 text-blue-800" };
  if (project.publication_status === "draft") return { label: "Draft", tone: "bg-neutral-100 text-neutral-700" };
  if (project.approval_status === "approved" && project.lifecycle_state === "published" && project.published_at) {
    return published;
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
  // Keep the local checklist aligned with developer_project_publication_check:
  // the current database contract counts every project_unit_types row,
  // including archived rows, until the server function is changed.
  const unitTypes = project.project_unit_types ?? [];
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
  // The persisted quality score describes the last server-side review. It can
  // be stale immediately after a developer edits the project, so the portal
  // score always reflects the current fields rendered in this request.
  const score = Math.round((complete / checks.length) * 100);
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
  if (!Number.isFinite(parsed)) throw new Error("Enter a valid payment plan number.");
  return parsed;
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
  const stages = plan.down_payment_stages?.map((stage) => `${stage.percent}% after ${stage.after_months} months`).join(" + ");
  const years = plan.installment_years != null ? `rest over ${plan.installment_years} years` : null;
  const frequency = plan.payment_frequency ? `${plan.payment_frequency.toLowerCase()} payments` : null;
  const discount = plan.discount_percent ? `${plan.discount_percent}% discount` : null;
  return [plan.title, down, stages, years, frequency, discount].filter(Boolean).join(" · ");
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
    inventoryView?: string | string[];
    addUnitType?: string | string[];
    editUnitType?: string | string[];
    phaseForm?: string | string[];
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
  const requestedInventoryView = typeof resolvedSearchParams?.inventoryView === "string" ? resolvedSearchParams.inventoryView : null;
  const openAddUnitType = resolvedSearchParams?.addUnitType === "1";
  const editUnitTypeId = typeof resolvedSearchParams?.editUnitType === "string" ? resolvedSearchParams.editUnitType : null;
  const requestedPhaseForm = typeof resolvedSearchParams?.phaseForm === "string" ? resolvedSearchParams.phaseForm : null;
  const requestedWorkspaceSection: ProjectWorkspaceSection = normalizeProjectWorkspaceSection(requestedSection, canManageProjects);
  const workspaceSection: ProjectWorkspaceSection = requestedWorkspaceSection;
  const inventoryView: ProjectInventoryView = normalizeProjectInventoryView(requestedInventoryView, canManageProjects);
  if (!canManageInventory) redirect("/developer?error=Inventory+access+is+not+enabled+for+this+role");
  if (showCreateWizard && !canManageProjects) redirect("/developer/projects?section=inventory&error=Only+project+managers+and+developer+super+admins+can+create+projects");
  const showProjectSettings = workspaceSection === "settings" || resolvedSearchParams?.settings === "1";
  const showArchivedProjects = resolvedSearchParams?.status === "archived";
  const showArchivedInventory = resolvedSearchParams?.inventory === "archived";
  const templateProject =
    showCreateWizard && templateProjectId
      ? projects.find((project) => project.id === templateProjectId)
      : undefined;
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
  const focusedUnitType = focusUnitTypeId
    ? selectedProject?.project_unit_types?.find((unit) => unit.id === focusUnitTypeId)
    : undefined;
  const requestedPhaseExists = Boolean(requestedPhaseId && selectedProjectPhases.some((phase) => phase.id === requestedPhaseId));
  // A direct unit/variant link owns its phase context. Do not silently switch
  // it to the first active phase when the focused phase is archived or the
  // requested phase is no longer in the active list.
  const selectedPhaseId = focusedUnitType?.phase_id ?? (
    requestedPhaseExists
      ? requestedPhaseId
      : focusUnitTypeId || requestedPhaseId === "new"
        ? null
        : activeProjectPhases[0]?.id ?? null
  );
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
    showVariantWizard
      ? focusUnitTypeId
        ? selectedProjectUnitTypes.some((unit) => unit.id === focusUnitTypeId) ? focusUnitTypeId : null
        : selectedProjectUnitTypes[0]?.id ?? null
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
  const portfolioProjects: DeveloperPortfolioProject[] = statusFilteredProjects.map((project) => {
    const readiness = getProjectReadiness(project);
    const publication = getProjectPublicationStatus(project, Boolean(profile?.is_demo));
    const heroMedia = (project.hero_media as ProjectMedia | null) ?? null;
    const imageUrl = heroMedia?.heroImageUrl ?? heroMedia?.hero_image_url ?? (Array.isArray(heroMedia?.images) ? heroMedia.images[0] : null) ?? null;
    const phases = (project.developer_project_phases ?? []).filter((phase) => !phase.archived_at && phase.lifecycle_state !== "archived").length;
    const activeUnitTypes = (project.project_unit_types ?? []).filter((unit) => !unit.archived_at);
    const stockCount = activeUnitTypes.reduce((total, unit) => total + (unit.project_unit_variants ?? []).filter((variant) => !variant.archived_at).reduce((variantTotal, variant) => variantTotal + Math.max(0, Number(variant.stock_count ?? 0)), 0), 0);
    const publicationAttention = publication.label === "Changes requested";
    const blocker = publicationAttention
      ? "Review requested changes"
      : readiness.missing.length
        ? `Missing ${readiness.missing[0].toLocaleLowerCase()}`
        : null;
    const publicationState: DeveloperPortfolioProject["publicationState"] = publication.label === "Published to mobile"
      ? "published"
      : publicationAttention
        ? "attention"
        : "review";
    const nextAction = blocker
      ? blocker
      : publication.label === "Published to mobile"
        ? "Live on mobile"
        : publication.label === "Submitted for review"
          ? "Awaiting admin review"
          : publication.label === "Published · demo hidden"
            ? "Demo hidden from customers"
            : "Submit for publication";
    return {
      id: project.id,
      name: project.name,
      imageUrl,
      logoUrl: project.project_logo_url ?? null,
      launchStatus: normalizeLaunchStatus(project.launch_status),
      publicationLabel: publication.label,
      publicationState,
      readiness: readiness.score,
      phases,
      inventoryCount: stockCount || activeUnitTypes.length,
      inventoryLabel: stockCount ? "units" : "unit types",
      summary: [project.location, project.project_types?.slice(0, 2).join(" · ")].filter(Boolean).join(" · ") || getLaunchStatusLabel(project.launch_status),
      nextAction,
      blocker,
      updatedLabel: "Project details are up to date",
      isDemo: Boolean(project.is_demo || profile?.is_demo),
    };
  });
  const selectedReadiness = selectedProject ? getProjectReadiness(selectedProject) : null;
  const incompleteUnitType = selectedProject?.project_unit_types?.find((unit) =>
    !unit.label?.trim() || Number(unit.min_price) < 100000 || Number(unit.unit_area_min) < 10 || !unit.description?.trim(),
  );
  const selectedSetupAction = selectedProject && selectedReadiness
    ? projectSetupAction({
        projectId: selectedProject.id,
        missing: selectedReadiness.missing,
        activePhaseCount: activeProjectPhases.length,
        selectedPhaseId,
        incompleteUnitTypeId: incompleteUnitType?.id ?? null,
        incompleteUnitTypePhaseId: incompleteUnitType?.phase_id ?? null,
        incompleteUnitTypeArchived: Boolean(incompleteUnitType?.archived_at),
      })
    : null;
  const selectedPublication = selectedProject ? getProjectPublicationStatus(selectedProject, Boolean(profile?.is_demo)) : null;
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
      description={selectedProjectId ? "Project portal · phases, inventory, and publication" : "Portfolio and mobile publication readiness."}
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
              <h2 className="mt-1 text-xl font-semibold text-neutral-900">Create a project</h2>
              <p className="mt-1 text-sm text-neutral-500">Save shared details, then set up phases and inventory.</p>
            </div>
            <Link
              href="/developer/projects"
              className="rounded-full border border-black/10 px-3 py-1 text-xs text-neutral-600 hover:border-black/30 hover:text-black"
            >
              Cancel
            </Link>
          </div>
          <div>
          <DeveloperProjectCreateForm
            action={upsertProjectAction}
            developerId={session.developerId}
            projects={projects.filter((project) => project.lifecycle_state !== "archived")}
            templateProject={templateProject ?? null}
          />
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
                href={`/developer/projects?project=${selectedProjectId}&${projectSectionQuery("inventory", { inventoryView: "types", phaseId: selectedPhaseId })}&addUnitType=1#add-property-types`}
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
          <header id="project-overview" className="relative scroll-mt-24 overflow-hidden rounded-[1.75rem] border border-black/5 bg-[#ece7dc]">
            {selectedHeroImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedHeroImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : null}
            <div className={`absolute inset-0 ${selectedHeroImage ? "bg-gradient-to-r from-black/80 via-black/70 to-black/60" : "bg-[radial-gradient(circle_at_90%_20%,rgba(255,255,255,0.9),transparent_42%)]"}`} />
            <div data-dashboard-surface={selectedHeroImage ? "dark" : "light"} className={`relative p-4 sm:p-6 ${selectedHeroImage ? "text-white" : "text-neutral-950"}`}>
              <Link href="/developer/projects" className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur ${selectedHeroImage ? "bg-black/60 text-white hover:bg-black/70" : "bg-white/75 text-neutral-700 hover:bg-white"}`}>
                <ArrowLeft aria-hidden="true" size={14} /> Back to projects
              </Link>
              <div className="mt-10 flex flex-wrap items-end justify-between gap-4 sm:mt-14">
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl border ${selectedHeroImage ? "border-white/25 bg-white/90" : "border-black/10 bg-white"}`}>
                    {selectedProject?.project_logo_url ?? profile?.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={selectedProject?.project_logo_url ?? profile!.logo_url!} alt={`${selectedProject?.name ?? profile?.name ?? "Developer"} logo`} className="size-12 object-contain" />
                    ) : <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400">Logo</span>}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{selectedProject?.name ?? "Project portal"}</h2>
                      {selectedProject?.is_demo ? <span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-amber-800">Demo</span> : null}
                    </div>
                    <p className={`mt-1 text-sm ${selectedHeroImage ? "text-white/70" : "text-neutral-600"}`}>{selectedProject?.location ?? getLaunchStatusLabel(selectedProject?.launch_status)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {selectedPublication ? <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${selectedPublication.tone}`}>{selectedPublication.label}</span> : null}
                      {selectedReadiness ? <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${selectedHeroImage ? "bg-white/15 text-white" : "bg-white/80 text-neutral-700"}`}>{selectedReadiness.score}% complete</span> : null}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!selectedReadiness?.hasHero && canManageProjects ? <a href={`/developer/projects?project=${selectedProjectId}&${projectSectionQuery("settings", { phaseId: selectedPhaseId })}&settings=1#project-media`} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800"><ImagePlus aria-hidden="true" size={15} /> Add hero media</a> : null}
                  <details className="relative">
                    <summary aria-label="More project actions" className={`grid size-10 cursor-pointer list-none place-items-center rounded-full ${selectedHeroImage ? "bg-black/60 text-white hover:bg-black/70" : "bg-white/80 text-neutral-700 hover:bg-white"}`}><MoreHorizontal aria-hidden="true" size={18} /></summary>
                    <div className="absolute right-0 z-20 mt-2 w-48 rounded-2xl border border-black/10 bg-white p-2 text-xs text-neutral-700 shadow-xl">
                      <a href={INVENTORY_TEMPLATE_PATH} download className="block rounded-xl px-3 py-2 hover:bg-neutral-50">Download inventory template</a>
                      {canManageProjects && selectedProject?.lifecycle_state === "archived" ? <form action={restoreProjectAction}><input type="hidden" name="projectId" value={selectedProjectId} /><ConfirmSubmitButton className="w-full rounded-xl px-3 py-2 text-left text-emerald-700 hover:bg-emerald-50" confirmMessage="Restore this project to your active workspace? It will return to draft review before becoming visible again." pendingLabel="Restoring…">Restore project</ConfirmSubmitButton></form> : canManageProjects ? <form action={archiveProjectAction}><input type="hidden" name="projectId" value={selectedProjectId} /><ConfirmSubmitButton className="w-full rounded-xl px-3 py-2 text-left text-amber-700 hover:bg-amber-50" confirmMessage="Archive this project? Its inventory and leads will be retained and it will be hidden from active workspaces." pendingLabel="Archiving…">Archive project</ConfirmSubmitButton></form> : null}
                    </div>
                  </details>
                </div>
              </div>
            </div>
            <nav aria-label="Project sections" className="relative grid grid-cols-3 gap-1 border-t border-black/5 bg-white/95 p-2 text-xs font-semibold backdrop-blur sm:flex sm:overflow-x-auto">
              {canManageProjects ? <a aria-current={workspaceSection === "overview" ? "page" : undefined} className={`rounded-xl px-4 py-2.5 text-center sm:shrink-0 ${workspaceSection === "overview" ? "bg-black text-white" : "text-neutral-600 hover:bg-black/5 hover:text-black"}`} href={`/developer/projects?project=${selectedProjectId}&${projectSectionQuery("overview", { phaseId: selectedPhaseId })}#project-overview`}>Overview</a> : null}
              {canManageProjects ? <a aria-current={workspaceSection === "phases" ? "page" : undefined} className={`rounded-xl px-4 py-2.5 text-center sm:shrink-0 ${workspaceSection === "phases" ? "bg-black text-white" : "text-neutral-600 hover:bg-black/5 hover:text-black"}`} href={`/developer/projects?project=${selectedProjectId}&${projectSectionQuery("phases", { phaseId: selectedPhaseId })}#project-phases`}>Phases</a> : null}
              <a aria-current={workspaceSection === "inventory" ? "page" : undefined} className={`rounded-xl px-4 py-2.5 text-center sm:shrink-0 ${workspaceSection === "inventory" ? "bg-black text-white" : "text-neutral-600 hover:bg-black/5 hover:text-black"}`} href={`/developer/projects?project=${selectedProjectId}&${projectSectionQuery("inventory", { phaseId: selectedPhaseId, inventoryView })}#project-inventory`}>Inventory</a>
              {canManageProjects ? <a aria-current={workspaceSection === "commercial" ? "page" : undefined} className={`rounded-xl px-4 py-2.5 text-center sm:shrink-0 ${workspaceSection === "commercial" ? "bg-black text-white" : "text-neutral-600 hover:bg-black/5 hover:text-black"}`} href={`/developer/projects?project=${selectedProjectId}&${projectSectionQuery("commercial", { phaseId: selectedPhaseId })}#project-commercial`}>Payment plans</a> : null}
              {canManageProjects ? <a aria-current={workspaceSection === "review" ? "page" : undefined} className={`rounded-xl px-4 py-2.5 text-center sm:shrink-0 ${workspaceSection === "review" ? "bg-black text-white" : "text-neutral-600 hover:bg-black/5 hover:text-black"}`} href={`/developer/projects?project=${selectedProjectId}&${projectSectionQuery("review", { phaseId: selectedPhaseId })}#project-review`}>Review</a> : null}
              {canManageProjects ? <a aria-current={workspaceSection === "settings" ? "page" : undefined} className={`rounded-xl px-4 py-2.5 text-center sm:shrink-0 ${workspaceSection === "settings" ? "bg-black text-white" : "text-neutral-600 hover:bg-black/5 hover:text-black"}`} href={`/developer/projects?project=${selectedProjectId}&${projectSectionQuery("settings", { phaseId: selectedPhaseId })}&settings=1#project-settings`}>Project details</a> : null}
            </nav>
          </header>

          {workspaceSection === "phases" ? <DeveloperProjectPhaseBoard
            projectId={selectedProjectId}
            phases={selectedProjectPhases}
            selectedPhaseId={selectedPhaseId}
            phaseForm={requestedPhaseForm === "edit" ? "edit" : requestedPhaseId === "new" ? "create" : null}
            inventoryCounts={inventoryCounts}
            createAction={createProjectPhaseAction}
            updateAction={updateProjectPhaseAction}
            archiveAction={archiveProjectPhaseAction}
            restoreAction={restoreProjectPhaseAction}
            hrefForPhase={(phaseId) => `/developer/projects/${selectedProjectId}?section=phases${phaseId ? `&phase=${phaseId}` : ""}#project-phases`}
            canManagePhases={canManageProjects}
            unitTypeSummaries={selectedProject?.project_unit_types ?? []}
            hrefForInventory={(phaseId) => `/developer/projects?project=${selectedProjectId}&${projectSectionQuery("inventory", { inventoryView: "types", phaseId })}#project-inventory`}
          /> : null}

          {workspaceSection === "review" && selectedReadiness ? (
            <DeveloperPublicationWorkflow
              projectId={selectedProjectId}
              phaseId={selectedPhaseId}
              status={selectedProject?.lifecycle_state === "archived" ? "archived" : selectedProject?.publication_status ?? (selectedProject?.approval_status === "rejected" ? "changes_requested" : selectedProject?.approval_status === "approved" ? "approved" : "draft")}
              readiness={selectedReadiness}
              markReadyAction={markProjectReadyAction}
              submitAction={submitProjectForReviewAction}
              isDemo={Boolean(selectedProject?.is_demo || profile?.is_demo)}
            />
          ) : null}

          {workspaceSection === "review" ? (
            <section id="project-review" className="grid scroll-mt-24 gap-4 lg:grid-cols-2" aria-label="Project review details">
              <DeveloperPublicationFeedbackPanel projectId={selectedProjectId} feedback={projectFeedback} resolveAction={resolveFeedbackAction} />
              <DeveloperVersionHistory projectId={selectedProjectId} versions={projectVersions} restoreAction={restoreInventoryVersionAction} />
            </section>
          ) : null}

          {workspaceSection === "inventory" ? (
            <>
              <nav aria-label="Inventory view" className="flex flex-wrap items-center gap-2 rounded-2xl border border-black/5 bg-white p-3">
                <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Inventory view</span>
                <a aria-current={inventoryView === "types" ? "page" : undefined} href={`/developer/projects?project=${selectedProjectId}&${projectSectionQuery("inventory", { inventoryView: "types", phaseId: selectedPhaseId })}#add-property-types`} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${inventoryView === "types" ? "border-black bg-black text-white" : "border-black/10 bg-neutral-50 text-neutral-600"}`}>Unit types</a>
                <a aria-current={inventoryView === "units" ? "page" : undefined} href={`/developer/projects?project=${selectedProjectId}&${projectSectionQuery("inventory", { inventoryView: "units", phaseId: selectedPhaseId })}#project-inventory`} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${inventoryView === "units" ? "border-black bg-black text-white" : "border-black/10 bg-neutral-50 text-neutral-600"}`}>Individual units</a>
              </nav>
              <nav aria-label="Inventory phase" className="flex flex-wrap gap-2 rounded-2xl border border-black/5 bg-white p-3">
                {activeProjectPhases.map((phase) => <a key={phase.id} aria-current={phase.id === selectedPhaseId ? "page" : undefined} href={`/developer/projects?project=${selectedProjectId}&${projectSectionQuery("inventory", { inventoryView, phaseId: phase.id })}`} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${phase.sales_status === "selling" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-black/10 bg-neutral-50 text-neutral-600"} ${phase.id === selectedPhaseId ? "ring-2 ring-black ring-offset-2" : ""}`}>{phase.name} · {phase.sales_status === "selling" ? "Currently selling" : (phase.sales_status ?? "upcoming").replaceAll("_", " ")}</a>)}
              </nav>
              {inventoryView === "units" ? <>
                <DeveloperInventoryGrid
                  key={`${selectedProjectId}:${selectedPhaseId}`}
                  projectId={selectedProjectId}
                  phaseId={selectedPhaseId}
                  phaseName={selectedPhase?.name ?? undefined}
                  rows={inventoryRows}
                  savedFilters={savedInventoryFilters}
                  bulkUpdateAction={bulkInventoryAction}
                  importAction={importInventoryRowsAction}
                  holdAction={holdInventoryAction}
                  releaseHoldAction={releaseInventoryHoldAction}
                  saveFilterAction={saveInventoryFilterAction}
                />
                <DeveloperPriceHistoryPanel history={priceHistory} />
              </> : null}
            </>
          ) : null}

          {workspaceSection === "overview" && selectedReadiness ? (
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]" aria-label="Project command overview">
              <div className="overflow-hidden rounded-[1.6rem] border border-black/5 bg-white">
                <div className="p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-400">Next release</p>
                      <h3 className="mt-1 text-lg font-semibold tracking-tight text-neutral-950">{selectedPhase ? `${selectedPhase.phase_order}. ${selectedPhase.name}` : "Create the first phase"}</h3>
                    </div>
                    <a href={`/developer/projects?project=${selectedProjectId}&${projectSectionQuery("phases", { phaseId: selectedPhaseId })}#project-phases`} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:border-black/25">Open phase <ChevronRight aria-hidden="true" size={14} /></a>
                  </div>
                  {selectedPhase ? (
                    <div className="mt-4 grid gap-3 rounded-2xl bg-[#f7f4ee] p-4 sm:grid-cols-3">
                      <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-white text-neutral-700"><CalendarDays aria-hidden="true" size={17} /></span><div><p className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">Launch</p><p className="mt-0.5 text-sm font-semibold text-neutral-800">{selectedPhase.launch_date?.slice(0, 10) ?? "Date not set"}</p></div></div>
                      <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-white text-neutral-700"><Layers3 aria-hidden="true" size={17} /></span><div><p className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">Unit types</p><p className="mt-0.5 text-sm font-semibold text-neutral-800">{inventoryCounts[selectedPhase.id] ?? 0} assigned</p></div></div>
                      <div><p className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">Release state</p><span className="mt-1 inline-flex rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-neutral-700">{getLaunchStatusLabel(selectedPhase.launch_status)}</span></div>
                    </div>
                  ) : <p className="mt-4 rounded-2xl border border-dashed border-black/10 bg-neutral-50 p-4 text-sm text-neutral-500">A phase keeps its launch details and inventory together.</p>}
                </div>

                <div className="border-t border-black/5 p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-neutral-900">Recent changes</h3><span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-400">Latest {Math.min(projectActivity.length, 3)}</span></div>
                  {projectActivity.length ? <ol className="mt-3 divide-y divide-black/5">{projectActivity.slice(0, 3).map((activity) => <li key={activity.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-neutral-800">{activity.action.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}</p><p className="mt-0.5 text-xs text-neutral-400">{activity.entity_type.replace(/_/g, " ")}</p></div><time className="shrink-0 text-[10px] text-neutral-400" dateTime={activity.created_at}>{new Date(activity.created_at).toLocaleDateString()}</time></li>)}</ol> : <p className="mt-3 rounded-2xl bg-neutral-50 p-4 text-xs text-neutral-500">No project changes recorded yet.</p>}
                </div>

                <div className="grid grid-cols-3 divide-x divide-black/5 border-t border-black/5 bg-neutral-50/70">
                  <a href={`/developer/projects?project=${selectedProjectId}&${projectSectionQuery("inventory", { inventoryView, phaseId: selectedPhaseId })}#project-inventory`} className="p-3 hover:bg-white sm:p-4"><p className="text-[9px] font-bold uppercase tracking-[0.18em] text-neutral-400">Inventory</p><p className="mt-1 text-xs font-semibold text-neutral-800">{impactSummary?.property_count ?? 0} active units</p></a>
                  <a href={`/developer/projects?project=${selectedProjectId}&${projectSectionQuery("commercial", { phaseId: selectedPhaseId })}#project-commercial`} className="p-3 hover:bg-white sm:p-4"><p className="text-[9px] font-bold uppercase tracking-[0.18em] text-neutral-400">Payment plans</p><p className="mt-1 text-xs font-semibold text-neutral-800">{asStructuredPlans(selectedProject?.payment_plan_templates).length} plans · {asLimitedTimeOffers(selectedProject?.limited_time_offers).length} offers</p></a>
                  <div className="p-3 sm:p-4"><p className="text-[9px] font-bold uppercase tracking-[0.18em] text-neutral-400">Publication</p><p className="mt-1 truncate text-xs font-semibold text-neutral-800">{selectedPublication?.label ?? "Draft"}</p></div>
                </div>
              </div>

              <aside className="rounded-[1.6rem] border border-black/5 bg-white p-4 sm:p-5" aria-label="Project completion">
                <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-400">Project completeness</p><p className="mt-1 text-2xl font-semibold text-neutral-950">{selectedReadiness.score}%</p></div><span className="grid size-11 place-items-center rounded-2xl bg-black text-white"><Smartphone aria-hidden="true" size={20} /></span></div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={selectedReadiness.score} aria-label="Project completion score"><span className={`block h-full rounded-full ${selectedReadiness.score >= 80 ? "bg-emerald-500" : selectedReadiness.score >= 50 ? "bg-amber-400" : "bg-rose-400"}`} style={{ width: `${selectedReadiness.score}%` }} /></div>
                {selectedReadiness.missing.length && selectedSetupAction ? <div className="mt-4 flex gap-3 rounded-2xl bg-amber-50 p-3 text-amber-900"><CircleAlert aria-hidden="true" className="mt-0.5 shrink-0" size={17} /><div><p className="text-xs font-semibold">Next step</p><p className="mt-1 text-xs leading-5">Add {selectedReadiness.missing[0].toLocaleLowerCase()} to continue toward mobile publication.</p><a href={selectedSetupAction.href} className="mt-3 inline-flex min-h-9 items-center gap-1 rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white">{selectedSetupAction.label}<ChevronRight aria-hidden="true" size={13} /></a></div></div> : <p className="mt-4 rounded-2xl bg-emerald-50 p-3 text-xs font-medium text-emerald-800">All local readiness checks are complete. Open Review when you are ready to send the project to Brixeler.</p>}
                <div className="mt-5 rounded-2xl border border-black/10 bg-[#f7f4ee] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400">Mobile card</p>
                  <div className="mt-3 overflow-hidden rounded-xl bg-white shadow-sm">
                    {selectedHeroImage ? <div className="h-24 bg-cover bg-center" style={{ backgroundImage: `url(${selectedHeroImage})` }} /> : <div className="grid h-20 place-items-center bg-neutral-100 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-400">Hero media needed</div>}
                    <div className="p-3"><p className="truncate text-sm font-semibold text-neutral-900">{selectedProject?.name}</p><p className="mt-1 truncate text-xs text-neutral-500">{selectedProject?.location ?? selectedProject?.description}</p></div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <MobilePreviewButton formId={`project-preview-${selectedProjectId}`} titleField="name" bodyField="description" typeField="launchStatus" label="Preview mobile" initialDraft={{ title: selectedProject?.name ?? "Project preview", body: selectedProject?.description ?? "Add a project description to preview the mobile card.", type: getLaunchStatusLabel(selectedProject?.launch_status) }} imageUrl={selectedHeroImage} />
                  <a href={`/developer/projects?project=${selectedProjectId}&${projectSectionQuery("review", { phaseId: selectedPhaseId })}#project-review`} className="inline-flex min-h-10 items-center rounded-full bg-black px-4 py-2 text-xs font-semibold text-white">Open Review</a>
                </div>
              </aside>
              <details className="rounded-2xl border border-black/5 bg-white p-4 xl:col-span-2">
                <summary className="cursor-pointer text-sm font-semibold">Project information & materials</summary>
                <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                  <div><p className="text-neutral-500">{[selectedProject?.location, selectedProject?.acres != null ? `${selectedProject.acres} acres` : null, selectedProject?.footprint != null ? `${selectedProject.footprint}% footprint` : null].filter(Boolean).join(" · ")}</p><p className="mt-2">Delivery: {selectedProject?.delivery_date ?? "Not set"}</p><p className="mt-2 text-neutral-600">{selectedProject?.amenities?.map((value: string) => AMENITIES.find((item) => item.slug === value)?.label ?? value).join(" · ") || "No shared facilities yet"}</p></div>
                  <ul className="list-inside list-disc text-neutral-600">{selectedProject?.selling_points?.map((point: string) => <li key={point}>{point}</li>)}</ul>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">{[{label:"Brochure",url:selectedHeroMedia?.brochureUrl},{label:"Masterplan",url:selectedHeroMedia?.masterplanUrl},...(selectedProject?.video_links ?? []).map((url: string,index: number)=>({label:`HD video ${index+1}`,url}))].filter((item)=>item.url && normalizeHttpMediaUrl(item.url)).map((item)=><a key={`${item.label}-${item.url}`} target="_blank" rel="noopener noreferrer" className="rounded-full border border-black/10 px-3 py-2 text-xs font-semibold" href={item.url}>{item.label}</a>)}</div>
              </details>
            </section>
          ) : null}

          {workspaceSection === "settings" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <DeveloperActivityTimeline activities={projectActivity} />
              <DeveloperTemplateManager
                projectId={selectedProjectId}
                projectName={selectedProject!.name}
                projectPayload={{ name: selectedProject!.name, selling_points: selectedProject!.selling_points, delivery_date: selectedProject!.delivery_date, description: selectedProject!.description, location: selectedProject!.location, hero_media: selectedProject!.hero_media, voice_notes: selectedProject!.voice_notes, video_links: selectedProject!.video_links, amenities: selectedProject!.amenities, payment_plans: selectedProject!.payment_plans, payment_plan_templates: selectedProject!.payment_plan_templates, limited_time_offers: selectedProject!.limited_time_offers, launch_status: selectedProject!.launch_status, launch_date: selectedProject!.launch_date, project_types: selectedProject!.project_types, phases: selectedProjectPhases.map((phase) => ({ ...phase, unit_types: (selectedProject!.project_unit_types ?? []).filter((unit) => unit.phase_id === phase.id) })) }}
                templates={projectTemplates}
                saveAction={saveProjectTemplateAction}
                cloneAction={cloneProjectTemplateAction}
              />
            </div>
          ) : null}

          <details id="project-settings" open={showProjectSettings} hidden={!showProjectSettings} className="scroll-mt-24 rounded-2xl border border-black/5 bg-neutral-50/80 p-4">
            <summary className="cursor-pointer list-none rounded-full border border-black/10 px-4 py-2 text-xs font-semibold text-neutral-600 hover:border-black/30 hover:text-black">
              Project details
            </summary>
              <div className="mt-4">
                <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">
                  Edit project details
                </p>
                <form id={`project-preview-${selectedProjectId}`} action={upsertProjectAction} className="mt-4 space-y-4">
                  <input type="hidden" name="projectId" value={selectedProjectId} />
                  <input type="hidden" name="returnSection" value="settings" />
                  <input type="hidden" name="returnPhaseId" value={selectedPhaseId ?? ""} />
                  <Field label="Project name" name="name" placeholder="Marina Vista Residences" required defaultValue={selectedProject?.name ?? ""} />
                  <Field label="Location" name="location" placeholder="North Coast, Ras El Hekma" defaultValue={selectedProject?.location ?? ""} />
                  <Field as="textarea" label="Project selling points" name="sellingPoints" placeholder="One selling point per line" maxLength={15050} defaultValue={selectedProject?.selling_points?.join("\n") ?? ""} />
                  <Field label="Expected delivery date" name="deliveryDate" type="date" defaultValue={selectedProject?.delivery_date ?? ""} />
                  <Field as="textarea" label="Additional project facilities" name="customFacilities" placeholder="One facility per line" defaultValue={selectedProject?.amenities?.filter((value: string) => !AMENITIES.some((item) => item.slug === value)).join("\n") ?? ""} />
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
                  <div id="commercial-settings" className="scroll-mt-28 rounded-2xl border border-black/10 bg-neutral-50 p-4">
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
                              <DownPaymentStages prefix={`paymentPlan${index}`} stages={plan?.down_payment_stages} />
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
                            <div className="md:col-span-5"><DownPaymentStages prefix="offer0" stages={offer?.down_payment_stages} /></div>
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
                  <div id="project-media" className="scroll-mt-28">
                    <DeveloperMediaField
                      label="Project images"
                      description="Upload, drop, or paste image URLs to refresh the project gallery."
                      fileName="project_images"
                      urlName="project_image_urls"
                      accept="image/*"
                      multiple
                      currentValue={phaseHeroImageFromMedia((selectedProject?.hero_media as ProjectMedia | null) ?? null)}
                    />
                  </div>
                  <DeveloperMediaField label="Project brochure (PDF)" fileName="project_brochure" urlName="project_brochure_url" accept="application/pdf" currentValue={(selectedProject?.hero_media as ProjectMedia | null)?.brochureUrl ?? null} />
                  <DeveloperMediaField label="Masterplan" fileName="project_masterplan" urlName="project_masterplan_url" accept="application/pdf,image/*" currentValue={selectedHeroMedia?.masterplanUrl ?? null} />
                  <DeveloperMediaField label="Voice notes" fileName="voice_notes" urlName="voice_note_urls" accept="audio/*" multiple currentValue={selectedProject?.voice_notes?.length ? `${selectedProject.voice_notes.length} existing notes` : null} />
                  <DeveloperMediaField label="HD project videos" description="Upload originals or paste hosted HD video URLs." fileName="project_videos" urlName="project_video_urls" accept="video/*" multiple currentValue={selectedProject?.video_links?.length ? `${selectedProject.video_links.length} existing videos` : null} />
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
            href={`/developer/projects?project=${selectedProjectId}&${projectSectionQuery("inventory", { inventoryView: "types", phaseId: selectedPhaseId })}#project-inventory`}
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
                href={`/developer/projects?project=${selectedProjectId}&${projectSectionQuery("inventory", { inventoryView: "types", phaseId: selectedPhaseId })}#project-inventory`}
                className="rounded-full border border-black/10 px-3 py-1 text-xs text-neutral-600 hover:border-black/30 hover:text-black"
              >
                Close
              </a>
            </div>
            <div className="mt-4">
              <VariantForm
                projectId={selectedProjectId}
                unitTypeId={modalUnitTypeId}
                phaseId={resolvedUnitType?.phase_id ?? selectedPhaseId}
                unitTypeCategory={resolvedUnitType?.category}
                unitTypeLabel={resolvedUnitType?.label ?? "Unit type"}
                variant={resolvedVariant}
              />
            </div>
          </div>
        </div>
      ) : null}

      {!showCreateWizard && setupStep !== "types" && !selectedProjectId ? (
        <DeveloperProjectPortfolioBoard projects={portfolioProjects} canCreateProjects={canManageProjects} archived={showArchivedProjects} />
      ) : null}

      {!showCreateWizard && setupStep !== "types" && selectedProjectId && (workspaceSection === "inventory" || workspaceSection === "commercial") ? (
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
            const publicationStatus = getProjectPublicationStatus(project, Boolean(profile?.is_demo));
            const readiness = getProjectReadiness(project);
            return (
            <article key={project.id} className="contents">
              <div className="hidden">
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
              <div className="hidden">
                <div className="flex items-center justify-between gap-2 text-xs text-neutral-500"><span>Project completeness</span><span className="dashboard-number font-semibold text-neutral-800">{readiness.score}%</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100"><span className={`block h-full rounded-full ${readiness.score >= 80 ? "bg-emerald-500" : readiness.score >= 50 ? "bg-amber-400" : "bg-rose-400"}`} style={{ width: `${readiness.score}%` }} /></div>
              </div>
              <div className="hidden">
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
              <details id={selectedProjectId === project.id ? "project-commercial" : undefined} hidden={workspaceSection !== "commercial"} className="scroll-mt-24 rounded-[1.6rem] border border-black/5 bg-white p-4 sm:p-5" open>
                <summary className="cursor-pointer list-none text-sm font-semibold text-neutral-900">Payment plans</summary>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-neutral-500">The plans and offers agents see for this project.</p><a href={`/developer/projects?project=${project.id}&${projectSectionQuery("settings", { phaseId: selectedPhaseId })}&settings=1#commercial-settings`} className="rounded-full border border-black/10 px-3 py-2 text-xs font-semibold text-neutral-700 hover:border-black/25">Edit payment plans</a></div>
                {asStructuredPlans(project.payment_plan_templates).length ? (
                  <>
                  <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Payment plans</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {asStructuredPlans(project.payment_plan_templates).slice(0, 3).map((plan, index) => (
                      <p key={`${project.id}-plan-${index}`} className="rounded-2xl bg-neutral-50 p-3 text-xs leading-5 text-neutral-600">{formatPlanSummary(plan)}</p>
                    ))}
                    {asLimitedTimeOffers(project.limited_time_offers).map((offer, index) => (
                      <p key={`${project.id}-offer-${index}`} className="rounded-2xl bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-800">
                        Limited offer: {formatPlanSummary(offer)}
                      </p>
                    ))}
                  </div>
                  </>
                ) : (
                  <p className="mt-2 text-xs text-neutral-500">No payment plans added yet. Open Settings to add the commercial terms agents should use.</p>
                )}
              </details>
              <div hidden={workspaceSection !== "inventory" || inventoryView !== "types"}>
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
                        {!showArchivedInventory ? <a href={`/developer/projects?project=${project.id}&${projectSectionQuery("inventory", { inventoryView: "types", phaseId: selectedPhaseId })}&addUnitType=1#add-property-types`} className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold text-neutral-600 hover:border-black/30 hover:text-black">Add unit type</a> : null}
                        <a href={`/developer/projects?project=${project.id}&${projectSectionQuery("inventory", { inventoryView: "types", phaseId: selectedPhaseId })}&inventory=${showArchivedInventory ? "active" : "archived"}#project-inventory`} className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold text-neutral-600 hover:border-black/30 hover:text-black">
                          {showArchivedInventory ? "View active inventory" : "View archived inventory"}
                        </a>
                      </div>
                    </div>
                    {inventoryUnitTypes.length ? (
                      <div className="mt-3 space-y-3">
                        {inventoryUnitTypes.map((unit) => (
                          <div id={`unit-type-row-${unit.id}`} key={unit.id} className="rounded-2xl border border-black/5 bg-white p-3 text-sm text-neutral-700">
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
                                  <input type="hidden" name="phaseId" value={unit.phase_id ?? selectedPhaseId ?? ""} />
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
                                      href={`/developer/projects?project=${project.id}&${projectSectionQuery("inventory", { inventoryView: "types", phaseId: unit.phase_id ?? selectedPhaseId })}&inventory=${showArchivedInventory ? "archived" : "active"}&unitType=${unit.id}&variants=1&variant=${variant.id}`}
                                      className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-neutral-700 hover:border-black/30"
                                    >
                                      {formatVariantChip(variant)}
                                    </a>
                                  ))}
                                  {!showArchivedInventory ? <a href={`/developer/projects?project=${project.id}&${projectSectionQuery("inventory", { inventoryView: "types", phaseId: unit.phase_id ?? selectedPhaseId })}&unitType=${unit.id}&variants=1`} className="rounded-full border border-dashed border-black/20 px-3 py-1 text-xs text-neutral-500 hover:border-black/40 hover:text-neutral-700">+ Add variant</a> : null}
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
                                  {!showArchivedInventory ? <a href={`/developer/projects?project=${project.id}&${projectSectionQuery("inventory", { inventoryView: "types", phaseId: unit.phase_id ?? selectedPhaseId })}&unitType=${unit.id}&variants=1`} className="mt-3 inline-flex rounded-full border border-black/10 px-3 py-1 text-xs font-semibold text-neutral-600 hover:border-black/30 hover:text-black">Add first variant</a> : null}
                              </div>
                            )}
                            <details id={`unit-type-editor-${unit.id}`} open={editUnitTypeId === unit.id} className="mt-3 rounded-xl border border-black/10 bg-neutral-50 p-3">
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
                    {!showArchivedInventory ? <details id="add-property-types" open={openAddUnitType} className="mt-4 rounded-2xl border border-dashed border-black/10 bg-white p-4">
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
          <span className="text-xs text-neutral-500">Current: {unitType.hero_image_url}<label className="block"><input type="checkbox" name="unitHeroImage_remove" value="1" /> Remove current image</label></span>
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
  phaseId,
  unitTypeCategory,
  unitTypeLabel,
  variant,
}: {
  projectId: string;
  unitTypeId: string;
  phaseId?: string | null;
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
        <input type="hidden" name="phaseId" value={phaseId ?? ""} />
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
          <input type="hidden" name="unitTypeId" value={unitTypeId} />
          <input type="hidden" name="phaseId" value={phaseId ?? ""} />
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
  const requestedReturnSection = formData.get("returnSection")?.toString();
  const returnSection: ProjectWorkspaceSection = ["overview", "phases", "inventory", "commercial", "review", "settings"].includes(requestedReturnSection ?? "")
    ? requestedReturnSection as ProjectWorkspaceSection
    : "overview";
  const returnPhaseId = formData.get("returnPhaseId")?.toString() || null;
  const returnInventoryView = returnSection === "inventory" ? "types" as const : undefined;
  const invalidTarget = id
    ? projectPortalHref(id, projectSectionQuery(returnSection, { phaseId: returnPhaseId, inventoryView: returnInventoryView }))
    : "/developer/projects?create=1";
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
  const deliveryDate = formData.get("deliveryDate")?.toString().trim() || null;
  let sellingPoints: string[];
  try { sellingPoints = parseLineItems(formData.get("sellingPoints")?.toString() ?? "", "Selling points"); }
  catch (error) { redirect(`${invalidTarget}&error=${encodeURIComponent((error as Error).message)}`); }
  if (!validDeliveryDate(deliveryDate ?? "")) redirect(`${invalidTarget}&error=${encodeURIComponent("Enter a valid delivery date.")}`);
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
  try { amenities.push(...parseLineItems(formData.get("customFacilities")?.toString() ?? "", "Facilities")); }
  catch (error) { redirect(`${invalidTarget}&error=${encodeURIComponent((error as Error).message)}`); }
  let paymentPlanTemplates: StructuredPaymentPlan[];
  let limitedTimeOffers: LimitedTimeOffer[];
  try {
  paymentPlanTemplates = [0, 1, 2]
    .map((index) => {
      const title = formData.get(`paymentPlanTitle_${index}`)?.toString().trim() || null;
      const downPayment = toPlanNumber(formData.get(`paymentPlanDown_${index}`)?.toString());
      const years = toPlanNumber(formData.get(`paymentPlanYears_${index}`)?.toString());
      const discount = toPlanNumber(formData.get(`paymentPlanDiscount_${index}`)?.toString());
      const frequency = formData.get(`paymentPlanFrequency_${index}`)?.toString().trim() || null;
      const stages = parseDownPaymentStages(formData, `paymentPlan${index}`, downPayment);
      if (!title && downPayment == null && years == null && discount == null && !stages.length) return null;
      return {
        title,
        down_payment_percent: downPayment,
        down_payment_stages: stages,
        installment_years: years,
        discount_percent: discount,
        payment_frequency: frequency,
      } satisfies StructuredPaymentPlan;
    })
    .filter(Boolean) as StructuredPaymentPlan[];
  limitedTimeOffers = [0]
    .map((index) => {
      const offerTitle = formData.get(`offerTitle_${index}`)?.toString().trim() || null;
      const downPayment = toPlanNumber(formData.get(`offerDown_${index}`)?.toString());
      const years = toPlanNumber(formData.get(`offerYears_${index}`)?.toString());
      const discount = toPlanNumber(formData.get(`offerDiscount_${index}`)?.toString());
      const frequency = formData.get(`offerFrequency_${index}`)?.toString().trim() || null;
      const stages = parseDownPaymentStages(formData, `offer${index}`, downPayment);
      if (!offerTitle && downPayment == null && years == null && discount == null && !stages.length) return null;
      return {
        offer_title: offerTitle,
        down_payment_stages: stages,
        title: offerTitle,
        down_payment_percent: downPayment,
        installment_years: years,
        discount_percent: discount,
        payment_frequency: frequency,
      } satisfies LimitedTimeOffer;
    })
    .filter(Boolean) as LimitedTimeOffer[];
  } catch (error) { redirect(`${invalidTarget}&error=${encodeURIComponent((error as Error).message)}`); }
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
    pastedProjectLogoUrl = parseHttpMediaUrls(retainedMediaInput(formData, "project_logo", "project_logo_url"), "Project logo", 1)[0] ?? null;
    pastedImageUrls = parseHttpMediaUrls(retainedMediaInput(formData, "project_images", "project_image_urls"), "Project images", 20);
    pastedVoiceUrls = parseHttpMediaUrls(retainedMediaInput(formData, "voice_notes", "voice_note_urls"), "Voice notes", 10);
    pastedVideoUrls = parseHttpMediaUrls(retainedMediaInput(formData, "project_videos", "project_video_urls"), "Project videos", 10);
    pastedBrochureUrl = parseHttpMediaUrls(retainedMediaInput(formData, "project_brochure", "project_brochure_url"), "Project brochure", 1)[0] ?? null;
    pastedMasterplanUrl = parseHttpMediaUrls(retainedMediaInput(formData, "project_masterplan", "project_masterplan_url"), "Project masterplan", 1)[0] ?? null;
    pastedInventoryUrl = parseHttpMediaUrls(retainedMediaInput(formData, "project_inventory", "project_inventory_url"), "Inventory template", 1)[0] ?? null;
  } catch (error) {
    redirect(`${invalidTarget}&error=${encodeURIComponent(error instanceof Error ? error.message : "Enter valid media URLs.")}`);
  }

  if (isFile(inventoryFile) && !isExcelTemplateFile(inventoryFile)) {
    redirect(`${invalidTarget}&error=${encodeURIComponent("Inventory must be uploaded using the Brixeler .xlsx template.")}`);
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
  if (formData.get("project_images_remove") === "1") { delete heroMedia.images; delete heroMedia.heroImageUrl; delete heroMedia.hero_image_url; heroMediaUpdated = true; }
  if (formData.get("project_brochure_remove") === "1") { delete heroMedia.brochureUrl; heroMediaUpdated = true; }
  if (formData.get("project_masterplan_remove") === "1") { delete heroMedia.masterplanUrl; heroMediaUpdated = true; }
  if (formData.get("project_logo_remove") === "1") projectLogoUrl = null;
  if (formData.get("project_inventory_remove") === "1") inventoryUrl = null;
  if (formData.get("voice_notes_remove") === "1") voiceNoteUrls = [];
  if (formData.get("project_videos_remove") === "1") videoUrls = [];
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
    redirect(`${invalidTarget}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to upload project media.")}`);
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
    delivery_date: deliveryDate,
    selling_points: sellingPoints,
    eoi_value_apt: eoiValueApt,
    eoi_value_villa: eoiValueVilla,
    ch_fees: chFees,
    project_types: projectTypes,
    inventory_url: inventoryUrl,
    project_logo_url: projectLogoUrl,
    hero_media: heroMediaUpdated ? heroMedia : undefined,
    voice_notes: voiceNoteUrls,
    video_links: videoUrls,
    amenities,
  });
  if (!error && data?.id) {
    const commissionResult = await upsertProjectCommissionRule({
      developerId: session.developerId,
      projectId: data.id,
      commissionRateRaw,
      platformShareRaw,
    });
    if (commissionResult?.error) {
      redirect(`${projectPortalHref(data.id, projectSectionQuery(returnSection, { phaseId: returnPhaseId, inventoryView: returnInventoryView }))}&error=${encodeURIComponent("Project saved, but the commission rule could not be saved. Please retry.")}`);
    }
    const successSection = id ? returnSection : "overview";
    const successQuery = projectSectionQuery(successSection, {
      phaseId: id ? returnPhaseId : null,
      inventoryView: successSection === "inventory" ? "types" : undefined,
    });
    redirect(`${projectPortalHref(data.id, successQuery)}${id ? "" : "&draft=clear"}&success=${encodeURIComponent(id ? "Project draft saved. Continue with the setup checklist." : "Project draft created. Continue with the setup checklist.")}`);
  }
  if (error) {
    await removeUploadedStorageObjects(uploadedObjects);
    redirect(`${invalidTarget}&error=${encodeURIComponent(error.message)}`);
  }
  if (!data?.id) {
    await removeUploadedStorageObjects(uploadedObjects);
    redirect(`${invalidTarget}&error=${encodeURIComponent("Project could not be saved.")}`);
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

const projectWorkspaceHref = (
  projectId: string,
  section: ProjectWorkspaceSection,
  options?: { phaseId?: string | null; inventoryView?: ProjectInventoryView },
) => projectPortalHref(projectId, projectSectionQuery(section, options));

const inventoryWorkspaceHref = (
  projectId: string,
  phaseId: string | null | undefined,
  inventoryView: ProjectInventoryView = "types",
  suffix = "",
) => `${projectWorkspaceHref(projectId, "inventory", { phaseId, inventoryView })}${suffix ? `&${suffix}` : ""}`;

const phaseWorkspaceHref = (projectId: string, phaseId?: string | null, suffix = "") =>
  `${projectWorkspaceHref(projectId, "phases", { phaseId })}${suffix ? `&${suffix}` : ""}`;

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
  const pastedMasterplan = formData.get("phaseMasterplanUrl")?.toString().trim() ?? "";
  const deliveryDate = formData.get("phaseDeliveryDate")?.toString().trim() || null;
  const salesStatus = formData.get("phaseSalesStatus")?.toString() || "upcoming";
  return { name, description, phaseOrder, launchStatus, launchDate, pastedHero, pastedMasterplan, deliveryDate, salesStatus,
    facilitiesRaw: formData.get("phaseFacilities")?.toString() ?? "",
    sellingPointsRaw: formData.get("phaseSellingPoints")?.toString() ?? "" };
}

function validatePhaseForm(values: ReturnType<typeof phaseFormValues>) {
  if (!values.name || values.name.length > 160) return "Add a phase name between 1 and 160 characters.";
  if (values.phaseOrder != null && (!Number.isInteger(values.phaseOrder) || values.phaseOrder <= 0)) return "Phase order must be a whole number greater than zero.";
  if (!["upcoming", "new_launch", "live"].includes(values.launchStatus)) return "Choose a valid phase launch status.";
  if (values.launchDate && Number.isNaN(Date.parse(`${values.launchDate}T00:00:00`))) return "Enter a valid phase launch date.";
  if (values.pastedHero && !normalizeHttpMediaUrl(values.pastedHero)) return "Phase image URLs must use http:// or https://.";
  if (values.pastedMasterplan && !normalizeHttpMediaUrl(values.pastedMasterplan)) return "Phase masterplan URLs must use http:// or https://.";
  if (!["upcoming", "selling", "sold_out", "paused"].includes(values.salesStatus)) return "Choose a valid phase sales status.";
  if (!validDeliveryDate(values.deliveryDate ?? "")) return "Enter a valid phase delivery date.";
  try { parseLineItems(values.facilitiesRaw, "Facilities"); parseLineItems(values.sellingPointsRaw, "Selling points"); }
  catch (error) { return (error as Error).message; }
  return null;
}

async function createProjectPhaseAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_projects");
  const projectId = formData.get("projectId")?.toString();
  if (!projectId) return;
  const values = phaseFormValues(formData);
  const validationError = validatePhaseForm(values);
  if (validationError) redirect(`${phaseWorkspaceHref(projectId, "new")}&error=${encodeURIComponent(validationError)}`);
  if (!await developerProjectUploadPreflight(session.developerId, projectId)) {
    redirect(`${phaseWorkspaceHref(projectId, "new")}&error=${encodeURIComponent("Project not found or access denied.")}`);
  }
  const pastedHero = normalizeHttpMediaUrl(values.pastedHero);
  const uploadedObjects: Array<{ bucket: string; url: string }> = [];
  let heroImageUrl = pastedHero;
  let masterplanUrl = normalizeHttpMediaUrl(values.pastedMasterplan);
  try {
    const masterplan = formData.get("phaseMasterplan");
    if (isFile(masterplan)) {
      if (masterplan.type !== "application/pdf" && !masterplan.type.startsWith("image/")) throw new Error("A phase masterplan must be an image or PDF.");
      masterplanUrl = await uploadFileToBucket({ bucket: STORAGE_BUCKETS.projectBrochures, pathPrefix: `developers/${session.developerId}/projects/${projectId}/phases/masterplans`, file: masterplan });
      uploadedObjects.push({ bucket: STORAGE_BUCKETS.projectBrochures, url: masterplanUrl });
    }
    const uploaded = await uploadPhaseHeroImage(formData, projectId, session.developerId);
    if (uploaded) {
      uploadedObjects.push({ bucket: STORAGE_BUCKETS.projectImages, url: uploaded });
      heroImageUrl = uploaded;
    }
  } catch (error) {
    await removeUploadedStorageObjects(uploadedObjects);
    redirect(`${phaseWorkspaceHref(projectId, "new")}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to upload the phase image.")}`);
  }
  const result = await createDeveloperProjectPhase(session.developerId, projectId, session.accountId, {
    name: values.name,
    description: values.description,
    phaseOrder: values.phaseOrder,
    launchStatus: values.launchStatus,
    launchDate: values.launchDate,
    heroMedia: heroImageUrl ? { heroImageUrl } : {},
    facilities: parseLineItems(values.facilitiesRaw, "Facilities"),
    sellingPoints: parseLineItems(values.sellingPointsRaw, "Selling points"),
    deliveryDate: values.deliveryDate,
    salesStatus: values.salesStatus as "upcoming" | "selling" | "sold_out" | "paused",
    masterplanUrl,
  });
  if (result.error || !result.data) {
    await removeUploadedStorageObjects(uploadedObjects);
    redirect(`${phaseWorkspaceHref(projectId, "new")}&error=${encodeURIComponent(result.error?.message ?? "Unable to create this release phase.")}`);
  }
  revalidatePath("/developer/projects");
  revalidatePath(`/developer/projects/${projectId}`);
  redirect(`${phaseWorkspaceHref(projectId, result.data.id)}&success=${encodeURIComponent("Release phase created. Add phase-scoped inventory, then submit the project for review.")}`);
}

async function updateProjectPhaseAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_projects");
  const projectId = formData.get("projectId")?.toString();
  const phaseId = formData.get("phaseId")?.toString();
  if (!projectId || !phaseId) return;
  const values = phaseFormValues(formData);
  const validationError = validatePhaseForm(values);
  if (validationError) redirect(`${phaseWorkspaceHref(projectId, phaseId, "phaseForm=edit")}&error=${encodeURIComponent(validationError)}`);
  if (!await developerProjectUploadPreflight(session.developerId, projectId)) {
    redirect(`${phaseWorkspaceHref(projectId, phaseId, "phaseForm=edit")}&error=${encodeURIComponent("Project not found or access denied.")}`);
  }
  const phases = await fetchDeveloperProjectPhases(session.developerId, projectId);
  const current = phases.find((phase) => phase.id === phaseId);
  if (!current) redirect(`${phaseWorkspaceHref(projectId, phaseId)}&error=${encodeURIComponent("Phase not found or access denied.")}`);
  const currentHero = phaseHeroImageFromMedia(current.hero_media);
  const pastedHero = normalizeHttpMediaUrl(values.pastedHero);
  const uploadedObjects: Array<{ bucket: string; url: string }> = [];
  let heroImageUrl = formData.get("phaseHeroImage_remove") === "1" ? null : pastedHero || currentHero;
  let masterplanUrl = formData.get("phaseMasterplan_remove") === "1" ? null : normalizeHttpMediaUrl(values.pastedMasterplan) || current.masterplan_url || null;
  try {
    const masterplan = formData.get("phaseMasterplan");
    if (isFile(masterplan)) {
      if (masterplan.type !== "application/pdf" && !masterplan.type.startsWith("image/")) throw new Error("A phase masterplan must be an image or PDF.");
      masterplanUrl = await uploadFileToBucket({ bucket: STORAGE_BUCKETS.projectBrochures, pathPrefix: `developers/${session.developerId}/projects/${projectId}/phases/${phaseId}/masterplan`, file: masterplan });
      uploadedObjects.push({ bucket: STORAGE_BUCKETS.projectBrochures, url: masterplanUrl });
    }
    const uploaded = await uploadPhaseHeroImage(formData, projectId, session.developerId);
    if (uploaded) {
      uploadedObjects.push({ bucket: STORAGE_BUCKETS.projectImages, url: uploaded });
      heroImageUrl = uploaded;
    }
  } catch (error) {
    await removeUploadedStorageObjects(uploadedObjects);
    redirect(`${phaseWorkspaceHref(projectId, phaseId, "phaseForm=edit")}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to upload the phase image.")}`);
  }
  const result = await updateDeveloperProjectPhase(session.developerId, phaseId, session.accountId, {
    name: values.name,
    description: values.description,
    phaseOrder: values.phaseOrder,
    launchStatus: values.launchStatus,
    launchDate: values.launchDate,
    heroMedia: heroImageUrl ? { ...(current.hero_media && typeof current.hero_media === "object" ? current.hero_media : {}), heroImageUrl } : {},
    facilities: parseLineItems(values.facilitiesRaw, "Facilities"),
    sellingPoints: parseLineItems(values.sellingPointsRaw, "Selling points"),
    deliveryDate: values.deliveryDate,
    salesStatus: values.salesStatus as "upcoming" | "selling" | "sold_out" | "paused",
    masterplanUrl,
  });
  if (result.error || !result.data) {
    await removeUploadedStorageObjects(uploadedObjects);
    redirect(`${phaseWorkspaceHref(projectId, phaseId, "phaseForm=edit")}&error=${encodeURIComponent(result.error?.message ?? "Unable to update this release phase.")}`);
  }
  revalidatePath("/developer/projects");
  revalidatePath(`/developer/projects/${projectId}`);
  redirect(`${phaseWorkspaceHref(projectId, phaseId)}&success=${encodeURIComponent("Release phase saved. The project is queued for review again.")}`);
}

async function archiveProjectPhaseAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_projects");
  const projectId = formData.get("projectId")?.toString();
  const phaseId = formData.get("phaseId")?.toString();
  if (!projectId || !phaseId) return;
  const result = await archiveDeveloperProjectPhase(session.developerId, phaseId, session.accountId);
  if (result.error) redirect(`${phaseWorkspaceHref(projectId, phaseId)}&error=${encodeURIComponent(result.error.message)}`);
  revalidatePath("/developer/projects");
  revalidatePath(`/developer/projects/${projectId}`);
  redirect(`${phaseWorkspaceHref(projectId, phaseId)}&success=${encodeURIComponent("Release phase archived. Its inventory was retained.")}`);
}

async function restoreProjectPhaseAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_projects");
  const projectId = formData.get("projectId")?.toString();
  const phaseId = formData.get("phaseId")?.toString();
  if (!projectId || !phaseId) return;
  const result = await restoreDeveloperProjectPhase(session.developerId, phaseId, session.accountId);
  if (result.error) redirect(`${phaseWorkspaceHref(projectId, phaseId)}&error=${encodeURIComponent(result.error.message)}`);
  revalidatePath("/developer/projects");
  revalidatePath(`/developer/projects/${projectId}`);
  redirect(`${phaseWorkspaceHref(projectId, phaseId)}&success=${encodeURIComponent("Release phase restored as a draft. Submit the project for review when ready.")}`);
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
    redirect(`${inventoryWorkspaceHref(projectId, null, "types", "addUnitType=1")}&error=${encodeURIComponent("Choose a release phase before saving inventory.")}`);
  }
  const unitTypeFormSuffix = unitTypeId ? `editUnitType=${encodeURIComponent(unitTypeId)}` : "addUnitType=1";

  const readUnitNumber = (field: string, label: string) => {
    const raw = formData.get(field)?.toString().trim();
    if (!raw) return undefined;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types", unitTypeFormSuffix)}&error=${encodeURIComponent(`${label} must be zero or more.`)}`);
    }
    return parsed;
  };
  const minPrice = readUnitNumber("unitStartPrice", "Minimum price");
  const maxPrice = readUnitNumber("unitMaxPrice", "Maximum price");
  if (minPrice == null || minPrice <= 0) {
    redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types", unitTypeFormSuffix)}&error=${encodeURIComponent("Enter a valid minimum price before saving this unit type.")}`);
  }
  if (maxPrice != null && maxPrice < minPrice) {
    redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types", unitTypeFormSuffix)}&error=${encodeURIComponent("Maximum price must be greater than or equal to the minimum.")}`);
  }

  const finishingStatus = formData.get("unitFinishing")?.toString().trim() || undefined;
  const unitAreaMin = readUnitNumber("unitMinBua", "Minimum BUA");
  const unitAreaMax = readUnitNumber("unitMaxBua", "Maximum BUA");
  const landAreaMin = readUnitNumber("unitMinLand", "Minimum land area");
  const landAreaMax = readUnitNumber("unitMaxLand", "Maximum land area");
  if (unitAreaMax != null && unitAreaMin != null && unitAreaMax < unitAreaMin) {
    redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types", unitTypeFormSuffix)}&error=${encodeURIComponent("Maximum BUA must be greater than or equal to the minimum.")}`);
  }
  if (landAreaMax != null && landAreaMin != null && landAreaMax < landAreaMin) {
    redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types", unitTypeFormSuffix)}&error=${encodeURIComponent("Maximum land area must be greater than or equal to the minimum.")}`);
  }
  if (!await developerProjectUploadPreflight(session.developerId, projectId)) {
    redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types", unitTypeFormSuffix)}&error=${encodeURIComponent("Project not found or access denied.")}`);
  }
  const heroImageFile = formData.get("unitHeroImage");
  const description = formData.get("unitDescription")?.toString().trim() || undefined;
  const label: string = baseType;

  const uploadedObjects: Array<{ bucket: string; url: string }> = [];
  let heroImageUrl: string | null | undefined = formData.get("unitHeroImage_remove") === "1" ? null : undefined;
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
    redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types", unitTypeFormSuffix)}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to save this unit type.")}`);
  }
  const { data, error } = result;
  if (error) {
    await removeUploadedStorageObjects(uploadedObjects);
    revalidatePath("/developer/projects");
    redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types", unitTypeFormSuffix)}&error=${encodeURIComponent(error.message)}`);
  }
  if (!unitTypeId && data?.id) {
    redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types")}&success=${encodeURIComponent("Unit type saved. Add variants only when you need more commercial detail.")}`);
  }
  revalidatePath("/developer/projects");
  if (unitTypeId) redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types", unitTypeFormSuffix)}&success=${encodeURIComponent("Unit type changes saved.")}`);
}

async function archiveUnitTypeAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const projectId = formData.get("projectId")?.toString();
  const unitTypeId = formData.get("unitTypeId")?.toString();
  const phaseId = formData.get("phaseId")?.toString() || null;
  if (!projectId || !unitTypeId) return;
  let result;
  try {
    result = await archiveProjectUnitType(session.developerId, unitTypeId, session.accountId);
  } catch (error) {
    redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types")}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to archive this unit type.")}`);
  }
  if (result?.error) {
    redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types")}&error=${encodeURIComponent(result.error.message)}`);
  }
  revalidatePath("/developer/projects");
  redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types", "inventory=archived")}&success=${encodeURIComponent("Unit type archived. Its variants were retained.")}`);
}

async function restoreUnitTypeAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const projectId = formData.get("projectId")?.toString();
  const unitTypeId = formData.get("unitTypeId")?.toString();
  const phaseId = formData.get("phaseId")?.toString() || null;
  if (!projectId || !unitTypeId) return;
  let result;
  try {
    result = await restoreProjectUnitType(session.developerId, unitTypeId);
  } catch (error) {
    redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types")}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to restore this unit type.")}`);
  }
  if (result?.error) redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types")}&error=${encodeURIComponent(result.error.message)}`);
  revalidatePath("/developer/projects");
  redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types", "inventory=active")}&success=${encodeURIComponent("Unit type restored to active inventory.")}`);
}

async function upsertProjectUnitVariantAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const projectId = formData.get("projectId")?.toString();
  const unitTypeId = formData.get("unitTypeId")?.toString();
  const phaseId = formData.get("phaseId")?.toString() || null;
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
      redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types", `unitType=${unitTypeId}&variants=1${variantId ? `&variant=${variantId}` : ""}`)}&error=${encodeURIComponent(`${label} must be a valid ${allowZero ? "zero or more" : "positive"} number.`)}`);
    }
    return parsed;
  };

  const minPrice = readVariantNumber("variantMinPrice", "Minimum price", false);
  if (minPrice == null) {
    redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types", `unitType=${unitTypeId}&variants=1${variantId ? `&variant=${variantId}` : ""}`)}&error=${encodeURIComponent("Enter a valid minimum price before saving this variant.")}`);
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
    redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types", `unitType=${unitTypeId}&variants=1${variantId ? `&variant=${variantId}` : ""}`)}&error=${encodeURIComponent("Maximum price must be greater than or equal to the minimum.")}`);
  }
  if (areaMax != null && areaMin != null && areaMax < areaMin) {
    redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types", `unitType=${unitTypeId}&variants=1${variantId ? `&variant=${variantId}` : ""}`)}&error=${encodeURIComponent("Maximum BUA must be greater than or equal to the minimum.")}`);
  }
  if (landAreaMax != null && landAreaMin != null && landAreaMax < landAreaMin) {
    redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types", `unitType=${unitTypeId}&variants=1${variantId ? `&variant=${variantId}` : ""}`)}&error=${encodeURIComponent("Maximum land area must be greater than or equal to the minimum.")}`);
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
    redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types", `unitType=${unitTypeId}&variants=1${variantId ? `&variant=${variantId}` : ""}`)}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to save this variant.")}`);
  }
  if (result?.error) {
    redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types", `unitType=${unitTypeId}&variants=1${variantId ? `&variant=${variantId}` : ""}`)}&error=${encodeURIComponent(result.error.message)}`);
  }
  redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types", `unitType=${unitTypeId}&variants=1${variantId ? `&variant=${variantId}` : ""}`)}&success=${encodeURIComponent("Variant saved to this unit type.")}`);
}

async function archiveVariantAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const projectId = formData.get("projectId")?.toString();
  const variantId = formData.get("variantId")?.toString();
  const phaseId = formData.get("phaseId")?.toString() || null;
  if (!projectId || !variantId) return;
  let result;
  try {
    result = await archiveProjectUnitVariant(session.developerId, variantId, session.accountId);
  } catch (error) {
    redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types", `unitType=${formData.get("unitTypeId")?.toString() ?? ""}&variants=1`)}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to archive this variant.")}`);
  }
  if (result?.error) {
    redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types")}&error=${encodeURIComponent(result.error.message)}`);
  }
  revalidatePath("/developer/projects");
  redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types", "inventory=archived")}&success=${encodeURIComponent("Variant archived and retained.")}`);
}

async function restoreVariantAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const projectId = formData.get("projectId")?.toString();
  const variantId = formData.get("variantId")?.toString();
  const phaseId = formData.get("phaseId")?.toString() || null;
  if (!projectId || !variantId) return;
  let result;
  try {
    result = await restoreProjectUnitVariant(session.developerId, variantId);
  } catch (error) {
    redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types")}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to restore this variant.")}`);
  }
  if (result?.error) redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types")}&error=${encodeURIComponent(result.error.message)}`);
  revalidatePath("/developer/projects");
  redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types", "inventory=active")}&success=${encodeURIComponent("Variant restored to active inventory.")}`);
}

async function importTypeWithVariantsAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const projectId = formData.get("projectId")?.toString();
  const phaseId = formData.get("phaseId")?.toString() || undefined;
  const payloadRaw = formData.get("payload")?.toString();
  if (!projectId || !payloadRaw) return;
  if (!phaseId) {
    redirect(`${inventoryWorkspaceHref(projectId, null, "types")}&error=${encodeURIComponent("Choose a release phase before importing inventory.")}`);
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
    redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types")}&error=${encodeURIComponent("Every imported variant needs a valid price and consistent numeric ranges. No rows were saved.")}`);
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
    redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types")}&error=${encodeURIComponent(error?.message ?? "Unable to import this inventory batch. No rows were saved.")}`);
  }

  revalidatePath("/developer/projects");
  redirect(`${inventoryWorkspaceHref(projectId, phaseId, "types")}&success=${encodeURIComponent("Inventory imported atomically to the selected release phase.")}`);
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

function inventoryActionError(projectId: string, message: string, phaseId?: string | null, inventoryView: ProjectInventoryView = "units") {
  return `${inventoryWorkspaceHref(projectId, phaseId, inventoryView)}&error=${encodeURIComponent(message)}`;
}

function reviewActionError(projectId: string, message: string) {
  return `${projectWorkspaceHref(projectId, "review")}&error=${encodeURIComponent(message)}`;
}

async function markProjectReadyAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_projects");
  const projectId = formData.get("projectId")?.toString();
  if (!projectId) return;
  const result = await markDeveloperProjectReady(session.developerId, projectId, session.accountId);
  if (result.error) redirect(reviewActionError(projectId, result.error.message));
  revalidatePath("/developer/projects");
  redirect(`${projectWorkspaceHref(projectId, "review")}&success=${encodeURIComponent("Project marked ready. Review the checklist before submitting.")}`);
}

async function submitProjectForReviewAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_projects");
  const projectId = formData.get("projectId")?.toString();
  if (!projectId) return;
  const result = await submitDeveloperProjectForReview(session.developerId, projectId, session.accountId);
  if (result.error) redirect(reviewActionError(projectId, result.error.message));
  revalidatePath("/developer/projects");
  redirect(`${projectWorkspaceHref(projectId, "review")}&success=${encodeURIComponent("Project submitted for admin review.")}`);
}

async function bulkInventoryAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const projectId = formData.get("projectId")?.toString();
  const phaseId = formData.get("phaseId")?.toString();
  const rows = parseJsonRows(formData.get("rows"));
  const dryRun = formData.get("dryRun")?.toString() === "true";
  if (!projectId || !phaseId || !rows) {
    if (projectId) redirect(inventoryActionError(projectId, "Select a release phase and provide valid inventory rows.", phaseId));
    return;
  }
  const result = await bulkUpdateDeveloperInventory(session.developerId, projectId, phaseId, session.accountId, rows, dryRun);
  if (result.error) redirect(inventoryActionError(projectId, result.error.message, phaseId));
  const errors = Array.isArray(result.data?.errors) ? result.data.errors.length : 0;
  if (errors) redirect(inventoryActionError(projectId, `${errors} inventory row(s) failed validation. No invalid rows were written.`, phaseId));
  revalidatePath("/developer/projects");
  redirect(`${inventoryWorkspaceHref(projectId, phaseId, "units")}&success=${encodeURIComponent(dryRun ? "Dry run passed. Review the rows, then submit again in commit mode." : "Inventory rows saved as pending changes.")}`);
}

async function importInventoryRowsAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const projectId = formData.get("projectId")?.toString();
  const phaseId = formData.get("phaseId")?.toString();
  const rows = parseJsonRows(formData.get("rows"));
  const dryRun = formData.get("dryRun")?.toString() !== "false";
  if (!projectId || !phaseId || !rows) {
    if (projectId) redirect(inventoryActionError(projectId, "Select a release phase and provide valid import rows.", phaseId));
    return;
  }
  const rowIds = rows.map((row) => typeof row.id === "string" && row.id.trim() ? row.id.trim() : null);
  if (rowIds.some(Boolean) && rowIds.some((id) => !id)) {
    redirect(inventoryActionError(projectId, "Do not mix existing inventory IDs with new import rows.", phaseId));
  }
  const result = rowIds.every(Boolean)
    ? await bulkUpdateDeveloperInventory(session.developerId, projectId, phaseId, session.accountId, rows, dryRun)
    : await importDeveloperInventoryRows(session.developerId, projectId, phaseId, session.accountId, rows, dryRun);
  if (result.error) redirect(inventoryActionError(projectId, result.error.message, phaseId));
  const errors = Array.isArray(result.data?.errors) ? result.data.errors.length : 0;
  if (errors) redirect(inventoryActionError(projectId, `${errors} import row(s) failed validation. Fix the row errors and try again.`, phaseId));
  revalidatePath("/developer/projects");
  redirect(`${inventoryWorkspaceHref(projectId, phaseId, "units")}&success=${encodeURIComponent(dryRun ? "Server dry run passed. Submit the import again in commit mode." : "Inventory imported as pending changes.")}`);
}

async function holdInventoryAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const projectId = formData.get("projectId")?.toString();
  const propertyId = formData.get("propertyId")?.toString();
  const phaseId = formData.get("phaseId")?.toString() || null;
  const expiresAt = formData.get("expiresAt")?.toString();
  const holderType = formData.get("holderType")?.toString() || "internal";
  const holderReference = formData.get("holderReference")?.toString() || null;
  if (!projectId || !propertyId || !expiresAt) {
    if (projectId) redirect(inventoryActionError(projectId, "A future hold expiry is required.", phaseId));
    return;
  }
  const result = await createDeveloperInventoryHold(session.developerId, propertyId, session.accountId, expiresAt, holderType, holderReference);
  if (result.error) redirect(inventoryActionError(projectId, result.error.message, phaseId));
  revalidatePath("/developer/projects");
  redirect(`${inventoryWorkspaceHref(projectId, phaseId, "units")}&success=${encodeURIComponent("Inventory hold created atomically.")}`);
}

async function releaseInventoryHoldAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const projectId = formData.get("projectId")?.toString();
  const holdId = formData.get("holdId")?.toString();
  const phaseId = formData.get("phaseId")?.toString() || null;
  const nextState = formData.get("nextState")?.toString() === "converted" ? "converted" as const : "released" as const;
  if (!projectId || !holdId) return;
  const result = await releaseDeveloperInventoryHold(session.developerId, holdId, session.accountId, nextState);
  if (result.error) redirect(inventoryActionError(projectId, result.error.message, phaseId));
  revalidatePath("/developer/projects");
  redirect(`${inventoryWorkspaceHref(projectId, phaseId, "units")}&success=${encodeURIComponent(nextState === "converted" ? "Hold converted to contracted inventory." : "Inventory hold released.")}`);
}

async function restoreInventoryVersionAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const projectId = formData.get("projectId")?.toString();
  const versionId = formData.get("versionId")?.toString();
  if (!projectId || !versionId) return;
  const result = await restoreDeveloperInventoryVersion(session.developerId, versionId, session.accountId);
  if (result.error) redirect(reviewActionError(projectId, result.error.message));
  revalidatePath("/developer/projects");
  redirect(`${projectWorkspaceHref(projectId, "review")}&success=${encodeURIComponent("Version restored to a draft. Review and submit the changes again.")}`);
}

async function saveInventoryFilterAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const projectId = formData.get("projectId")?.toString();
  const phaseId = formData.get("phaseId")?.toString() || null;
  const name = formData.get("name")?.toString().trim();
  const filter = parseJsonObject(formData.get("filter"));
  if (!projectId || !name || !filter) {
    if (projectId) redirect(inventoryActionError(projectId, "Enter a filter name before saving.", phaseId));
    return;
  }
  const result = await saveDeveloperInventoryFilter(session.developerId, session.accountId, name, filter);
  if (result.error) redirect(inventoryActionError(projectId, result.error.message, phaseId));
  revalidatePath("/developer/projects");
  redirect(`${inventoryWorkspaceHref(projectId, phaseId, "units")}&success=${encodeURIComponent("Inventory filter saved.")}`);
}

async function saveProjectTemplateAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_projects");
  const projectId = formData.get("projectId")?.toString();
  const name = formData.get("name")?.toString().trim();
  const description = formData.get("description")?.toString().trim() || null;
  const payload = parseJsonObject(formData.get("payload"));
  if (!projectId || !name || !payload) {
    if (projectId) redirect(`${projectWorkspaceHref(projectId, "settings")}&error=${encodeURIComponent("Provide a template name and valid project payload.")}`);
    return;
  }
  const result = await saveDeveloperProjectTemplate(session.developerId, session.accountId, {
    templateType: "project",
    name,
    description,
    payload,
    sourceProjectId: projectId,
  });
  if (result.error) redirect(`${projectWorkspaceHref(projectId, "settings")}&error=${encodeURIComponent(result.error.message)}`);
  revalidatePath("/developer/projects");
  redirect(`${projectWorkspaceHref(projectId, "settings")}&success=${encodeURIComponent("Project template saved.")}`);
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
  if (result.error) redirect(reviewActionError(projectId, result.error.message));
  revalidatePath("/developer/projects");
  redirect(`${projectWorkspaceHref(projectId, "review")}&success=${encodeURIComponent("Publication feedback marked resolved.")}`);
}
