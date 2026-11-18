import Link from "next/link";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
import { supabaseServer } from "@/lib/supabaseServer";
import { VerificationCarousel, type VerificationCard } from "@/components/VerificationCarousel";
import { createSignedStorageUrl, STORAGE_BUCKETS } from "@/lib/storageServer";

type VerificationQueueResult = {
  queue: VerificationCard[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  unavailable?: boolean;
};

type VerificationMode = "live" | "demo";

function escapeSearch(value: string) {
  return value.replace(/[%,()]/g, "").slice(0, 80);
}

async function loadVerificationQueue(options: { search?: string; page?: number; mode?: VerificationMode } = {}): Promise<VerificationQueueResult> {
  const pageSize = 10;
  const page = Math.max(1, Math.floor(options.page ?? 1));
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { queue: [], total: 0, page, pageSize, hasNext: false, unavailable: true };
  }

  let query = supabaseServer
    .from("users_profile")
    .select(
      "id, display_name, phone, account_status, account_lifecycle_state, verification_status, verification_documents_url, verification_submitted_at, verification_review_version, created_at",
      { count: "exact" },
    )
    .eq("verification_status", "pending")
    .order("verification_submitted_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);
  const search = escapeSearch(options.search?.trim() ?? "");
  if (options.mode) query = query.eq("is_demo", options.mode === "demo");
  if (search) {
    const filters = [`display_name.ilike.%${search}%`, `phone.ilike.%${search}%`];
    if (/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(search)) filters.push(`id.eq.${search}`);
    query = query.or(filters.join(","));
  }

  const { data, error, count } = await query;

  if (error || !data?.length) {
    if (error) {
      console.warn("Failed to load verification queue", error);
    }
    return { queue: [], total: count ?? 0, page, pageSize, hasNext: page * pageSize < (count ?? 0), unavailable: Boolean(error) };
  }

  const now = Date.now();
  const queue = await Promise.all(
    data.map(async (profile) => ({
      id: profile.id,
      name: profile.display_name ?? "Pending Agent",
      phone: profile.phone ?? "—",
      submittedAt: profile.verification_submitted_at ?? profile.created_at ?? null,
      submitted: profile.verification_submitted_at || profile.created_at ? new Date(profile.verification_submitted_at ?? profile.created_at).toLocaleString("en-US", { timeZone: "Africa/Cairo" }) : "—",
      docs: (
        await Promise.all(
          ((profile.verification_documents_url ?? []) as string[]).map((value) =>
            createSignedStorageUrl(STORAGE_BUCKETS.verificationDocs, value),
          ),
        )
      ).filter((value): value is string => Boolean(value)),
      status: profile.verification_status,
      accountStatus: profile.account_status ?? "active",
      lifecycleState: profile.account_lifecycle_state ?? "active",
      reviewVersion: profile.verification_review_version ?? 0,
      ageHours: profile.verification_submitted_at || profile.created_at
        ? Math.max(0, (now - new Date(profile.verification_submitted_at ?? profile.created_at).getTime()) / 3600000)
        : 0,
      priority: profile.account_status !== "active" || profile.account_lifecycle_state !== "active"
        ? "Blocked"
        : profile.verification_submitted_at && now - new Date(profile.verification_submitted_at).getTime() >= 48 * 3600000
        ? "Overdue"
        : profile.verification_submitted_at && now - new Date(profile.verification_submitted_at).getTime() >= 24 * 3600000
        ? "High"
        : "Normal",
      reviewable: profile.account_status === "active" && profile.account_lifecycle_state === "active",
      notes: profile.phone ?? "—",
    })),
  );
  const total = count ?? 0;
  return { queue, total, page, pageSize, hasNext: page * pageSize < total };
}

export default async function VerificationPage({ searchParams }: { searchParams?: Promise<{ q?: string; page?: string; mode?: string }> }) {
  const ui = await buildAdminUi(["user_auth_admin"]);
  const params = (await searchParams) ?? {};
  const search = typeof params.q === "string" ? params.q : undefined;
  const mode = params.mode === "live" || params.mode === "demo" ? params.mode : undefined;
  const page = Number.parseInt(params.page ?? "1", 10) || 1;
  const result = ui.hasAccess ? await loadVerificationQueue({ search, page, mode }) : null;
  const pageHref = (nextPage: number) => {
    const query = new URLSearchParams();
    if (search) query.set("q", search);
    if (mode) query.set("mode", mode);
    query.set("page", String(nextPage));
    return `/verification?${query.toString()}`;
  };
  return (
    <AdminLayout
      title="Verification queue"
      description="Process agent KYC within 48 hours to keep onboarding SLAs healthy."
      actions={ui.hasAccess ? (
        <details className="relative text-sm">
          <summary className="cursor-pointer rounded-full border border-black/10 px-5 py-2 text-neutral-700 hover:bg-black/5">Open SOP</summary>
          <div className="absolute right-0 z-30 mt-2 w-64 rounded-2xl border border-black/10 bg-white p-4 shadow-xl sm:w-80">
            <h2 className="font-semibold text-neutral-900">Verification review procedure</h2>
            <ol className="mt-2 list-decimal space-y-2 pl-4 text-neutral-700">
              <li>Review the request within 48 hours. Only active accounts can be reviewed.</li>
              <li>Open the submitted identity documents and confirm they are readable and match the profile.</li>
              <li>Approve with one to three valid documents. For missing or unreadable evidence, send a specific change request.</li>
              <li>If the request changes during review, refresh and inspect the latest documents before deciding.</li>
            </ol>
          </div>
        </details>
      ) : null}
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!result ? (
        <AdminAccessDenied />
      ) : (
        <section className="rounded-3xl border border-black/5 bg-white p-4 shadow-xl shadow-black/5 sm:p-6">
          <form method="get" className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-black/10 bg-neutral-50 p-4" role="search">
            {mode ? <input type="hidden" name="mode" value={mode} /> : null}
            <label className="min-w-48 flex-1 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
              Search verification queue
              <input name="q" type="search" defaultValue={search} maxLength={80} placeholder="Name, phone, or ID…" className="mt-2 block min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-neutral-900" />
            </label>
            <button type="submit" className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white">Search</button>
            {search ? <Link href={mode ? `/verification?mode=${mode}` : "/verification"} className="rounded-full border border-black/10 px-4 py-2 text-sm text-neutral-700">Clear search</Link> : null}
          </form>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-500">
            <span>{result.total} pending request{result.total === 1 ? "" : "s"}{mode ? ` · ${mode === "demo" ? "Demo" : "Live"}` : ""} · page {result.page}</span>
            <div className="flex gap-2">
              {result.page > 1 ? <Link href={pageHref(result.page - 1)} className="rounded-full border border-black/10 px-3 py-1.5 text-xs text-neutral-700">Previous</Link> : null}
              {result.hasNext ? <Link href={pageHref(result.page + 1)} className="rounded-full border border-black/10 px-3 py-1.5 text-xs text-neutral-700">Next</Link> : null}
            </div>
          </div>
          {result.unavailable ? <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Verification requests could not be loaded. Refresh to retry.</p> : (
            <VerificationCarousel key={`${mode ?? "all"}:${search ?? ""}:${result.page}`} queue={result.queue} isSearch={Boolean(search)} />
          )}
        </section>
      )}
    </AdminLayout>
  );
}
