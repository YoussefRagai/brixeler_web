import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDeveloperSession, type DeveloperSession } from "./developerSession";
import { getDeveloperImpersonation, type DeveloperImpersonationMarker } from "./developerImpersonation";
import { findDeveloperAccountByUser } from "./developerQueries";

export async function currentDeveloperSession(): Promise<DeveloperSession | null> {
  const store = await cookies();
  return getDeveloperSession(store);
}

export async function currentDeveloperImpersonation(): Promise<DeveloperImpersonationMarker | null> {
  const store = await cookies();
  return getDeveloperImpersonation(store);
}

export async function requireDeveloperSession(): Promise<DeveloperSession> {
  const session = await currentDeveloperSession();
  if (!session) {
    redirect("/developer/login");
  }
  const account = await findDeveloperAccountByUser(session.userId);
  if (!account || account.developerId !== session.developerId) {
    redirect("/developer/login?error=Access+revoked+or+expired");
  }
  return session;
}
