import { revalidatePath } from "next/cache";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { DeveloperLayout } from "@/components/DeveloperLayout";
import { requireDeveloperSession } from "@/lib/developerAuth";
import { fetchDeveloperProfile, updateDeveloperProfile } from "@/lib/developerQueries";
import { STORAGE_BUCKETS, isFile, uploadFileToBucket } from "@/lib/storageServer";

export default async function DeveloperProfilePage() {
  const isSupabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  if (!isSupabaseConfigured) {
    return (
      <DeveloperLayout title="Profile" description="Control how Brixeler presents your brand.">
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
    <DeveloperLayout title="Profile" description="Control how Brixeler presents your brand.">
      <form
        action={updateProfileAction}
        className="space-y-4 rounded-3xl border border-black/5 bg-white p-6"
      >
        <input type="hidden" name="developerId" value={session.developerId} />
        <Field label="Developer name" name="name" defaultValue={profile?.name ?? ""} required />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Logo upload</span>
          <input
            className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
            type="file"
            name="logo_file"
            accept="image/*"
          />
          {profile?.logo_url ? (
            <span className="text-xs text-neutral-500">Current logo: {profile.logo_url}</span>
          ) : null}
        </label>
        <Field
          as="textarea"
          label="Description"
          name="description"
          defaultValue={profile?.description ?? ""}
          placeholder="What makes your launches special?"
        />
        <button className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white" type="submit">
          Update profile
        </button>
      </form>
    </DeveloperLayout>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; as?: "input" };
type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; as: "textarea" };

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
