import { NextResponse } from "next/server";
import { clearDeveloperSession } from "@/lib/developerSession";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/developer/login", request.url));
  clearDeveloperSession(response.cookies);
  return response;
}

export async function GET(request: Request) {
  return POST(request);
}
