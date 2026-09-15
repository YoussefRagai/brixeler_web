import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
import { requireAdminRole } from "@/lib/adminAuth";
import { logAdminActivity } from "@/lib/adminQueries";
import { supabaseServer } from "@/lib/supabaseServer";
import type { ReactNode } from "react";
import { parseMobileActionUrl } from "@/lib/mobileActions";
import { NotificationCampaignStudio } from "@/components/NotificationCampaignStudio";
import { GrowthVersionHistory } from "@/components/GrowthVersionHistory";
import { GrowthApprovalControls } from "@/components/GrowthApprovalControls";

type Campaign = {
  id: string;
  title: string;
  message: string;
  audience_id: string | null;
  action_url: string | null;
  audience: string;
  channel: string;
  status: string;
  lifecycle_state: string;
  version: number;
  title_ar: string | null;
  message_ar: string | null;
  approval_status: string;
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
  const [{ count: all }, { count: verified }, { count: newThisWeek }, { count: noDeals }, { data: waitingDeals }, { data: campaigns }, { data: pushBatches }, { data: testAgents }, { data: savedAudiences }] = await Promise.all([
    supabaseServer.from("users_profile").select("id", { count: "exact", head: true }).eq("account_status", "active"),
    supabaseServer.from("users_profile").select("id", { count: "exact", head: true }).eq("verification_status", "verified"),
    supabaseServer
      .from("users_profile")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
    supabaseServer.from("users_profile").select("id", { count: "exact", head: true }).eq("account_status", "active").eq("total_deals", 0),
    supabaseServer.from("deals").select("agent_id").in("status", ["approved", "confirmed", "awaiting_payment"]),
    supabaseServer
      .from("notification_campaigns")
      .select("id, title, title_ar, message, message_ar, audience, audience_id, channel, action_url, status, lifecycle_state, version, approval_status, recipient_count, push_recipient_count, push_batch_count, scheduled_for, sent_at, is_demo")
      .order("created_at", { ascending: false })
      .limit(20),
    supabaseServer
      .from("push_delivery_batches")
      .select("campaign_id, status, token_count"),
    supabaseServer
      .from("users_profile")
      .select("id, display_name, phone")
      .eq("account_status", "active")
      .order("display_name")
      .limit(100),
    supabaseServer
      .from("growth_audiences")
      .select("id, name")
      .eq("lifecycle_state", "active")
      .order("name"),
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
    audiences: [
      { value: "verified", label: "All verified agents", count: verified ?? 0 },
      { value: "all", label: "All active agents", count: all ?? 0 },
      { value: "no_deals", label: "Agents without deals", count: noDeals ?? 0 },
      { value: "waiting_payment", label: "Agents waiting for payment", count: new Set((waitingDeals ?? []).map((deal) => deal.agent_id).filter(Boolean)).size },
      ...(savedAudiences ?? []).map((audience) => ({ value: `audience:${audience.id}`, label: audience.name, count: null })),
    ],
    testAgents: (testAgents ?? []).map((agent) => ({ id: agent.id, label: agent.display_name || agent.phone || "Unnamed agent" })),
    campaigns: ((campaigns ?? []) as Campaign[]).map((campaign) => {
      const delivery = deliveryByCampaign.get(campaign.id) ?? { delivered: 0, pending: 0, failed: 0 };
      return { ...campaign, pushDelivered: delivery.delivered, pushPending: delivery.pending, pushFailed: delivery.failed };
    }),
  };
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ success?: string; error?: string; edit?: string }>;
}) {
  const ui = await buildAdminUi(["marketing_admin"]);
  const feedback = (await searchParams) ?? {};
  const data = ui.hasAccess ? await loadNotificationData() : { segments: [], campaigns: [], audiences: [], testAgents: [] };
  const editingCampaign = data.campaigns.find((campaign) => campaign.id === feedback.edit && ["draft", "scheduled", "paused"].includes(campaign.lifecycle_state)) ?? null;
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

          <NotificationCampaignStudio action={createCampaignAction} audiences={data.audiences} testAgents={data.testAgents} initial={editingCampaign ? { id: editingCampaign.id, audience: editingCampaign.audience, audienceId: editingCampaign.audience_id, channel: editingCampaign.channel, title: editingCampaign.title, titleAr: editingCampaign.title_ar, message: editingCampaign.message, messageAr: editingCampaign.message_ar, actionUrl: editingCampaign.action_url, scheduledFor: editingCampaign.scheduled_for } : null} />

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
                      <td className="px-4 py-3 font-semibold">{campaign.title} {campaign.is_demo ? <DemoBadge /> : null}<span className="ml-2 text-[10px] font-normal text-neutral-400">v{campaign.version}</span></td>
                      <td className="px-4 py-3 capitalize">{campaign.audience.replaceAll("_", " ")}</td>
                      <td className="px-4 py-3">{new Date(campaign.scheduled_for).toLocaleString()}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${campaign.lifecycle_state === "active" || campaign.status === "sent" ? "bg-emerald-100 text-emerald-800" : campaign.lifecycle_state === "scheduled" ? "bg-blue-100 text-blue-800" : "bg-neutral-100 text-neutral-600"}`}>{campaign.status === "sent" ? "sent" : campaign.lifecycle_state}</span><GrowthApprovalControls entityType="notification_campaign" entityId={campaign.id} expectedVersion={campaign.version} status={campaign.approval_status} canApprove={ui.roles.includes("super_admin")} /><div className="mt-2 flex flex-wrap gap-2"><GrowthVersionHistory entityType="notification_campaign" entityId={campaign.id} currentVersion={campaign.version} />{["draft", "scheduled", "paused"].includes(campaign.lifecycle_state) ? <><a href={`/notifications?edit=${campaign.id}#notification-composer`} className="text-xs text-neutral-600 underline-offset-2 hover:underline">Edit</a><form action={duplicateCampaignAction}><input type="hidden" name="id" value={campaign.id}/><button type="submit" className="text-xs text-neutral-600 underline-offset-2 hover:underline">Duplicate</button></form><form action={cancelCampaignAction}><input type="hidden" name="id" value={campaign.id}/><button type="submit" className="text-xs text-rose-700 underline-offset-2 hover:underline">Cancel</button></form></> : null}</div></td>
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
  const titleAr = formData.get("titleAr")?.toString().trim() || null;
  const messageAr = formData.get("messageAr")?.toString().trim() || null;
  const requestedAudience = formData.get("audience")?.toString() ?? "verified";
  const customAudienceId = requestedAudience.startsWith("audience:") ? requestedAudience.slice("audience:".length) : null;
  const audience = customAudienceId ? "all" : requestedAudience;
  const channel = formData.get("channel")?.toString() ?? "in_app";
  const intent = formData.get("intent")?.toString() ?? "schedule";
  const campaignId = formData.get("campaignId")?.toString() || null;
  const actionUrl = parseMobileActionUrl(formData.get("actionUrl"));
  const scheduledRaw = formData.get("scheduledFor")?.toString();
  const scheduledFor = scheduledRaw ? new Date(scheduledRaw) : new Date();
  if (!title || !message || !["all", "verified", "no_deals", "waiting_payment"].includes(audience) || (customAudienceId && !/^[0-9a-f-]{36}$/i.test(customAudienceId)) || !["in_app", "in_app_push"].includes(channel) || Number.isNaN(scheduledFor.getTime())) redirect("/notifications?error=Check%20the%20campaign%20fields.");
  if (customAudienceId) {
    const { data: savedAudience } = await supabaseServer.from("growth_audiences").select("id").eq("id", customAudienceId).eq("lifecycle_state", "active").maybeSingle();
    if (!savedAudience) redirect("/notifications?error=The%20selected%20audience%20is%20not%20active.");
  }

  if (intent === "test") {
    const testAgentId = formData.get("testAgentId")?.toString() ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(testAgentId)) redirect("/notifications?error=Choose%20a%20test%20recipient.");
    const { data: testAgent } = await supabaseServer.from("users_profile").select("id, language_preference, account_status").eq("id", testAgentId).eq("account_status", "active").maybeSingle();
    if (!testAgent) redirect("/notifications?error=Test%20recipient%20is%20not%20available.");
    const useArabic = testAgent.language_preference === "ar" && titleAr && messageAr;
    const { error: testError } = await supabaseServer.from("notifications").insert({ agent_id: testAgent.id, type: "admin_message", title: useArabic ? titleAr : title, message: useArabic ? messageAr : message, action_url: actionUrl, push_sent: false, is_demo: false });
    if (testError) redirect(`/notifications?error=${encodeURIComponent(testError.message)}`);
    await logAdminActivity({ adminId: admin.adminId, action: "notification_campaign_tested", resourceType: "notification", resourceId: testAgent.id, metadata: { channel: "in_app", requestedChannel: channel } });
    revalidatePath("/notifications");
    redirect("/notifications?success=Test%20message%20sent%20to%20the%20selected%20agent.");
  }

  const lifecycleState = intent === "draft" ? "draft" : "scheduled";

  const record = {
      title,
      title_ar: titleAr,
      message,
      message_ar: messageAr,
      audience,
      audience_id: customAudienceId,
      channel,
      action_url: actionUrl,
      scheduled_for: scheduledFor.toISOString(),
      status: lifecycleState === "draft" ? "cancelled" : "scheduled",
      lifecycle_state: lifecycleState,
      approval_status: lifecycleState === "scheduled" ? "pending" : "not_required",
      start_at: scheduledFor.toISOString(),
      published_at: lifecycleState === "scheduled" ? new Date().toISOString() : null,
      updated_by: admin.adminId,
      metadata: { requires_second_approval: lifecycleState === "scheduled" },
    };
  const mutation = supabaseServer.from("notification_campaigns");
  if (campaignId) {
    if (!/^[0-9a-f-]{36}$/i.test(campaignId)) redirect("/notifications?error=Invalid%20campaign.");
    const { data: editable } = await supabaseServer.from("notification_campaigns").select("id, lifecycle_state").eq("id", campaignId).maybeSingle();
    if (!editable || !["draft", "scheduled", "paused"].includes(editable.lifecycle_state)) redirect("/notifications?error=This%20campaign%20can%20no%20longer%20be%20edited.");
  }
  const { data, error } = campaignId
    ? await mutation.update(record).eq("id", campaignId).select("id").single()
    : await mutation.insert({ ...record, created_by: admin.adminId }).select("id").single();
  if (error || !data) redirect(`/notifications?error=${encodeURIComponent(error?.message ?? "Unable to create campaign.")}`);

  await logAdminActivity({ adminId: admin.adminId, action: campaignId ? "notification_campaign_updated" : lifecycleState === "draft" ? "notification_campaign_draft_saved" : "notification_campaign_created", resourceType: "notification_campaign", resourceId: data.id, metadata: { audience, channel, lifecycleState } });
  revalidatePath("/notifications");
  redirect(`/notifications?success=${encodeURIComponent(lifecycleState === "draft" ? "Campaign draft saved." : "Campaign submitted for approval.")}`);
}

