import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { DeveloperLayout } from "@/components/DeveloperLayout";
import { ProjectImportPanel } from "@/components/ProjectImportPanel";
import { requireDeveloperSession } from "@/lib/developerAuth";
import {
  deleteDeveloperProject,
  deleteProjectUnitType,
  deleteProjectUnitVariant,
  fetchDeveloperProfile,
  fetchDeveloperProjects,
  type LimitedTimeOffer,
  type StructuredPaymentPlan,
  upsertDeveloperProject,
  upsertProjectUnitType,
  upsertProjectUnitVariant,
} from "@/lib/developerQueries";
import { STORAGE_BUCKETS, isFile, uploadFileToBucket } from "@/lib/storageServer";
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
    error?: string | string[];
  }>;
}) {
  const session = await requireDeveloperSession();
  const [projects, profile, commissionRules] = await Promise.all([
    fetchDeveloperProjects(session.developerId),
    fetchDeveloperProfile(session.developerId),
    supabaseServer
      .from("developer_commission_rules")
      .select("id, developer_id, property_id, commission_rate, platform_share")
      .eq("developer_id", session.developerId),
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
  const templateProjectId =
    typeof resolvedSearchParams?.template === "string" ? resolvedSearchParams.template : null;
  const pageError =
    typeof resolvedSearchParams?.error === "string" ? decodeURIComponent(resolvedSearchParams.error) : null;
  const templateProject =
    showCreateWizard && templateProjectId
      ? projects.find((project) => project.id === templateProjectId)
      : undefined;
  const templatePlanDefaults = asStructuredPlans(templateProject?.payment_plan_templates).slice(0, 3);
  const templateOfferDefaults = asLimitedTimeOffers(templateProject?.limited_time_offers).slice(0, 1);
  const selectedProjectId =
    activeProjectId && projects.some((project) => project.id === activeProjectId)
      ? activeProjectId
      : projects[0]?.id ?? null;
  const selectedProject = selectedProjectId
    ? projects.find((project) => project.id === selectedProjectId)
    : undefined;
  const projectCommissionRule = selectedProjectId
    ? ((commissionRules.data ?? []) as CommissionRuleRow[]).find((rule) => rule.property_id === selectedProjectId)
    : undefined;
  const visibleProjects = selectedProjectId
    ? projects.filter((project) => project.id === selectedProjectId)
    : projects;
  const resolvedUnitTypeId =
    showVariantWizard && selectedProject?.project_unit_types?.length
      ? (focusUnitTypeId &&
          selectedProject.project_unit_types.some((unit) => unit.id === focusUnitTypeId)
          ? focusUnitTypeId
          : selectedProject.project_unit_types[0].id)
      : null;
  const modalUnitTypeId = focusUnitTypeId ?? resolvedUnitTypeId ?? null;
  const resolvedUnitType =
    modalUnitTypeId && selectedProject
      ? selectedProject.project_unit_types?.find((unit) => unit.id === modalUnitTypeId)
      : undefined;
  const resolvedVariant =
    focusVariantId && resolvedUnitType
      ? resolvedUnitType.project_unit_variants?.find((variant) => variant.id === focusVariantId)
      : undefined;
  const projectGridClass = selectedProjectId ? "grid gap-4" : "grid gap-4 md:grid-cols-2";

  return (
    <DeveloperLayout
      title="Projects"
      description="Keep launch briefs, media, and talking points up to date for agents."
    >
      {pageError ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {pageError}
        </div>
      ) : null}

      {showCreateWizard ? (
        <section className="rounded-3xl border border-black/5 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">New project</p>
              <p className="text-base font-semibold text-neutral-900">Create a new launch</p>
              <p className="text-sm text-neutral-600">
                Use the same settings wizard to define name, description, and media.
              </p>
            </div>
            <a
              href="/developer/projects"
              className="rounded-full border border-black/10 px-3 py-1 text-xs text-neutral-600 hover:border-black/30 hover:text-black"
            >
              Cancel
            </a>
          </div>
          <div className="mt-4">
            <form action={upsertProjectAction} className="space-y-4">
              {projects.length ? (
                <div className="rounded-2xl border border-black/10 bg-neutral-50 p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Reuse an existing setup</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Copy payment plans, amenities, CH fees, location, description, and types from a previous project.
                  </p>
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
                </div>
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
              <div className="rounded-2xl border border-black/10 bg-neutral-50 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Original payment plans</p>
                <p className="mt-1 text-xs text-neutral-500">
                  Reusable plans for this project. Start prices on property types should reflect the original plan.
                </p>
                <div className="mt-4 space-y-3">
                  {[0, 1, 2].map((index) => {
                    const plan = templatePlanDefaults[index];
                    return (
                      <div key={`plan-${index}`} className="rounded-2xl border border-black/10 bg-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-neutral-400">Plan {index + 1}</p>
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
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-amber-700">Limited-time offer</p>
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
              </div>
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
                    defaultValue={templateProject?.launch_status ?? "live"}
                  >
                    <option value="live">Live</option>
                    <option value="new_launch">New launch</option>
                    <option value="upcoming">Upcoming</option>
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
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Project images</span>
                <input
                  className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
                  type="file"
                  name="project_images"
                  accept="image/*"
                  multiple
                />
                <span className="text-xs text-neutral-500">Upload new images to refresh the project gallery.</span>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Project brochure (PDF)</span>
                <input
                  className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
                  type="file"
                  name="project_brochure"
                  accept="application/pdf"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Masterplan</span>
                <input
                  className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
                  type="file"
                  name="project_masterplan"
                  accept="application/pdf,image/*"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Voice notes</span>
                <input
                  className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
                  type="file"
                  name="voice_notes"
                  accept="audio/*"
                  multiple
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Project videos</span>
                <input
                  className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
                  type="file"
                  name="project_videos"
                  accept="video/*"
                  multiple
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Inventory template upload</span>
                <input
                  className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
                  type="file"
                  name="project_inventory"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                />
                <span className="text-xs text-neutral-500">
                  Use the Brixeler customer Excel template only.{" "}
                  <a href={INVENTORY_TEMPLATE_PATH} download className="font-semibold text-black underline underline-offset-2">
                    Download template
                  </a>
                  , fill it, then upload the `.xlsx` file here.
                </span>
              </label>
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
              <button className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white" type="submit">
                Create project
              </button>
            </form>
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
                <ProjectImportPanel projectId={selectedProjectId} onImportAction={importTypeWithVariantsAction} />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {!showCreateWizard && setupStep !== "types" && selectedProjectId ? (
        <section className="space-y-4">
          <header className="rounded-3xl border border-black/5 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Project overview</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#050505]">
                  {selectedProject?.name ?? "Project analytics"}
                </h2>
                <p className="mt-2 max-w-xl text-sm text-neutral-500">
                  {selectedProject?.description ?? "Live telemetry for the selected project."}
                </p>
              </div>
              <div className="flex flex-col items-end gap-3">
                <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-black/10 bg-neutral-50">
                  {profile?.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.logo_url}
                      alt={`${profile?.name ?? "Developer"} logo`}
                      className="h-16 w-16 object-contain"
                    />
                  ) : (
                    <span className="text-xs uppercase tracking-[0.3em] text-neutral-400">Logo</span>
                  )}
                </div>
                {!showCreateWizard && setupStep !== "types" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={INVENTORY_TEMPLATE_PATH}
                      download
                      className="rounded-full border border-black/10 px-4 py-2 text-xs font-semibold text-neutral-600 hover:border-black/30 hover:text-black"
                    >
                      Download import template
                    </a>
                    {selectedProjectId ? (
                      <ProjectImportPanel
                        projectId={selectedProjectId}
                        onImportAction={importTypeWithVariantsAction}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          <section className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "EOIs", value: "—" },
              { label: "CILs", value: "—" },
              { label: "Reservations", value: "—" },
              { label: "Sales claims", value: "—" },
              { label: "Sales (total)", value: "—" },
              { label: "Sales (monthly)", value: "—" },
            ].map((metric) => (
              <div key={metric.label} className="rounded-2xl border border-black/5 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">{metric.label}</p>
                <p className="mt-2 text-lg font-semibold text-[#050505]">{metric.value}</p>
              </div>
            ))}
          </section>

          <details className="rounded-2xl border border-black/5 bg-neutral-50/80 p-4">
            <summary className="cursor-pointer list-none rounded-full border border-black/10 px-4 py-2 text-xs font-semibold text-neutral-600 hover:border-black/30 hover:text-black">
              Project settings
            </summary>
              <div className="mt-4">
                <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">
                  Edit project details
                </p>
                <form action={upsertProjectAction} className="mt-4 space-y-4">
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
                        defaultValue={selectedProject?.launch_status ?? "live"}
                      >
                        <option value="live">Live</option>
                        <option value="new_launch">New launch</option>
                        <option value="upcoming">Upcoming</option>
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
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Project images</span>
                    <input
                      className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
                      type="file"
                      name="project_images"
                      accept="image/*"
                      multiple
                    />
                    <span className="text-xs text-neutral-500">Upload new images to refresh the project gallery.</span>
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Project brochure (PDF)</span>
                    <input
                      className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
                      type="file"
                      name="project_brochure"
                      accept="application/pdf"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Masterplan</span>
                    <input
                      className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
                      type="file"
                      name="project_masterplan"
                      accept="application/pdf,image/*"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Voice notes</span>
                    <input
                      className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
                      type="file"
                      name="voice_notes"
                      accept="audio/*"
                      multiple
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Project videos</span>
                    <input
                      className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
                      type="file"
                      name="project_videos"
                      accept="video/*"
                      multiple
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Inventory template upload</span>
                    <input
                      className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
                      type="file"
                      name="project_inventory"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    />
                    {selectedProject?.inventory_url ? (
                      <span className="text-xs text-neutral-500">Current inventory template uploaded</span>
                    ) : null}
                    <span className="text-xs text-neutral-500">
                      Replace inventory only with the latest filled Brixeler Excel template.
                    </span>
                  </label>
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
          <div className="w-full max-w-2xl rounded-3xl border border-black/10 bg-white p-5 shadow-xl">
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
                variant={resolvedVariant}
              />
            </div>
          </div>
        </div>
      ) : null}

      {!showCreateWizard && setupStep !== "types" ? (
        <section className="space-y-3">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Live projects</p>
            <p className="text-base text-neutral-700">Visible inside the agent workspace</p>
          </div>
        </header>
        <div className={projectGridClass}>
          {visibleProjects.map((project) => (
            <article key={project.id} className="rounded-2xl border border-black/5 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#050505]">{project.name}</p>
                  <p className="text-sm text-neutral-500">{project.description ?? "No description yet."}</p>
                </div>
                <form action={deleteProjectAction}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <button className="text-xs text-red-500 hover:underline" type="submit">
                    Remove
                  </button>
                </form>
              </div>
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
                {project.launch_status ? <p>Launch status: {project.launch_status.replace(/_/g, " ")}</p> : null}
                {project.launch_date ? <p>Launch date: {project.launch_date}</p> : null}
                {project.eoi_value_apt != null ? <p>EOI (Apt): EGP {Number(project.eoi_value_apt).toLocaleString()}</p> : null}
                {project.eoi_value_villa != null ? <p>EOI (Villa): EGP {Number(project.eoi_value_villa).toLocaleString()}</p> : null}
              </div>
              {asStructuredPlans(project.payment_plan_templates).length ? (
                <div className="mt-3 rounded-2xl border border-black/10 bg-neutral-50 p-3">
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
                </div>
              ) : null}
              <div className="mt-4 rounded-2xl border border-dashed border-black/10 bg-neutral-50/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Property types</p>
                  <a
                    href="#add-property-types"
                    className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold text-neutral-600 hover:border-black/30 hover:text-black"
                  >
                    Add property types
                  </a>
                </div>
                {project.project_unit_types?.length ? (
                  <div className="mt-3 space-y-3">
                    {project.project_unit_types.map((unit) => (
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
                          <form action={deleteUnitTypeAction}>
                            <input type="hidden" name="unitTypeId" value={unit.id} />
                            <button className="text-xs text-red-500 hover:underline" type="submit">
                              Delete
                            </button>
                          </form>
                        </div>
                        {unit.project_unit_variants?.length ? (
                          <div className="mt-3">
                            <div className="flex flex-wrap gap-2">
                              {unit.project_unit_variants.map((variant) => (
                                <a
                                  key={variant.id}
                                  href={`/developer/projects?project=${project.id}&unitType=${unit.id}&variants=1&variant=${variant.id}`}
                                  className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-neutral-700 hover:border-black/30"
                                >
                                  {formatVariantChip(variant)}
                                </a>
                              ))}
                              <a
                                href={`/developer/projects?project=${project.id}&unitType=${unit.id}&variants=1`}
                                className="rounded-full border border-dashed border-black/20 px-3 py-1 text-xs text-neutral-500 hover:border-black/40 hover:text-neutral-700"
                              >
                                + Add variant
                              </a>
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
                            <a
                              href={`/developer/projects?project=${project.id}&unitType=${unit.id}&variants=1`}
                              className="mt-3 inline-flex rounded-full border border-black/10 px-3 py-1 text-xs font-semibold text-neutral-600 hover:border-black/30 hover:text-black"
                            >
                              Add first variant
                            </a>
                          </div>
                        )}
                        <details className="mt-3 rounded-xl border border-black/10 bg-neutral-50 p-3">
                          <summary className="text-xs font-semibold text-neutral-600">Edit {unit.label}</summary>
                          <div className="mt-3 space-y-3">
                            <UnitTypeForm projectId={project.id} unitType={unit} paymentPlanSummary={project.payment_plans ?? null} />
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
                  <p className="mt-2 text-sm text-neutral-500">No property types yet. Add the commercial ranges below.</p>
                )}
                <div id="add-property-types" className="mt-4 rounded-2xl border border-black/5 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Add property type</p>
                  <div className="mt-3 space-y-3">
                    <UnitTypeForm projectId={project.id} paymentPlanSummary={project.payment_plans ?? null} />
                  </div>
                </div>
              </div>
            </article>
          ))}
          {!projects.length && (
            <p className="rounded-2xl border border-dashed border-black/5 bg-white p-6 text-sm text-neutral-500">
              No projects yet. Use the form below to create your first launch.
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
  paymentPlanSummary?: string | null;
  unitType?: {
    id: string;
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
    project_unit_variants?: Array<{
      id: string;
      category?: string | null;
      label?: string | null;
      bedrooms?: number | null;
      bathrooms?: number | null;
      min_price: number;
      max_price?: number | null;
      unit_area_min?: number | null;
      unit_area_max?: number | null;
      land_area_min?: number | null;
      land_area_max?: number | null;
      down_payment_percent?: number | null;
      installment_years?: number | null;
      stock_count?: number | null;
      description?: string | null;
      amenities?: string[] | null;
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

function UnitTypeForm({ projectId, paymentPlanSummary, unitType }: UnitTypeFormProps) {
  const categoryValue = normalizeCategory(unitType?.category ?? inferCategoryFromType(unitType?.label));
  const baseTypeValue = normalizeTypeForCategory(categoryValue, unitType?.label);
  return (
    <form action={upsertProjectUnitTypeAction} className="space-y-3 text-sm">
      <input type="hidden" name="projectId" value={projectId} />
      {unitType ? <input type="hidden" name="unitTypeId" value={unitType.id} /> : null}
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
  variant,
}: {
  projectId: string;
  unitTypeId: string;
  variant?: {
    id: string;
    category?: string | null;
    label?: string | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    min_price: number;
    max_price?: number | null;
    unit_area_min?: number | null;
    unit_area_max?: number | null;
    land_area_min?: number | null;
    land_area_max?: number | null;
    down_payment_percent?: number | null;
    installment_years?: number | null;
    stock_count?: number | null;
    description?: string | null;
    amenities?: string[] | null;
  };
}) {
  const selectedAmenities = new Set(variant?.amenities ?? []);
  const categoryValue = normalizeCategory(variant?.category ?? inferCategoryFromType(variant?.label));
  const variantTypeValue = normalizeTypeForCategory(categoryValue, variant?.label);
  return (
    <>
      <form action={upsertProjectUnitVariantAction} className="space-y-3 text-sm">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="unitTypeId" value={unitTypeId} />
        {variant ? <input type="hidden" name="variantId" value={variant.id} /> : null}
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Category</span>
            <select
              className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
              name="variantCategory"
              defaultValue={categoryValue}
              required
            >
              {PROPERTY_CATEGORIES.map((category) => (
                <option key={`variant-category-${category}`} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Type</span>
            <select
              className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
              name="variantType"
              defaultValue={variantTypeValue}
              required
            >
              {PROPERTY_CATEGORIES.map((category) => (
                <optgroup key={`variant-type-group-${category}`} label={category}>
                  {PROPERTY_TYPES_BY_CATEGORY[category].map((type) => (
                    <option key={`variant-${category}-${type}`} value={type}>
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
            label="Down payment (%)"
            name="variantDownPayment"
            type="number"
            min="0"
            max="100"
            step="1"
            defaultValue={variant?.down_payment_percent ?? undefined}
            placeholder="10"
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field
            label="Installment years"
            name="variantInstallmentYears"
            type="number"
            min="0"
            defaultValue={variant?.installment_years ?? undefined}
            placeholder="8"
          />
          <Field
            label="Inventory count"
            name="variantStock"
            type="number"
            min="0"
            defaultValue={variant?.stock_count ?? undefined}
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
          label="Notes"
          name="variantDescription"
          rows={2}
          placeholder="Payment perks, view notes, phase details…"
          defaultValue={variant?.description ?? ""}
        />
        <div className="rounded-2xl border border-black/10 bg-neutral-50 p-3">
          <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Add amenities</p>
          <p className="mt-1 text-xs text-neutral-500">Pick all amenities that apply to this variant.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {AMENITIES.map((amenity) => (
              <label key={amenity.slug} className="cursor-pointer">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  name="variantAmenities"
                  value={amenity.slug}
                  defaultChecked={selectedAmenities.has(amenity.slug)}
                />
                <span className="rounded-full border border-black/10 px-3 py-1 text-xs text-neutral-600 transition peer-checked:border-black peer-checked:bg-black peer-checked:text-white hover:border-black/30">
                  {amenity.label}
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end">
          <button className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white" type="submit">
            {variant ? "Save variant" : "Add variant"}
          </button>
        </div>
      </form>
      {variant ? (
        <form action={deleteVariantAction} className="mt-2 flex justify-end">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="variantId" value={variant.id} />
          <button className="text-xs text-red-500 hover:underline" type="submit">
            Delete variant
          </button>
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
  unit_area_min?: number | null;
  unit_area_max?: number | null;
  land_area_min?: number | null;
  land_area_max?: number | null;
  min_price: number;
  max_price?: number | null;
  installment_years?: number | null;
  down_payment_percent?: number | null;
}) {
  const kind = variant.label ?? null;
  const beds = variant.bedrooms != null ? `${variant.bedrooms}BR` : "?BR";
  const baths = variant.bathrooms != null ? `${variant.bathrooms}BA` : "?BA";
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
  const installments = variant.installment_years ? `${variant.installment_years}y` : null;
  const down = variant.down_payment_percent != null ? `${variant.down_payment_percent}%` : null;
  return [variant.category, kind, beds, baths, bua, land, price, installments, down].filter(Boolean).join(" · ");
}

async function upsertProjectAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperSession();
  const id = formData.get("projectId")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!name) return;
  const description = formData.get("description")?.toString() ?? undefined;
  const location = formData.get("location")?.toString().trim() || undefined;
  const acres = parseOptionalNumber(formData.get("acres")?.toString());
  const footprint = parseOptionalNumber(formData.get("footprint")?.toString());
  const maintenance = parseOptionalNumber(formData.get("maintenance")?.toString());
  const chFees = parseOptionalNumber(formData.get("chFees")?.toString());
  const projectTypes = parseProjectTypes(formData.get("projectTypes")?.toString());
  const launchStatus = formData.get("launchStatus")?.toString().trim() || "live";
  const launchDate = formData.get("launchDate")?.toString().trim() || null;
  const eoiValueApt = parseOptionalNumber(formData.get("eoiValueApt")?.toString());
  const eoiValueVilla = parseOptionalNumber(formData.get("eoiValueVilla")?.toString());
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

  const imageFiles = formData.getAll("project_images").filter(isFile) as File[];
  const brochureFile = formData.get("project_brochure");
  const masterplanFile = formData.get("project_masterplan");
  const voiceFiles = formData.getAll("voice_notes").filter(isFile) as File[];
  const videoFiles = formData.getAll("project_videos").filter(isFile) as File[];
  const inventoryFile = formData.get("project_inventory");

  if (isFile(inventoryFile) && !isExcelTemplateFile(inventoryFile)) {
    const target = id ? `/developer/projects?project=${id}` : "/developer/projects?create=1";
    redirect(`${target}&error=${encodeURIComponent("Inventory must be uploaded using the Brixeler .xlsx template.")}`);
  }

  const existingProjects = id ? await fetchDeveloperProjects(session.developerId) : [];
  const existingProject = id ? existingProjects.find((project) => project.id === id) : undefined;
  const existingHeroMedia =
    existingProject?.hero_media && typeof existingProject.hero_media === "object"
      ? { ...(existingProject.hero_media as ProjectMedia) }
      : {};
  const heroMedia: ProjectMedia = { ...existingHeroMedia };
  let heroMediaUpdated = false;
  let inventoryUrl = existingProject?.inventory_url ?? null;

  if (imageFiles.length) {
    const imageUrls = await Promise.all(
      imageFiles.map((file) =>
        uploadFileToBucket({
          bucket: STORAGE_BUCKETS.projectImages,
          pathPrefix: `${projectBasePath}/images`,
          file,
        }),
      ),
    );
    heroMedia.images = imageUrls;
    heroMedia.heroImageUrl = imageUrls[0];
    heroMediaUpdated = true;
  }

  if (isFile(brochureFile)) {
    const brochureUrl = await uploadFileToBucket({
      bucket: STORAGE_BUCKETS.projectBrochures,
      pathPrefix: `${projectBasePath}/brochure`,
      file: brochureFile,
    });
    heroMedia.brochureUrl = brochureUrl;
    heroMediaUpdated = true;
  }

  if (isFile(masterplanFile)) {
    const masterplanUrl = await uploadFileToBucket({
      bucket: STORAGE_BUCKETS.projectBrochures,
      pathPrefix: `${projectBasePath}/masterplan`,
      file: masterplanFile,
    });
    heroMedia.masterplanUrl = masterplanUrl;
    heroMediaUpdated = true;
  }

  const voiceNoteUrls = voiceFiles.length
    ? await Promise.all(
        voiceFiles.map((file) =>
          uploadFileToBucket({
            bucket: STORAGE_BUCKETS.projectVoiceNotes,
            pathPrefix: `${projectBasePath}/voice-notes`,
            file,
          }),
        ),
      )
    : undefined;

  const videoUrls = videoFiles.length
    ? await Promise.all(
        videoFiles.map((file) =>
          uploadFileToBucket({
            bucket: STORAGE_BUCKETS.projectVideos,
            pathPrefix: `${projectBasePath}/videos`,
            file,
          }),
        ),
      )
    : undefined;

  if (isFile(inventoryFile)) {
    inventoryUrl = await uploadFileToBucket({
      bucket: STORAGE_BUCKETS.projectBrochures,
      pathPrefix: `${projectBasePath}/inventory`,
      file: inventoryFile,
    });
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
    hero_media: heroMediaUpdated ? heroMedia : undefined,
    voice_notes: voiceNoteUrls?.length ? voiceNoteUrls : undefined,
    video_links: videoUrls?.length ? videoUrls : undefined,
    amenities: amenities.length ? amenities : undefined,
  });
  if (!error && data?.id) {
    await upsertProjectCommissionRule({
      developerId: session.developerId,
      projectId: data.id,
      commissionRateRaw,
      platformShareRaw,
    });
    redirect(`/developer/projects?project=${data.id}&step=types`);
  }
  revalidatePath("/developer/projects");
}

async function deleteProjectAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperSession();
  const projectId = formData.get("projectId")?.toString();
  if (!projectId) return;
  await deleteDeveloperProject(session.developerId, projectId);
  revalidatePath("/developer/projects");
}

async function upsertProjectCommissionRule(input: {
  developerId: string;
  projectId: string;
  commissionRateRaw?: string | null;
  platformShareRaw?: string | null;
}) {
  const commissionRateRaw = input.commissionRateRaw?.trim() ?? "";
  const platformShareRaw = input.platformShareRaw?.trim() ?? "";
  if (!commissionRateRaw && !platformShareRaw) return;

  const commissionRate = Number(commissionRateRaw);
  if (!Number.isFinite(commissionRate) || commissionRate <= 0) {
    return;
  }
  const platformShare = platformShareRaw.length ? Number(platformShareRaw) : null;

  const { data: existing } = await supabaseServer
    .from("developer_commission_rules")
    .select("id")
    .eq("developer_id", input.developerId)
    .eq("property_id", input.projectId)
    .maybeSingle();

  await supabaseServer.from("developer_commission_rules").upsert(
    {
      id: existing?.id,
      developer_id: input.developerId,
      property_id: input.projectId,
      commission_rate: commissionRate,
      platform_share: Number.isFinite(platformShare ?? NaN) ? platformShare : null,
    },
    { onConflict: "id" },
  );
}

async function upsertProjectUnitTypeAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperSession();
  const projectId = formData.get("projectId")?.toString();
  const unitTypeId = formData.get("unitTypeId")?.toString() || undefined;
  const unitCategory = normalizeCategory(formData.get("unitCategory")?.toString());
  const baseTypeRaw = formData.get("unitBaseType")?.toString().trim() || "";
  const baseType = normalizeTypeForCategory(unitCategory, baseTypeRaw);
  const minPrice = parseOptionalNumber(formData.get("unitStartPrice")?.toString());
  const maxPrice = parseOptionalNumber(formData.get("unitMaxPrice")?.toString()) ?? undefined;
  if (!projectId) {
    return;
  }
  if (minPrice == null || minPrice <= 0) {
    redirect(`/developer/projects?project=${projectId}`);
  }

  const finishingStatus = formData.get("unitFinishing")?.toString().trim() || undefined;
  const unitAreaMin = parseOptionalNumber(formData.get("unitMinBua")?.toString()) ?? undefined;
  const unitAreaMax = parseOptionalNumber(formData.get("unitMaxBua")?.toString()) ?? undefined;
  const landAreaMin = parseOptionalNumber(formData.get("unitMinLand")?.toString()) ?? undefined;
  const landAreaMax = parseOptionalNumber(formData.get("unitMaxLand")?.toString()) ?? undefined;
  const heroImageFile = formData.get("unitHeroImage");
  const description = formData.get("unitDescription")?.toString() || undefined;
  const label: string = baseType;

  let heroImageUrl: string | undefined = undefined;
  if (isFile(heroImageFile)) {
    heroImageUrl = await uploadFileToBucket({
      bucket: STORAGE_BUCKETS.projectUnitImages,
      pathPrefix: `developers/${session.developerId}/projects/${projectId}/unit-types`,
      file: heroImageFile,
    });
  }

  const { data, error } = await upsertProjectUnitType(session.developerId, projectId, {
    id: unitTypeId,
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
  if (error) {
    revalidatePath("/developer/projects");
    return;
  }
  if (!unitTypeId && data?.id) {
    redirect(`/developer/projects?project=${projectId}`);
  }
  revalidatePath("/developer/projects");
}

async function deleteUnitTypeAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperSession();
  const unitTypeId = formData.get("unitTypeId")?.toString();
  if (!unitTypeId) return;
  await deleteProjectUnitType(session.developerId, unitTypeId);
  revalidatePath("/developer/projects");
}

async function upsertProjectUnitVariantAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperSession();
  const projectId = formData.get("projectId")?.toString();
  const unitTypeId = formData.get("unitTypeId")?.toString();
  const variantId = formData.get("variantId")?.toString() || undefined;
  const variantCategory = normalizeCategory(formData.get("variantCategory")?.toString());
  const variantTypeRaw = formData.get("variantType")?.toString().trim() || "";
  const variantType = normalizeTypeForCategory(variantCategory, variantTypeRaw);
  const minPriceValue = formData.get("variantMinPrice")?.toString();
  const minPrice = minPriceValue ? Number(minPriceValue) : NaN;
  if (!projectId || !unitTypeId || Number.isNaN(minPrice) || minPrice <= 0) {
    return;
  }

  const toOptionalNumber = (value?: string | null, allowZero = false) => {
    if (!value || !value.trim()) return undefined;
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return undefined;
    if (!allowZero && parsed <= 0) return undefined;
    return parsed;
  };

  const maxPrice = toOptionalNumber(formData.get("variantMaxPrice")?.toString(), true);
  const bedrooms = toOptionalNumber(formData.get("variantBedrooms")?.toString(), true);
  const bathrooms = toOptionalNumber(formData.get("variantBathrooms")?.toString(), true);
  const stock = toOptionalNumber(formData.get("variantStock")?.toString(), true);
  const downPayment = toOptionalNumber(formData.get("variantDownPayment")?.toString(), true);
  const installmentYears = toOptionalNumber(formData.get("variantInstallmentYears")?.toString(), true);
  const areaMin = toOptionalNumber(formData.get("variantAreaMin")?.toString(), true);
  const areaMax = toOptionalNumber(formData.get("variantAreaMax")?.toString(), true);
  const landAreaMin = toOptionalNumber(formData.get("variantLandMin")?.toString(), true);
  const landAreaMax = toOptionalNumber(formData.get("variantLandMax")?.toString(), true);
  const description = formData.get("variantDescription")?.toString() || undefined;
  const amenities = formData
    .getAll("variantAmenities")
    .map((value) => value.toString())
    .filter(Boolean);

  await upsertProjectUnitVariant(session.developerId, unitTypeId, {
    id: variantId,
    category: variantCategory,
    label: variantType,
    minPrice,
    maxPrice,
    bedrooms,
    bathrooms,
    unitAreaMin: areaMin,
    unitAreaMax: areaMax,
    landAreaMin,
    landAreaMax,
    downPaymentPercent: downPayment,
    installmentYears,
    stockCount: stock,
    description,
    amenities: amenities.length ? amenities : undefined,
  });
  redirect(`/developer/projects?project=${projectId}&unitType=${unitTypeId}&variants=1`);
}

async function deleteVariantAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperSession();
  const projectId = formData.get("projectId")?.toString();
  const variantId = formData.get("variantId")?.toString();
  if (!projectId || !variantId) return;
  await deleteProjectUnitVariant(session.developerId, variantId);
  redirect(`/developer/projects?project=${projectId}`);
}

async function importTypeWithVariantsAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperSession();
  const projectId = formData.get("projectId")?.toString();
  const payloadRaw = formData.get("payload")?.toString();
  if (!projectId || !payloadRaw) return;

  let payload: {
    baseType: string;
    finishingStatus?: string;
    description?: string;
    variants: Array<{
      bedrooms?: number;
      bathrooms?: number;
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

  const importedPrices = payload.variants
    .map((variant) => variant.price)
    .filter((value): value is number => typeof value === "number" && value > 0);
  if (!importedPrices.length) {
    redirect(`/developer/projects?project=${projectId}`);
  }

  const inferredCategory = inferCategoryFromType(payload.baseType);
  const { data, error } = await upsertProjectUnitType(session.developerId, projectId, {
    category: inferredCategory,
    label: payload.baseType,
    minPrice: Math.min(...importedPrices),
    maxPrice: Math.max(...importedPrices),
    unitAreaMin: (() => {
      const values = payload?.variants.map((variant) => variant.areaMin).filter((value): value is number => typeof value === "number");
      return values.length ? Math.min(...values) : undefined;
    })(),
    unitAreaMax: (() => {
      const values = payload?.variants
        .flatMap((variant) => [variant.areaMax, variant.areaMin])
        .filter((value): value is number => typeof value === "number");
      return values.length ? Math.max(...values) : undefined;
    })(),
    finishingStatus: payload.finishingStatus,
    description: payload.description,
  });
  if (error || !data?.id) {
    redirect(`/developer/projects?project=${projectId}`);
    return;
  }

  for (const variant of payload.variants) {
    if (!variant.price || variant.price <= 0) continue;
    await upsertProjectUnitVariant(session.developerId, data.id, {
      category: inferredCategory,
      label: payload.baseType,
      minPrice: variant.price,
      maxPrice: variant.price,
      bedrooms: variant.bedrooms,
      bathrooms: variant.bathrooms,
      unitAreaMin: variant.areaMin,
      unitAreaMax: variant.areaMax,
      downPaymentPercent: variant.downPayment,
      installmentYears: variant.installmentYears,
      stockCount: variant.stockCount,
      description: variant.description,
      amenities: variant.amenities,
    });
  }

  redirect(`/developer/projects?project=${projectId}`);
}
