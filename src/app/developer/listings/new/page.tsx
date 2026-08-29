import { redirect } from "next/navigation";
import { DeveloperLayout } from "@/components/DeveloperLayout";
import { DeveloperListingWizard } from "@/components/DeveloperListingWizard";
import { currentDeveloperImpersonation, requireDeveloperSession } from "@/lib/developerAuth";
import { createDeveloperListing, fetchDeveloperProjects, upsertDeveloperProject } from "@/lib/developerQueries";
import { resolveDeveloperListingMedia } from "@/lib/developerListingMedia";

const SALE_TYPES = ["developer_sale", "resale"];

export default async function NewListingPage({
  searchParams,
}: {
  searchParams?: Promise<{ project?: string | string[]; saleType?: string | string[]; createProject?: string | string[]; error?: string | string[] }>;
}) {
  const session = await requireDeveloperSession();
  const [projects, impersonation] = await Promise.all([
    fetchDeveloperProjects(session.developerId),
    currentDeveloperImpersonation(),
  ]);
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
        projects={projects}
        developerId={session.developerId}
        preselectedProjectId={preselectedProjectId}
        preselectedSaleType={preselectedSaleType}
        emphasizeCreateProject={emphasizeCreateProject}
      />
    </DeveloperLayout>
  );
}

async function createListingAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperSession();
  const name = formData.get("name")?.toString();
  const selectedProjectId = formData.get("projectId")?.toString() || null;
  const createProjectName = formData.get("createProjectName")?.toString().trim() || "";
  const createProjectLocation = formData.get("createProjectLocation")?.toString().trim() || "";
  const createProjectDescription = formData.get("createProjectDescription")?.toString().trim() || "";
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
  const returnQuery = `saleType=${encodeURIComponent(saleType)}`;

  if (!name || !price || price < 100000 || unitArea <= 0 || installmentYears <= 0 || downPayment < 0 || downPayment > 100 || (!selectedProjectId && !createProjectName)) {
    redirect(`/developer/listings/new?${returnQuery}&error=${encodeURIComponent("Check the required listing, project, and payment fields.")}`);
  }
  let media: Awaited<ReturnType<typeof resolveDeveloperListingMedia>>;
  try { media = await resolveDeveloperListingMedia(formData, session.developerId, crypto.randomUUID()); }
  catch (error) { redirect(`/developer/listings/new?${returnQuery}&error=${encodeURIComponent((error as Error).message)}`); }
  if (media.photoUrls.length < 3) redirect(`/developer/listings/new?${returnQuery}&error=${encodeURIComponent("Add at least three real property photos.")}`);

  let projectId = selectedProjectId;
  if (!projectId && createProjectName) {
    const { data, error } = await upsertDeveloperProject(session.developerId, { name: createProjectName, location: createProjectLocation || undefined, description: createProjectDescription || undefined });
    if (error) redirect(`/developer/listings/new?${returnQuery}&error=${encodeURIComponent(error.message)}`);
    projectId = data?.id ?? null;
  }

  const amenities = amenitiesRaw.split(",").map((value) => value.trim()).filter(Boolean);
  const { error } = await createDeveloperListing(session.developerId, {
    name, area, projectId, price, description, photoUrls: media.photoUrls, propertyType, saleType,
    bedrooms, bathrooms, unitArea, downPayment, installmentYears,
    monthlyInstallment: monthlyInstallmentRaw > 0 ? monthlyInstallmentRaw : undefined,
    deliveryDate, finishingStatus, amenities, brochureUrl: media.brochureUrl, videoUrl: media.videoUrl,
  });
  if (error) redirect(`/developer/listings/new?${returnQuery}&error=${encodeURIComponent(error.message)}`);
  redirect(saleType === "resale" ? "/developer/listings?view=developer&clearDraft=resale&success=Resale%20submitted%20for%20review." : "/developer/listings?clearDraft=developer_sale&success=Listing%20submitted%20for%20review.");
}