async function cancelCampaignAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin) redirect("/notifications?error=Access%20denied.");
  const id = formData.get("id")?.toString() ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/notifications?error=Invalid%20campaign.");
  const { error } = await supabaseServer.from("notification_campaigns").update({ status: "cancelled", lifecycle_state: "archived", archived_at: new Date().toISOString(), updated_by: admin.adminId }).eq("id", id).in("status", ["scheduled", "failed", "cancelled"]);
  if (error) redirect(`/notifications?error=${encodeURIComponent(error.message)}`);
  await logAdminActivity({ adminId: admin.adminId, action: "notification_campaign_cancelled", resourceType: "notification_campaign", resourceId: id });
  revalidatePath("/notifications");
}

async function duplicateCampaignAction(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin) redirect("/notifications?error=Access%20denied.");
  const id = formData.get("id")?.toString() ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/notifications?error=Invalid%20campaign.");
  const { data: source, error: sourceError } = await supabaseServer.from("notification_campaigns").select("audience, audience_id, channel, title, title_ar, message, message_ar, action_url, metadata").eq("id", id).single();
  if (sourceError || !source) redirect("/notifications?error=Campaign%20could%20not%20be%20duplicated.");
  const { error } = await supabaseServer.from("notification_campaigns").insert({ ...source, title: `${source.title} · Copy`, created_by: admin.adminId, updated_by: admin.adminId, status: "cancelled", lifecycle_state: "draft", scheduled_for: new Date().toISOString(), start_at: null, published_at: null, archived_at: null, recipient_count: 0 });
  if (error) redirect(`/notifications?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/notifications");
  redirect("/notifications?success=Campaign%20duplicated%20as%20a%20draft.");
}
