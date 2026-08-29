import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { logAdminActivity } from "@/lib/adminQueries";

export async function POST(request: Request) {
  const admin = await requireAdminRole(["marketing_admin"]);
  if (!admin?.adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabaseServer.rpc("run_growth_evaluation", {
    p_scope: "gifts",
    p_dry_run: false,
    p_requested_by_admin: admin.adminId,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminActivity({
    adminId: admin.adminId,
    action: "gifts.rules.apply",
    resourceType: "gifts",
    resourceId: null,
    metadata: {},
  });

  return NextResponse.redirect(new URL("/gifts", request.url));
}
