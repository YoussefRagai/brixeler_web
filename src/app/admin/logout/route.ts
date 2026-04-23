import { NextRequest, NextResponse } from "next/server";
import { clearAdminSession } from "@/lib/adminSession";
import { getRequestBaseUrl } from "@/lib/requestUrl";

export async function POST(request: NextRequest) {
  const baseUrl = getRequestBaseUrl(request);
  const response = NextResponse.redirect(new URL("/admin/login", baseUrl));
  clearAdminSession(response.cookies);
  return response;
}

export async function GET(request: NextRequest) {
  return POST(request);
}
