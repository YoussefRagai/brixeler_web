import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { AdminLayout } from "@/components/AdminLayout";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { requireAdminRole } from "@/lib/adminAuth";
import { logAdminActivity } from "@/lib/adminQueries";
import { buildAdminUi } from "@/lib/adminUi";
import { compensateDeveloperInviteAuthUser } from "@/lib/developerAccountInvites";
import { supabaseServer } from "@/lib/supabaseServer";

type ReferralBand = {
  id: string;
  tier_name: string;
  min_referrals: number;
  max_referrals: number | null;
  bonus_percentage: number;
  behavior_requirement: "none" | "verified" | "first_deal";
};

type DemoBatch = {
  batch_key: string;
  label: string;
  notes: string | null;
  status: string;
  created_at: string;
  removed_at: string | null;
};

const behaviorOptions: Array<{ value: ReferralBand["behavior_requirement"]; label: string }> = [
  { value: "none", label: "All referrals" },
  { value: "verified", label: "Verified referrals" },
  { value: "first_deal", label: "Referrals with a first deal" },
];

async function requireSettingsAdmin() {
  const admin = await requireAdminRole(["super_admin"]);
  if (!admin) redirect("/settings?error=Access%20denied.");
  return admin;
}

async function getSettingsData() {
  const [bandsResult, batchesResult, tiersResult, badgesResult, audiencesResult] = await Promise.all([
    supabaseServer
      .from("referral_bonus_rules")
      .select("id, tier_name, min_referrals, max_referrals, bonus_percentage, behavior_requirement")
      .order("min_referrals", { ascending: true }),
    supabaseServer
      .from("demo_data_batches")
      .select("batch_key, label, notes, status, created_at, removed_at")
      .order("created_at", { ascending: false }),
    supabaseServer.from("tiers").select("id", { count: "exact", head: true }),
    supabaseServer.from("badges").select("id", { count: "exact", head: true }),
    supabaseServer.from("growth_audiences").select("id", { count: "exact", head: true }),
  ]);

  return {
    bands: (bandsResult.data ?? []) as ReferralBand[],
    demoBatches: (batchesResult.data ?? []) as DemoBatch[],
    growthCounts: {
      tiers: tiersResult.count ?? 0,
      badges: badgesResult.count ?? 0,
      audiences: audiencesResult.count ?? 0,
    },
  };
}

function formError(message: string): never {
  redirect(`/settings?error=${encodeURIComponent(message)}`);
}

async function upsertReferralBand(formData: FormData) {
  "use server";
  const admin = await requireSettingsAdmin();
  const bandId = formData.get("bandId")?.toString() || undefined;
  const name = formData.get("name")?.toString().trim() ?? "";
  const min = Number(formData.get("minReferrals"));
  const rawMax = formData.get("maxReferrals")?.toString().trim() ?? "";
  const max = rawMax ? Number(rawMax) : null;
  const bonus = Number(formData.get("bonusPercentage"));
  const behavior = formData.get("behaviorRequirement")?.toString() as ReferralBand["behavior_requirement"];

  if (!name || name.length > 50) formError("Use a referral-band name between 1 and 50 characters.");
  if (!Number.isInteger(min) || min < 0) formError("Minimum referrals must be a non-negative whole number.");
  if (max !== null && (!Number.isInteger(max) || max < min)) formError("Maximum referrals must be blank or at least the minimum.");
  if (!Number.isFinite(bonus) || bonus < 0 || bonus > 5) formError("Bonus percentage must be between 0 and 5.");
  if (!behaviorOptions.some((option) => option.value === behavior)) formError("Choose a supported referral qualification.");

  const { data: existing, error: loadError } = await supabaseServer
    .from("referral_bonus_rules")
    .select("id, min_referrals, max_referrals");
  if (loadError) formError("Unable to validate the referral bands.");
  const overlaps = (existing ?? []).some((row) => {
    if (row.id === bandId) return false;
    const rowMax = row.max_referrals ?? Number.POSITIVE_INFINITY;
    const nextMax = max ?? Number.POSITIVE_INFINITY;
    return min <= rowMax && row.min_referrals <= nextMax;
  });
  if (overlaps) formError("Referral ranges cannot overlap. Adjust the minimum or maximum and try again.");

  const { data, error } = await supabaseServer
    .from("referral_bonus_rules")
    .upsert({
      id: bandId,
      tier_name: name,
      min_referrals: min,
      max_referrals: max,
      bonus_percentage: bonus,
      requires_verification: behavior === "verified",
      requires_first_deal: behavior === "first_deal",
      behavior_requirement: behavior,
    })
    .select("id")
    .single();
  if (error) formError(error.message);
  await logAdminActivity({
    adminId: admin.adminId,
    action: bandId ? "settings.referral_band.updated" : "settings.referral_band.created",
    resourceType: "referral_bonus_rules",
    resourceId: data?.id ?? bandId ?? null,
    metadata: { name, min_referrals: min, max_referrals: max, bonus_percentage: bonus, behavior_requirement: behavior },
  });
  revalidatePath("/settings");
  redirect(`/settings?success=${encodeURIComponent(`Referral payout band ${bandId ? "updated" : "created"}.`)}`);
}

