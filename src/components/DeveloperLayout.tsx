import type { ReactNode } from "react";
import type { DeveloperImpersonationMarker } from "@/lib/developerImpersonation";
import type { DeveloperPortalBrand } from "@/lib/developerPortalBrand";
import { requireDeveloperSession } from "@/lib/developerAuth";
import { fetchDeveloperPortalBrand } from "@/lib/developerPortalBrand";
import { developerRoleCapabilities } from "@/lib/developerRbac";
import { DeveloperLayoutClient } from "./DeveloperLayoutClient";

const fallbackBrand: DeveloperPortalBrand = {
  name: "Brixeler Partners",
  logoUrl: null,
  tagline: "Your portfolio command center",
  pendingReview: false,
  role: null,
  capabilities: [],
};

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  impersonation?: DeveloperImpersonationMarker | null;
  onboarding?: boolean;
  preview?: boolean;
}

export async function DeveloperLayout({ title, description, actions, children, impersonation, onboarding = false, preview = false }: Props) {
  const initialBrand = await loadInitialBrand({ onboarding, preview });
  return <DeveloperLayoutClient title={title} description={description} actions={actions} impersonation={impersonation} onboarding={onboarding} initialBrand={initialBrand}>{children}</DeveloperLayoutClient>;
}

async function loadInitialBrand({ onboarding, preview }: { onboarding: boolean; preview: boolean }): Promise<DeveloperPortalBrand | null> {
  // The profile page has an explicit no-backend preview for local setup help.
  // Every real developer layout still crosses the normal signed-session boundary.
  if (preview && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) return null;

  const session = await requireDeveloperSession({ allowIncompleteProfile: onboarding });
  let brand: DeveloperPortalBrand | null = null;
  try {
    brand = await fetchDeveloperPortalBrand(session.developerId);
  } catch (error) {
    console.warn("Unable to load developer portal brand for server hydration", error);
  }
  return {
    ...(brand ?? fallbackBrand),
    role: session.role,
    capabilities: developerRoleCapabilities(session.role),
  };
}
