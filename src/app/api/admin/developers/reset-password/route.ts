import { NextResponse } from "next/server";
import { getAdminSessionFromCookie } from "@/lib/adminSession";
import { hasAdminRole, type AdminRole } from "@/lib/adminRoles";
import { fetchAdminAccountByUser } from "@/lib/adminQueries";

export async function POST(request: Request) {
  const session = getAdminSessionFromCookie(request.headers.get("cookie"));
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const roles = (session.roles ?? []) as AdminRole[];
  if (!hasAdminRole(roles, ["developers_admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const account = await fetchAdminAccountByUser(session.authUserId);
  if (!account) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    { error: "Developer members must set their own password through the invite email flow." },
    { status: 410 },
  );
}
