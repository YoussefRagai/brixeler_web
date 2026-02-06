import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

const VALID_STATUSES = ["Under Review", "Accepted - Processing", "Paid"];

type RouteContext = {
  params: Promise<{
    id?: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const params = await context.params;
  const id = params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing sales claim id." }, { status: 400 });
  }
  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const status = body.status;
  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: "Invalid status. Allowed values: Under Review, Accepted - Processing, Paid." },
      { status: 400 },
    );
  }
  const { data, error } = await supabaseServer.rpc("set_sales_claim_status", {
    p_entry_id: id,
    p_status: status,
  });
  if (error) {
    console.error("Failed to update sales claim status", error);
    return NextResponse.json({ error: "Unable to update sales claim status." }, { status: 500 });
  }
  return NextResponse.json({ success: true, status: data?.status ?? status });
}
