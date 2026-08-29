"use client";

import { useMemo, useState } from "react";
import { MobilePreviewButton } from "@/components/MobilePreviewButton";

type AudienceOption = { value: string; label: string; count: number | null };
type TestAgent = { id: string; label: string };
type CampaignDraft = {
  id: string;
  audience: string;
  audienceId?: string | null;
  channel: string;
  title: string;
  titleAr?: string | null;
  message: string;
  messageAr?: string | null;
  actionUrl?: string | null;
  scheduledFor?: string | null;
};

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  audiences: AudienceOption[];
  testAgents: TestAgent[];
  initial?: CampaignDraft | null;
};

export function NotificationCampaignStudio({ action, audiences, testAgents, initial }: Props) {
  const [audience, setAudience] = useState(initial?.audienceId ? `audience:${initial.audienceId}` : initial?.audience ?? audiences[0]?.value ?? "verified");
  const [channel, setChannel] = useState(initial?.channel ?? "in_app");
  const selectedAudience = useMemo(() => audiences.find((option) => option.value === audience), [audience, audiences]);

  return (
    <section className="rounded-3xl border border-black/5 bg-white p-5 shadow-lg sm:p-6" aria-labelledby="campaign-studio-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">Campaign studio</p>
          <h2 id="campaign-studio-title" className="mt-1 text-xl font-semibold text-neutral-950">{initial ? "Edit campaign draft" : "Compose, test, and schedule"}</h2>
          <p className="mt-1 text-sm text-neutral-500">Drafts and tests never broadcast to the selected audience.</p>
        </div>
        <div aria-live="polite" className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-600">
          {selectedAudience?.count == null ? "Audience calculated at send time" : `${selectedAudience.count.toLocaleString("en-EG")} estimated recipients`}
        </div>
      </div>

      <form id="notification-composer" action={action} className="mt-6 space-y-6">
        {initial ? <input type="hidden" name="campaignId" value={initial.id} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm" htmlFor="campaign-audience">
            <span className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">Audience</span>
            <select id="campaign-audience" name="audience" value={audience} onChange={(event) => setAudience(event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3">
              {audiences.map((option) => <option key={option.value} value={option.value}>{option.label}{option.count == null ? "" : ` · ${option.count}`}</option>)}
            </select>
          </label>
          <label className="text-sm" htmlFor="campaign-channel">
            <span className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">Delivery</span>
            <select id="campaign-channel" name="channel" value={channel} onChange={(event) => setChannel(event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3">
              <option value="in_app">In-app inbox</option>
              <option value="in_app_push">In-app inbox + phone push</option>
            </select>
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <fieldset className="space-y-4 rounded-2xl border border-black/5 bg-neutral-50 p-4">
            <legend className="px-2 text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">English</legend>
            <label className="block text-sm" htmlFor="campaign-title">
              <span className="text-xs font-semibold text-neutral-600">Title</span>
              <input id="campaign-title" name="title" defaultValue={initial?.title} required maxLength={120} className="mt-1 min-h-12 w-full rounded-2xl border border-black/10 bg-white px-4 py-3" placeholder="Commission batch released" />
            </label>
            <label className="block text-sm" htmlFor="campaign-message">
              <span className="text-xs font-semibold text-neutral-600">Message</span>
              <textarea id="campaign-message" name="message" defaultValue={initial?.message} required maxLength={2000} className="mt-1 min-h-32 w-full rounded-2xl border border-black/10 bg-white px-4 py-3" placeholder="Write the update agents will receive." />
            </label>
          </fieldset>
          <fieldset className="space-y-4 rounded-2xl border border-black/5 bg-neutral-50 p-4">
            <legend className="px-2 text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Arabic</legend>
            <label className="block text-sm" htmlFor="campaign-title-ar">
              <span className="text-xs font-semibold text-neutral-600">Arabic title</span>
              <input id="campaign-title-ar" name="titleAr" defaultValue={initial?.titleAr ?? ""} dir="rtl" maxLength={120} className="mt-1 min-h-12 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-right" />
            </label>
            <label className="block text-sm" htmlFor="campaign-message-ar">
              <span className="text-xs font-semibold text-neutral-600">Arabic message</span>
              <textarea id="campaign-message-ar" name="messageAr" defaultValue={initial?.messageAr ?? ""} dir="rtl" maxLength={2000} className="mt-1 min-h-32 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-right" />
            </label>
          </fieldset>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm" htmlFor="campaign-action">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Open in mobile</span>
            <select id="campaign-action" name="actionUrl" defaultValue={initial?.actionUrl ?? "/"} className="mt-1 min-h-12 w-full rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3">
              <option value="/">Home</option>
              <option value="/properties">Properties</option>
              <option value="/deals">Deals</option>
              <option value="/gifts">Gifts</option>
              <option value="/profile">Profile</option>
              <option value="/support">Support</option>
            </select>
          </label>
          <label className="text-sm" htmlFor="campaign-schedule">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Schedule</span>
            <input id="campaign-schedule" name="scheduledFor" type="datetime-local" defaultValue={initial?.scheduledFor ? new Date(initial.scheduledFor).toISOString().slice(0, 16) : ""} className="mt-1 min-h-12 w-full rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3" />
          </label>
          <label className="text-sm" htmlFor="campaign-test-agent">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Test recipient</span>
            <select id="campaign-test-agent" name="testAgentId" defaultValue="" className="mt-1 min-h-12 w-full rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3">
              <option value="">Select an agent</option>
              {testAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.label}</option>)}
            </select>
          </label>
        </div>

        <p className="text-xs text-neutral-500">Phone alerts require a registered device token; the in-app inbox remains the durable source of truth.</p>
        <div className="flex flex-wrap items-center gap-3">
          <MobilePreviewButton formId="notification-composer" titleField="title" bodyField="message" titleArField="titleAr" bodyArField="messageAr" typeField="channel" actionField="actionUrl" label="Preview mobile" />
          <button name="intent" value="test" className="min-h-11 rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-800 hover:border-black/30" type="submit">Send test</button>
          <button name="intent" value="draft" className="min-h-11 rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-800 hover:border-black/30" type="submit">{initial ? "Update draft" : "Save draft"}</button>
          <button name="intent" value="schedule" className="min-h-11 rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800" type="submit">{initial ? "Update and schedule" : "Schedule or send"}</button>
        </div>
      </form>
    </section>
  );
}
