import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Check, Clock3, Eye, FileClock, ShieldCheck } from "lucide-react";
import { DeveloperLayout } from "@/components/DeveloperLayout";
import { DeveloperProfileForm } from "@/components/DeveloperProfileForm";
import {
  currentDeveloperImpersonation,
  isCompletePublicDeveloperProfile,
  isCompleteSubmittedDeveloperProfileRevision,
  requireDeveloperCapability,
  requireDeveloperSession,
} from "@/lib/developerAuth";
import { fetchDeveloperProfile } from "@/lib/developerQueries";
import { STORAGE_BUCKETS, isFile, removeUploadedStorageObjects, uploadFileToBucket } from "@/lib/storageServer";
import { supabaseServer } from "@/lib/supabaseServer";

type ProfileRevision = {
  id: string;
  version: number;
  status: string;
  name: string | null;
  description: string | null;
  logo_url: string | null;
  slogan: string | null;
  created_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_reason: string | null;
};

type LatestRevisionResult = {
  revision: ProfileRevision | null;
  contractAvailable: boolean;
};

type PublicProfileState = {
  lifecycleState: string | null;
  publishedAt: string | null;
  slogan: string | null;
  contractAvailable: boolean;
};

const editableRevisionStatuses = new Set(["draft", "pending", "submitted", "rejected"]);

