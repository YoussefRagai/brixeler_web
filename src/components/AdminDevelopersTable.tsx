"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";

type DeveloperRow = {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  logo_url?: string | null;
  projectsCount: number;
  publishedProjectsCount: number;
  pendingProjectsCount: number;
  rejectedProjectsCount: number;
  mobileVisibleProjectsCount: number;
  listingsCount: number;
  pendingListingsCount: number;
  rejectedListingsCount: number;
  expiredListingsCount: number;
  mobileVisibleListingsCount: number;
  membersCount: number;
  activeMembersCount: number;
  pendingMembersCount: number;
  revokedMembersCount: number;
  stalePendingInvitesCount: number;
  profilePendingCount: number;
  attentionCount: number;
  lastLogin?: string | null;
  isActive: boolean;
  lifecycleState?: string | null;
  publishedAt?: string | null;
  is_demo: boolean;
  demo_batch: string | null;
};

type DeveloperProject = {
  id: string;
  developer_id: string | null;
  name: string;
  created_at: string | null;
  updated_at: string | null;
  launch_status: string | null;
  approval_status: string | null;
  rejection_reason: string | null;
  lifecycle_state: string | null;
  published_at: string | null;
  is_demo?: boolean | null;
  demo_batch?: string | null;
  quality_issues?: string[] | null;
  quality_score?: number | null;
};

type DeveloperProperty = {
  id: string;
  developer_id: string | null;
  project_id: string | null;
  listed_by_agent_id: string | null;
  property_name: string | null;
  price: number | null;
  inquiries_count: number | null;
  approval_status: string | null;
  rejection_reason: string | null;
  is_active: boolean | null;
  published_at: string | null;
  expires_at: string | null;
  updated_at: string | null;
  created_at: string | null;
  is_demo?: boolean | null;
  quality_issues?: string[] | null;
  quality_score?: number | null;
};

type DeveloperMember = {
  id: string;
  developer_id: string;
  auth_user_id: string;
  email: string | null;
  full_name: string | null;
  status: string | null;
  invited_at: string | null;
  invitation_sent_at: string | null;
  activated_at: string | null;
  revoked_at: string | null;
  last_login: string | null;
  invite_request_id?: string | null;
  is_demo?: boolean | null;
  demo_batch?: string | null;
};

type DeveloperActivity = {
  id: string;
  developer_id: string | null;
  developer_account_id?: string | null;
  action: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  resource_id: string | null;
  actor_type?: string | null;
  actor_id?: string | null;
};

type DeveloperProfileRevision = {
  id: string;
  developer_id: string;
  version: number;
  name: string;
  description: string | null;
  logo_url: string | null;
  status: string;
  submitted_by_account_id: string | null;
  reviewed_by_admin_id: string | null;
  review_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  published_at?: string | null;
  developerName?: string | null;
};

type DeveloperFilter = "all" | "attention" | "access" | "publication" | "healthy" | string;

type DeveloperDataAvailability = {
  publicationContract: boolean;
  inventoryQuality: boolean;
  demoData: boolean;
  invitationReliability: boolean;
  lifecycleEvents: boolean;
  profileReviews: boolean;
};

type Props = {
  developers: DeveloperRow[];
  projects: DeveloperProject[];
  properties: DeveloperProperty[];
  members: DeveloperMember[];
  activity: DeveloperActivity[];
  profileRevisions?: DeveloperProfileRevision[];
  canImpersonate?: boolean;
  filter?: DeveloperFilter;
  search?: string;
  pagination?: { page: number; pageSize: number; total: number; hasNext: boolean };
  availability?: Partial<DeveloperDataAvailability>;
  pageHref?: (page: number) => string;
};

const tabs = ["Overview", "Members", "Projects", "Listings"] as const;
type Tab = (typeof tabs)[number];

const statusStyles: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  pending: "border-amber-200 bg-amber-50 text-amber-900",
  revoked: "border-rose-200 bg-rose-50 text-rose-800",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  published: "border-emerald-200 bg-emerald-50 text-emerald-800",
  rejected: "border-rose-200 bg-rose-50 text-rose-800",
  draft: "border-slate-200 bg-slate-100 text-slate-700",
  archived: "border-slate-300 bg-slate-100 text-slate-700",
  expired: "border-rose-200 bg-rose-50 text-rose-800",
};

const actionLabels: Record<string, string> = {
  "developer_account.invite": "Invite sent",
  "developer_account.resend_invite": "Invite resent",
  "developer_account.accepted": "Invite accepted",
  "developer_account.login": "Portal login",
  "developer_account.revoke": "Access revoked",
};

const safeMetadataLabels: Array<[string, string]> = [
  ["email", "Email"],
  ["reason", "Reason"],
  ["outcome", "Outcome"],
  ["ip_address", "IP address"],
  ["device", "Device"],
  ["user_agent", "Browser"],
  ["session_invalidated", "Sessions"],
];

