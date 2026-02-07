import { NextResponse } from "next/server";
import { clearDeveloperSession } from "@/lib/developerSession";
import { getRequestBaseUrl } from "@/lib/requestUrl";

export async function POST(request: Request) {
  const baseUrl = getRequestBaseUrl(request as any);
  const response = NextResponse.redirect(new URL("/developer/login", baseUrl));
  clearDeveloperSession(response.cookies);
  return response;
}

export async function GET(request: Request) {
  return POST(request);
}
