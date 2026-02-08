import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  const admin = await requireAdminContext();
  if (!admin?.adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const { gift_id, metric, time_window, operator, value_single, value_min, value_max, filters } = payload ?? {};

  const { data, error } = await supabaseServer.rpc("preview_gift_rule", {
    gift_id,
    metric,
    time_window,
    operator,
    value_single,
    value_min,
    value_max,
    filters: filters ?? {},
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? { count: 0, sample: [] });
}
