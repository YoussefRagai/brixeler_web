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
};

function escapeSearch(value: string) {
  return value.replace(/[%,()]/g, "").slice(0, 80);
}

async function loadVerificationQueue(options: { search?: string; page?: number } = {}): Promise<VerificationQueueResult> {
  const pageSize = 10;
  const page = Math.max(1, Math.floor(options.page ?? 1));
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { queue: [], total: 0, page, pageSize, hasNext: false };
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
  if (search) query = query.or(`display_name.ilike.%${search}%,phone.ilike.%${search}%`);

  const { data, error, count } = await query;

  if (error || !data?.length) {
    if (error) {
      console.warn("Failed to load verification queue", error);
    }
    return { queue: [], total: count ?? 0, page, pageSize, hasNext: page * pageSize < (count ?? 0) };
  }

  const now = Date.now();
  const queue = await Promise.all(
    data.map(async (profile) => ({
      id: profile.id,
      name: profile.display_name ?? "Pending Agent",
      phone: profile.phone ?? "—",
      submittedAt: profile.verification_submitted_at ?? profile.created_at ?? null,
      submitted: profile.verification_submitted_at || profile.created_at ? new Date(profile.verification_submitted_at ?? profile.created_at).toLocaleString() : "—",
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

export default async function VerificationPage({ searchParams }: { searchParams?: Promise<{ q?: string; page?: string }> }) {
  const ui = await buildAdminUi(["user_auth_admin"]);
  const params = (await searchParams) ?? {};
  const page = Number.parseInt(params.page ?? "1", 10) || 1;
  const result = ui.hasAccess ? await loadVerificationQueue({ search: params.q, page }) : { queue: [], total: 0, page, pageSize: 10, hasNext: false };
  const pageHref = (nextPage: number) => {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    query.set("page", String(nextPage));
    return `/verification?${query.toString()}`;
  };
  return (
    <AdminLayout
      title="Verification queue"
      description="Process agent KYC within 48 hours to keep onboarding SLAs healthy."
      actions={
        <button className="rounded-full border border-black/10 px-5 py-2 text-sm text-neutral-700 hover:bg-black/5">
          Open SOP
        </button>
      }
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <section className="rounded-3xl border border-black/5 bg-white p-4 shadow-xl shadow-black/5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-500">
            <span>{result.total} pending request{result.total === 1 ? "" : "s"} · page {result.page}</span>
            <div className="flex gap-2">
              {result.page > 1 ? <Link href={pageHref(result.page - 1)} className="rounded-full border border-black/10 px-3 py-1.5 text-xs text-neutral-700">Previous</Link> : null}
              {result.hasNext ? <Link href={pageHref(result.page + 1)} className="rounded-full border border-black/10 px-3 py-1.5 text-xs text-neutral-700">Next</Link> : null}
            </div>
          </div>
          <VerificationCarousel queue={result.queue} />
        </section>
      )}
    </AdminLayout>
  );
}
