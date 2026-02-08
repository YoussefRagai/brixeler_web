import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { logAdminActivity } from "@/lib/adminQueries";

export async function POST(request: Request) {
  const admin = await requireAdminContext();
  if (!admin?.adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const {
    target_type,
    target_id,
    metric,
    time_window,
    operator,
    value_min,
    value_max,
    value_single,
    filters,
  } = body ?? {};

  const { data, error } = await supabaseServer
    .from("admin_rules")
    .insert({
      target_type,
      target_id,
      metric,
      time_window,
      operator,
      value_min,
      value_max,
      value_single,
      filters: filters ?? {},
      is_active: true,
      created_by_admin: admin.adminId,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminActivity({
    adminId: admin.adminId,
    action: "rewards.rule.create",
    resourceType: "admin_rules",
    resourceId: data?.id ?? null,
    metadata: { target_type, metric },
  });

  try {
    await supabaseServer.rpc("evaluate_admin_rules_for_all");
  } catch (error) {
    console.warn("Failed to run rewards evaluation", error);
  }

  return NextResponse.json({ id: data?.id });
}
