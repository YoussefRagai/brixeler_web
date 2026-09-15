import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { DeveloperLayout } from "@/components/DeveloperLayout";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { DeveloperListingProjectFields } from "@/components/DeveloperListingProjectFields";
import { DeveloperMediaField } from "@/components/DeveloperMediaField";
import { currentDeveloperImpersonation, requireDeveloperCapability } from "@/lib/developerAuth";
import { archiveDeveloperListing, fetchDeveloperListing, fetchDeveloperProfile, fetchDeveloperProjects, updateDeveloperListing, requestListingRenewal, validateDeveloperProjectPhase } from "@/lib/developerQueries";
import { resolveDeveloperListingMedia } from "@/lib/developerListingMedia";
import { removeUploadedStorageObjects } from "@/lib/storageServer";
import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from "react";

const PROPERTY_TYPES = ["apartment", "villa", "townhouse", "penthouse", "duplex"];
const SALE_TYPES = [
  { value: "developer_sale", label: "Developer sale" },
  { value: "resale", label: "Resale" },
];
const FINISHING_STATUSES = ["finished", "semi_finished", "core_and_shell", "furnished"];

interface Props {
  params: { listingId: string };
  searchParams?: Promise<{ success?: string; error?: string }>;
}

export default async function EditListingPage({ params, searchParams }: Props) {
  const session = await requireDeveloperCapability("manage_inventory");
  const feedback = (await searchParams) ?? {};
  const [listing, projects, impersonation, profile] = await Promise.all([
    fetchDeveloperListing(params.listingId, session.developerId),
    fetchDeveloperProjects(session.developerId),
    currentDeveloperImpersonation(),
    fetchDeveloperProfile(session.developerId),
  ]);
  if (!listing) {
    notFound();
  }
  const activeProjects = projects
    .filter((project) => project.lifecycle_state !== "archived")
    .map((project) => ({
      ...project,
      phases: (project.developer_project_phases ?? [])
        .filter((phase) => !phase.archived_at && phase.lifecycle_state !== "archived")
        .sort((a, b) => a.phase_order - b.phase_order),
    }));

  const price = typeof listing.price === "string" ? Number(listing.price) : listing.price ?? 0;
  const visibility = listing.is_active === false ? "hidden" : "public";
  const mobileVisibility = listingMobileVisibility(listing, projects, profile);
  const expiresLabel = listing.expires_at
    ? new Date(listing.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;
  const renewalStatus = (listing.renewal_status as string) ?? "active";
  const propertyType = (listing.property_type as string) ?? PROPERTY_TYPES[0];
  const saleType = (listing.sale_type as string) ?? "developer_sale";
  const bedrooms = Number(listing.bedrooms ?? 0);
  const bathrooms = Number(listing.bathrooms ?? 0);
  const unitArea = Number(listing.unit_area ?? 0);
  const downPayment = Number(listing.down_payment_percentage ?? 0);
  const installmentYears = Number(listing.installment_years ?? 1);
  const monthlyInstallment = Number(listing.monthly_installment ?? 0);
  const finishingStatus = (listing.finishing_status as string) ?? "finished";
  const amenitiesValue = Array.isArray(listing.amenities) ? listing.amenities.join(", ") : "";
  const photosValue = Array.isArray(listing.photos) ? listing.photos.join(", ") : "";
  const deliveryDateValue = listing.delivery_date ? listing.delivery_date.slice(0, 10) : "";

  return (
    <DeveloperLayout
      title="Edit listing"
      description="Adjust the information that agents see."
      impersonation={impersonation}
      actions={
        <form action={archiveListingFromEditAction}>
          <input type="hidden" name="listingId" value={params.listingId} />
          <ConfirmSubmitButton
            className="rounded-full border border-amber-200 bg-amber-50 px-5 py-2 text-sm font-semibold text-amber-800 disabled:opacity-50"
            confirmMessage="Archive this listing? It will be hidden and retained so you can restore visibility later."
            pendingLabel="Archiving…"
          >
            Archive listing
          </ConfirmSubmitButton>
        </form>
      }
    >
      {listing.is_demo ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Demo record.</strong> This listing is part of a removable demonstration batch.
        </div>
      ) : null}
      {feedback.success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {feedback.success}
        </div>
      ) : null}
      {feedback.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {feedback.error}
        </div>
      ) : null}
      {expiresLabel && (
        <div className="mb-6 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          <p className="font-semibold">Expires {expiresLabel}</p>
          {renewalStatus === "awaiting_admin" ? (
            <p className="text-xs text-amber-600/80">Renewal pending admin approval. You will be notified when the status changes.</p>
          ) : renewalStatus === "active" ? (
            <p className="text-xs text-amber-600/80">Your listing is active. No action is required.</p>
          ) : (
            <form action={requestRenewalFromEditAction} className="mt-2 inline-flex items-center gap-3">
              <input type="hidden" name="listingId" value={params.listingId} />
              <button className="rounded-full border border-amber-400 px-4 py-2 text-xs font-semibold text-amber-700" type="submit">
                Request renewal
              </button>
              <span className="text-xs text-amber-600/90">Submit a renewal to keep this listing live.</span>
            </form>
          )}
        </div>
      )}
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <form action={updateListingAction} className="space-y-4 rounded-3xl border border-black/5 bg-white p-6">
        <input type="hidden" name="listingId" value={params.listingId} />
        <Field label="Listing title" name="name" defaultValue={listing.property_name} readOnly />
        <Field label="Area / location" name="area" defaultValue={listing.specific_location ?? ""} readOnly />
        <DeveloperListingProjectFields
          projects={activeProjects}
          initialProjectId={listing.project_id}
          initialPhaseId={listing.phase_id}
        />
        <Field label="Price (EGP)" name="price" type="number" min="100000" defaultValue={price} required />
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField label="Property type" name="propertyType" options={PROPERTY_TYPES} defaultValue={propertyType} required />
          <SelectField
            label="Sale type"
            name="saleType"
            options={SALE_TYPES.map((option) => option.value)}
            optionLabels={SALE_TYPES.reduce<Record<string, string>>((acc, option) => {
              acc[option.value] = option.label;
              return acc;
            }, {})}
            defaultValue={saleType}
            required
          />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Bedrooms" name="bedrooms" type="number" min="0" step="1" defaultValue={bedrooms} required />
          <Field label="Bathrooms" name="bathrooms" type="number" min="0" step="1" defaultValue={bathrooms} required />
          <Field label="Unit area (m²)" name="unitArea" type="number" min="10" step="10" defaultValue={unitArea} required />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Down payment (%)" name="downPayment" type="number" min="0" max="100" defaultValue={downPayment} required />
          <Field label="Installment years" name="installmentYears" type="number" min="1" step="1" defaultValue={installmentYears} required />
          <Field label="Monthly installment (EGP)" name="monthlyInstallment" type="number" min="0" defaultValue={monthlyInstallment || undefined} />
        </div>
        <Field label="Delivery date" name="deliveryDate" type="date" defaultValue={deliveryDateValue} />
        <SelectField
          label="Finishing status"
          name="finishingStatus"
          options={FINISHING_STATUSES}
          optionLabels={{
            finished: "Fully finished",
            semi_finished: "Semi finished",
            core_and_shell: "Core & shell",
            furnished: "Furnished",
          }}
          defaultValue={finishingStatus}
          required
        />
        <Field
          as="textarea"
          label="Description"
          name="description"
          defaultValue={listing.description ?? ""}
          placeholder="Key highlights, payment terms, and delivery"
          required
        />
        <Field
          as="textarea"
          label="Amenities (comma separated)"
          name="amenities"
          defaultValue={amenitiesValue}
          placeholder="Clubhouse, Rooftop pool, Concierge"
        />
        <DeveloperMediaField label="Property photos" description="Keep, replace, or add images by dropping files, browsing, or editing the URL list." fileName="photoFiles" urlName="photoUrls" accept="image/*" multiple defaultUrl={photosValue} currentValue={listing.photos?.length ? `${listing.photos.length} current photos` : null} required />
        <div className="grid gap-4 md:grid-cols-2">
          <DeveloperMediaField label="Brochure / floor plan" fileName="brochureFile" urlName="brochureUrl" accept="application/pdf,image/*,.xlsx" defaultUrl={listing.floor_plan_url ?? ""} currentValue={listing.floor_plan_url} />
          <DeveloperMediaField label="Video tour" fileName="videoFile" urlName="videoUrl" accept="video/*" defaultUrl={listing.video_tour_url ?? ""} currentValue={listing.video_tour_url} />
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Visibility</span>
          <select
            name="visibility"
            defaultValue={visibility}
            className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
          >
            <option value="public">Public after approval</option>
            <option value="hidden">Hidden from agents</option>
          </select>
          <span className="text-xs text-neutral-500">Saving listing content sends it back for review; publication and visibility are controlled separately.</span>
        </label>
        <button className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white" type="submit">
          Save changes
        </button>
      </form>
      <aside className="h-fit rounded-[2rem] bg-[#090909] p-5 text-white shadow-2xl xl:sticky xl:top-6">
        <p className="text-[10px] uppercase tracking-[0.32em] text-white/45">Mobile publish preview</p>
        <div className="mt-4 overflow-hidden rounded-[1.5rem] bg-white text-black">
          {Array.isArray(listing.photos) && listing.photos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={listing.photos[0]} alt="" className="h-44 w-full object-cover" />
          ) : (
            <div className="flex h-44 items-center justify-center bg-neutral-100 text-xs text-neutral-400">Missing cover image</div>
          )}
          <div className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold">{listing.property_name}</p>
              {mobileVisibility.isDemo ? <span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-bold text-amber-800">DEMO</span> : null}
            </div>
            <p className="text-xs text-neutral-500">{listing.specific_location || "Location missing"}</p>
            <p className="text-lg font-semibold">EGP {price.toLocaleString()}</p>
            <div className="flex flex-wrap gap-1.5 text-[10px]">
              <span className="rounded-full bg-neutral-100 px-2 py-1">{bedrooms} beds</span>
              <span className="rounded-full bg-neutral-100 px-2 py-1">{bathrooms} baths</span>
              <span className="rounded-full bg-neutral-100 px-2 py-1">{unitArea} m²</span>
            </div>
          </div>
        </div>
        <ul className="mt-4 space-y-2 text-xs text-white/65">
          <li>{listing.approval_status === "approved" ? "✓ Approved" : listing.approval_status === "rejected" ? "! Changes requested" : "○ Awaiting approval"}</li>
          <li>{listing.approval_status === "approved" && listing.published_at ? "✓ Publication approved" : "○ Publication not approved"}</li>
          <li>{mobileVisibility.visible ? "✓ Visible to agents" : mobileVisibility.isDemo ? "○ Demo · hidden from agents" : "○ Hidden from agents"}</li>
          <li>{Array.isArray(listing.photos) && listing.photos.length >= 3 ? "✓ Three or more photos" : "○ Add at least three photos"}</li>
          <li>{listing.description ? "✓ Description supplied" : "○ Description missing"}</li>
        </ul>
      </aside>
      </section>
    </DeveloperLayout>
  );
}

