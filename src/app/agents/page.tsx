import Link from "next/link";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
import { hasAdminRole } from "@/lib/adminRoles";
import { supabaseServer } from "@/lib/supabaseServer";
import { AgentTable, type AgentRow } from "@/components/AgentTable";
import { AgentPurgeOperations } from "@/components/AgentPurgeOperations";

type BadgeRow = {
  agent_id: string;
  badges?:
    | {
        name: string | null;
      }
    | {
        name: string | null;
      }[]
    | null;
};

type AgentProfileRow = {
  id: string;
  display_name: string | null;
  phone: string | null;
  total_deals: number | null;
  total_earnings: number | string | null;
  account_status: string | null;
  total_referrals: number | null;
  verified_referrals: number | null;
  referrals_with_first_deal: number | null;
  profile_picture_url: string | null;
  language_preference: string | null;
  verification_status: string | null;
  account_lifecycle_state: string | null;
  verification_review_version: number | null;
};

type GrowthTierRow = {
  user_id: string;
  tiers?:
    | { name: string | null; level: number | null; benefit_type: string | null; benefit_value: number | null }
    | { name: string | null; level: number | null; benefit_type: string | null; benefit_value: number | null }[]
    | null;
};

type AgentPage = {
  agents: AgentRow[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
};

type ArchivedAgentRow = {
  id: string;
  display_name: string | null;
  phone: string | null;
  archived_at: string | null;
};

type PurgeRequestRow = {
  id: string;
  agent_id: string;
  requested_by: string;
  request_reason: string;
  requested_at: string;
  retention_snapshot_id: string | null;
};

type RetentionSnapshotRow = {
  id: string;
  agent_id: string;
  generated_at: string;
};

function escapeSearch(value: string) {
  return value.replace(/[%,()]/g, "").slice(0, 80);
}

async function loadAgents(options: { verifiedOnly?: boolean; search?: string; status?: string; page?: number } = {}): Promise<AgentPage> {
  const pageSize = 25;
  const page = Math.max(1, Math.floor(options.page ?? 1));
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { agents: [], total: 0, page, pageSize, hasNext: false };
  }

  let profilesQuery = supabaseServer
      .from("users_profile")
      .select(
        "id, display_name, phone, total_deals, total_earnings, account_status, account_lifecycle_state, total_referrals, verified_referrals, referrals_with_first_deal, profile_picture_url, language_preference, verification_status, verification_review_version",
        { count: "exact" },
      )
      .order("account_created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
  if (options.verifiedOnly) profilesQuery = profilesQuery.eq("verification_status", "verified");
  if (options.status && ["active", "suspended", "archived", "purged"].includes(options.status)) {
    profilesQuery = profilesQuery.eq("account_lifecycle_state", options.status);
  }
  const search = escapeSearch(options.search?.trim() ?? "");
  if (search) profilesQuery = profilesQuery.or(`display_name.ilike.%${search}%,phone.ilike.%${search}%`);

  const { data: profiles, count } = await profilesQuery;
  const profileRows = (profiles ?? []) as AgentProfileRow[];
  const profileIds = profileRows.map((profile) => profile.id);
  const [{ data: tierRows }, { data: badgeRows }] = profileIds.length
    ? await Promise.all([
        supabaseServer.from("user_tiers").select("user_id, tiers(name, level, benefit_type, benefit_value)").in("user_id", profileIds),
        supabaseServer.from("agent_badges").select("agent_id, badges(name)").in("agent_id", profileIds).order("unlocked_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];

  const badgeMap = new Map<string, string[]>();
  ((badgeRows ?? []) as BadgeRow[]).forEach((row) => {
    const badge = Array.isArray(row.badges) ? row.badges[0] : row.badges;
    const name = badge?.name;
    if (!name) return;
    const list = badgeMap.get(row.agent_id) ?? [];
    if (!list.includes(name)) list.push(name);
    badgeMap.set(row.agent_id, list);
  });

  const tierMap = new Map<string, { name: string; level: number | null }>();
  ((tierRows ?? []) as GrowthTierRow[]).forEach((row) => {
    const tier = Array.isArray(row.tiers) ? row.tiers[0] : row.tiers;
    if (tier?.name) tierMap.set(row.user_id, { name: tier.name, level: tier.level ?? null });
  });

  const agents = profileRows.map((profile) => {
    const growthTier = tierMap.get(profile.id);
    return {
      id: profile.id,
      name: profile.display_name ?? "Agent",
      phone: profile.phone ?? "—",
      deals: profile.total_deals ?? 0,
      earnings: profile.total_earnings ? `${profile.total_earnings}` : "—",
      status: profile.account_lifecycle_state ?? profile.account_status ?? "active",
      account_status: profile.account_status ?? "active",
      tier: growthTier?.name ?? "Unassigned",
      growth_tier_level: growthTier?.level ?? null,
      badges: badgeMap.get(profile.id) ?? [],
      profile_picture_url: profile.profile_picture_url ?? null,
      language_preference: profile.language_preference ?? null,
      verification_status: profile.verification_status ?? null,
      verification_review_version: profile.verification_review_version ?? 0,
    };
  });
  const total = count ?? 0;
  return { agents, total, page, pageSize, hasNext: page * pageSize < total };
}

async function loadPurgeOperations() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { archivedAgents: [], pendingRequests: [] };
  }
  const [{ data: archivedData }, { data: requestData }] = await Promise.all([
    supabaseServer
      .from("users_profile")
      .select("id, display_name, phone, archived_at")
      .eq("account_lifecycle_state", "archived")
      .order("archived_at", { ascending: false })
      .limit(100),
    supabaseServer
      .from("agent_account_purge_requests")
      .select("id, agent_id, requested_by, request_reason, requested_at, retention_snapshot_id")
      .eq("status", "pending")
      .order("requested_at", { ascending: false })
      .limit(100),
  ]);
  const archivedRows = (archivedData ?? []) as ArchivedAgentRow[];
  const requestRows = (requestData ?? []) as PurgeRequestRow[];
  const archivedIds = archivedRows.map((agent) => agent.id);
  const { data: snapshotData } = archivedIds.length
    ? await supabaseServer
      .from("agent_account_retention_snapshots")
      .select("id, agent_id, generated_at")
      .in("agent_id", archivedIds)
      .gte("generated_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("generated_at", { ascending: false })
    : { data: [] };
  const latestSnapshots = new Map<string, { id: string; generatedAt: string }>();
  ((snapshotData ?? []) as RetentionSnapshotRow[]).forEach((snapshot) => {
    if (!latestSnapshots.has(snapshot.agent_id)) latestSnapshots.set(snapshot.agent_id, { id: snapshot.id, generatedAt: snapshot.generated_at });
  });
  const nameById = new Map(archivedRows.map((agent) => [agent.id, agent.display_name ?? "Archived agent"]));
  return {
    archivedAgents: archivedRows.map((agent) => ({
      id: agent.id,
      displayName: agent.display_name ?? "Archived agent",
      phone: agent.phone ?? "—",
      archivedAt: agent.archived_at,
      snapshot: latestSnapshots.get(agent.id) ?? null,
    })),
    pendingRequests: requestRows.map((request) => ({
      id: request.id,
      agentId: request.agent_id,
      agentName: nameById.get(request.agent_id) ?? `Agent ${request.agent_id.slice(0, 8)}`,
      requestedBy: request.requested_by,
      requestReason: request.request_reason,
      requestedAt: request.requested_at,
      snapshotId: request.retention_snapshot_id,
    })),
  };
}

export default async function AgentsPage({ searchParams }: { searchParams?: Promise<{ filter?: string; q?: string; status?: string; page?: string }> }) {
  const ui = await buildAdminUi(["user_auth_admin"]);
  const params = (await searchParams) ?? {};
  const verifiedOnly = params.filter === "verified";
  const page = Number.parseInt(params.page ?? "1", 10) || 1;
  const result = await loadAgents({ verifiedOnly, search: params.q, status: params.status, page });
  const purgeOperations = ui.hasAccess ? await loadPurgeOperations() : { archivedAgents: [], pendingRequests: [] };
  const pageHref = (nextPage: number) => {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.status) query.set("status", params.status);
    if (verifiedOnly) query.set("filter", "verified");
    query.set("page", String(nextPage));
    return `/agents?${query.toString()}`;
  };
  return (
    <AdminLayout
      title="Agents"
      description="Manage verification, commission tiers, referrals, and account health."
      navItems={ui.navItems}
      meta={ui.meta}
    >
  {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <section className="rounded-3xl border border-white/5 bg-white/5 p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
              Roster
            </p>
            <p className="text-lg text-slate-300">Agent directory</p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <a href="/api/admin/exports/download?type=agents&format=csv" className="rounded-full border border-white/10 px-4 py-2 text-white/80 hover:bg-white/10">
              Export CSV
            </a>
            <a href={verifiedOnly ? "/agents" : "/agents?filter=verified&page=1"} className="rounded-full border border-emerald-400 px-4 py-2 text-emerald-200">
              {verifiedOnly ? "Show: All agents" : "Filter: Verified"}
            </a>
          </div>
        </header>
        <form method="get" className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-black/10 p-4 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end">
          {verifiedOnly ? <input type="hidden" name="filter" value="verified" /> : null}
          <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Search agents
            <input name="q" defaultValue={params.q} placeholder="Name or phone" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm normal-case tracking-normal text-white placeholder:text-slate-500" />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Lifecycle
            <select name="status" defaultValue={params.status ?? ""} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm normal-case tracking-normal text-white">
              <option value="">All states</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="archived">Archived</option><option value="purged">Purged</option>
            </select>
          </label>
          <button type="submit" className="min-h-11 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black">Apply filters</button>
        </form>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <span>{result.total} agent{result.total === 1 ? "" : "s"} · page {result.page}</span>
          <div className="flex gap-2">
            {result.page > 1 ? <Link href={pageHref(result.page - 1)} className="rounded-full border border-white/10 px-3 py-1.5 text-slate-200">Previous</Link> : null}
            {result.hasNext ? <Link href={pageHref(result.page + 1)} className="rounded-full border border-white/10 px-3 py-1.5 text-slate-200">Next</Link> : null}
          </div>
        </div>
        <AgentTable agents={result.agents} />
        <AgentPurgeOperations
          archivedAgents={purgeOperations.archivedAgents}
          pendingRequests={purgeOperations.pendingRequests}
          currentAdminId={ui.context.adminId}
          isSuperAdmin={hasAdminRole(ui.roles, ["super_admin"])}
        />
        </section>
      )}
    </AdminLayout>
  );
}
