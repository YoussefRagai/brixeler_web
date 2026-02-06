import { NextResponse } from "next/server";
import { requireDeveloperSession } from "@/lib/developerAuth";
import { fetchDeveloperProjects } from "@/lib/developerQueries";

export async function GET() {
  const session = await requireDeveloperSession();
  const projects = await fetchDeveloperProjects(session.developerId);
  const result = projects.map((project) => ({
    id: project.id,
    name: project.name,
  }));
  return NextResponse.json(result);
}
