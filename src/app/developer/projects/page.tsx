import { revalidatePath } from "next/cache";
import Link from "next/link";
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
  upsertDeveloperProject,
  upsertProjectUnitType,
  upsertProjectUnitVariant,
} from "@/lib/developerQueries";
import { STORAGE_BUCKETS, isFile, uploadFileToBucket } from "@/lib/storageServer";

export const dynamic = "force-dynamic";

const FINISHING_STATUSES = [
  { value: "finished", label: "Fully finished" },
  { value: "semi_finished", label: "Semi finished" },
  { value: "core_and_shell", label: "Core & shell" },
  { value: "furnished", label: "Furnished" },
];

const PROPERTY_TYPES = [
  "Studio",
  "Apartment",
  "Duplex",
  "Quadhouse",
  "Townhouse",
  "Twinhouse",
  "Standalone",
];

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
  }>;
}) {
  const session = await requireDeveloperSession();
  const [projects, profile] = await Promise.all([
    fetchDeveloperProjects(session.developerId),
    fetchDeveloperProfile(session.developerId),
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
  const selectedProjectId =
    activeProjectId && projects.some((project) => project.id === activeProjectId)
      ? activeProjectId
      : projects[0]?.id ?? null;
  const selectedProject = selectedProjectId
    ? projects.find((project) => project.id === selectedProjectId)
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
              <Field label="Project name" name="name" placeholder="Marina Vista Residences" required />
              <Field
                as="textarea"
                label="Description"
                name="description"
                placeholder="Key highlights, payment terms, delivery date..."
              />
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
                Add property types and variants directly in the dashboard.
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
                  href="/templates/developer-project-import.xlsx"
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
                      href="/templates/developer-project-import.xlsx"
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
                  <Field label="Project name" name="name" placeholder="Marina Vista Residences" required />
                  <Field
                    as="textarea"
                    label="Description"
                    name="description"
                    placeholder="Key highlights, payment terms, delivery date..."
                  />
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
                  <div className="rounded-2xl border border-black/10 bg-neutral-50 p-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Add amenities</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      Select all amenities that are shared across this project.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {AMENITIES.map((amenity) => {
                        const isSelected = (selectedProject as any)?.amenities?.includes(amenity.slug);
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
                    This property type wasn't loaded yet. You can still add a variant.
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
                const heroMedia = project.hero_media as Record<string, any> | null;
                const imageCount = Array.isArray(heroMedia?.images) ? heroMedia?.images.length : 0;
                const hasBrochure = Boolean(heroMedia?.brochureUrl);
                return (
                  (imageCount || hasBrochure || project.voice_notes?.length || project.video_links?.length) ? (
                    <div className="mt-3 space-y-2 text-xs text-neutral-500">
                      {imageCount ? <p>Images: {imageCount}</p> : null}
                      {hasBrochure ? <p>Brochure: uploaded</p> : null}
                      {project.voice_notes?.length ? <p>Voice notes: {project.voice_notes.length}</p> : null}
                      {project.video_links?.length ? <p>Videos: {project.video_links.length}</p> : null}
                    </div>
                  ) : null
                );
              })()}
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
                              No variants yet. Add your first one below — you can add more variants later if the area or payment plan changes.
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
                            <UnitTypeForm projectId={project.id} unitType={unit} />
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
                  <p className="mt-2 text-sm text-neutral-500">No property types yet. Add each bedroom mix below.</p>
                )}
                <div id="add-property-types" className="mt-4 rounded-2xl border border-black/5 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Add property type</p>
                  <div className="mt-3 space-y-3">
                    <UnitTypeForm projectId={project.id} />
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
  unitType?: {
    id: string;
    label: string;
    finishing_status?: string | null;
    hero_image_url?: string | null;
    description?: string | null;
    project_unit_variants?: Array<{
      id: string;
      bedrooms?: number | null;
      bathrooms?: number | null;
      min_price: number;
      unit_area_min?: number | null;
      unit_area_max?: number | null;
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

function UnitTypeForm({ projectId, unitType }: UnitTypeFormProps) {
  const baseTypeValue =
    PROPERTY_TYPES.find((type) => unitType?.label?.startsWith(type)) ?? "Apartment";
  return (
    <form action={upsertProjectUnitTypeAction} className="space-y-3 text-sm">
      <input type="hidden" name="projectId" value={projectId} />
      {unitType ? <input type="hidden" name="unitTypeId" value={unitType.id} /> : null}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Property type</span>
        <select
          className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
          name="unitBaseType"
          defaultValue={baseTypeValue}
          required
        >
          {PROPERTY_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
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
        label="Finishing status"
        name="unitFinishing"
        list={`finishing-statuses-${projectId}`}
        defaultValue={unitType?.finishing_status ?? undefined}
        placeholder="finished"
      />
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
    bedrooms?: number | null;
    bathrooms?: number | null;
    min_price: number;
    unit_area_min?: number | null;
    unit_area_max?: number | null;
    down_payment_percent?: number | null;
    installment_years?: number | null;
    stock_count?: number | null;
    description?: string | null;
    amenities?: string[] | null;
  };
}) {
  const selectedAmenities = new Set(variant?.amenities ?? []);
  return (
    <>
      <form action={upsertProjectUnitVariantAction} className="space-y-3 text-sm">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="unitTypeId" value={unitTypeId} />
        {variant ? <input type="hidden" name="variantId" value={variant.id} /> : null}
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
            label="Price (EGP)"
            name="variantMinPrice"
            type="number"
            min="100000"
            required
            defaultValue={variant ? Number(variant.min_price ?? 0) : undefined}
          />
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
            label="Area min (m²)"
            name="variantAreaMin"
            type="number"
            min="0"
            step="1"
            defaultValue={variant?.unit_area_min ?? undefined}
            placeholder="120"
          />
          <Field
            label="Area max (m²)"
            name="variantAreaMax"
            type="number"
            min="0"
            step="1"
            defaultValue={variant?.unit_area_max ?? undefined}
            placeholder="240"
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
  bedrooms?: number | null;
  bathrooms?: number | null;
  unit_area_min?: number | null;
  unit_area_max?: number | null;
  min_price: number;
  installment_years?: number | null;
  down_payment_percent?: number | null;
}) {
  const beds = variant.bedrooms != null ? `${variant.bedrooms}BR` : "?BR";
  const baths = variant.bathrooms != null ? `${variant.bathrooms}BA` : "?BA";
  const area = variant.unit_area_min
    ? variant.unit_area_max && variant.unit_area_max !== variant.unit_area_min
      ? `${variant.unit_area_min}-${variant.unit_area_max}m²`
      : `${variant.unit_area_min}m²`
    : "Area TBD";
  const price = Number.isFinite(Number(variant.min_price))
    ? `EGP ${Number(variant.min_price).toLocaleString()}`
    : "Price TBD";
  const installments = variant.installment_years ? `${variant.installment_years}y` : null;
  const down = variant.down_payment_percent != null ? `${variant.down_payment_percent}%` : null;
  return [beds, baths, area, price, installments, down].filter(Boolean).join(" · ");
}

async function upsertProjectAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperSession();
  const id = formData.get("projectId")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!name) return;
  const description = formData.get("description")?.toString() ?? undefined;
  const amenities = formData
    .getAll("projectAmenities")
    .map((value) => value.toString())
    .filter(Boolean);
  const projectKey = id || `new-${Date.now()}`;
  const projectBasePath = `developers/${session.developerId}/projects/${projectKey}`;

  const imageFiles = formData.getAll("project_images").filter(isFile) as File[];
  const brochureFile = formData.get("project_brochure");
  const voiceFiles = formData.getAll("voice_notes").filter(isFile) as File[];
  const videoFiles = formData.getAll("project_videos").filter(isFile) as File[];

  const existingProjects = id ? await fetchDeveloperProjects(session.developerId) : [];
  const existingProject = id ? existingProjects.find((project) => project.id === id) : undefined;
  const existingHeroMedia =
    existingProject?.hero_media && typeof existingProject.hero_media === "object"
      ? { ...(existingProject.hero_media as Record<string, any>) }
      : {};
  const heroMedia: Record<string, any> = { ...existingHeroMedia };
  let heroMediaUpdated = false;

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

  const { data, error } = await upsertDeveloperProject(session.developerId, {
    id: id || undefined,
    name,
    description,
    hero_media: heroMediaUpdated ? heroMedia : undefined,
    voice_notes: voiceNoteUrls?.length ? voiceNoteUrls : undefined,
    video_links: videoUrls?.length ? videoUrls : undefined,
    amenities: amenities.length ? amenities : undefined,
  });
  if (!error && data?.id) {
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

async function upsertProjectUnitTypeAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperSession();
  const projectId = formData.get("projectId")?.toString();
  const unitTypeId = formData.get("unitTypeId")?.toString() || undefined;
  const baseTypeRaw = formData.get("unitBaseType")?.toString().trim() || "";
  const baseType = PROPERTY_TYPES.includes(baseTypeRaw) ? baseTypeRaw : "Apartment";
  if (!projectId) {
    return;
  }

  const finishingStatus = formData.get("unitFinishing")?.toString().trim() || undefined;
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
    label,
    finishingStatus,
    description,
    heroImageUrl,
  });
  if (error) {
    revalidatePath("/developer/projects");
    return;
  }
  if (!unitTypeId && data?.id) {
    redirect(`/developer/projects?project=${projectId}&unitType=${data.id}&variants=1`);
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

  const bedrooms = toOptionalNumber(formData.get("variantBedrooms")?.toString(), true);
  const bathrooms = toOptionalNumber(formData.get("variantBathrooms")?.toString(), true);
  const stock = toOptionalNumber(formData.get("variantStock")?.toString(), true);
  const downPayment = toOptionalNumber(formData.get("variantDownPayment")?.toString(), true);
  const installmentYears = toOptionalNumber(formData.get("variantInstallmentYears")?.toString(), true);
  const areaMin = toOptionalNumber(formData.get("variantAreaMin")?.toString(), true);
  const areaMax = toOptionalNumber(formData.get("variantAreaMax")?.toString(), true);
  const description = formData.get("variantDescription")?.toString() || undefined;
  const amenities = formData
    .getAll("variantAmenities")
    .map((value) => value.toString())
    .filter(Boolean);

  await upsertProjectUnitVariant(session.developerId, unitTypeId, {
    id: variantId,
    minPrice,
    bedrooms,
    bathrooms,
    unitAreaMin: areaMin,
    unitAreaMax: areaMax,
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

  const { data, error } = await upsertProjectUnitType(session.developerId, projectId, {
    label: payload.baseType,
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
      minPrice: variant.price,
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