async function deleteReferralBand(formData: FormData) {
  "use server";
  const admin = await requireSettingsAdmin();
  const bandId = formData.get("bandId")?.toString();
  if (!bandId) formError("Missing referral payout band.");
  const { error } = await supabaseServer.from("referral_bonus_rules").delete().eq("id", bandId);
  if (error) formError(error.message);
  await logAdminActivity({ adminId: admin.adminId, action: "settings.referral_band.deleted", resourceType: "referral_bonus_rules", resourceId: bandId });
  revalidatePath("/settings");
  redirect("/settings?success=Referral%20payout%20band%20deleted.");
}

async function removeDemoBatch(formData: FormData) {
  "use server";
  const admin = await requireSettingsAdmin();
  const batchKey = formData.get("batchKey")?.toString().trim();
  if (!batchKey) formError("Missing demo batch.");
  const { data: demoAccounts, error: demoAccountsError } = await supabaseServer
    .from("developer_accounts")
    .select("auth_user_id, developer_id, invite_request_id")
    .eq("is_demo", true)
    .eq("demo_batch", batchKey);
  if (demoAccountsError) formError("Unable to prepare developer demo-account cleanup.");

  const { error: cleanupError } = await supabaseServer.rpc("cleanup_demo_batch", { p_batch: batchKey });
  if (cleanupError) formError(cleanupError.message);

  const cleanupFailures: string[] = [];
  for (const account of demoAccounts ?? []) {
    const result = await compensateDeveloperInviteAuthUser({
      authUserId: account.auth_user_id,
      developerId: account.developer_id,
      inviteRequestId: account.invite_request_id ?? "",
    });
    if (["auth_delete_failed", "membership_check_failed"].includes(result.reason ?? "")) {
      cleanupFailures.push(account.auth_user_id);
    }
  }
  if (cleanupFailures.length) {
    formError(`Demo rows were removed, but ${cleanupFailures.length} Auth cleanup operation(s) need follow-up.`);
  }
  await logAdminActivity({ adminId: admin.adminId, action: "settings.demo_batch.removed", resourceType: "demo_data_batches", resourceId: batchKey });
  revalidatePath("/settings");
  redirect("/settings?success=Demo%20batch%20removed.");
}

