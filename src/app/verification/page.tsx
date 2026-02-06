import { AdminLayout } from "@/components/AdminLayout";
import { verificationQueue } from "@/data/mock";
import { supabaseServer } from "@/lib/supabaseServer";
import { revalidatePath } from "next/cache";

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

async function approveAgent(formData: FormData) {
  "use server";
  const agentId = formData.get("agentId")?.toString();
  if (!agentId) return;
  await supabaseServer
    .from("users_profile")
    .update({ verification_status: "verified" })
    .eq("id", agentId);
  revalidatePath("/verification");
}

export default async function VerificationPage() {
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
    >
      <section className="rounded-3xl border border-white/5 bg-white/5 p-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
              Pending agents
            </p>
            <p className="text-lg text-slate-300">
              {queue.length} submissions awaiting action
            </p>
          </div>
          <div className="flex gap-3 text-sm">
            <button className="rounded-full border border-white/10 px-4 py-2 text-white/75 hover:bg-white/10">
              Auto-assign
            </button>
            <button className="rounded-full bg-emerald-400/90 px-4 py-2 font-semibold text-emerald-950">
              Bulk approve (PDF)
            </button>
          </div>
        </header>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {queue.map((agent) => (
            <article
              key={agent.id}
              className="rounded-2xl border border-white/5 bg-black/20 p-4 text-sm text-slate-200"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-semibold text-white">{agent.name}</p>
                  <p className="text-xs text-slate-500">Submitted {agent.submitted}</p>
                </div>
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs">
                  {agent.priority} priority
                </span>
              </div>
              {agent.docs?.length ? (
                <div className="mt-4 space-y-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Documents
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {agent.docs.map((doc: string) => (
                      <a
                        key={doc}
                        href={doc}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-200 hover:bg-white/10"
                      >
                        View file
                      </a>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-xs text-slate-500">No documents uploaded yet.</p>
              )}
              <p className="mt-4 text-xs text-slate-400">Status: {agent.status}</p>
              <p className="text-xs text-slate-500">Notes: {agent.notes}</p>
              <div className="mt-4 flex gap-3">
                <button className="flex-1 rounded-full border border-white/10 px-3 py-2 text-xs text-white/80 hover:bg-white/10">
                  Request change
                </button>
                <form action={approveAgent} className="flex-1">
                  <input type="hidden" name="agentId" value={agent.id} />
                  <button
                    type="submit"
                    className="w-full rounded-full bg-white/90 px-3 py-2 text-xs font-semibold text-slate-900 hover:opacity-80"
                  >
                    Approve
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      </section>
    </AdminLayout>
  );
}
