import { notFound, redirect } from "next/navigation";
import { DeveloperLayout } from "@/components/DeveloperLayout";
import { requireDeveloperSession } from "@/lib/developerAuth";
import { deleteListing, fetchDeveloperListing, updateDeveloperListing, requestListingRenewal } from "@/lib/developerQueries";
import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from "react";

const PROPERTY_TYPES = ["apartment", "villa", "townhouse", "penthouse", "duplex"];
const SALE_TYPES = [
  { value: "developer_sale", label: "Developer sale" },
  { value: "resale", label: "Resale" },
];
const FINISHING_STATUSES = ["finished", "semi_finished", "core_and_shell", "furnished"];

interface Props {
  params: { listingId: string };
}

export default async function EditListingPage({ params }: Props) {
  const session = await requireDeveloperSession();
  const listing = await fetchDeveloperListing(params.listingId, session.developerId);
  if (!listing) {
    notFound();
  }

  const price = typeof listing.price === "string" ? Number(listing.price) : listing.price ?? 0;
  const visibility = (listing.visibility_status as string) ?? "public";
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
      actions={
        <form action={deleteListingFromEditAction}>
          <input type="hidden" name="listingId" value={params.listingId} />
          <button className="rounded-full border border-red-200 bg-red-50 px-5 py-2 text-sm font-semibold text-red-600" type="submit">
            Delete listing
          </button>
        </form>
      }
    >
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
      <form action={updateListingAction} className="space-y-4 rounded-3xl border border-black/5 bg-white p-6">
        <input type="hidden" name="listingId" value={params.listingId} />
        <Field label="Listing title" name="name" defaultValue={listing.property_name} readOnly />
        <Field label="Area / location" name="area" defaultValue={listing.specific_location ?? ""} readOnly />
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
          <Field label="Unit area (m²)" name="unitArea" type="number" min="30" step="10" defaultValue={unitArea} required />
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
        />
        <Field
          as="textarea"
          label="Amenities (comma separated)"
          name="amenities"
          defaultValue={amenitiesValue}
          placeholder="Clubhouse, Rooftop pool, Concierge"
        />
        <Field
          as="textarea"
          label="Photo URLs"
          name="photoUrls"
          defaultValue={photosValue}
          placeholder="Paste 3+ comma-separated image URLs"
          required
        />
        <Field label="Brochure / floor plan URL" name="brochureUrl" defaultValue={listing.floor_plan_url ?? ""} placeholder="https://example.com/brochure.pdf" />
        <Field label="Video tour URL" name="videoUrl" defaultValue={listing.video_tour_url ?? ""} placeholder="https://youtu.be/..." />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Visibility</span>
          <select
            name="visibility"
            defaultValue={visibility}
            className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
          >
            <option value="public">Public to agents</option>
            <option value="hidden">Hidden</option>
          </select>
        </label>
        <button className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white" type="submit">
          Save changes
        </button>
      </form>
    </DeveloperLayout>
  );
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
  const session = await requireDeveloperSession();
  const listingId = formData.get("listingId")?.toString();
  const name = formData.get("name")?.toString() ?? "";
  const area = formData.get("area")?.toString() ?? undefined;
  const price = Number(formData.get("price") ?? 0);
  const description = formData.get("description")?.toString() ?? undefined;
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
  const brochureUrl = formData.get("brochureUrl")?.toString() || null;
  const videoUrl = formData.get("videoUrl")?.toString() || null;
  const photoUrls = (formData.get("photoUrls")?.toString() ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (
    !listingId ||
    !price ||
    price < 100000 ||
    unitArea <= 0 ||
    installmentYears <= 0 ||
    downPayment < 0 ||
    downPayment > 100 ||
    photoUrls.length < 3
  ) {
    return;
  }
  const amenities = amenitiesRaw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const monthlyInstallment = monthlyInstallmentRaw > 0 ? monthlyInstallmentRaw : undefined;
  await updateDeveloperListing(session.developerId, listingId, {
    price,
    description,
    visibility,
    name,
    area,
    photoUrls,
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
    brochureUrl,
    videoUrl,
  });
  redirect("/developer/listings");
}

async function deleteListingFromEditAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperSession();
  const listingId = formData.get("listingId")?.toString();
  if (!listingId) return;
  await deleteListing(session.developerId, listingId);
  redirect("/developer/listings");
}

async function requestRenewalFromEditAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperSession();
  const listingId = formData.get("listingId")?.toString();
  if (!listingId) return;
  await requestListingRenewal(listingId, session.userId);
  redirect("/developer/listings");
}
