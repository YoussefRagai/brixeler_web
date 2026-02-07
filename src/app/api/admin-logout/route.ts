import { NextResponse, type NextRequest } from "next/server";
import { clearAdminSession } from "@/lib/adminSession";
import { getRequestBaseUrl } from "@/lib/requestUrl";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/admin/login", getRequestBaseUrl(request)));
  clearAdminSession(response.cookies as any);
  return response;
}
