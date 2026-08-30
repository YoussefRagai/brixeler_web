"use client";

import { useEffect, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { Building2, Check } from "lucide-react";
import { DeveloperMediaField } from "@/components/DeveloperMediaField";

type ProfileAction = (formData: FormData) => void | Promise<void>;

type Props = {
  action: ProfileAction;
  initialName: string;
  initialDescription: string;
  initialSlogan?: string;
  initialLogoUrl?: string | null;
  revisionStatus?: string | null;
  submissionAvailable?: boolean;
  onboarding?: boolean;
};

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const allowedLogoTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export function DeveloperProfileForm({
  action,
  initialName,
  initialDescription,
  initialSlogan = "",
  initialLogoUrl,
  revisionStatus,
  submissionAvailable = true,
  onboarding = false,
}: Props) {
  const nameId = useId();
  const sloganId = useId();
  const descriptionId = useId();
  const [name, setName] = useState(initialName);
  const [slogan, setSlogan] = useState(initialSlogan);
  const [description, setDescription] = useState(initialDescription);
  const [previewUrl, setPreviewUrl] = useState(initialLogoUrl ?? "");
  const [temporaryUrl, setTemporaryUrl] = useState("");
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    return () => {
      if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
    };
  }, [temporaryUrl]);

  function handleFilesSelected(files: File[]) {
    const file = files[0];
    if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
    if (!file) {
      setTemporaryUrl("");
      setPreviewUrl(initialLogoUrl ?? "");
      setUploadError("");
      return;
    }
    if (!allowedLogoTypes.has(file.type) || file.size > MAX_LOGO_BYTES) {
      setTemporaryUrl("");
      setPreviewUrl(initialLogoUrl ?? "");
      setUploadError(
        !allowedLogoTypes.has(file.type)
          ? "Choose a PNG, JPG, or WebP image."
          : "Choose an image smaller than 5 MB.",
      );
      return;
    }
    const url = URL.createObjectURL(file);
    setTemporaryUrl(url);
    setPreviewUrl(url);
    setUploadError("");
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <aside
        aria-label="Illustrative mobile profile preview"
        className="relative overflow-hidden rounded-3xl bg-[#101110] p-6 text-white lg:sticky lg:top-6 lg:self-start"
      >
        <div className="absolute -right-16 -top-20 size-48 rounded-full border border-white/10" aria-hidden="true" />
        <div className="absolute -right-5 -top-9 size-28 rounded-full border border-white/10" aria-hidden="true" />
        <div className="relative">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/55">Agent mobile card</p>
            <span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
              Preview only
            </span>
          </div>
          <p className="mt-2 max-w-sm text-xs leading-5 text-white/55">
            This is an illustrative preview of your public identity. It does not publish while you edit.
          </p>
          <div className="mt-8 flex items-center gap-4">
            <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-3xl bg-white p-3 text-black shadow-2xl shadow-black/20">
              {previewUrl ? (
                <Image
                  src={previewUrl}
                  alt="Developer logo preview"
                  width={80}
                  height={80}
                  unoptimized
                  className="h-full w-full object-contain"
                />
              ) : (
                <Building2 aria-hidden="true" size={30} strokeWidth={1.5} />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="line-clamp-2 break-words text-2xl font-semibold leading-tight tracking-tight">
                {name || "Developer name"}
              </h2>
              <p className="mt-1 line-clamp-1 text-xs font-medium text-white/50">{slogan || "Verified developer partner"}</p>
            </div>
          </div>
          <p className="mt-8 line-clamp-4 break-words text-sm leading-6 text-white/70">
            {description || "Your company story will appear here for agents browsing your launches."}
          </p>
          <div className="mt-8 space-y-2 border-t border-white/10 pt-5 text-xs text-white/60">
            <p className="flex items-center gap-2">
              <Check aria-hidden="true" size={14} className="text-[#d6e87a]" />
              Used across project and listing screens
            </p>
            <p className="flex items-center gap-2">
              <Check aria-hidden="true" size={14} className="text-[#d6e87a]" />
              Visible after the revision is approved
            </p>
          </div>
        </div>
      </aside>

      <form
        action={action}
        encType="multipart/form-data"
        className="rounded-3xl border border-black/5 bg-white p-5 sm:p-7"
        onSubmit={(event) => {
          if (!uploadError) return;
          event.preventDefault();
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/5 pb-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Private draft</p>
            <h2 className="mt-1 text-lg font-semibold text-black">{onboarding ? "Complete your company profile" : "Prepare your public profile"}</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-neutral-500">
              {onboarding
                ? "Add the required company name and brand line. Submit when they are ready to unlock your workspace; an admin reviews the public version before it reaches agents."
                : "Your edits stay private while you work. Submit when they are ready and an admin will review the next version before it reaches agents."}
            </p>
          </div>
          <span className="rounded-full bg-[#f1f5d9] px-3 py-1.5 text-xs font-semibold text-[#4c5d11]">
            {revisionStatus ? formatRevisionStatus(revisionStatus) : "No version submitted"}
          </span>
        </div>

        <div className="mt-6 space-y-5">
          <label htmlFor={nameId} className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-semibold text-neutral-700">Developer name</span>
            <input
              id={nameId}
              autoComplete="organization"
              className="min-h-12 rounded-2xl border border-black/10 bg-neutral-50 px-4 text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-black/40 focus:bg-white focus:ring-4 focus:ring-black/[0.05]"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={200}
              required
              aria-describedby={`${nameId}-hint`}
            />
            <span id={`${nameId}-hint`} className="text-xs text-neutral-500">
              This is the name agents will recognize in Brixeler.
            </span>
          </label>

          <label htmlFor={sloganId} className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-semibold text-neutral-700">Brand slogan (optional)</span>
            <input
              id={sloganId}
              className="min-h-12 rounded-2xl border border-black/10 bg-neutral-50 px-4 text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-black/40 focus:bg-white focus:ring-4 focus:ring-black/[0.05]"
              name="slogan"
              value={slogan}
              onChange={(event) => setSlogan(event.target.value)}
              maxLength={160}
              placeholder="A short line that captures your brand"
              aria-describedby={`${sloganId}-hint`}
            />
            <span id={`${sloganId}-hint`} className="text-xs text-neutral-500">
              This appears beneath your company name in the portal. If blank, your description becomes the brand line.
            </span>
          </label>

          <label htmlFor={descriptionId} className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-semibold text-neutral-700">Company tagline / description</span>
            <textarea
              id={descriptionId}
              className="min-h-32 rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3 leading-6 text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-black/40 focus:bg-white focus:ring-4 focus:ring-black/[0.05]"
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              required
              placeholder="What should agents know about your company and launches?"
              aria-describedby={`${descriptionId}-hint ${descriptionId}-count`}
            />
            <span id={`${descriptionId}-hint`} className="text-xs text-neutral-500">
              Keep it useful and concise; this copy appears beside your projects.
            </span>
            <span id={`${descriptionId}-count`} className="text-right text-[11px] tabular-nums text-neutral-400">
              {description.length}/500
            </span>
          </label>

          <DeveloperMediaField
            label={onboarding ? "Company logo" : "Company logo (optional)"}
            description={onboarding ? "Required to unlock the workspace. Upload a PNG, JPG, or WebP logo up to 5 MB." : "Upload a PNG, JPG, or WebP logo up to 5 MB. The current logo stays in place when you submit without a new file."}
            fileName="logo_file"
            urlName="logo_url"
            urlLabel="Or paste your hosted logo URL"
            accept="image/png,image/jpeg,image/webp"
            required={onboarding}
            currentValue={initialLogoUrl}
            onFilesSelected={handleFilesSelected}
          />
        </div>

        <ProfileSubmitControls submissionAvailable={submissionAvailable} onboarding={onboarding} blockedByUploadError={Boolean(uploadError)} />
      </form>
    </div>
  );
}

function ProfileSubmitControls({ submissionAvailable, onboarding, blockedByUploadError }: { submissionAvailable: boolean; onboarding: boolean; blockedByUploadError: boolean }) {
  const { pending } = useFormStatus();
  const blocked = !submissionAvailable || blockedByUploadError;
  return (
    <div className="mt-7 flex flex-col gap-3 border-t border-black/5 pt-5 sm:flex-row sm:items-center sm:justify-between">
      <p aria-live="polite" className="max-w-md text-xs leading-5 text-neutral-500">
        {pending
          ? "Uploading your logo and sending this revision for review…"
          : !submissionAvailable
            ? "Review submission is unavailable until the profile contract is deployed."
            : blockedByUploadError
            ? "Fix the logo upload before submitting."
            : onboarding
            ? "Submit a complete profile to unlock the rest of the developer workspace."
            : "The current public profile stays unchanged until this version is approved."}
      </p>
      <button
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-black px-6 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
        type="submit"
        disabled={pending || blocked}
        aria-busy={pending}
      >
        {pending ? "Submitting…" : "Submit for review"}
      </button>
    </div>
  );
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
