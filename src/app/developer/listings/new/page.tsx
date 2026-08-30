import { redirect } from "next/navigation";
import { DeveloperLayout } from "@/components/DeveloperLayout";
import { DeveloperListingWizard } from "@/components/DeveloperListingWizard";
import { currentDeveloperImpersonation, requireDeveloperCapability } from "@/lib/developerAuth";
import { createDeveloperListing, fetchDeveloperProjects, fetchDeveloperResales, upsertDeveloperProject, validateDeveloperProjectPhase } from "@/lib/developerQueries";
import { resolveDeveloperListingMedia } from "@/lib/developerListingMedia";
import { removeUploadedStorageObjects } from "@/lib/storageServer";

const SALE_TYPES = ["developer_sale", "resale"];

export default async function NewListingPage({
  searchParams,
}: {
  searchParams?: Promise<{ project?: string | string[]; saleType?: string | string[]; createProject?: string | string[]; error?: string | string[] }>;
}) {
  const session = await requireDeveloperCapability("manage_inventory");
  const [projects, listings, impersonation] = await Promise.all([
    fetchDeveloperProjects(session.developerId),
    fetchDeveloperResales(session.developerId),
    currentDeveloperImpersonation(),
  ]);
  const activeProjects = projects
    .filter((project) => project.lifecycle_state !== "archived")
    .map((project) => ({
      ...project,
      phases: (project.developer_project_phases ?? [])
        .filter((phase) => !phase.archived_at && phase.lifecycle_state !== "archived")
        .sort((a, b) => a.phase_order - b.phase_order),
    }));
  const existingDeveloperListings = listings.filter((listing) => !listing.listed_by_agent_id);
  const params = (await searchParams) ?? {};
  const preselectedProjectId = typeof params.project === "string" ? params.project : "";
  const preselectedSaleType = typeof params.saleType === "string" && SALE_TYPES.includes(params.saleType) ? params.saleType : "developer_sale";
  const emphasizeCreateProject = params.createProject === "1";
  const errorMessage = typeof params.error === "string" ? params.error : null;

  return (
    <DeveloperLayout
      title={preselectedSaleType === "resale" ? "Add developer resale" : "Create listing"}
      description="A focused, guided flow for inventory managed by your team."
      impersonation={impersonation}
    >
      {errorMessage ? <div role="alert" aria-live="assertive" className="mx-auto max-w-5xl rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{errorMessage}</div> : null}
      <DeveloperListingWizard
        action={createListingAction}
        projects={activeProjects}
        developerId={session.developerId}
        preselectedProjectId={preselectedProjectId}
        preselectedSaleType={preselectedSaleType}
        emphasizeCreateProject={emphasizeCreateProject}
        existingListings={existingDeveloperListings}
      />
    </DeveloperLayout>
  );
}

async function createListingAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_inventory");
  const name = formData.get("name")?.toString().trim();
  const selectedProjectId = formData.get("projectId")?.toString() || null;
  const phaseId = formData.get("phaseId")?.toString() || null;
  const createProjectName = formData.get("createProjectName")?.toString().trim() || "";
  const createProjectLocation = formData.get("createProjectLocation")?.toString().trim() || "";
  const createProjectDescription = formData.get("createProjectDescription")?.toString().trim() || "";
  const priceRaw = formData.get("price")?.toString().trim() ?? "";
  const price = Number(priceRaw);
  const area = formData.get("area")?.toString() ?? undefined;
  const description = formData.get("description")?.toString().trim() || undefined;
  const propertyType = formData.get("propertyType")?.toString() ?? "apartment";
  const saleType = formData.get("saleType")?.toString() ?? "developer_sale";
  const bedroomsRaw = formData.get("bedrooms")?.toString().trim() ?? "";
  const bathroomsRaw = formData.get("bathrooms")?.toString().trim() ?? "";
  const unitAreaRaw = formData.get("unitArea")?.toString().trim() ?? "";
  const downPaymentRaw = formData.get("downPayment")?.toString().trim() ?? "";
  const installmentYearsRaw = formData.get("installmentYears")?.toString().trim() ?? "";
  const monthlyInstallmentValue = formData.get("monthlyInstallment")?.toString().trim() ?? "";
  const bedrooms = Number(bedroomsRaw);
  const bathrooms = Number(bathroomsRaw);
  const unitArea = Number(unitAreaRaw);
  const downPayment = Number(downPaymentRaw);
  const installmentYears = Number(installmentYearsRaw);
  const monthlyInstallmentRaw = Number(monthlyInstallmentValue);
  const deliveryDate = formData.get("deliveryDate")?.toString() || null;
  const finishingStatus = formData.get("finishingStatus")?.toString() ?? "finished";
  const amenitiesRaw = formData.get("amenities")?.toString() ?? "";
  const returnQuery = `saleType=${encodeURIComponent(saleType)}`;

  if (!name || name.length < 3 || !description || !SALE_TYPES.includes(saleType) || !Number.isFinite(price) || price < 100000 || !Number.isFinite(bedrooms) || bedrooms < 0 || !Number.isFinite(bathrooms) || bathrooms < 0 || !Number.isFinite(unitArea) || unitArea < 10 || !Number.isFinite(installmentYears) || installmentYears <= 0 || !Number.isFinite(downPayment) || downPayment < 0 || downPayment > 100 || (monthlyInstallmentValue && (!Number.isFinite(monthlyInstallmentRaw) || monthlyInstallmentRaw < 0)) || (!selectedProjectId && !createProjectName)) {
    redirect(`/developer/listings/new?${returnQuery}&error=${encodeURIComponent("Check the required listing, project, and payment fields.")}`);
  }
  if (selectedProjectId) {
    const phaseValidation = await validateDeveloperProjectPhase(session.developerId, selectedProjectId, phaseId);
    if (phaseValidation.error) {
      redirect(`/developer/listings/new?${returnQuery}&error=${encodeURIComponent(phaseValidation.error.message)}`);
    }
  }
  let media: Awaited<ReturnType<typeof resolveDeveloperListingMedia>>;
  try { media = await resolveDeveloperListingMedia(formData, session.developerId, crypto.randomUUID()); }
  catch (error) { redirect(`/developer/listings/new?${returnQuery}&error=${encodeURIComponent((error as Error).message)}`); }
  if (media.photoUrls.length < 3) {
    await removeUploadedStorageObjects(media.uploadedObjects);
    redirect(`/developer/listings/new?${returnQuery}&error=${encodeURIComponent("Add at least three real property photos.")}`);
  }

  let projectId = selectedProjectId;
  if (!projectId && createProjectName) {
    const { data, error } = await upsertDeveloperProject(session.developerId, { name: createProjectName, location: createProjectLocation || undefined, description: createProjectDescription || undefined });
    if (error) {
      await removeUploadedStorageObjects(media.uploadedObjects);
      redirect(`/developer/listings/new?${returnQuery}&error=${encodeURIComponent(error.message)}`);
    }
    projectId = data?.id ?? null;
  }

  const amenities = amenitiesRaw.split(",").map((value) => value.trim()).filter(Boolean);
  const { error } = await createDeveloperListing(session.developerId, {
    name, area, projectId, phaseId, price, description, photoUrls: media.photoUrls, propertyType, saleType,
    bedrooms, bathrooms, unitArea, downPayment, installmentYears,
    monthlyInstallment: monthlyInstallmentRaw > 0 ? monthlyInstallmentRaw : undefined,
    deliveryDate, finishingStatus, amenities, brochureUrl: media.brochureUrl, videoUrl: media.videoUrl,
  });
  if (error) {
    await removeUploadedStorageObjects(media.uploadedObjects);
    redirect(`/developer/listings/new?${returnQuery}&error=${encodeURIComponent(error.message)}`);
  }
  redirect(saleType === "resale" ? `/developer/listings?view=developer&clearDraft=resale&success=${encodeURIComponent("Resale submitted for review. Approval and mobile publication are separate steps.")}` : `/developer/listings?clearDraft=developer_sale&success=${encodeURIComponent("Listing submitted for review. Approval and mobile publication are separate steps.")}`);
}
