import { DeveloperIntegrationsCenter } from "@/components/DeveloperIntegrationsCenter";
import { DeveloperLayout } from "@/components/DeveloperLayout";
import { currentDeveloperImpersonation, requireDeveloperCapability } from "@/lib/developerAuth";
import { fetchDeveloperIntegrations } from "@/lib/developerSalesOps";

export const dynamic = "force-dynamic";

export default async function DeveloperIntegrationsPage() {
  const session = await requireDeveloperCapability("manage_integrations");
  const [data, impersonation] = await Promise.all([
    fetchDeveloperIntegrations(session.developerId),
    currentDeveloperImpersonation(),
  ]);
  return <DeveloperLayout title="Integrations" description="Company-scoped credentials, webhook contracts, import configuration, and sync health." impersonation={impersonation}><DeveloperIntegrationsCenter initialData={data} /></DeveloperLayout>;
}