function listingMobileVisibility(
  listing: NonNullable<Awaited<ReturnType<typeof fetchDeveloperListing>>>,
  projects: Awaited<ReturnType<typeof fetchDeveloperProjects>>,
  profile: Awaited<ReturnType<typeof fetchDeveloperProfile>>,
) {
  const project = projects.find((item) => item.id === listing.project_id);
  const isDemo = Boolean(listing.is_demo || project?.is_demo || profile?.is_demo);
  const hidden = { visible: false, isDemo };
  if (isDemo || !profile?.is_active || profile.lifecycle_state !== "published" || !profile.published_at) return hidden;
  if (listing.archived_at || listing.is_active === false || listing.approval_status !== "approved" || !listing.published_at) return hidden;
  if (listing.availability_state && !["available", "released"].includes(listing.availability_state)) return hidden;
  if (listing.expires_at && new Date(listing.expires_at).getTime() <= Date.now()) return hidden;
  if (listing.project_id) {
    if (!project || project.approval_status !== "approved" || project.lifecycle_state !== "published" || !project.published_at) return hidden;
    if (listing.phase_id) {
      const phase = project.developer_project_phases?.find((item) => item.id === listing.phase_id);
      if (!phase || phase.archived_at || phase.approval_status !== "approved" || phase.lifecycle_state !== "published" || !phase.published_at) return hidden;
      if (!project.project_unit_types?.some((unit) => unit.phase_id === phase.id && !unit.archived_at)) return hidden;
    }
  }
  return { visible: true, isDemo };
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; as?: "input" };
type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; as: "textarea" };
type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: string[];
  optionLabels?: Record<string, string>;
};

