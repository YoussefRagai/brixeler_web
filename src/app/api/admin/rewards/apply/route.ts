import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { logAdminActivity } from "@/lib/adminQueries";

export async function POST(request: Request) {
  const admin = await requireAdminContext();
  if (!admin?.adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabaseServer.rpc("evaluate_admin_rules_for_all");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminActivity({
    adminId: admin.adminId,
    action: "rewards.rules.apply",
    resourceType: "admin_rules",
    resourceId: null,
    metadata: {},
  });

  return NextResponse.redirect(new URL("/rewards", request.url));
}
