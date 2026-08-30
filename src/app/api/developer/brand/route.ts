import { NextResponse } from "next/server";
import { requireDeveloperSession } from "@/lib/developerAuth";
import { fetchDeveloperPortalBrand } from "@/lib/developerPortalBrand";
import { developerRoleCapabilities } from "@/lib/developerRbac";

export async function GET() {
  const session = await requireDeveloperSession({ allowIncompleteProfile: true });
  const brand = await fetchDeveloperPortalBrand(session.developerId);
  return NextResponse.json({
    ...brand,
    role: session.role,
    capabilities: developerRoleCapabilities(session.role),
  });
}
