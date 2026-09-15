"use client";

import { useEffect, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { DownPaymentStages } from "@/components/DownPaymentStages";
import { DeveloperMediaField } from "@/components/DeveloperMediaField";
import { ProjectWizard, type ProjectWizardAction } from "@/components/ProjectWizard";
import type { DownPaymentStage } from "@/lib/projectMerchandising";

/**
 * The project row intentionally stays structural here. This keeps the client
 * boundary independent from the server query module while accepting the row
 * returned by fetchDeveloperProjects without copying its generated type.
 */
export type DeveloperProjectCreateProject = {
  [key: string]: unknown;
  id?: string | null;
  name?: string | null;
  description?: string | null;
  location?: string | null;
  acres?: number | string | null;
  footprint?: number | string | null;
  maintenance?: number | string | null;
  ch_fees?: number | string | null;
  selling_points?: string[] | null;
  delivery_date?: string | null;
  amenities?: string[] | null;
  payment_plan_templates?: unknown;
  limited_time_offers?: unknown;
  project_types?: string[] | null;
  launch_status?: string | null;
  launch_date?: string | null;
  eoi_value_apt?: number | string | null;
  eoi_value_villa?: number | string | null;
};

export type DeveloperProjectCreateFormProps = {
  action: ProjectWizardAction;
  developerId: string;
  projects?: readonly DeveloperProjectCreateProject[];
  templateProject?: DeveloperProjectCreateProject | null;
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
] as const;

const PAYMENT_FREQUENCIES = ["Quarterly", "Monthly", "Semi-annual", "Annual"] as const;
const PROJECT_STATUS_OPTIONS = [
  { value: "new_release", label: "New Release" },
  { value: "upcoming", label: "Upcoming" },
  { value: "live", label: "Live" },
] as const;

type PaymentPlan = {
  title?: string | null;
  down_payment_percent?: number | null;
  down_payment_stages?: DownPaymentStage[];
  installment_years?: number | null;
  discount_percent?: number | null;
  payment_frequency?: string | null;
};

type Offer = PaymentPlan & { offer_title?: string | null };

function stringValue(value: unknown) {
  return value == null ? "" : String(value);
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numberValue(value: unknown) {
  return typeof value === "number" || typeof value === "string" ? value : "";
}

function dateValue(value: unknown) {
  return typeof value === "string" ? value.slice(0, 10) : "";
}

function normalizeLaunchStatus(value: unknown) {
  if (value === "new_release" || value === "new_launch") return "new_release";
  if (value === "upcoming") return "upcoming";
  if (value == null || value === "") return "upcoming";
  return "live";
}

function paymentPlan(value: unknown): PaymentPlan | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const stages = Array.isArray(item.down_payment_stages)
    ? item.down_payment_stages.filter((stage): stage is DownPaymentStage => Boolean(stage) && typeof stage === "object" && typeof (stage as Record<string, unknown>).percent === "number" && typeof (stage as Record<string, unknown>).after_months === "number")
    : [];
  return {
    title: typeof item.title === "string" ? item.title : null,
    down_payment_percent: typeof item.down_payment_percent === "number" ? item.down_payment_percent : null,
    down_payment_stages: stages,
    installment_years: typeof item.installment_years === "number" ? item.installment_years : null,
    discount_percent: typeof item.discount_percent === "number" ? item.discount_percent : null,
    payment_frequency: typeof item.payment_frequency === "string" ? item.payment_frequency : null,
  };
}

function offer(value: unknown): Offer | null {
  const plan = paymentPlan(value);
  if (!plan || typeof value !== "object") return null;
  const offerTitle = (value as Record<string, unknown>).offer_title;
  return { ...plan, offer_title: typeof offerTitle === "string" ? offerTitle : plan.title };
}

function defaultFacilities(project?: DeveloperProjectCreateProject | null) {
  const selected = stringList(project?.amenities);
  return selected.filter((value) => !AMENITIES.some((item) => item.slug === value)).join("\n");
}

type FieldInputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; as?: undefined };
type FieldTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; as: "textarea" };

