'use client';

import { useEffect } from 'react';
import { captureOperationalError } from '@/lib/observability';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureOperationalError(error, 'next-root-render');
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-950">
        <main className="flex min-h-screen items-center justify-center p-6" role="alert">
          <section className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
            <p className="text-xs font-semibold tracking-[0.18em] text-neutral-500">BRIXELER</p>
            <h1 className="mt-4 text-2xl font-semibold">Something went wrong</h1>
            <p className="mt-2 text-sm leading-6 text-neutral-600">Your work is safe. Try loading this view again.</p>
            <button
              type="button"
              onClick={reset}
              className="mt-6 w-full rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white"
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