function BandFields({ band }: { band?: ReferralBand }) {
  return (
    <>
      <input type="hidden" name="bandId" value={band?.id ?? ""} />
      <label className="space-y-1.5 text-xs font-semibold text-neutral-600 sm:col-span-2">Label<input name="name" required maxLength={50} defaultValue={band?.tier_name ?? ""} placeholder="Qualified referrals" className="mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm text-[#111]" /></label>
      <label className="space-y-1.5 text-xs font-semibold text-neutral-600">Minimum<input name="minReferrals" required type="number" min={0} step={1} defaultValue={band?.min_referrals ?? 0} className="mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm text-[#111]" /></label>
      <label className="space-y-1.5 text-xs font-semibold text-neutral-600">Maximum<input name="maxReferrals" type="number" min={0} step={1} defaultValue={band?.max_referrals ?? ""} placeholder="No limit" className="mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm text-[#111]" /></label>
      <label className="space-y-1.5 text-xs font-semibold text-neutral-600">Bonus %<input name="bonusPercentage" required type="number" min={0} max={5} step="0.05" defaultValue={band?.bonus_percentage ?? 0} className="mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm text-[#111]" /></label>
      <label className="space-y-1.5 text-xs font-semibold text-neutral-600 sm:col-span-2">Qualifying referrals<select name="behaviorRequirement" defaultValue={band?.behavior_requirement ?? "verified"} className="mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm text-[#111]">{behaviorOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    </>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams?: Promise<{ success?: string; error?: string }> }) {
  const ui = await buildAdminUi(["super_admin"]);
  const feedback = (await searchParams) ?? {};
  const { bands, demoBatches, growthCounts } = await getSettingsData();
  const activeDemoBatches = demoBatches.filter((batch) => batch.status === "active").length;

  return (
    <AdminLayout title="System settings" description="Control referral payouts, Growth ownership, and removable demonstration data." navItems={ui.navItems} meta={ui.meta}>
      {!ui.hasAccess ? <AdminAccessDenied /> : (
        <div className="space-y-6">
          {feedback.success ? <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{feedback.success}</div> : null}
          {feedback.error ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{feedback.error}</div> : null}
          <section className="grid gap-3 sm:grid-cols-3">
            <article className="rounded-2xl border border-black/5 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Referral bands</p><p className="mt-2 text-2xl font-semibold text-[#111]">{bands.length}</p></article>
            <article className="rounded-2xl border border-black/5 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Growth catalog</p><p className="mt-2 text-2xl font-semibold text-[#111]">{growthCounts.tiers + growthCounts.badges}</p><p className="mt-1 text-xs text-neutral-500">{growthCounts.tiers} tiers · {growthCounts.badges} badges</p></article>
            <article className="rounded-2xl border border-black/5 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Active demo batches</p><p className="mt-2 text-2xl font-semibold text-[#111]">{activeDemoBatches}</p></article>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.7fr)]">
            <article className="rounded-3xl border border-black/5 bg-white p-6 shadow-sm shadow-black/5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#66722f]">Referral payout policy</p><h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#111]">Clear, non-overlapping bonus bands</h2><p className="mt-1 max-w-2xl text-sm text-neutral-500">These bands affect referral payout calculations only. Mobile progression tiers and badges are managed in Growth.</p></div><span className="rounded-full border border-[#d9dfbf] bg-[#f1f5d9] px-3 py-1.5 text-xs font-semibold text-[#4c5d11]">Explicit save</span></div>
              <div className="mt-5 space-y-3">
                {bands.map((band) => (
                  <article key={band.id} className="rounded-2xl border border-black/10 bg-[#fafaf8] p-4">
                    <form action={upsertReferralBand} className="grid gap-3 sm:grid-cols-5"><BandFields band={band} /><div className="sm:col-span-5"><button type="submit" className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white">Save band</button></div></form>
                    <form action={deleteReferralBand} className="mt-2"><input type="hidden" name="bandId" value={band.id} /><ConfirmSubmitButton confirmMessage={`Delete ${band.tier_name}? Referral calculations will stop using this range.`} pendingLabel="Deleting…" className="rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-700">Delete band</ConfirmSubmitButton></form>
                  </article>
                ))}
                {!bands.length ? <p className="rounded-2xl border border-dashed border-black/10 px-4 py-8 text-center text-sm text-neutral-500">No referral payout bands are configured.</p> : null}
              </div>
              <details className="mt-4 rounded-2xl border border-dashed border-black/10 bg-[#fafaf8] p-4"><summary className="cursor-pointer text-sm font-semibold text-[#111]">Add referral payout band</summary><form action={upsertReferralBand} className="mt-4 grid gap-3 sm:grid-cols-5"><BandFields /><div className="sm:col-span-5"><button className="rounded-full bg-black px-5 py-2.5 text-xs font-semibold text-white">Create band</button></div></form></details>
            </article>

            <aside className="space-y-4">
              <article className="rounded-3xl border border-[#c8c2e9] bg-[#f2f1fb] p-5"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#4d477f]">Growth ownership</p><h2 className="mt-2 text-lg font-semibold text-[#111]">One place for tiers and badges</h2><p className="mt-2 text-sm leading-5 text-neutral-600">Catalog design, rules, audiences, approvals, versions, and mobile visibility now live exclusively in Growth.</p><div className="mt-4 flex flex-wrap gap-2"><Link href="/rewards" className="rounded-full bg-[#4d477f] px-4 py-2 text-xs font-semibold text-white">Open tiers & badges</Link><Link href="/growth/audiences" className="rounded-full border border-[#4d477f]/30 bg-white px-4 py-2 text-xs font-semibold text-[#4d477f]">Open audiences ({growthCounts.audiences})</Link></div></article>
              <article className="rounded-3xl border border-black/5 bg-white p-5"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">What reaches customers</p><ul className="mt-3 space-y-2 text-sm leading-5 text-neutral-600"><li>Only approved, active Growth resources are eligible.</li><li>Referral bands change payout calculations, not profile progression.</li><li>Demo resources remain flagged and removable before launch.</li></ul></article>
            </aside>
          </section>

          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
            <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-800">Demo data control</p><h2 className="mt-1 text-xl font-semibold text-[#111]">Remove demonstrations by exact batch</h2><p className="mt-1 max-w-3xl text-sm text-neutral-600">Cleanup targets only records explicitly marked with the selected batch. Production records are preserved.</p></div>
            <div className="mt-5 space-y-3">
              {demoBatches.map((batch) => <article key={batch.batch_key} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-white p-4"><div><div className="flex items-center gap-2"><p className="font-semibold text-[#111]">{batch.label}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${batch.status === "active" ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-500"}`}>{batch.status}</span></div><p className="mt-1 font-mono text-xs text-neutral-500">{batch.batch_key}</p>{batch.notes ? <p className="mt-2 text-sm text-neutral-600">{batch.notes}</p> : null}</div>{batch.status === "active" ? <form action={removeDemoBatch}><input type="hidden" name="batchKey" value={batch.batch_key} /><ConfirmSubmitButton pendingLabel="Removing…" confirmMessage={`Remove all demo records in ${batch.label}? This cannot be undone.`} className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700">Remove demo batch</ConfirmSubmitButton></form> : <p className="text-xs text-neutral-500">Removed {batch.removed_at ? new Date(batch.removed_at).toLocaleString() : ""}</p>}</article>)}
              {!demoBatches.length ? <p className="rounded-2xl border border-dashed border-amber-300 px-4 py-8 text-center text-sm text-neutral-500">No demo batches have been registered.</p> : null}
            </div>
          </section>
        </div>
      )}
    </AdminLayout>
  );
}
