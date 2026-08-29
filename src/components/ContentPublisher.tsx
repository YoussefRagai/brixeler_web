"use client";

import { useMemo, useState } from "react";
import { MobilePreviewButton } from "@/components/MobilePreviewButton";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  audiences?: Array<{ id: string; name: string }>;
  initial?: {
    id: string;
    type: string;
    key: string;
    label: string;
    labelAr?: string | null;
    body?: string | null;
    bodyAr?: string | null;
    audienceId?: string | null;
    placement?: string | null;
    startAt?: string | null;
  } | null;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

export function ContentPublisher({ action, audiences = [], initial }: Props) {
  const [contentType, setContentType] = useState(initial?.type ?? "amenity");
  const [label, setLabel] = useState(initial?.label ?? "");
  const generatedKey = useMemo(() => initial?.key ?? slugify(label), [initial?.key, label]);
  const isAnnouncement = contentType === "mobile_announcement";

  return (
    <section className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="content-publisher-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">Content studio</p>
          <h2 id="content-publisher-title" className="mt-1 text-xl font-semibold text-neutral-950">{initial ? "Edit mobile content" : "Create a mobile content item"}</h2>
          <p className="mt-1 text-sm text-neutral-500">Write, preview, save, and publish without managing technical keys.</p>
        </div>
        <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-600">Drafts stay hidden from agents</span>
      </div>

      <form id="content-publisher" action={action} className="mt-6 grid gap-5 lg:grid-cols-2">
        {initial ? <input type="hidden" name="contentId" value={initial.id} /> : null}
        <input type="hidden" name="contentKey" value={generatedKey} />
        <label className="text-sm" htmlFor="content-type">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Content type</span>
          <select id="content-type" name="contentType" value={contentType} onChange={(event) => setContentType(event.target.value)} className="mt-1 min-h-12 w-full rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3">
            <option value="amenity">Amenity</option>
            <option value="faq">FAQ</option>
            <option value="mobile_announcement">Mobile announcement</option>
          </select>
        </label>
        <label className="text-sm" htmlFor="content-placement">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Mobile placement</span>
          <select id="content-placement" name="placement" defaultValue={initial?.placement ?? (isAnnouncement ? "home" : "automatic")} className="mt-1 min-h-12 w-full rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3">
            <option value="automatic">Automatic for this content type</option>
            <option value="home">Home</option>
            <option value="properties">Property filters</option>
            <option value="settings">Help & settings</option>
          </select>
        </label>
        <label className="text-sm lg:col-span-2" htmlFor="content-audience">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Who can see it</span>
          <select id="content-audience" name="audienceId" defaultValue={initial?.audienceId ?? ""} className="mt-1 min-h-12 w-full rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3">
            <option value="">All active agents</option>
            {audiences.map((audience) => <option key={audience.id} value={audience.id}>{audience.name}</option>)}
          </select>
          <span className="mt-1 block text-xs text-neutral-500">Targeted content follows the same saved audiences used by rewards and campaigns.</span>
        </label>

        <fieldset className="grid gap-4 rounded-2xl border border-black/5 bg-neutral-50 p-4 lg:col-span-2 lg:grid-cols-2">
          <legend className="px-2 text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">English</legend>
          <label className="text-sm" htmlFor="content-label">
            <span className="text-xs font-semibold text-neutral-600">Title or label</span>
            <input id="content-label" name="label" value={label} onChange={(event) => setLabel(event.target.value)} required maxLength={160} className="mt-1 min-h-12 w-full rounded-2xl border border-black/10 bg-white px-4 py-3" />
          </label>
          <label className="text-sm lg:row-span-2" htmlFor="content-body">
            <span className="text-xs font-semibold text-neutral-600">Body</span>
            <textarea id="content-body" name="body" defaultValue={initial?.body ?? ""} required={contentType !== "amenity"} maxLength={4000} className="mt-1 min-h-28 w-full rounded-2xl border border-black/10 bg-white px-4 py-3" />
          </label>
          <p className="self-end text-xs text-neutral-500">Internal reference: <span className="font-mono text-neutral-700">{generatedKey || "generated-from-title"}</span></p>
        </fieldset>

        <fieldset className="grid gap-4 rounded-2xl border border-black/5 bg-neutral-50 p-4 lg:col-span-2 lg:grid-cols-2">
          <legend className="px-2 text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Arabic</legend>
          <label className="text-sm" htmlFor="content-label-ar">
            <span className="text-xs font-semibold text-neutral-600">Arabic title or label</span>
            <input id="content-label-ar" name="labelAr" defaultValue={initial?.labelAr ?? ""} dir="rtl" maxLength={160} className="mt-1 min-h-12 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-right" />
          </label>
          <label className="text-sm" htmlFor="content-body-ar">
            <span className="text-xs font-semibold text-neutral-600">Arabic body</span>
            <textarea id="content-body-ar" name="bodyAr" defaultValue={initial?.bodyAr ?? ""} dir="rtl" maxLength={4000} className="mt-1 min-h-28 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-right" />
          </label>
        </fieldset>

        <label className="text-sm" htmlFor="content-scheduled-for">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Publish time</span>
          <input id="content-scheduled-for" name="scheduledFor" type="datetime-local" defaultValue={initial?.startAt ? new Date(initial.startAt).toISOString().slice(0, 16) : ""} className="mt-1 min-h-12 w-full rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3" />
          <span className="mt-1 block text-xs text-neutral-500">Leave blank to publish immediately.</span>
        </label>

        <div className="flex flex-wrap items-end justify-start gap-3 lg:justify-end">
          <MobilePreviewButton formId="content-publisher" titleField="label" bodyField="body" titleArField="labelAr" bodyArField="bodyAr" typeField="contentType" actionField="placement" />
          <button name="intent" value="draft" className="min-h-11 rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-800 hover:border-black/30" type="submit">{initial ? "Update draft" : "Save draft"}</button>
          <button name="intent" value="publish" className="min-h-11 rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800" type="submit">{initial ? "Update and publish" : "Publish or schedule"}</button>
        </div>
      </form>
    </section>
  );
}
