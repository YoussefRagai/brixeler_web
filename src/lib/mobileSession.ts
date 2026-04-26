import { supabaseServer } from "@/lib/supabaseServer";

export async function getMobileUserFromRequest(request: Request) {
  const authHeader = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { user: null, error: "Missing bearer token", status: 401 as const };
  }

  const accessToken = authHeader.slice("Bearer ".length).trim();
  if (!accessToken) {
    return { user: null, error: "Missing bearer token", status: 401 as const };
  }

  const { data, error } = await supabaseServer.auth.getUser(accessToken);
  if (error || !data.user?.id) {
    return { user: null, error: "Invalid or expired session", status: 401 as const };
  }

  return { user: data.user, error: null, status: 200 as const };
}
