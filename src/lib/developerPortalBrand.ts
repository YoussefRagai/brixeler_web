import {
  isCompleteDeveloperProfile,
  isCompleteSubmittedDeveloperProfileRevision,
  isCompletePublicDeveloperProfile,
} from "./developerAuth";
import { supabaseServer } from "./supabaseServer";
import type { DeveloperCapability, DeveloperRole } from "./developerRbac";

export type DeveloperPortalBrand = {
  name: string;
  logoUrl: string | null;
  tagline: string;
  pendingReview: boolean;
  role?: DeveloperRole | null;
  capabilities?: DeveloperCapability[];
};

type PublicProfile = {
  name?: string | null;
  logo_url?: string | null;
  description?: string | null;
  slogan?: string | null;
  lifecycle_state?: string | null;
};

type ProfileRevision = PublicProfile & {
  status?: string | null;
  submitted_at?: string | null;
  version?: number | null;
};

export async function fetchDeveloperPortalBrand(developerId: string): Promise<DeveloperPortalBrand | null> {
  const [profileResult, revisionResult] = await Promise.all([
    supabaseServer
      .from("developers")
      .select("name, logo_url, description, slogan")
      .eq("id", developerId)
      .maybeSingle(),
    supabaseServer
      .from("developer_profile_revisions")
      .select("name, logo_url, description, slogan, status, submitted_at, version")
      .eq("developer_id", developerId)
      .in("status", ["pending", "approved"])
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const publicProfile = (profileResult.data as PublicProfile | null) ?? null;
  const revision = revisionResult.error ? null : ((revisionResult.data as ProfileRevision | null) ?? null);
  const source = isCompleteSubmittedDeveloperProfileRevision(revision)
    ? revision
    : isCompletePublicDeveloperProfile(publicProfile)
      ? publicProfile
      : null;
  if (!source || !isCompleteDeveloperProfile(source)) return null;

  return {
    name: source.name!.trim(),
    logoUrl: source.logo_url?.trim() || null,
    tagline: source.slogan?.trim() || compactTagline(source.description!),
    pendingReview: source === revision && revision?.status?.toLowerCase() === "pending",
  };
}

function compactTagline(description: string) {
  const tagline = description.trim().replace(/\s+/g, " ");
  if (tagline.length <= 96) return tagline;
  return `${tagline.slice(0, 93).trimEnd()}…`;
}