function formatTimestamp(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function formatCurrency(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `EGP ${Number(value).toLocaleString("en-EG", { maximumFractionDigits: 0 })}`;
}

function formatIdentifier(value: string) {
  return value.length <= 12 ? value : `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function labelize(value?: string | null) {
  if (!value) return "Unknown";
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function isExpired(value?: string | null) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp < Date.now();
}

function isStaleInvite(member: DeveloperMember) {
  if (member.status !== "pending") return false;
  const sentAt = member.invitation_sent_at ?? member.invited_at;
  if (!sentAt) return false;
  const timestamp = new Date(sentAt).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp > 7 * 24 * 60 * 60 * 1000;
}

function projectStatus(project: DeveloperProject) {
  if (project.approval_status === "rejected") return "rejected";
  if (project.lifecycle_state === "published" && project.published_at) return "published";
  if (project.approval_status === "pending") return "pending";
  if (project.approval_status === "approved") return "approved";
  return project.lifecycle_state ?? "draft";
}

function listingStatus(listing: DeveloperProperty) {
  if (isExpired(listing.expires_at)) return "expired";
  return listing.approval_status ?? "pending";
}

function statusClass(status?: string | null) {
  return statusStyles[status ?? ""] ?? "border-black/10 bg-white text-neutral-700";
}

function isProjectMobileVisible(
  project: DeveloperProject,
  publicationContractAvailable: boolean,
  developerIsActive = true,
  developerLifecycleState?: string | null,
  developerIsDemo = false,
) {
  if (project.is_demo || developerIsDemo || !developerIsActive) return false;
  if (publicationContractAvailable) return developerLifecycleState === "published" && project.approval_status === "approved" && project.lifecycle_state === "published" && Boolean(project.published_at);
  return project.approval_status === "approved";
}

function isListingMobileVisible(
  listing: DeveloperProperty,
  projects: DeveloperProject[],
  publicationContractAvailable: boolean,
  developerIsActive = true,
  developerLifecycleState?: string | null,
  developerIsDemo = false,
) {
  if (listing.is_demo || developerIsDemo || listing.approval_status !== "approved" || listing.is_active !== true || isExpired(listing.expires_at) || !developerIsActive) return false;
  if (publicationContractAvailable && (developerLifecycleState !== "published" || !listing.published_at)) return false;
  if (!listing.project_id) return true;
  const project = projects.find((candidate) => candidate.id === listing.project_id);
  return project ? isProjectMobileVisible(project, publicationContractAvailable, developerIsActive, developerLifecycleState, developerIsDemo) : false;
}

function healthLabel(developer: DeveloperRow) {
  if (!developer.isActive) return "Inactive";
  if (developer.attentionCount > 0) return `${developer.attentionCount} exception${developer.attentionCount === 1 ? "" : "s"}`;
  if (!developer.membersCount) return "Needs invite";
  if (!developer.projectsCount && !developer.listingsCount) return "No portfolio";
  return "Healthy";
}

function healthClass(developer: DeveloperRow) {
  if (!developer.isActive) return "border-slate-300 bg-slate-100 text-slate-700";
  if (developer.attentionCount > 0) return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function developerPublicationStatus(developer: DeveloperRow) {
  if (!developer.isActive) return "Inactive";
  if (developer.lifecycleState === "archived") return "Archived";
  if (developer.lifecycleState === "published" && developer.publishedAt) return "Published";
  if (developer.lifecycleState === "draft") return "Draft";
  return "Legacy state";
}

function DeveloperLogo({ developer, size = "h-11 w-11" }: { developer: DeveloperRow; size?: string }) {
  return (
    <div className={clsx("flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-black/10 bg-neutral-100", size)}>
      {developer.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={developer.logo_url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-sm font-semibold text-neutral-700">{developer.name.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

function StatusPill({ label, status }: { label: string; status?: string | null }) {
  return <span className={clsx("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold", statusClass(status))}>{label}</span>;
}

function safeMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata) return [] as Array<[string, string]>;
  return safeMetadataLabels.flatMap(([key, label]) => {
    const value = metadata[key];
    if (value == null || (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean")) return [];
    const rendered = String(value).trim();
    return rendered ? ([[label, rendered.slice(0, 180)]] as Array<[string, string]>) : [];
  });
}

export function AdminDevelopersTable({
  developers,
  projects,
  properties,
  members,
  activity,
  profileRevisions = [],
  canImpersonate = false,
  filter = "all",
  search = "",
  pagination = { page: 1, pageSize: developers.length || 25, total: developers.length, hasNext: false },
  availability = {},
  pageHref,
}: Props) {
  const router = useRouter();
  const publicationContractAvailable = availability.publicationContract ?? false;
  const [activeDeveloperId, setActiveDeveloperId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [activeProfileRevisionId, setActiveProfileRevisionId] = useState<string | null>(null);
  const [profileReviewReason, setProfileReviewReason] = useState("");
  const [profileReviewFeedback, setProfileReviewFeedback] = useState<string | null>(null);
  const [profileReviewHasError, setProfileReviewHasError] = useState(false);
  const [busyProfileRevisionId, setBusyProfileRevisionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
  const [busyDeveloperId, setBusyDeveloperId] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const profileCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const memberActionRequestIds = useRef(new Map<string, string>());

  const activeDeveloper = useMemo(
    () => developers.find((developer) => developer.id === activeDeveloperId) ?? null,
    [activeDeveloperId, developers],
  );
  const activeProfileRevision = useMemo(
    () => profileRevisions.find((revision) => revision.id === activeProfileRevisionId) ?? null,
    [activeProfileRevisionId, profileRevisions],
  );
  const developerProjects = useMemo(
    () => projects.filter((project) => project.developer_id === activeDeveloperId),
    [activeDeveloperId, projects],
  );
  const developerListings = useMemo(
    () => properties.filter((property) => property.developer_id === activeDeveloperId),
    [activeDeveloperId, properties],
  );
  const developerMembers = useMemo(
    () => members.filter((member) => member.developer_id === activeDeveloperId),
    [activeDeveloperId, members],
  );
  const developerActivity = useMemo(
    () => activity.filter((entry) => entry.developer_id === activeDeveloperId || String(entry.metadata?.developer_id ?? "") === activeDeveloperId),
    [activeDeveloperId, activity],
  );
  const currentProfileRevisions = useMemo(
    () => profileRevisions.filter((revision) => revision.developer_id === activeDeveloperId),
    [activeDeveloperId, profileRevisions],
  );

  const filteredDevelopers = useMemo(() => {
    if (filter === "attention") return developers.filter((developer) => developer.attentionCount > 0);
    if (filter === "access") return developers.filter((developer) => !developer.isActive || developer.pendingMembersCount > 0 || developer.revokedMembersCount > 0 || developer.stalePendingInvitesCount > 0 || developer.activeMembersCount === 0);
    if (filter === "publication") return developers.filter((developer) => (publicationContractAvailable && developer.lifecycleState !== "published") || developer.pendingProjectsCount > 0 || developer.rejectedProjectsCount > 0 || developer.pendingListingsCount > 0 || developer.rejectedListingsCount > 0 || developer.expiredListingsCount > 0 || developer.profilePendingCount > 0);
    if (filter === "healthy") return developers.filter((developer) => developer.attentionCount === 0 && developer.isActive);
    return developers;
  }, [developers, filter, publicationContractAvailable]);

  const pageLink = (page: number) => {
    if (pageHref) return pageHref(page);
    const params = new URLSearchParams();
    if (search) params.set("developerSearch", search);
    if (filter && filter !== "all") params.set("developerFilter", filter);
    params.set("developerPage", String(page));
    return `/developers?${params.toString()}`;
  };

  const openDeveloper = (developerId: string, tab: Tab = "Overview") => {
    setActiveDeveloperId(developerId);
    setActiveTab(tab);
    setActionError(null);
    setActionMessage(null);
  };

  const openProfileRevision = (revisionId: string) => {
    setActiveProfileRevisionId(revisionId);
    setProfileReviewReason("");
    setProfileReviewFeedback(null);
    setProfileReviewHasError(false);
  };

  useEffect(() => {
    if (!activeDeveloper && !activeProfileRevision) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (activeProfileRevision) {
        setActiveProfileRevisionId(null);
        setProfileReviewReason("");
      } else {
        setActiveDeveloperId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeDeveloper, activeProfileRevision]);

  useEffect(() => {
    if (activeProfileRevision) profileCloseButtonRef.current?.focus();
    else if (activeDeveloper) closeButtonRef.current?.focus();
  }, [activeDeveloper, activeProfileRevision]);

  const runMemberAction = async (accountId: string, path: string, fields: Record<string, string> = {}) => {
    setActionError(null);
    setActionMessage(null);
    setBusyAccountId(accountId);
    const actionKey = `${path}:${accountId}`;
    const requestId = memberActionRequestIds.current.get(actionKey) ?? crypto.randomUUID();
    memberActionRequestIds.current.set(actionKey, requestId);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, requestId, ...fields }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string; idempotent?: boolean };
      if (!response.ok) {
        setActionError(payload.error ?? "Action failed. No access state was changed.");
        return;
      }
      setActionMessage(payload.message ?? (payload.idempotent ? "This action was already recorded." : "Developer access updated."));
      memberActionRequestIds.current.delete(actionKey);
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Network error. No access state was changed.");
    } finally {
      setBusyAccountId(null);
    }
  };

  const startImpersonation = async (developerId: string) => {
    setActionError(null);
    setBusyDeveloperId(developerId);
    try {
      const response = await fetch("/api/admin/developers/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ developerId }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; redirectUrl?: string };
      if (!response.ok || !payload.redirectUrl) {
        setActionError(payload.error ?? "Unable to open developer dashboard.");
        return;
      }
      window.location.assign(payload.redirectUrl);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Network error. No access state was changed.");
    } finally {
      setBusyDeveloperId(null);
    }
  };

  const reviewProfileRevision = async (revisionId: string, decision: "approved" | "rejected") => {
    const reason = profileReviewReason.trim();
    if (decision === "rejected" && (reason.length < 3 || reason.length > 500)) {
      setProfileReviewFeedback("A review reason between 3 and 500 characters is required when requesting changes.");
      setProfileReviewHasError(true);
      return;
    }
    setBusyProfileRevisionId(revisionId);
    setProfileReviewFeedback(null);
    setProfileReviewHasError(false);
    try {
      const response = await fetch("/api/admin/developers/profile-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionId, decision, reason: reason || null }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) {
        setProfileReviewFeedback(payload.error ?? "Unable to save this profile review.");
        setProfileReviewHasError(true);
        return;
      }
      setProfileReviewFeedback(payload.message ?? "Profile review saved.");
      setProfileReviewHasError(false);
      setProfileReviewReason("");
      router.refresh();
      window.setTimeout(() => setActiveProfileRevisionId(null), 500);
    } catch (error) {
      setProfileReviewFeedback(error instanceof Error ? error.message : "Network error. The profile review was not saved.");
      setProfileReviewHasError(true);
    } finally {
      setBusyProfileRevisionId(null);
    }
  };

  const pageSummary = filteredDevelopers.reduce(
    (summary, developer) => ({
      attention: summary.attention + (developer.attentionCount > 0 ? 1 : 0),
      mobile: summary.mobile + developer.mobileVisibleListingsCount + developer.mobileVisibleProjectsCount,
      pendingAccess: summary.pendingAccess + developer.pendingMembersCount,
    }),
    { attention: 0, mobile: 0, pendingAccess: 0 },
  );

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-black/5 bg-white p-4 shadow-xl shadow-black/5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">Operations snapshot</p>
            <h2 className="mt-1 text-xl font-semibold text-[#050505]">Portfolio and access health</h2>
            <p className="mt-1 text-sm text-neutral-600">
              {pagination.total ? `Showing ${filteredDevelopers.length} of ${pagination.total} developers` : "No developers in this scope"}
              {search ? ` matching “${search}”` : ""}. Resolve exceptions before they affect mobile visibility.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:min-w-[25rem]">
            <div className="rounded-2xl border border-black/10 bg-neutral-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">On page</p><p className="mt-1 text-xl font-semibold text-neutral-900">{filteredDevelopers.length}</p></div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-800">Exceptions</p><p className="mt-1 text-xl font-semibold text-amber-950">{pageSummary.attention}</p></div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-800">Mobile items</p><p className="mt-1 text-xl font-semibold text-emerald-950">{pageSummary.mobile}</p></div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 sm:col-span-3 lg:col-span-1"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-800">Pending access</p><p className="mt-1 text-xl font-semibold text-blue-950">{pageSummary.pendingAccess}</p></div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-neutral-600">
          <span className={clsx("rounded-full border px-3 py-1", availability.publicationContract === false ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>{availability.publicationContract === false ? "Legacy publication fallback" : "Publication gate connected"}</span>
          <span className={clsx("rounded-full border px-3 py-1", availability.lifecycleEvents === false ? "border-slate-200 bg-slate-100 text-slate-700" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>{availability.lifecycleEvents === false ? "Access timeline is compatibility-scoped" : "Access events connected"}</span>
          {availability.profileReviews === false ? <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-blue-900">Profile review lane pending migration</span> : null}
        </div>
      </section>

      {profileRevisions.length ? (
        <section className="rounded-3xl border border-violet-200 bg-violet-50 p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-[0.3em] text-violet-800">Public profile review</p><h2 className="mt-1 text-lg font-semibold text-violet-950">{profileRevisions.length} pending profile change{profileRevisions.length === 1 ? "" : "s"}</h2><p className="mt-1 text-sm text-violet-900">Review the exact public identity preview before it becomes mobile-visible.</p></div>
            <span className="rounded-full border border-violet-300 bg-white px-3 py-1 text-xs font-semibold text-violet-900">Admin decision required</span>
          </div>
          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            {profileRevisions.map((revision) => (
              <article key={revision.id} className="flex flex-col gap-3 rounded-2xl border border-violet-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-black/10 bg-neutral-100">{revision.logo_url ? <img src={revision.logo_url} alt="" className="h-full w-full object-cover" /* eslint-disable-line @next/next/no-img-element */ /> : <span className="font-semibold text-neutral-700">{revision.name.charAt(0).toUpperCase()}</span>}</div>
                  <div className="min-w-0"><p className="truncate font-semibold text-neutral-950">{revision.developerName ?? "Developer"}</p><p className="truncate text-sm text-neutral-700">{revision.name} · Version {revision.version}</p><p className="text-xs text-neutral-500">Submitted {formatTimestamp(revision.submitted_at ?? revision.updated_at ?? revision.created_at)}</p></div>
                </div>
                <button type="button" onClick={() => openProfileRevision(revision.id)} className="min-h-11 shrink-0 rounded-full bg-violet-900 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800">Review change</button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="space-y-3 lg:hidden">
        {filteredDevelopers.map((developer) => (
          <article key={`card-${developer.id}`} className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm shadow-black/5">
            <div className="flex items-start gap-3"><DeveloperLogo developer={developer} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold text-neutral-950">{developer.name}</p><span className={clsx("rounded-full border px-2 py-0.5 text-[10px] font-semibold", healthClass(developer))}>{healthLabel(developer)}</span></div><p className="mt-1 truncate text-sm text-neutral-500">{developer.contact_email ?? "No contact email"}</p>{developer.is_demo ? <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-800">Demo{developer.demo_batch ? ` · ${developer.demo_batch}` : ""}</p> : null}</div><button type="button" onClick={() => openDeveloper(developer.id)} className="min-h-11 shrink-0 rounded-full border border-black/15 px-3 py-2 text-sm font-semibold text-neutral-800 hover:bg-black/5">View</button></div>
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-neutral-50 p-3 text-sm"><div><p className="text-xs text-neutral-500">Portfolio</p><p className="font-semibold text-neutral-900">{developer.projectsCount} projects · {developer.listingsCount} listings</p></div><div><p className="text-xs text-neutral-500">Developer publication</p><p className="font-semibold text-neutral-900">{developerPublicationStatus(developer)}</p></div><div><p className="text-xs text-neutral-500">Mobile visible</p><p className="font-semibold text-neutral-900">{developer.mobileVisibleProjectsCount + developer.mobileVisibleListingsCount}</p></div><div><p className="text-xs text-neutral-500">Access</p><p className="font-semibold text-neutral-900">{developer.activeMembersCount} active · {developer.pendingMembersCount} pending</p></div><div><p className="text-xs text-neutral-500">Last portal access</p><p className="font-semibold text-neutral-900">{formatDate(developer.lastLogin)}</p></div></div>
            {developer.attentionCount ? <p className="mt-3 text-xs font-medium text-amber-900">{developer.attentionCount} exception{developer.attentionCount === 1 ? "" : "s"} need operator attention.</p> : null}
          </article>
        ))}
        {!filteredDevelopers.length ? <div className="rounded-2xl border border-black/10 bg-white px-4 py-8 text-center text-sm text-neutral-600">No developers match this view.</div> : null}
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-black/10 bg-white lg:block">
        <table className="w-full min-w-[1080px] text-left text-sm text-neutral-700">
          <thead className="bg-neutral-50 text-xs uppercase tracking-[0.18em] text-neutral-600"><tr><th className="px-4 py-3">Developer</th><th className="px-4 py-3">Portfolio</th><th className="px-4 py-3">Mobile visibility</th><th className="px-4 py-3">Access</th><th className="px-4 py-3">Health</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
          <tbody>
            {filteredDevelopers.map((developer) => (
              <tr key={developer.id} className="border-t border-black/5 align-top"><td className="px-4 py-4"><div className="flex items-center gap-3"><DeveloperLogo developer={developer} /><div className="min-w-0"><p className="font-semibold text-neutral-950">{developer.name}</p><p className="mt-1 max-w-[15rem] truncate text-xs text-neutral-500">{developer.contact_email ?? "No contact email"}</p>{developer.is_demo ? <span className="mt-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-800">Demo</span> : null}</div></div></td><td className="px-4 py-4"><p className="font-semibold text-neutral-900">{developer.projectsCount} projects · {developer.listingsCount} listings</p><p className="mt-1 text-xs text-neutral-500">Developer {developerPublicationStatus(developer)} · {developer.pendingProjectsCount + developer.pendingListingsCount} pending review · {developer.rejectedProjectsCount + developer.rejectedListingsCount} rejected</p></td><td className="px-4 py-4"><p className="font-semibold text-neutral-900">{developer.mobileVisibleProjectsCount + developer.mobileVisibleListingsCount} visible</p><p className="mt-1 text-xs text-neutral-500">{developer.mobileVisibleProjectsCount} projects · {developer.mobileVisibleListingsCount} listings</p></td><td className="px-4 py-4"><p className="font-semibold text-neutral-900">{developer.activeMembersCount} active · {developer.membersCount} total</p><p className="mt-1 text-xs text-neutral-500">{developer.pendingMembersCount} pending · Last access {formatDate(developer.lastLogin)}</p></td><td className="px-4 py-4"><span className={clsx("inline-flex rounded-full border px-3 py-1 text-xs font-semibold", healthClass(developer))}>{healthLabel(developer)}</span>{developer.profilePendingCount ? <p className="mt-2 text-xs font-medium text-violet-800">{developer.profilePendingCount} profile review</p> : null}{developer.stalePendingInvitesCount ? <p className="mt-1 text-xs font-medium text-amber-800">{developer.stalePendingInvitesCount} stale invite</p> : null}</td><td className="px-4 py-4 text-right"><div className="flex flex-wrap justify-end gap-2">{canImpersonate && developer.activeMembersCount > 0 ? <button type="button" onClick={() => void startImpersonation(developer.id)} disabled={busyDeveloperId === developer.id} className="min-h-10 rounded-full border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-60">{busyDeveloperId === developer.id ? "Opening…" : "Open portal"}</button> : null}<button type="button" onClick={() => openDeveloper(developer.id)} className="min-h-10 rounded-full border border-black/15 px-3 py-2 text-xs font-semibold text-neutral-800 hover:bg-black/5">View details</button></div></td></tr>
            ))}
            {!filteredDevelopers.length ? <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-neutral-600">No developers match this view.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 text-xs text-neutral-600 sm:flex-row sm:items-center sm:justify-between"><span>Page {pagination.page} · {pagination.total} developer{pagination.total === 1 ? "" : "s"} · {pagination.pageSize} per page</span><div className="flex gap-2">{pagination.page > 1 ? <Link href={pageLink(pagination.page - 1)} className="inline-flex min-h-10 items-center rounded-full border border-black/15 px-3 py-2 font-semibold text-neutral-800 hover:bg-black/5">Previous</Link> : null}{pagination.hasNext ? <Link href={pageLink(pagination.page + 1)} className="inline-flex min-h-10 items-center rounded-full border border-black/15 px-3 py-2 font-semibold text-neutral-800 hover:bg-black/5">Next</Link> : null}</div></div>

      {actionError ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{actionError}</p> : null}
      {actionMessage ? <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{actionMessage}</p> : null}

      {activeDeveloper ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-2 sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveDeveloperId(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="developer-dialog-title" className="max-h-[calc(100dvh-1rem)] w-full max-w-6xl overflow-y-auto rounded-3xl border border-black/10 bg-white p-4 text-neutral-900 shadow-2xl sm:max-h-[90dvh] sm:p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3 sm:gap-4"><DeveloperLogo developer={activeDeveloper} size="h-12 w-12 sm:h-14 sm:w-14" /><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">Developer operations</p><h2 id="developer-dialog-title" className="truncate text-xl font-semibold text-neutral-950 sm:text-2xl">{activeDeveloper.name}</h2><p className="truncate text-sm text-neutral-600">{activeDeveloper.contact_email ?? "No contact email"}{activeDeveloper.contact_phone ? ` · ${activeDeveloper.contact_phone}` : ""}</p></div></div><button ref={closeButtonRef} type="button" onClick={() => setActiveDeveloperId(null)} className="min-h-10 shrink-0 rounded-full border border-black/15 px-3 py-2 text-sm font-semibold text-neutral-800 hover:bg-black/5" aria-label="Close developer details">Close</button></div>
            <div className="mt-4 flex flex-wrap items-center gap-2" role="tablist" aria-label="Developer details">{tabs.map((tab) => <button key={tab} id={`developer-tab-${tab.toLowerCase()}`} type="button" role="tab" aria-selected={activeTab === tab} aria-controls="developer-tab-panel" onClick={() => setActiveTab(tab)} className={clsx("min-h-10 rounded-full border px-4 py-2 text-xs font-semibold transition", activeTab === tab ? "border-black bg-black text-white" : "border-black/15 bg-white text-neutral-800 hover:bg-black/5")}>{tab}</button>)}</div>

            <div id="developer-tab-panel" role="tabpanel" aria-labelledby={`developer-tab-${activeTab.toLowerCase()}`} className="mt-4 rounded-2xl border border-black/10 bg-neutral-50 p-4 sm:p-5">
              {activeTab === "Overview" ? <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><div className="rounded-2xl border border-black/10 bg-white p-4"><p className="text-xs uppercase tracking-[0.22em] text-neutral-500">Portfolio</p><p className="mt-1 text-lg font-semibold text-neutral-950">{activeDeveloper.projectsCount} projects</p><p className="text-xs text-neutral-600">{activeDeveloper.listingsCount} linked listings</p></div><div className="rounded-2xl border border-black/10 bg-white p-4"><p className="text-xs uppercase tracking-[0.22em] text-neutral-500">Developer publication</p><p className="mt-1 text-lg font-semibold text-neutral-950">{developerPublicationStatus(activeDeveloper)}</p><p className="text-xs text-neutral-600">Published {formatDate(activeDeveloper.publishedAt)}</p></div><div className="rounded-2xl border border-black/10 bg-white p-4"><p className="text-xs uppercase tracking-[0.22em] text-neutral-500">Mobile visible</p><p className="mt-1 text-lg font-semibold text-neutral-950">{activeDeveloper.mobileVisibleProjectsCount + activeDeveloper.mobileVisibleListingsCount}</p><p className="text-xs text-neutral-600">{activeDeveloper.mobileVisibleProjectsCount} projects · {activeDeveloper.mobileVisibleListingsCount} listings</p></div><div className="rounded-2xl border border-black/10 bg-white p-4"><p className="text-xs uppercase tracking-[0.22em] text-neutral-500">Access</p><p className="mt-1 text-lg font-semibold text-neutral-950">{activeDeveloper.activeMembersCount} active</p><p className="text-xs text-neutral-600">{activeDeveloper.pendingMembersCount} pending · {activeDeveloper.revokedMembersCount} revoked</p></div><div className="rounded-2xl border border-black/10 bg-white p-4"><p className="text-xs uppercase tracking-[0.22em] text-neutral-500">Health</p><p className="mt-1 text-lg font-semibold text-neutral-950">{healthLabel(activeDeveloper)}</p><p className="text-xs text-neutral-600">Last access {formatTimestamp(activeDeveloper.lastLogin)}</p></div></div>
                <div><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-neutral-950">Attention queue</h3><span className="text-xs text-neutral-600">{activeDeveloper.attentionCount} open exception{activeDeveloper.attentionCount === 1 ? "" : "s"}</span></div><div className="mt-3 space-y-2">{currentProfileRevisions.map((revision) => <button key={revision.id} type="button" onClick={() => openProfileRevision(revision.id)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-left text-sm text-violet-950 hover:bg-violet-100"><span><span className="font-semibold">Profile revision v{revision.version}</span><span className="mt-0.5 block text-xs text-violet-800">Public identity change is waiting for review</span></span><span aria-hidden="true">Review →</span></button>)}{developerProjects.filter((project) => project.approval_status === "pending" || project.approval_status === "rejected").map((project) => <Link key={project.id} href={`/properties?projectStatus=all&projectSearch=${encodeURIComponent(project.name)}`} className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 hover:bg-amber-100"><span><span className="font-semibold">{project.name}</span><span className="mt-0.5 block text-xs text-amber-900">Project {labelize(project.approval_status)}{project.rejection_reason ? ` · ${project.rejection_reason}` : ""}</span></span><span aria-hidden="true">Open queue →</span></Link>)}{developerListings.filter((listing) => listing.approval_status !== "approved" || isExpired(listing.expires_at)).map((listing) => <Link key={listing.id} href={`/properties?propertySearch=${encodeURIComponent(listing.property_name ?? "")}`} className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 hover:bg-amber-100"><span><span className="font-semibold">{listing.property_name ?? "Untitled listing"}</span><span className="mt-0.5 block text-xs text-amber-900">Listing {labelize(listingStatus(listing))}{listing.rejection_reason ? ` · ${listing.rejection_reason}` : ""}</span></span><span aria-hidden="true">Open queue →</span></Link>)}{activeDeveloper.stalePendingInvitesCount ? <button type="button" onClick={() => setActiveTab("Members")} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-left text-sm text-blue-950 hover:bg-blue-100"><span><span className="font-semibold">{activeDeveloper.stalePendingInvitesCount} stale invitation{activeDeveloper.stalePendingInvitesCount === 1 ? "" : "s"}</span><span className="mt-0.5 block text-xs text-blue-900">Check delivery or resend from Members</span></span><span aria-hidden="true">View access →</span></button> : null}{!activeDeveloper.attentionCount ? <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">No open exceptions. Portfolio and access are within the current health contract.</p> : null}</div></div>
                {canImpersonate ? <button type="button" onClick={() => void startImpersonation(activeDeveloper.id)} disabled={busyDeveloperId === activeDeveloper.id || activeDeveloper.activeMembersCount === 0} className="min-h-11 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60">{busyDeveloperId === activeDeveloper.id ? "Opening developer portal…" : activeDeveloper.activeMembersCount ? "Open developer portal" : "No active member available"}</button> : null}</div> : null}

              {activeTab === "Members" ? <div className="space-y-4"><div className="space-y-3">{developerMembers.map((member) => <article key={member.id} className="rounded-2xl border border-black/10 bg-white p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="truncate font-semibold text-neutral-950">{member.full_name ?? member.email ?? "Developer member"}</p><p className="truncate text-sm text-neutral-600">{member.email ?? "No email recorded"}</p>{member.is_demo ? <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-800">Demo access{member.demo_batch ? ` · ${member.demo_batch}` : ""}</p> : null}</div><div className="flex flex-wrap items-center gap-2"><StatusPill label={labelize(member.status ?? "pending")} status={member.status ?? "pending"} />{member.status === "pending" ? <button type="button" onClick={() => void runMemberAction(member.id, "/api/admin/developers/resend-invite")} disabled={busyAccountId === member.id} className="min-h-10 rounded-full border border-black/15 px-3 py-2 text-xs font-semibold text-neutral-800 hover:bg-black/5 disabled:opacity-60">{busyAccountId === member.id ? "Sending…" : "Resend invite"}</button> : null}{member.status !== "revoked" ? <button type="button" onClick={() => { if (!window.confirm("Revoke this developer member's access? They will no longer be able to sign in.")) return; const reason = window.prompt("Why are you revoking this access? (3–500 characters)")?.trim() ?? ""; if (reason.length < 3 || reason.length > 500) { setActionError("A revoke reason between 3 and 500 characters is required."); return; } void runMemberAction(member.id, "/api/admin/developers/revoke", { reason }); }} disabled={busyAccountId === member.id} className="min-h-10 rounded-full border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-60">Revoke</button> : <span className="text-xs font-medium text-rose-800">Re-invite with a new address</span>}</div></div><div className="mt-4 grid gap-3 border-t border-black/5 pt-3 text-xs text-neutral-600 sm:grid-cols-2 xl:grid-cols-4"><p><span className="font-semibold text-neutral-800">Invited</span><br />{formatTimestamp(member.invited_at ?? member.invitation_sent_at)}{isStaleInvite(member) ? <span className="mt-1 block font-semibold text-amber-800">Stale invite</span> : null}</p><p><span className="font-semibold text-neutral-800">Activated</span><br />{formatTimestamp(member.activated_at)}</p><p><span className="font-semibold text-neutral-800">Last login</span><br />{formatTimestamp(member.last_login)}</p><p><span className="font-semibold text-neutral-800">Revoked</span><br />{formatTimestamp(member.revoked_at)}</p></div></article>)}{!developerMembers.length ? <p className="rounded-2xl border border-black/10 bg-white px-4 py-6 text-sm text-neutral-600">No members invited yet.</p> : null}</div><div className="rounded-2xl border border-black/10 bg-white p-4"><div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-neutral-500">Access timeline</p><p className="mt-1 text-sm text-neutral-600">Named lifecycle events and operator context; sensitive tokens are never shown.</p></div><span className="text-xs text-neutral-500">{developerActivity.length} event{developerActivity.length === 1 ? "" : "s"}</span></div><div className="mt-4 space-y-3">{developerActivity.map((entry) => { const targetMember = developerMembers.find((member) => member.id === entry.resource_id); const details = safeMetadata(entry.metadata); return <div key={entry.id} className="border-l-2 border-black/10 pl-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-neutral-950">{actionLabels[entry.action] ?? labelize(entry.action)}</p><time className="text-xs text-neutral-500">{formatTimestamp(entry.created_at)}</time></div><p className="mt-1 text-xs text-neutral-600">{entry.actor_type ? `Actor: ${labelize(entry.actor_type)}` : "Recorded by admin activity"}{entry.actor_id ? ` · ${formatIdentifier(entry.actor_id)}` : ""}{targetMember ? ` · Target: ${targetMember.email ?? targetMember.full_name ?? "member"}` : ""}</p>{details.length ? <div className="mt-2 grid gap-1 text-xs text-neutral-600 sm:grid-cols-2">{details.map(([label, value]) => <p key={label}><span className="font-semibold text-neutral-800">{label}:</span> {value}</p>)}</div> : null}</div>; })}{!developerActivity.length ? <p className="text-sm text-neutral-600">No recent access actions logged.</p> : null}</div></div></div> : null}

              {activeTab === "Projects" ? <div className="space-y-3">{developerProjects.map((project) => { const projectListings = developerListings.filter((listing) => listing.project_id === project.id); const visible = isProjectMobileVisible(project, publicationContractAvailable, activeDeveloper.isActive, activeDeveloper.lifecycleState, activeDeveloper.is_demo); const status = projectStatus(project); return <article key={project.id} className="rounded-2xl border border-black/10 bg-white p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold text-neutral-950">{project.name}</p><StatusPill label={labelize(status)} status={status} />{project.is_demo ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">Demo</span> : null}</div><p className="mt-1 text-xs text-neutral-600">Updated {formatTimestamp(project.updated_at ?? project.created_at)} · Launch label {labelize(project.launch_status)}</p></div><Link href={`/properties?projectStatus=all&projectSearch=${encodeURIComponent(project.name)}`} className="inline-flex min-h-10 items-center justify-center rounded-full border border-black/15 px-3 py-2 text-xs font-semibold text-neutral-800 hover:bg-black/5">Open moderation</Link></div><div className="mt-4 grid gap-3 border-t border-black/5 pt-3 sm:grid-cols-4"><p className="text-xs text-neutral-600"><span className="font-semibold text-neutral-900">Listings</span><br />{projectListings.length} total</p><p className="text-xs text-neutral-600"><span className="font-semibold text-neutral-900">Mobile</span><br />{visible ? "Published" : "Hidden"}</p><p className="text-xs text-neutral-600"><span className="font-semibold text-neutral-900">Completeness</span><br />{project.quality_score != null ? `${project.quality_score}% score` : project.quality_issues?.length ? `${project.quality_issues.length} blockers` : "Checklist unavailable"}</p><p className="text-xs text-neutral-600"><span className="font-semibold text-neutral-900">Published</span><br />{formatDate(project.published_at)}</p></div>{project.rejection_reason ? <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900"><span className="font-semibold">Review reason:</span> {project.rejection_reason}</p> : null}</article>; })}{!developerProjects.length ? <p className="rounded-2xl border border-black/10 bg-white px-4 py-6 text-sm text-neutral-600">No projects yet.</p> : null}</div> : null}

              {activeTab === "Listings" ? <div className="space-y-3">{developerListings.map((listing) => { const project = developerProjects.find((candidate) => candidate.id === listing.project_id); const status = listingStatus(listing); return <article key={listing.id} className="rounded-2xl border border-black/10 bg-white p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold text-neutral-950">{listing.property_name ?? "Untitled listing"}</p><StatusPill label={labelize(status)} status={status} /><span className="rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold text-neutral-700">{listing.listed_by_agent_id ? "Agent submission" : "Developer inventory"}</span></div><p className="mt-1 text-xs text-neutral-600">{project ? `Project: ${project.name}` : "No linked project"} · Updated {formatTimestamp(listing.updated_at ?? listing.created_at)}</p></div><Link href={`/properties?propertySearch=${encodeURIComponent(listing.property_name ?? "")}`} className="inline-flex min-h-10 items-center justify-center rounded-full border border-black/15 px-3 py-2 text-xs font-semibold text-neutral-800 hover:bg-black/5">Open moderation</Link></div><div className="mt-4 grid gap-3 border-t border-black/5 pt-3 sm:grid-cols-2 xl:grid-cols-5"><p className="text-xs text-neutral-600"><span className="font-semibold text-neutral-900">Price</span><br />{formatCurrency(listing.price)}</p><p className="text-xs text-neutral-600"><span className="font-semibold text-neutral-900">Inquiries</span><br />{listing.inquiries_count ?? 0}</p><p className="text-xs text-neutral-600"><span className="font-semibold text-neutral-900">Mobile</span><br />{isListingMobileVisible(listing, developerProjects, publicationContractAvailable, activeDeveloper.isActive, activeDeveloper.lifecycleState, activeDeveloper.is_demo) ? "Visible" : "Hidden"}</p><p className="text-xs text-neutral-600"><span className="font-semibold text-neutral-900">Expiry</span><br />{formatDate(listing.expires_at)}</p><p className="text-xs text-neutral-600"><span className="font-semibold text-neutral-900">Quality</span><br />{listing.quality_score != null ? `${listing.quality_score}% score` : listing.quality_issues?.length ? `${listing.quality_issues.length} blockers` : "Checklist unavailable"}</p></div>{listing.rejection_reason ? <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900"><span className="font-semibold">Review reason:</span> {listing.rejection_reason}</p> : null}</article>; })}{!developerListings.length ? <p className="rounded-2xl border border-black/10 bg-white px-4 py-6 text-sm text-neutral-600">No listings yet.</p> : null}</div> : null}
            </div>
          </div>
        </div>
      ) : null}

      {activeProfileRevision ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-2 sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveProfileRevisionId(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="profile-review-title" className="max-h-[calc(100dvh-1rem)] w-full max-w-3xl overflow-y-auto rounded-3xl border border-violet-200 bg-white p-4 text-neutral-900 shadow-2xl sm:max-h-[90dvh] sm:p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.3em] text-violet-800">Pending public profile</p><h2 id="profile-review-title" className="mt-1 text-xl font-semibold text-neutral-950">Review version {activeProfileRevision.version}</h2><p className="mt-1 text-sm text-neutral-600">{activeProfileRevision.developerName ?? "Developer"} · Submitted {formatTimestamp(activeProfileRevision.submitted_at ?? activeProfileRevision.updated_at ?? activeProfileRevision.created_at)}</p></div><button ref={profileCloseButtonRef} type="button" onClick={() => setActiveProfileRevisionId(null)} className="min-h-10 rounded-full border border-black/15 px-3 py-2 text-sm font-semibold text-neutral-800 hover:bg-black/5">Close</button></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]"><div className="flex aspect-square items-center justify-center overflow-hidden rounded-3xl border border-black/10 bg-neutral-100">{activeProfileRevision.logo_url ? <img src={activeProfileRevision.logo_url} alt={`${activeProfileRevision.name} logo preview`} className="h-full w-full object-cover" /* eslint-disable-line @next/next/no-img-element */ /> : <span className="text-4xl font-semibold text-neutral-500">{activeProfileRevision.name.charAt(0).toUpperCase()}</span>}</div><div className="rounded-2xl border border-black/10 bg-neutral-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.25em] text-neutral-500">Mobile identity preview</p><p className="mt-2 text-xl font-semibold text-neutral-950">{activeProfileRevision.name}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{activeProfileRevision.description?.trim() || "No public description supplied."}</p></div></div>
            {profileReviewFeedback ? <p role="status" className={clsx("mt-4 rounded-2xl border px-4 py-3 text-sm", profileReviewHasError ? "border-rose-200 bg-rose-50 text-rose-900" : "border-emerald-200 bg-emerald-50 text-emerald-900")}>{profileReviewFeedback}</p> : null}
            <label className="mt-5 block text-sm font-semibold text-neutral-900">Review note <span className="font-normal text-neutral-600">(required when requesting changes)</span><textarea value={profileReviewReason} onChange={(event) => setProfileReviewReason(event.target.value)} maxLength={500} rows={4} placeholder="Explain the change needed before this profile can be published…" className="mt-2 w-full rounded-2xl border border-black/15 bg-white px-3 py-3 text-sm font-normal text-neutral-900 placeholder:text-neutral-500" /></label>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => void reviewProfileRevision(activeProfileRevision.id, "rejected")} disabled={busyProfileRevisionId === activeProfileRevision.id} className="min-h-11 rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-60">{busyProfileRevisionId === activeProfileRevision.id ? "Saving…" : "Request changes"}</button><button type="button" onClick={() => void reviewProfileRevision(activeProfileRevision.id, "approved")} disabled={busyProfileRevisionId === activeProfileRevision.id} className="min-h-11 rounded-full bg-violet-900 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60">{busyProfileRevisionId === activeProfileRevision.id ? "Saving…" : "Approve and publish"}</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
