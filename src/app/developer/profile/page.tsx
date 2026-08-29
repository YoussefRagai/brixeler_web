import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DeveloperLayout } from "@/components/DeveloperLayout";
import { DeveloperProfileForm } from "@/components/DeveloperProfileForm";
import { currentDeveloperImpersonation, requireDeveloperSession } from "@/lib/developerAuth";
import { fetchDeveloperProfile, updateDeveloperProfile } from "@/lib/developerQueries";
import { STORAGE_BUCKETS, isFile, uploadFileToBucket } from "@/lib/storageServer";

export default async function DeveloperProfilePage({
  searchParams,
}: {
  searchParams?: Promise<{ success?: string; error?: string }>;
}) {
  const impersonation = await currentDeveloperImpersonation();
  const isSupabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  if (!isSupabaseConfigured) {
    return (
      <DeveloperLayout title="Profile" description="Control how Brixeler presents your brand." impersonation={impersonation}>
        <div className="rounded-3xl border border-black/5 bg-white p-6 text-sm text-neutral-600">
          Supabase environment variables are missing. Set `NEXT_PUBLIC_SUPABASE_URL` and
          `SUPABASE_SERVICE_ROLE_KEY` in your deployment environment to enable profile management.
        </div>
      </DeveloperLayout>
    );
  }
  const session = await requireDeveloperSession();
  const profile = await fetchDeveloperProfile(session.developerId);
  const feedback = (await searchParams) ?? {};

  return (
    <DeveloperLayout title="Profile" description="Control how Brixeler presents your brand." impersonation={impersonation}>
      {feedback.success ? <div role="status" aria-live="polite" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{feedback.success}</div> : null}
      {feedback.error ? <div role="alert" aria-live="assertive" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{feedback.error}</div> : null}
      <DeveloperProfileForm
        action={updateProfileAction}
        developerId={session.developerId}
        initialName={profile?.name ?? ""}
        initialDescription={profile?.description ?? ""}
        initialLogoUrl={profile?.logo_url}
      />
    </DeveloperLayout>
  );
}

async function updateProfileAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperSession();
  const name = formData.get("name")?.toString().trim();
  if (!name) return;
  const description = formData.get("description")?.toString() ?? undefined;
  const logoFile = formData.get("logo_file");
  let logoUrl: string | undefined;
  if (isFile(logoFile)) {
    try {
      logoUrl = await uploadFileToBucket({
        bucket: STORAGE_BUCKETS.developerLogos,
        pathPrefix: `developers/${session.developerId}/logo`,
        file: logoFile,
      });
    } catch (error) {
      redirect(`/developer/profile?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to upload this logo.")}`);
    }
  }

  const { error } = await updateDeveloperProfile(session.developerId, {
    name,
    logo_url: logoUrl,
    description,
  });
  if (error) {
    redirect(`/developer/profile?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/developer/profile");
  redirect("/developer/profile?success=Profile%20saved.");
}
