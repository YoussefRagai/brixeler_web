import { NextResponse } from "next/server";
import { clearAdminSession } from "@/lib/adminSession";
import { getRequestBaseUrl } from "@/lib/requestUrl";

export async function POST(request: Request) {
  const baseUrl = getRequestBaseUrl(request as any);
  const response = NextResponse.redirect(new URL("/admin/login", baseUrl));
  clearAdminSession(response.cookies);
  return response;
}

export async function GET(request: Request) {
  return POST(request);
}
