import { NextRequest, NextResponse } from "next/server";
import { clearDeveloperSession } from "@/lib/developerSession";
import { getRequestBaseUrl } from "@/lib/requestUrl";

export async function POST(request: NextRequest) {
  const baseUrl = getRequestBaseUrl(request);
  const response = NextResponse.redirect(new URL("/developer/login", baseUrl));
  clearDeveloperSession(response.cookies);
  return response;
}

export async function GET(request: NextRequest) {
  return POST(request);
}
