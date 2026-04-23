import { AdminLayout } from "@/components/AdminLayout";
import { fetchSalesClaims } from "@/lib/adminDeals";
import { AdminAccessDenied } from "@/components/AdminAccessDenied";
import { buildAdminUi } from "@/lib/adminUi";
import { DealsClaimsTable } from "@/components/DealsClaimsTable";

export default async function DealsPage() {
  const ui = await buildAdminUi(["deals_admin"]);
  const salesClaims = await fetchSalesClaims();
  const isSuperAdmin = ui.roles.includes("super_admin");
  return (
    <AdminLayout
      title="Deal room"
      description="Realtime snapshot from submission to payout with SLA tracking."
      actions={
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Coming soon"
          className="cursor-not-allowed rounded-full bg-emerald-200 px-5 py-2 text-sm font-semibold text-emerald-900/70"
        >
          New admin task
        </button>
      }
      navItems={ui.navItems}
      meta={ui.meta}
    >
      {!ui.hasAccess ? (
        <AdminAccessDenied />
      ) : (
        <DealsClaimsTable claims={salesClaims} isSuperAdmin={isSuperAdmin} />
      )}
    </AdminLayout>
  );
}