export default async function DeveloperProfilePage({
  searchParams,
}: {
  searchParams?: Promise<{ success?: string; error?: string; onboarding?: string }>;
}) {
  const impersonation = await currentDeveloperImpersonation();
  const isSupabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  if (!isSupabaseConfigured) {
    return (
      <DeveloperLayout title="Profile" description="Control how Brixeler presents your brand." impersonation={impersonation} preview>
        <div className="rounded-3xl border border-black/5 bg-white p-6 text-sm text-neutral-600">
          Supabase environment variables are missing. Set `NEXT_PUBLIC_SUPABASE_URL` and
          `SUPABASE_SERVICE_ROLE_KEY` in your deployment environment to enable profile management.
        </div>
      </DeveloperLayout>
    );
  }

  const session = await requireDeveloperSession({ allowIncompleteProfile: true });
  const feedback = (await searchParams) ?? {};
  const [profile, latestRevisionResult, publicProfileState] = await Promise.all([
    fetchDeveloperProfile(session.developerId),
    fetchLatestProfileRevision(session.developerId),
    fetchPublicProfileState(session.developerId),
  ]);
  const latestRevision = latestRevisionResult.revision;
  const latestStatus = latestRevision?.status ?? null;
  const editableRevision = latestRevision && editableRevisionStatuses.has(latestRevision.status.toLowerCase())
    ? latestRevision
    : null;
  const formName = editableRevision?.name ?? profile?.name ?? "";
  const formDescription = editableRevision?.description ?? profile?.description ?? "";
  const formLogoUrl = editableRevision?.logo_url ?? profile?.logo_url ?? null;
  const formSlogan = editableRevision?.slogan ?? publicProfileState.slogan ?? "";
  const profileComplete =
    isCompletePublicDeveloperProfile({ ...profile, lifecycle_state: publicProfileState.lifecycleState }) ||
    isCompleteSubmittedDeveloperProfileRevision(latestRevision);
  const onboarding = !profileComplete;

  return (
    <DeveloperLayout title="Profile" description="Control how Brixeler presents your brand." impersonation={impersonation} onboarding={onboarding}>
      {feedback.success ? (
        <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-2xl border border-[#d9dfbf] bg-[#f1f5d9] px-4 py-3 text-sm text-[#4c5d11]">
          <Check aria-hidden="true" className="mt-0.5 shrink-0" size={17} />
          <span>{feedback.success}</span>
        </div>
      ) : null}
      {feedback.error ? (
        <div role="alert" aria-live="assertive" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <FileClock aria-hidden="true" className="mt-0.5 shrink-0" size={17} />
          <span>{feedback.error}</span>
        </div>
      ) : null}

      {onboarding ? (
        <section aria-labelledby="profile-onboarding-heading" className="relative overflow-hidden rounded-3xl bg-[#dff579] px-5 py-6 text-[#253000] sm:px-7 sm:py-7">
          <div className="absolute -right-14 -top-20 size-52 rounded-full border border-[#253000]/10" aria-hidden="true" />
          <div className="relative max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#53630e]">First login · one step to unlock</p>
            <h2 id="profile-onboarding-heading" className="mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Complete your company profile</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#46530e]">
              Add your company name, a short brand line, and logo, then submit the revision for review. Your workspace unlocks as soon as a complete revision is submitted; agents only see approved public branding.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-[#53630e]">
              <span>✓ Company name</span>
              <span>✓ Brand line</span>
              <span>Company logo</span>
            </div>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="profile-review-heading" className="overflow-hidden rounded-3xl border border-black/5 bg-[#111211] text-white">
        <div className="border-b border-white/10 px-5 py-5 sm:px-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">Publication control</p>
              <h2 id="profile-review-heading" className="mt-1 text-xl font-semibold tracking-tight">Public profile, clearly staged</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
                The live identity and your next revision are separate. Agents keep seeing the public version until an admin approves a submitted revision.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#d6e87a]/30 bg-[#d6e87a]/10 px-3 py-1.5 text-xs font-semibold text-[#d6e87a]">
              <ShieldCheck aria-hidden="true" size={15} />
              Review required
            </span>
          </div>
        </div>

        <div className="grid lg:grid-cols-2">
          <ProfileStateCard
            icon={<Eye aria-hidden="true" size={17} />}
            label={publicProfileLabel(publicProfileState, profile)}
            status={publicProfileStatus(publicProfileState, profile)}
            name={profile?.name ?? "No public name yet"}
            slogan={publicProfileState.slogan}
            description={profile?.description ?? "Add a concise company description below."}
            logoUrl={profile?.logo_url}
            note={publicProfileNote(publicProfileState, profile)}
          />
          <ProfileStateCard
            icon={<Clock3 aria-hidden="true" size={17} />}
            label={latestRevision ? `Next version · v${latestRevision.version}` : "Next version"}
            status={latestRevision ? formatRevisionStatus(latestRevision.status) : "No submitted revision"}
            name={latestRevision?.name ?? "Your next version will appear here"}
            slogan={latestRevision?.slogan}
            description={latestRevision?.description ?? "Submit the private draft below when your public copy is ready for review."}
            logoUrl={latestRevision?.logo_url}
            note={revisionNote(latestRevision)}
            muted={!latestRevision}
          />
        </div>
      </section>

      {!latestRevisionResult.contractAvailable ? (
        <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          Review history is not available in this environment yet. You can prepare the draft, but submission will remain disabled until the profile review contract is deployed.
        </div>
      ) : null}

      <DeveloperProfileForm
        action={submitProfileRevisionAction}
        initialName={formName}
        initialDescription={formDescription}
        initialLogoUrl={formLogoUrl}
        initialSlogan={formSlogan}
        revisionStatus={latestStatus}
        submissionAvailable={latestRevisionResult.contractAvailable}
        onboarding={onboarding}
      />
    </DeveloperLayout>
  );
}

function ProfileStateCard({
  icon,
  label,
  status,
  name,
  slogan,
  description,
  logoUrl,
  note,
  muted = false,
}: {
  icon: React.ReactNode;
  label: string;
  status: string;
  name: string;
  slogan?: string | null;
  description: string;
  logoUrl?: string | null;
  note: string;
  muted?: boolean;
}) {
  return (
    <div className="border-white/10 px-5 py-5 first:border-b lg:border-b-0 lg:first:border-r sm:px-7">
      <div className="flex items-center justify-between gap-3 text-xs">
        <p className="flex items-center gap-2 font-semibold uppercase tracking-[0.16em] text-white/55">{icon}{label}</p>
        <span className={muted ? "rounded-full border border-white/10 px-2.5 py-1 font-semibold text-white/40" : "rounded-full bg-white/10 px-2.5 py-1 font-semibold text-white/75"}>
          {status}
        </span>
      </div>
      <div className={`mt-6 flex items-center gap-3 ${muted ? "opacity-65" : ""}`}>
        <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white p-2 text-black">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-neutral-400">Logo</span>
          )}
        </div>
        <p className="min-w-0 truncate text-lg font-semibold tracking-tight text-white">{name}</p>
      </div>
      {slogan ? <p className="mt-3 line-clamp-1 text-xs font-semibold text-[#d6e87a]">{slogan}</p> : null}
      <p className={`mt-4 line-clamp-2 min-h-10 text-sm leading-5 ${muted ? "text-white/35" : "text-white/65"}`}>{description}</p>
      <p className="mt-5 border-t border-white/10 pt-4 text-xs text-white/45">{note}</p>
    </div>
  );
}

async function fetchLatestProfileRevision(developerId: string): Promise<LatestRevisionResult> {
  const { data, error } = await supabaseServer
    .from("developer_profile_revisions")
    .select("id, version, status, name, description, logo_url, slogan, created_at, submitted_at, reviewed_at, review_reason")
    .eq("developer_id", developerId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("Unable to load latest developer profile revision", error);
    return { revision: null, contractAvailable: false };
  }
  if (!data) return { revision: null, contractAvailable: true };
  return { revision: data as ProfileRevision, contractAvailable: true };
}

async function fetchPublicProfileState(developerId: string): Promise<PublicProfileState> {
  const { data, error } = await supabaseServer
    .from("developers")
    .select("lifecycle_state, published_at, slogan")
    .eq("id", developerId)
    .maybeSingle();
  if (error) {
    console.warn("Unable to load developer profile publication state", error);
    return { lifecycleState: null, publishedAt: null, slogan: null, contractAvailable: false };
  }
  return {
    lifecycleState: (data?.lifecycle_state as string | null | undefined) ?? null,
    publishedAt: (data?.published_at as string | null | undefined) ?? null,
    slogan: (data?.slogan as string | null | undefined) ?? null,
    contractAvailable: true,
  };
}

async function submitProfileRevisionAction(formData: FormData) {
  "use server";
  const session = await requireDeveloperCapability("manage_company", { allowIncompleteProfile: true });
  const nameValue = formData.get("name");
  const descriptionValue = formData.get("description");
  const sloganValue = formData.get("slogan");
  const name = typeof nameValue === "string" ? nameValue.trim() : "";
  const description = typeof descriptionValue === "string" ? descriptionValue.trim() : "";
  const slogan = typeof sloganValue === "string" ? sloganValue.trim() : "";
  const logoUrlValue = formData.get("logo_url");
  const suppliedLogoUrl = typeof logoUrlValue === "string" ? validatedOptionalHttpUrl(logoUrlValue, "Logo URL") : null;
  if (!name || name.length > 200) {
    redirect(`/developer/profile?error=${encodeURIComponent("Enter a developer name between 1 and 200 characters.")}`);
  }
  if (!description) {
    redirect(`/developer/profile?error=${encodeURIComponent("Add a short brand line or company description before submitting.")}`);
  }
  if (description.length > 500) {
    redirect(`/developer/profile?error=${encodeURIComponent("Keep the company description to 500 characters or fewer.")}`);
  }
  if (slogan.length > 160) {
    redirect(`/developer/profile?error=${encodeURIComponent("Keep the slogan to 160 characters or fewer.")}`);
  }

  const latestRevisionResult = await fetchLatestProfileRevision(session.developerId);
  const currentProfile = await fetchDeveloperProfile(session.developerId);
  const currentRevision = latestRevisionResult.revision;
  const shouldPreserveRevisionLogo = currentRevision && editableRevisionStatuses.has(currentRevision.status.toLowerCase());
  let uploadedLogoUrl: string | null = null;
  const logoFile = formData.get("logo_file");
  if (isFile(logoFile)) {
    try {
      uploadedLogoUrl = await uploadFileToBucket({
        bucket: STORAGE_BUCKETS.developerLogos,
        pathPrefix: `developers/${session.developerId}/profile-revision`,
        file: logoFile,
      });
    } catch (error) {
      redirect(`/developer/profile?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to upload this logo.")}`);
    }
  }

  const logoUrl = uploadedLogoUrl ?? suppliedLogoUrl ?? (shouldPreserveRevisionLogo ? currentRevision.logo_url : currentProfile?.logo_url) ?? null;
  if (!logoUrl) {
    redirect(`/developer/profile?error=${encodeURIComponent("Add a company logo before submitting your profile.")}`);
  }
  let result: { data: unknown; error: { message?: string } | null };
  try {
    result = await supabaseServer.rpc("submit_developer_profile_revision", {
      p_developer_id: session.developerId,
      p_account_id: session.accountId,
      p_name: name,
      p_description: description || null,
      p_logo_url: logoUrl,
      p_slogan: slogan || null,
    });
  } catch (error) {
    await discardUploadedLogo(uploadedLogoUrl);
    console.warn("Developer profile revision submission failed", error);
    redirect(`/developer/profile?error=${encodeURIComponent("We couldn't submit this profile revision. Please try again.")}`);
  }
  if (result.error) {
    await discardUploadedLogo(uploadedLogoUrl);
    console.warn("Developer profile revision submission failed", result.error);
    redirect(`/developer/profile?error=${encodeURIComponent("We couldn't submit this profile revision. Please try again.")}`);
  }

  const revisionResult = Array.isArray(result.data) ? result.data[0] : result.data;
  const revisionRecord = revisionResult as { id?: string; revision_id?: string; version?: number | string; status?: string } | null;
  if (!(revisionRecord?.revision_id ?? revisionRecord?.id) || revisionRecord.status === undefined) {
    await discardUploadedLogo(uploadedLogoUrl);
    redirect(`/developer/profile?error=${encodeURIComponent("The profile revision was not confirmed. Please try again.")}`);
  }

  revalidatePath("/developer/profile");
  revalidatePath("/developer");
  const version = revisionRecord.version ? ` v${revisionRecord.version}` : "";
  redirect(`/developer/profile?success=${encodeURIComponent(`Profile revision${version} submitted for review. Your public profile is unchanged until approval.`)}`);
}

async function discardUploadedLogo(url: string | null) {
  if (!url) return;
  const { error } = await removeUploadedStorageObjects([{ bucket: STORAGE_BUCKETS.developerLogos, url }]);
  if (error) console.warn("Unable to remove an unsubmitted developer profile logo", error);
}

function validatedOptionalHttpUrl(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:") throw new Error("unsupported protocol");
    return parsed.toString();
  } catch {
    redirect(`/developer/profile?error=${encodeURIComponent(`${label} must be a valid HTTPS URL.`)}`);
  }
}

function formatRevisionStatus(value: string) {
  switch (value.toLowerCase()) {
    case "pending":
    case "submitted":
      return "Pending review";
    case "approved":
    case "published":
      return "Approved version";
    case "rejected":
      return "Changes requested";
    case "draft":
      return "Draft version";
    default:
      return value.replaceAll("_", " ");
  }
}

function revisionNote(revision: ProfileRevision | null) {
  if (!revision) return "Nothing is waiting for review yet.";
  if (revision.status.toLowerCase() === "rejected" && revision.review_reason) {
    return `Admin feedback: ${revision.review_reason}`;
  }
  if (["approved", "published"].includes(revision.status.toLowerCase()) && revision.reviewed_at) {
    return `Approved ${formatDateTime(revision.reviewed_at)}.`;
  }
  const date = revision.submitted_at ?? revision.created_at;
  return date ? `Submitted ${formatDateTime(date)}.` : "Submitted for review.";
}

type PublicProfileIdentity = { name?: string | null; is_demo?: boolean | null; is_active?: boolean | null };

function publicProfileLabel(state: PublicProfileState, profile: PublicProfileIdentity | null) {
  if (!profile) return "Public profile unavailable";
  if (profile.is_demo || !profile.is_active) return "Saved identity";
  if (!state.contractAvailable) return "Current identity";
  if (!state.lifecycleState) return "Current identity";
  if (state.lifecycleState === "draft") return "Draft public identity";
  if (state.lifecycleState === "archived") return "Archived identity";
  return state.lifecycleState === "published" && state.publishedAt ? "Published now" : "Saved identity";
}

function publicProfileStatus(state: PublicProfileState, profile: PublicProfileIdentity | null) {
  if (!profile) return "Not available";
  if (!state.contractAvailable) return "Publication state unavailable";
  if (!state.lifecycleState) return "Current public profile";
  if (state.lifecycleState === "draft") return "Draft · not published";
  if (state.lifecycleState === "archived") return "Archived";
  if (profile.is_demo) return "Demo · hidden from mobile";
  if (!profile.is_active) return "Inactive · hidden from mobile";
  if (state.lifecycleState === "published" && state.publishedAt) return "Published to mobile";
  return "Current public profile";
}

function publicProfileNote(state: PublicProfileState, profile: PublicProfileIdentity | null) {
  if (!profile) return "The current public identity could not be loaded.";
  if (profile.is_demo) return "This demo identity is hidden from agents, including after publication approval.";
  if (!profile.is_active) return "This developer identity is inactive and hidden from agents.";
  if (!state.contractAvailable) return "Current identity loaded; publication state is unavailable in this environment.";
  if (!state.lifecycleState) return "Current identity loaded; mobile publication has not been confirmed.";
  if (state.lifecycleState === "draft") return "This identity is saved but not available to agents yet.";
  if (state.lifecycleState === "archived") return "This developer identity is archived and hidden from agents.";
  return state.lifecycleState === "published" && state.publishedAt
    ? "This is the identity currently available to agents."
    : "Current identity loaded; mobile publication has not been confirmed.";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