function Field(props: InputProps | TextareaProps) {
  const { label } = props;
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">{label}</span>
      {props.as === "textarea" ? (
        <textarea
          className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
          rows={4}
          {...(props as TextareaProps)}
        />
      ) : (
        <input
          className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
          {...(props as InputProps)}
        />
      )}
    </label>
  );
}

function SelectField({ label, options, optionLabels, ...selectProps }: SelectProps) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">{label}</span>
      <select className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3" {...selectProps}>
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabels?.[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

async function updateListingAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const listingId = formData.get("listingId")?.toString();
  const projectId = formData.get("projectId")?.toString() || null;
  const phaseId = formData.get("phaseId")?.toString() || null;
  const name = formData.get("name")?.toString().trim() ?? "";
  const area = formData.get("area")?.toString().trim() || undefined;
  const price = Number(formData.get("price") ?? 0);
  const description = formData.get("description")?.toString().trim() || undefined;
  const visibility = formData.get("visibility")?.toString() ?? "public";
  const propertyType = formData.get("propertyType")?.toString() ?? "apartment";
  const saleType = formData.get("saleType")?.toString() ?? "developer_sale";
  const bedrooms = Number(formData.get("bedrooms") ?? 0);
  const bathrooms = Number(formData.get("bathrooms") ?? 0);
  const unitArea = Number(formData.get("unitArea") ?? 0);
  const downPayment = Number(formData.get("downPayment") ?? 0);
  const installmentYears = Number(formData.get("installmentYears") ?? 0);
  const monthlyInstallmentRaw = Number(formData.get("monthlyInstallment") ?? 0);
  const deliveryDate = formData.get("deliveryDate")?.toString() || null;
  const finishingStatus = formData.get("finishingStatus")?.toString() ?? "finished";
  const amenitiesRaw = formData.get("amenities")?.toString() ?? "";
  if (!listingId || name.length < 3 || !description || !Number.isFinite(price) || price < 100000 || !Number.isFinite(bedrooms) || bedrooms < 0 || !Number.isFinite(bathrooms) || bathrooms < 0 || !Number.isFinite(unitArea) || unitArea < 10 || !Number.isFinite(installmentYears) || installmentYears <= 0 || !Number.isFinite(downPayment) || downPayment < 0 || downPayment > 100 || (formData.get("monthlyInstallment")?.toString().trim() && (!Number.isFinite(monthlyInstallmentRaw) || monthlyInstallmentRaw < 0)) || !PROPERTY_TYPES.includes(propertyType) || !SALE_TYPES.some((option) => option.value === saleType) || !["public", "hidden"].includes(visibility)) {
    redirect(`/developer/listings/${listingId ?? ""}?error=${encodeURIComponent("Check the required listing and payment fields.")}`);
  }
  if (!projectId) {
    redirect(`/developer/listings/${listingId}?error=${encodeURIComponent("Choose a project and active release phase before uploading media.")}`);
  }
  const phaseValidation = await validateDeveloperProjectPhase(session.developerId, projectId, phaseId);
  if (phaseValidation.error) {
    redirect(`/developer/listings/${listingId}?error=${encodeURIComponent(phaseValidation.error.message)}`);
  }
  let media: Awaited<ReturnType<typeof resolveDeveloperListingMedia>>;
  try {
    media = await resolveDeveloperListingMedia(formData, session.developerId, listingId ?? "unknown");
  } catch (error) {
    redirect(`/developer/listings/${listingId ?? ""}?error=${encodeURIComponent((error as Error).message)}`);
  }

  if (media.photoUrls.length < 3) {
    await removeUploadedStorageObjects(media.uploadedObjects);
    redirect(`/developer/listings/${listingId ?? ""}?error=${encodeURIComponent("Check the required fields and add at least three photos.")}`);
  }
  const amenities = amenitiesRaw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const monthlyInstallment = monthlyInstallmentRaw > 0 ? monthlyInstallmentRaw : undefined;
  const { error } = await updateDeveloperListing(session.developerId, listingId, {
    price,
    description,
    visibility,
    name,
    area,
    projectId,
    phaseId,
    photoUrls: media.photoUrls,
    propertyType,
    saleType,
    bedrooms,
    bathrooms,
    unitArea,
    downPayment,
    installmentYears,
    monthlyInstallment,
    deliveryDate,
    finishingStatus,
    amenities,
    brochureUrl: media.brochureUrl,
    videoUrl: media.videoUrl,
  });
  if (error) {
    await removeUploadedStorageObjects(media.uploadedObjects);
    redirect(`/developer/listings/${listingId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/developer/listings/${listingId}`);
  revalidatePath("/developer/listings");
  redirect(`/developer/listings/${listingId}?success=${encodeURIComponent("Listing saved and sent for review. Mobile publication remains separate and stays hidden until approval.")}`);
}

async function archiveListingFromEditAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const listingId = formData.get("listingId")?.toString();
  if (!listingId) return;
  const { error } = await archiveDeveloperListing(session.developerId, listingId, session.accountId);
  if (error) redirect(`/developer/listings/${listingId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/developer/listings/${listingId}`);
  revalidatePath("/developer/listings");
  redirect(`/developer/listings?view=developer&success=${encodeURIComponent("Listing archived and retained. Use Restore visibility when ready.")}`);
}

async function requestRenewalFromEditAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const listingId = formData.get("listingId")?.toString();
  if (!listingId) return;
  try {
    await requestListingRenewal(listingId, session.userId, session.developerId);
  } catch (error) {
    redirect(`/developer/listings/${listingId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to request renewal.")}`);
  }
  redirect("/developer/listings");
}
