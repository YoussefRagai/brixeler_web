import { DeveloperLayout } from "@/components/DeveloperLayout";
import { DeveloperSupportCenter } from "@/components/DeveloperSupportCenter";
import { currentDeveloperImpersonation, requireDeveloperSession } from "@/lib/developerAuth";
import { fetchDeveloperSupportTickets } from "@/lib/developerSalesOps";

export const dynamic = "force-dynamic";

export default async function DeveloperSupportPage() {
  const session = await requireDeveloperSession();
  const [tickets, impersonation] = await Promise.all([
    fetchDeveloperSupportTickets(session.developerId),
    currentDeveloperImpersonation(),
  ]);
  return <DeveloperLayout title="Support & help" description="Get help with account access, inventory, and sales operations." impersonation={impersonation}><DeveloperSupportCenter initialTickets={tickets} /></DeveloperLayout>;
}
