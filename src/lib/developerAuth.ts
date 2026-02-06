import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDeveloperSession, type DeveloperSession } from "./developerSession";

export async function currentDeveloperSession(): Promise<DeveloperSession | null> {
  const store = await cookies();
  return getDeveloperSession(store);
}

export async function requireDeveloperSession(): Promise<DeveloperSession> {
  const session = await currentDeveloperSession();
  if (!session) {
    redirect("/developer/login");
  }
  return session;
}
