import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
import { requireAdminRole } from "@/lib/adminAuth";
import { logAdminActivity } from "@/lib/adminQueries";
import { supabaseServer } from "@/lib/supabaseServer";
import type { ReactNode } from "react";
import { MOBILE_ACTIONS, parseMobileActionUrl } from "@/lib/mobileActions";
import { MobilePreviewButton } from "@/components/MobilePreviewButton";

type Campaign = {
  id: string;
  title: string;
  audience: string;
  channel: string;
  status: string;
  recipient_count: number;
  push_recipient_count: number;
  push_batch_count: number;
  scheduled_for: string;
  sent_at: string | null;
  is_demo: boolean;
  pushDelivered?: number;
  pushPending?: number;
  pushFailed?: number;
};

async function loadNotificationData() {
  const [{ count: all }, { count: verified }, { count: newThisWeek }, { data: campaigns }, { data: pushBatches }] = await Promise.all([
    supabaseServer.from("users_profile").select("id", { count: "exact", head: true }).eq("account_status", "active"),
    supabaseServer.from("users_profile").select("id", { count: "exact", head: true }).eq("verification_status", "verified"),
    supabaseServer
      .from("users_profile")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
    supabaseServer
      .from("notification_campaigns")
      .select("id, title, audience, channel, status, recipient_count, push_recipient_count, push_batch_count, scheduled_for, sent_at, is_demo")
      .order("created_at", { ascending: false })
      .limit(20),
    supabaseServer
      .from("push_delivery_batches")
      .select("campaign_id, status, token_count"),
  ]);
  const deliveryByCampaign = new Map<string, { delivered: number; pending: number; failed: number }>();
  (pushBatches ?? []).forEach((batch) => {
    const current = deliveryByCampaign.get(batch.campaign_id) ?? { delivered: 0, pending: 0, failed: 0 };
    if (batch.status === "delivered") current.delivered += 1;
    else if (batch.status === "failed") current.failed += 1;
    else if (batch.status === "partial") {
      current.delivered += 1;
      current.failed += 1;
    } else current.pending += 1;
    deliveryByCampaign.set(batch.campaign_id, current);
  });
  return {
    segments: [
      { label: "Active agents", value: all ?? 0 },
      { label: "Verified", value: verified ?? 0 },
      { label: "New this week", value: newThisWeek ?? 0 },
    ],
    campaigns: ((campaigns ?? []) as Campaign[]).map((campaign) => {
      const delivery = deliveryByCampaign.get(campaign.id) ?? { delivered: 0, pending: 0, failed: 0 };
      return { ...campaign, pushDelivered: delivery.delivered, pushPending: delivery.pending, pushFailed: delivery.failed };
    }),
  };
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ success?: string; error?: string }>;
}) {
  const ui = await buildAdminUi(["marketing_admin"]);
  const feedback = (await searchParams) ?? {};
  const data = ui.hasAccess ? await loadNotificationData() : { segments: [], campaigns: [] };
  return (
    <AdminLayout
      title="Notifications"
      description="Create durable in-app campaigns, send immediately, or schedule delivery."
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <>
          {feedback.success ? <Feedback tone="success">{feedback.success}</Feedback> : null}
          {feedback.error ? <Feedback tone="error">{feedback.error}</Feedback> : null}

          <section className="grid gap-4 sm:grid-cols-3">
            {data.segments.map((segment) => (
              <article key={segment.label} className="rounded-2xl border border-black/5 bg-white p-4 shadow-md">
                <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">{segment.label}</p>
                <p className="mt-2 text-2xl font-semibold text-[#050505]">{segment.value.toLocaleString()}</p>
              </article>
            ))}
          </section>

          <section className="rounded-3xl border border-black/5 bg-white p-6 shadow-lg">
            <form id="notification-composer" action={createCampaignAction} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Recipients</span>
                  <select name="audience" className="mt-2 w-full rounded-2xl border border-black/10 bg-[#f7f7f7] px-4 py-3">
                    <option value="verified">All verified agents</option>
                    <option value="all">All active agents</option>
                    <option value="no_deals">Agents without deals</option>
                    <option value="waiting_payment">Agents waiting for payment</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Delivery</span>
                  <select name="channel" className="mt-2 w-full rounded-2xl border border-black/10 bg-[#f7f7f7] px-4 py-3">
                    <option value="in_app">In-app inbox</option>
                    <option value="in_app_push">In-app + phone push</option>
                  </select>
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Title</span>
                <input name="title" required maxLength={120} className="mt-2 w-full rounded-2xl border border-black/10 bg-[#f7f7f7] px-4 py-3" placeholder="Commission batch released" />
              </label>
              <label className="block text-sm">
                <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Message</span>
                <textarea name="message" required maxLength={2000} className="mt-2 min-h-36 w-full rounded-2xl border border-black/10 bg-[#f7f7f7] px-4 py-3" placeholder="Write the update agents will receive." />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Open in mobile</span>
                  <select name="actionUrl" defaultValue="/" className="mt-2 w-full rounded-2xl border border-black/10 bg-[#f7f7f7] px-4 py-3">
                    {MOBILE_ACTIONS.map((action) => <option key={action.value} value={action.value}>{action.label}</option>)}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Schedule for</span>
                  <input name="scheduledFor" type="datetime-local" className="mt-2 w-full rounded-2xl border border-black/10 bg-[#f7f7f7] px-4 py-3" />
                </label>
              </div>
              <p className="text-xs text-neutral-500">Leave the schedule blank to deliver now. Phone alerts go to agents who enabled notifications and registered this version of the mobile app; every recipient still receives the in-app message.</p>
              <div className="flex flex-wrap items-center gap-3">
                <button className="min-h-11 rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-800" type="submit">
                  Create campaign
                </button>
                <MobilePreviewButton formId="notification-composer" titleField="title" bodyField="message" typeField="channel" label="Preview in mobile" />
              </div>
            </form>
          </section>

          <section className="overflow-hidden rounded-3xl border border-black/5 bg-white">
            <div className="border-b border-black/5 px-5 py-4">
              <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Campaign history</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-50 text-xs uppercase tracking-[0.22em] text-neutral-500">
                  <tr><th className="px-4 py-3">Campaign</th><th className="px-4 py-3">Audience</th><th className="px-4 py-3">Schedule</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">In-app</th><th className="px-4 py-3">Phone push</th></tr>
                </thead>
                <tbody>
                  {data.campaigns.map((campaign) => (
                    <tr key={campaign.id} className="border-t border-black/5">
                      <td className="px-4 py-3 font-semibold">{campaign.title} {campaign.is_demo ? <DemoBadge /> : null}</td>
                      <td className="px-4 py-3 capitalize">{campaign.audience.replaceAll("_", " ")}</td>
                      <td className="px-4 py-3">{new Date(campaign.scheduled_for).toLocaleString()}</td>
                      <td className="px-4 py-3 capitalize">{campaign.status}</td>
                      <td className="px-4 py-3">{campaign.recipient_count}</td>
                      <td className="px-4 py-3">{campaign.channel === "in_app_push" ? (
                        <span>{campaign.pushDelivered ?? 0} delivered batches · {campaign.pushPending ?? 0} pending · {campaign.pushFailed ?? 0} failed</span>
                      ) : "—"}</td>
                    </tr>
                  ))}
                  {!data.campaigns.length ? <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-500">No campaigns yet.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </AdminLayout>
  );
}

function Feedback({ tone, children }: { tone: "success" | "error"; children: ReactNode }) {
  return <div className={`rounded-2xl border px-4 py-3 text-sm ${tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{children}</div>;
}

function DemoBadge() {
  return <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-800">Demo</span>;
}

async function createCampaignAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin) redirect("/notifications?error=Access%20denied.");
  const title = formData.get("title")?.toString().trim() ?? "";
  const message = formData.get("message")?.toString().trim() ?? "";
  const audience = formData.get("audience")?.toString() ?? "verified";
  const channel = formData.get("channel")?.toString() ?? "in_app";
  const actionUrl = parseMobileActionUrl(formData.get("actionUrl"));
  const scheduledRaw = formData.get("scheduledFor")?.toString();
  const scheduledFor = scheduledRaw ? new Date(scheduledRaw) : new Date();
  if (!title || !message || Number.isNaN(scheduledFor.getTime())) redirect("/notifications?error=Check%20the%20campaign%20fields.");

  const { data, error } = await supabaseServer
    .from("notification_campaigns")
    .insert({
      created_by: admin.adminId,
      title,
      message,
      audience,
      channel,
      action_url: actionUrl,
      scheduled_for: scheduledFor.toISOString(),
      status: "scheduled",
    })
    .select("id")
    .single();
  if (error || !data) redirect(`/notifications?error=${encodeURIComponent(error?.message ?? "Unable to create campaign.")}`);

  if (scheduledFor.getTime() <= Date.now() + 5000) {
    const { error: dispatchError } = await supabaseServer.rpc("dispatch_notification_campaign", { p_campaign_id: data.id });
    if (dispatchError) redirect(`/notifications?error=${encodeURIComponent(dispatchError.message)}`);
  }
  await logAdminActivity({ adminId: admin.adminId, action: "notification_campaign_created", resourceType: "notification_campaign", resourceId: data.id, metadata: { audience, channel } });
  revalidatePath("/notifications");
  redirect("/notifications?success=Campaign%20created.");
}
