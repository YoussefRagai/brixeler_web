"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { Building2, Check, ImageUp } from "lucide-react";

type ProfileAction = (formData: FormData) => void | Promise<void>;

export function DeveloperProfileForm({ action, developerId, initialName, initialDescription, initialLogoUrl }: { action: ProfileAction; developerId: string; initialName: string; initialDescription: string; initialLogoUrl?: string | null }) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [previewUrl, setPreviewUrl] = useState(initialLogoUrl ?? "");
  const [temporaryUrl, setTemporaryUrl] = useState("");

  useEffect(() => () => { if (temporaryUrl) URL.revokeObjectURL(temporaryUrl); }, [temporaryUrl]);

  function previewLogo(file?: File) {
    if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
    if (!file) { setTemporaryUrl(""); setPreviewUrl(initialLogoUrl ?? ""); return; }
    const url = URL.createObjectURL(file);
    setTemporaryUrl(url);
    setPreviewUrl(url);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <aside aria-label="Illustrative mobile profile preview" className="rounded-3xl bg-black p-6 text-white lg:sticky lg:top-6 lg:self-start">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">Illustrative mobile preview</p>
        <p className="mt-2 max-w-sm text-xs leading-5 text-white/50">A guide to how agents may see your brand in Brixeler. This preview does not publish changes.</p>
        <div className="mt-8 flex items-center gap-4">
          <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-3xl bg-white p-3 text-black">
            {previewUrl ? <Image src={previewUrl} alt="Illustrative developer logo preview" width={80} height={80} unoptimized className="h-full w-full object-contain" /> : <Building2 aria-hidden="true" size={30} strokeWidth={1.5} />}
          </div>
          <div className="min-w-0"><h2 className="line-clamp-2 break-words text-2xl font-semibold leading-tight tracking-tight">{name || "Developer name"}</h2><p className="mt-1 text-xs font-medium text-white/45">Verified developer partner</p></div>
        </div>
        <p className="mt-8 line-clamp-4 break-words text-sm leading-6 text-white/65">{description || "Your company story will appear here for agents browsing your launches."}</p>
        <div className="mt-8 space-y-2 border-t border-white/10 pt-5 text-xs text-white/55"><p className="flex items-center gap-2"><Check size={14} className="text-emerald-400" /> Used across project and listing screens</p><p className="flex items-center gap-2"><Check size={14} className="text-emerald-400" /> Visible to agents in the Brixeler app</p></div>
      </aside>

      <form action={action} className="rounded-3xl border border-black/5 bg-white p-5 sm:p-7">
        <input type="hidden" name="developerId" value={developerId} />
        <div className="border-b border-black/5 pb-5"><h2 className="text-lg font-semibold text-black">Brand details</h2><p className="mt-1 text-sm text-neutral-500">Keep your identity concise and recognizable across Brixeler.</p></div>
        <div className="mt-6 space-y-5">
          <label className="flex flex-col gap-1.5 text-sm"><span className="text-xs font-semibold text-neutral-600">Developer name</span><input autoComplete="organization" className="min-h-12 rounded-2xl border border-black/10 bg-neutral-50 px-4 outline-none transition focus:border-black/30 focus:bg-white focus:ring-4 focus:ring-black/[0.04]" name="name" value={name} onChange={(event) => setName(event.target.value)} required /></label>
          <label className="flex flex-col gap-1.5 text-sm"><span className="text-xs font-semibold text-neutral-600">Company description</span><textarea className="min-h-32 rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3 leading-6 outline-none transition focus:border-black/30 focus:bg-white focus:ring-4 focus:ring-black/[0.04]" name="description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} placeholder="What should agents know about your company and launches?" /><span className="text-right text-[11px] text-neutral-400">{description.length}/500</span></label>
          <label className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-black/15 bg-neutral-50 p-4 transition hover:border-black/30 hover:bg-white"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-black/5"><ImageUp size={19} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-neutral-800">Upload a new logo</span><span className="mt-0.5 block text-xs text-neutral-500">PNG, JPG, or WebP · up to 5 MB</span></span><input className="sr-only" type="file" name="logo_file" accept="image/*" onChange={(event) => previewLogo(event.target.files?.[0])} /></label>
        </div>
        <ProfileSubmitControls />
      </form>
    </div>
  );
}

function ProfileSubmitControls() {
  const { pending } = useFormStatus();
  return (
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-5">
      <p aria-live="polite" className="text-xs text-neutral-500">
        {pending ? "Saving your profile…" : "Changes are saved when you submit."}
      </p>
      <button
        className="min-h-11 rounded-full bg-black px-6 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-60"
        type="submit"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? "Saving…" : "Save profile"}
      </button>
    </div>
  );
}
