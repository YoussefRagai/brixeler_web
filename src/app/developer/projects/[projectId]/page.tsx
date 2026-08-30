import DeveloperProjectsPage from "../page";

export const dynamic = "force-dynamic";

export default async function DeveloperProjectPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const query = (await searchParams) ?? {};
  return DeveloperProjectsPage({
    searchParams: Promise.resolve({ ...query, project: projectId }),
  });
}
