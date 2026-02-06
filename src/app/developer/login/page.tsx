import { redirect } from "next/navigation";
import { currentDeveloperSession } from "@/lib/developerAuth";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function DeveloperLoginPage({ searchParams }: Props) {
  const existingSession = await currentDeveloperSession();
  if (existingSession) {
    redirect("/developer");
  }

  const params = await searchParams;
  const errorMessage = params.error;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f8f8] px-6">
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-black/10 bg-white p-8 shadow-xl shadow-black/5">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Developer Console</p>
          <h1 className="text-2xl font-semibold text-[#050505]">Sign in</h1>
          <p className="text-sm text-neutral-500">Use the credentials shared with you by the Brixeler team.</p>
        </div>
        {errorMessage && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{errorMessage}</p>
        )}
        <form method="post" action="/api/developer-login" className="space-y-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Email</span>
            <input
              type="email"
              name="email"
              required
              className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
              placeholder="partners@atlas-demo.com"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">Password</span>
            <input
              type="password"
              name="password"
              required
              className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
              placeholder="••••••••"
            />
          </label>
          <button className="w-full rounded-full bg-black px-5 py-3 text-sm font-semibold text-white" type="submit">
            Enter console
          </button>
        </form>
      </div>
    </div>
  );
}
