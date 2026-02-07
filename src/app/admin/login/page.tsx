import Link from "next/link";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const resolved = (await searchParams) ?? {};
  const error = resolved?.error;
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f8f8] px-4 text-[#050505]">
      <div className="w-full max-w-md rounded-3xl border border-black/5 bg-white p-8 shadow-xl shadow-black/5">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">Brixeler</p>
          <h1 className="text-2xl font-semibold">Admin login</h1>
          <p className="text-sm text-neutral-500">Sign in to manage the command center.</p>
        </div>
        {error ? (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {decodeURIComponent(error)}
          </div>
        ) : null}
        <form action="/api/admin-login" method="post" className="space-y-4">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-xs uppercase tracking-[0.3em] text-neutral-400">Email</span>
            <input
              name="email"
              type="email"
              required
              className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-xs uppercase tracking-[0.3em] text-neutral-400">Password</span>
            <input
              name="password"
              type="password"
              required
              className="rounded-2xl border border-black/10 bg-[#f8f8f8] px-4 py-3"
            />
          </label>
          <button className="w-full rounded-full bg-black px-5 py-3 text-sm font-semibold text-white">
            Sign in
          </button>
        </form>
        <div className="mt-6 text-xs text-neutral-400">
          <Link className="underline" href="/developer/login">
            Developer login
          </Link>
        </div>
      </div>
    </div>
  );
}
