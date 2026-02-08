import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/adminAuth";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  const admin = await requireAdminContext();
  if (!admin?.adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = await request.json();
  const { data, error } = await supabaseServer.rpc("preview_admin_rule", payload);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? { count: 0, sample: [] });
}