function Field(props: FieldInputProps | FieldTextareaProps) {
  const { label, as, ...rest } = props;
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">{label}</span>
      {as === "textarea" ? (
        <textarea
          className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3 outline-none focus:border-black/40 focus:ring-2 focus:ring-[#dff579]"
          rows={(rest as FieldTextareaProps).rows ?? 3}
          {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : (
        <input
          className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3 outline-none focus:border-black/40 focus:ring-2 focus:ring-[#dff579]"
          {...(rest as InputHTMLAttributes<HTMLInputElement>)}
        />
      )}
    </label>
  );
}

function hasUnsavedValues() {
  const form = document.getElementById("project-creator") as HTMLFormElement | null;
  if (!form) return false;
  return Array.from(form.elements).some((control) => {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return false;
    if (control instanceof HTMLInputElement && control.type === "file") return Boolean(control.files?.length);
    if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) return control.checked !== control.defaultChecked;
    const initialValue = control instanceof HTMLSelectElement
      ? Array.from(control.options).find((option) => option.defaultSelected)?.value ?? ""
      : control.defaultValue;
    return control.value !== initialValue;
  });
}

function TemplatePicker({ projects, templateProject }: { projects: readonly DeveloperProjectCreateProject[]; templateProject?: DeveloperProjectCreateProject | null }) {
  if (!projects.length) return null;
  const selectedTemplateId = stringValue(templateProject?.id);
  return (
    <details open={Boolean(templateProject)} className="rounded-2xl border border-black/10 bg-neutral-50 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-neutral-800">Start from a saved project template <span className="font-normal text-neutral-500">· optional</span></summary>
      <p className="mt-2 text-xs leading-5 text-neutral-500">A template only supplies starting values. Your new project is always created separately; review the fields before saving.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {projects.slice(0, 6).map((project) => {
          const id = stringValue(project.id);
          const name = stringValue(project.name) || "Untitled project";
          const selected = Boolean(selectedTemplateId && id === selectedTemplateId);
          return (
            <a
              key={id || name}
              href={`/developer/projects?create=1&template=${encodeURIComponent(id)}`}
              onClick={(event) => {
                if (!hasUnsavedValues() || window.confirm("Changing the template may replace the current starting values. Continue?")) return;
                event.preventDefault();
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${selected ? "border-black bg-black text-white" : "border-black/10 bg-white text-neutral-600 hover:border-black/30 hover:text-black"}`}
            >
              {name}
            </a>
          );
        })}
      </div>
      {templateProject ? <p className="mt-3 text-xs font-medium text-neutral-700">Using “{stringValue(templateProject.name) || "Untitled project"}” as a starting point.</p> : null}
    </details>
  );
}

function SharedAmenities({ templateProject }: { templateProject?: DeveloperProjectCreateProject | null }) {
  const selected = stringList(templateProject?.amenities);
  return (
    <details className="rounded-2xl border border-black/10 bg-neutral-50 p-4" open={selected.length > 0}>
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.24em] text-neutral-600">Shared amenities · optional</summary>
      <p className="mt-2 text-xs text-neutral-500">Choose features shared across the project. You can add or change them later.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {AMENITIES.map((amenity) => (
          <label key={amenity.slug} className="cursor-pointer">
            <input
              type="checkbox"
              className="peer sr-only"
              name="projectAmenities"
              value={amenity.slug}
              defaultChecked={selected.includes(amenity.slug)}
            />
            <span className="inline-flex min-h-9 items-center rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-neutral-600 transition peer-checked:border-black peer-checked:bg-black peer-checked:text-white hover:border-black/30">
              {amenity.label}
            </span>
          </label>
        ))}
      </div>
    </details>
  );
}

function PaymentPlanFields({ templateProject }: { templateProject?: DeveloperProjectCreateProject | null }) {
  const plans = Array.isArray(templateProject?.payment_plan_templates) ? templateProject.payment_plan_templates.map(paymentPlan) : [];
  const offers = Array.isArray(templateProject?.limited_time_offers) ? templateProject.limited_time_offers.map(offer) : [];
  return (
    <details className="rounded-2xl border border-black/10 bg-neutral-50 p-4" open={plans.some(Boolean) || offers.some(Boolean)}>
      <summary className="cursor-pointer text-sm font-semibold text-neutral-800">Commercial terms <span className="font-normal text-neutral-500">· optional</span></summary>
      <p className="mt-2 text-xs leading-5 text-neutral-500">Payment plans and offers can be completed after the project is created. Leave every field blank if pricing is not ready.</p>
      <div className="mt-4 space-y-3">
        {[0, 1, 2].map((index) => {
          const plan = plans[index] ?? null;
          return (
            <details key={`plan-${index}`} className="rounded-2xl border border-black/10 bg-white p-3" open={index === 0 && Boolean(plan)}>
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Original plan {index + 1}{index > 0 ? " · optional" : ""}</summary>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <Field label="Title" name={`paymentPlanTitle_${index}`} placeholder="Original plan" defaultValue={stringValue(plan?.title)} />
                <Field label="Down payment %" name={`paymentPlanDown_${index}`} type="number" min="0" max="100" step="0.01" placeholder="10" defaultValue={numberValue(plan?.down_payment_percent)} />
                <Field label="Installment years" name={`paymentPlanYears_${index}`} type="number" min="1" step="1" placeholder="8" defaultValue={numberValue(plan?.installment_years)} />
                <Field label="Discount %" name={`paymentPlanDiscount_${index}`} type="number" min="0" max="100" step="0.01" placeholder="0" defaultValue={numberValue(plan?.discount_percent)} />
              </div>
              <label className="mt-3 flex flex-col gap-1 text-sm">
                <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Payment frequency</span>
                <select className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3" name={`paymentPlanFrequency_${index}`} defaultValue={stringValue(plan?.payment_frequency) || "Quarterly"}>
                  {PAYMENT_FREQUENCIES.map((frequency) => <option key={frequency} value={frequency}>{frequency}</option>)}
                </select>
              </label>
              <DownPaymentStages prefix={`paymentPlan${index}`} stages={plan?.down_payment_stages} />
            </details>
          );
        })}
      </div>
      <details className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3" open={Boolean(offers[0])}>
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Limited-time offer · optional</summary>
        <p className="mt-2 text-xs text-amber-800/80">Add a temporary offer now or leave it for the commercial workspace.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Field label="Offer title" name="offerTitle_0" placeholder="Ramadan offer" defaultValue={stringValue(offers[0]?.offer_title)} />
          <Field label="Down payment %" name="offerDown_0" type="number" min="0" max="100" step="0.01" placeholder="5" defaultValue={numberValue(offers[0]?.down_payment_percent)} />
          <Field label="Installment years" name="offerYears_0" type="number" min="1" step="1" placeholder="10" defaultValue={numberValue(offers[0]?.installment_years)} />
          <Field label="Discount %" name="offerDiscount_0" type="number" min="0" max="100" step="0.01" placeholder="15" defaultValue={numberValue(offers[0]?.discount_percent)} />
        </div>
        <label className="mt-3 flex flex-col gap-1 text-sm">
          <span className="text-xs uppercase tracking-[0.3em] text-amber-700">Payment frequency</span>
          <select className="rounded-2xl border border-amber-200 bg-white px-4 py-3" name="offerFrequency_0" defaultValue={stringValue(offers[0]?.payment_frequency) || "Quarterly"}>
            {PAYMENT_FREQUENCIES.map((frequency) => <option key={frequency} value={frequency}>{frequency}</option>)}
          </select>
        </label>
        <DownPaymentStages prefix="offer0" stages={offers[0]?.down_payment_stages} />
      </details>
    </details>
  );
}

function LaunchFields({ templateProject }: { templateProject?: DeveloperProjectCreateProject | null }) {
  return (
    <details className="rounded-2xl border border-black/10 bg-neutral-50 p-4" open={Boolean(templateProject?.launch_date || templateProject?.project_types?.length)}>
      <summary className="cursor-pointer text-sm font-semibold text-neutral-800">Launch settings <span className="font-normal text-neutral-500">· optional</span></summary>
      <p className="mt-2 text-xs leading-5 text-neutral-500">These labels help your team plan the release. You can refine them after creating the project.</p>
      <div className="mt-4 space-y-3">
        <Field as="textarea" label="Property types" name="projectTypes" rows={2} placeholder="Apartment, Duplex, Townhouse" defaultValue={stringList(templateProject?.project_types).join(", ")} />
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Launch status</span>
            <select className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3" name="launchStatus" defaultValue={normalizeLaunchStatus(templateProject?.launch_status)}>
              {PROJECT_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <Field label="Launch date" name="launchDate" type="date" defaultValue={dateValue(templateProject?.launch_date)} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="EOI value (Apt)" name="eoiValueApt" type="number" min="0" step="1" placeholder="100000" defaultValue={numberValue(templateProject?.eoi_value_apt)} />
          <Field label="EOI value (Villa)" name="eoiValueVilla" type="number" min="0" step="1" placeholder="250000" defaultValue={numberValue(templateProject?.eoi_value_villa)} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Commission rate (%)" name="commissionRate" type="number" min="0" max="100" step="0.01" placeholder="2.50" />
          <Field label="Platform share (%)" name="platformShare" type="number" min="0" max="100" step="0.01" placeholder="0.25" />
        </div>
      </div>
    </details>
  );
}

type ReviewSnapshot = {
  name: string;
  location: string;
  description: string;
  delivery: string;
  types: string;
  launchStatus: string;
  sellingPoints: number;
  facilities: number;
  amenities: string[];
  materials: string[];
};

function readReviewSnapshot(form: HTMLFormElement): ReviewSnapshot {
  const value = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null)?.value.trim() ?? "";
  const checkedAmenities = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="projectAmenities"]:checked')).map((input) => AMENITIES.find((item) => item.slug === input.value)?.label ?? input.value);
  const materialNames = [
    ["project_logo", "Project logo"],
    ["project_images", "Project images"],
    ["project_brochure", "Brochure"],
    ["project_masterplan", "Masterplan"],
    ["voice_notes", "Voice notes"],
    ["project_videos", "HD videos"],
  ].flatMap(([name, label]) => {
    const input = form.elements.namedItem(name) as HTMLInputElement | null;
    return input?.files?.length ? [`${label} · ${input.files.length}`] : [];
  });
  const mediaUrls = [
    ["project_logo_url", "Logo URL"],
    ["project_image_urls", "Image URLs"],
    ["project_brochure_url", "Brochure URL"],
    ["project_masterplan_url", "Masterplan URL"],
    ["voice_note_urls", "Voice URLs"],
    ["project_video_urls", "Video URLs"],
  ].flatMap(([name, label]) => value(name) ? [label] : []);
  return {
    name: value("name"),
    location: value("location"),
    description: value("description"),
    delivery: value("deliveryDate"),
    types: value("projectTypes"),
    launchStatus: value("launchStatus"),
    sellingPoints: value("sellingPoints").split(/\r?\n/).filter(Boolean).length,
    facilities: value("customFacilities").split(/\r?\n/).filter(Boolean).length,
    amenities: checkedAmenities,
    materials: [...materialNames, ...mediaUrls],
  };
}

function ProjectReviewSummary() {
    const [snapshot, setSnapshot] = useState<ReviewSnapshot>({ name: "", location: "", description: "", delivery: "", types: "", launchStatus: "", sellingPoints: 0, facilities: 0, amenities: [], materials: [] });
  useEffect(() => {
    const form = document.getElementById("project-creator") as HTMLFormElement | null;
    if (!form) return;
    const update = () => setSnapshot(readReviewSnapshot(form));
    update();
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    form.addEventListener("project-wizard-sync", update);
    return () => {
      form.removeEventListener("input", update);
      form.removeEventListener("change", update);
      form.removeEventListener("project-wizard-sync", update);
    };
  }, []);
  const valueOrNotSet = (value: string) => value || "Not set yet";
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-4" aria-labelledby="project-review-summary">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p id="project-review-summary" className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">Your project so far</p>
          <h3 className="mt-2 text-lg font-semibold text-neutral-950">{valueOrNotSet(snapshot.name)}</h3>
          <p className="mt-1 text-sm text-neutral-500">{valueOrNotSet(snapshot.location)}</p>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600">Draft until reviewed</span>
      </div>
      <p className="mt-4 line-clamp-3 text-sm leading-6 text-neutral-700">{valueOrNotSet(snapshot.description)}</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-neutral-50 p-3"><dt className="text-xs uppercase tracking-[0.18em] text-neutral-400">Delivery</dt><dd className="mt-1 font-medium text-neutral-800">{valueOrNotSet(snapshot.delivery)}</dd></div>
            <div className="rounded-xl bg-neutral-50 p-3"><dt className="text-xs uppercase tracking-[0.18em] text-neutral-400">Property types</dt><dd className="mt-1 font-medium text-neutral-800">{valueOrNotSet(snapshot.types)}</dd></div>
            <div className="rounded-xl bg-neutral-50 p-3"><dt className="text-xs uppercase tracking-[0.18em] text-neutral-400">Launch status</dt><dd className="mt-1 font-medium capitalize text-neutral-800">{valueOrNotSet(snapshot.launchStatus).replaceAll("_", " ")}</dd></div>
        <div className="rounded-xl bg-neutral-50 p-3"><dt className="text-xs uppercase tracking-[0.18em] text-neutral-400">Story & facilities</dt><dd className="mt-1 font-medium text-neutral-800">{snapshot.sellingPoints} selling points · {snapshot.facilities} custom facilities</dd></div>
        <div className="rounded-xl bg-neutral-50 p-3"><dt className="text-xs uppercase tracking-[0.18em] text-neutral-400">Materials</dt><dd className="mt-1 font-medium text-neutral-800">{snapshot.materials.length ? snapshot.materials.join(" · ") : "None added yet"}</dd></div>
      </dl>
      {snapshot.amenities.length ? <p className="mt-4 text-xs leading-5 text-neutral-600"><span className="font-semibold text-neutral-800">Shared amenities:</span> {snapshot.amenities.join(" · ")}</p> : null}
    </section>
  );
}

export function DeveloperProjectCreateForm({ action, developerId, projects = [], templateProject }: DeveloperProjectCreateFormProps) {
  const existingProjectNames = projects.map((project) => stringValue(project.name)).filter(Boolean);
  const [mediaResetKey, setMediaResetKey] = useState(0);
  useEffect(() => {
    const form = document.getElementById("project-creator");
    if (!form) return;
    const handleWizardSync = (event: Event) => {
      const reset = (event as CustomEvent<{ reset?: boolean }>).detail?.reset;
      if (reset) setMediaResetKey((current) => current + 1);
    };
    form.addEventListener("project-wizard-sync", handleWizardSync);
    return () => form.removeEventListener("project-wizard-sync", handleWizardSync);
  }, []);
  return (
    <ProjectWizard action={action} developerId={developerId} existingProjectNames={existingProjectNames} draftContext={templateProject?.id ?? null}>
      <div data-wizard-panel="details" className="space-y-4">
        <TemplatePicker projects={projects} templateProject={templateProject} />
        <div className="rounded-2xl border border-black/10 bg-white">
          <div className="border-b border-black/5 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">Start with the essentials</p>
            <p className="mt-1 text-xs text-neutral-500">Only a name is needed to create the project. Everything else can be refined later.</p>
          </div>
          <div className="space-y-4 p-4">
            <Field label="Project name" name="name" placeholder="Marina Vista Residences" required minLength={3} autoComplete="off" defaultValue={templateProject?.name ? `${stringValue(templateProject.name)} Copy` : ""} />
            <Field label="Location" name="location" placeholder="North Coast, Ras El Hekma" defaultValue={stringValue(templateProject?.location)} />
            <Field as="textarea" label="Project story" name="description" placeholder="What should a buyer know first? Add the project's character, highlights, or positioning." defaultValue={stringValue(templateProject?.description)} />
          </div>
        </div>
        <details className="rounded-2xl border border-black/10 bg-neutral-50 p-4" open={Boolean(templateProject?.acres || templateProject?.footprint || templateProject?.maintenance || templateProject?.ch_fees || templateProject?.delivery_date || templateProject?.selling_points?.length)}>
          <summary className="cursor-pointer text-sm font-semibold text-neutral-800">Project facts and facilities <span className="font-normal text-neutral-500">· optional</span></summary>
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Acres" name="acres" type="number" min="0" step="0.01" placeholder="120" defaultValue={numberValue(templateProject?.acres)} />
              <Field label="Footprint (%)" name="footprint" type="number" min="0" max="100" step="0.01" placeholder="18" defaultValue={numberValue(templateProject?.footprint)} />
              <Field label="Maintenance" name="maintenance" type="number" min="0" step="0.01" placeholder="8" defaultValue={numberValue(templateProject?.maintenance)} />
              <Field label="CH fees" name="chFees" type="number" min="0" step="0.01" placeholder="250000" defaultValue={numberValue(templateProject?.ch_fees)} />
            </div>
            <Field as="textarea" label="Project selling points" name="sellingPoints" placeholder="One selling point per line" maxLength={15050} defaultValue={stringList(templateProject?.selling_points).join("\n")} />
            <Field label="Expected delivery date" name="deliveryDate" type="date" defaultValue={dateValue(templateProject?.delivery_date)} />
            <Field as="textarea" label="Additional project facilities" name="customFacilities" placeholder="One facility per line" defaultValue={defaultFacilities(templateProject)} />
          </div>
        </details>
        <SharedAmenities templateProject={templateProject} />
      </div>

      <div data-wizard-panel="materials" className="space-y-4">
        <div className="rounded-2xl border border-[#dceaa3] bg-[#f7fbe7] p-4">
          <p className="text-sm font-semibold text-[#405000]">Add what is ready today</p>
          <p className="mt-1 text-xs leading-5 text-[#52630c]">Upload files or paste hosted URLs. Files are sent only when you create the project; browser drafts never store uploads.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <DeveloperMediaField key={`project-logo-${mediaResetKey}`} label="Project logo" description="Used in this project's portal header." fileName="project_logo" urlName="project_logo_url" accept="image/*" />
          <DeveloperMediaField key={`project-images-${mediaResetKey}`} label="Project images" description="Upload, drop, or paste image URLs to build the project gallery." fileName="project_images" urlName="project_image_urls" accept="image/*" multiple />
          <DeveloperMediaField key={`project-brochure-${mediaResetKey}`} label="Project brochure (PDF)" fileName="project_brochure" urlName="project_brochure_url" accept="application/pdf" />
          <DeveloperMediaField key={`project-masterplan-${mediaResetKey}`} label="Masterplan" fileName="project_masterplan" urlName="project_masterplan_url" accept="application/pdf,image/*" />
          <DeveloperMediaField key={`voice-notes-${mediaResetKey}`} label="Voice notes" fileName="voice_notes" urlName="voice_note_urls" accept="audio/*" multiple />
          <DeveloperMediaField key={`project-videos-${mediaResetKey}`} label="HD project videos" description="Upload originals or paste hosted HD video URLs." fileName="project_videos" urlName="project_video_urls" accept="video/*" multiple />
        </div>
        <p className="text-xs text-neutral-500">Inventory spreadsheets are added from the project workspace after creation, where the filled Brixeler template can be checked before import.</p>
      </div>

      <div data-wizard-panel="review" className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">One last look</p>
          <h2 className="mt-1 text-xl font-semibold text-neutral-950">Review & create</h2>
          <p className="mt-1 text-sm leading-6 text-neutral-500">Create a draft now. Approval and mobile publication remain separate review steps.</p>
        </div>
        <ProjectReviewSummary />
        <PaymentPlanFields templateProject={templateProject} />
        <LaunchFields templateProject={templateProject} />
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">Ready when you are</p>
          <p className="mt-1 text-xs leading-5 text-emerald-800">Your project will be saved as a draft. Add phases and inventory next, then submit it for review from the project workspace.</p>
        </div>
      </div>
    </ProjectWizard>
  );
}
