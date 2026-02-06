import { redirect } from "next/navigation";
import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from "react";
import { DeveloperLayout } from "@/components/DeveloperLayout";
import { requireDeveloperSession } from "@/lib/developerAuth";
import { createDeveloperListing } from "@/lib/developerQueries";

const PROPERTY_TYPES = ["apartment", "villa", "townhouse", "penthouse", "duplex"];
const SALE_TYPES = [
  { value: "developer_sale", label: "Developer sale" },
  { value: "resale", label: "Resale" },
];
const FINISHING_STATUSES = ["finished", "semi_finished", "core_and_shell", "furnished"];

export default function NewListingPage() {
  return (
    <DeveloperLayout title="Create listing" description="Publish a property for Brixeler agents">
      <form action={createListingAction} className="space-y-4 rounded-3xl border border-black/5 bg-white p-6">
        <Field label="Listing title" name="name" required placeholder="Palm Gardens – Tower B" />
        <Field label="Area / location" name="area" placeholder="New Cairo – Golden Square" />
        <Field label="Price (EGP)" name="price" type="number" min="100000" required />
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField label="Property type" name="propertyType" options={PROPERTY_TYPES} defaultValue={PROPERTY_TYPES[0]} required />
          <SelectField
            label="Sale type"
            name="saleType"
            options={SALE_TYPES.map((option) => option.value)}
            optionLabels={SALE_TYPES.reduce<Record<string, string>>((acc, option) => {
              acc[option.value] = option.label;
              return acc;
            }, {})}
            defaultValue="developer_sale"
            required
          />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Bedrooms" name="bedrooms" type="number" min="0" step="1" placeholder="3" required />
          <Field label="Bathrooms" name="bathrooms" type="number" min="0" step="1" placeholder="2" required />
          <Field label="Unit area (m²)" name="unitArea" type="number" min="30" step="10" placeholder="180" required />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Down payment (%)" name="downPayment" type="number" min="0" max="100" placeholder="10" required />
          <Field label="Installment years" name="installmentYears" type="number" min="1" step="1" placeholder="8" required />
          <Field label="Monthly installment (EGP)" name="monthlyInstallment" type="number" min="0" placeholder="Optional" />
        </div>
        <Field label="Delivery date" name="deliveryDate" type="date" />
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
          defaultValue="finished"
          required
        />
        <Field as="textarea" label="Description" name="description" placeholder="Key highlights, payment terms, and delivery" />
        <Field
          as="textarea"
          label="Amenities (comma separated)"
          name="amenities"
          placeholder="Clubhouse, Rooftop pool, Concierge"
        />
        <Field
          as="textarea"
          label="Photo URLs"
          name="photoUrls"
          placeholder="Paste 3+ comma-separated image URLs"
          required
        />
        <Field label="Brochure / floor plan URL" name="brochureUrl" placeholder="https://example.com/brochure.pdf" />
        <Field label="Video tour URL" name="videoUrl" placeholder="https://youtu.be/..." />
        <button className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white" type="submit">
          Submit for review
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
      <select
        className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
        {...selectProps}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabels?.[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

async function createListingAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperSession();
  const name = formData.get("name")?.toString();
  const price = Number(formData.get("price") ?? 0);
  const area = formData.get("area")?.toString() ?? undefined;
  const description = formData.get("description")?.toString() ?? undefined;
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
    .map((url) => url.trim())
    .filter(Boolean);

  if (
    !name ||
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

  const monthlyInstallment = monthlyInstallmentRaw > 0 ? monthlyInstallmentRaw : undefined;
  const amenities = amenitiesRaw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  await createDeveloperListing(session.developerId, {
    name,
    area,
    price,
    description,
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
