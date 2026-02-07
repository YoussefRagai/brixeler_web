import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { verificationQueue } from "@/data/mock";
import { buildAdminUi } from "@/lib/adminUi";
import { supabaseServer } from "@/lib/supabaseServer";
import { VerificationCarousel } from "@/components/VerificationCarousel";

async function loadVerificationQueue() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return verificationQueue;
  }

  const { data, error } = await supabaseServer
    .from("users_profile")
    .select(
      "id, display_name, phone, verification_status, verification_documents_url, created_at"
    )
    .eq("verification_status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);

  if (error || !data?.length) {
    return verificationQueue;
  }

  return data.map((profile) => ({
    id: profile.id,
    name: profile.display_name ?? "Pending Agent",
    submitted: profile.created_at ? new Date(profile.created_at).toLocaleString() : "—",
    docs: (profile.verification_documents_url ?? []) as string[],
    status: profile.verification_status,
    priority: profile.verification_status === "pending" ? "High" : "Medium",
    notes: profile.phone ?? "—",
  }));
}

export default async function VerificationPage() {
  const ui = await buildAdminUi(["user_auth_admin"]);
  const queue = await loadVerificationQueue();
  return (
    <AdminLayout
      title="Verification queue"
      description="Process agent KYC within 48 hours to keep onboarding SLAs healthy."
      actions={
        <button className="rounded-full border border-white/10 px-5 py-2 text-sm text-white/80 hover:bg-white/10">
          Open SOP
        </button>
      }
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <section className="rounded-3xl border border-white/5 bg-white/5 p-6">
          <VerificationCarousel queue={queue} />
        </section>
      )}
    </AdminLayout>
  );
}
