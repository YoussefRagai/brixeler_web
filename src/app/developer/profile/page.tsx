import { revalidatePath } from "next/cache";
import { DeveloperLayout } from "@/components/DeveloperLayout";
import { DeveloperProfileForm } from "@/components/DeveloperProfileForm";
import { currentDeveloperImpersonation, requireDeveloperSession } from "@/lib/developerAuth";
import { fetchDeveloperProfile, updateDeveloperProfile } from "@/lib/developerQueries";
import { STORAGE_BUCKETS, isFile, uploadFileToBucket } from "@/lib/storageServer";

export default async function DeveloperProfilePage() {
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

  return (
    <DeveloperLayout title="Profile" description="Control how Brixeler presents your brand." impersonation={impersonation}>
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
    logoUrl = await uploadFileToBucket({
      bucket: STORAGE_BUCKETS.developerLogos,
      pathPrefix: `developers/${session.developerId}/logo`,
      file: logoFile,
    });
  }

  await updateDeveloperProfile(session.developerId, {
    name,
    logo_url: logoUrl,
    description,
  });
  revalidatePath("/developer/profile");
}
