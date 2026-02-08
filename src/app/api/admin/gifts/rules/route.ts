import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";
import { logAdminActivity } from "@/lib/adminQueries";

export async function POST(request: Request) {
  const admin = await requireAdminContext();
  if (!admin?.adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const { gift_id, metric, time_window, operator, value_single, value_min, value_max, filters } = payload ?? {};

  const { data, error } = await supabaseServer
    .from("gift_rules")
    .insert({
      gift_id,
      metric,
      time_window,
      operator,
      value_single,
      value_min,
      value_max,
      filters: filters ?? {},
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminActivity({
    adminId: admin.adminId,
    action: "gifts.rule.create",
    resourceType: "gift_rules",
    resourceId: data?.id ?? null,
    metadata: { gift_id, metric },
  });

  return NextResponse.json({ ok: true });
}
