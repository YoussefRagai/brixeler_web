import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

export const metadata: Metadata = { title: 'Open agent resume in Brixeler', robots: { index: false, follow: false } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ResumeLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!UUID.test(token)) notFound();
  return <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-5 bg-white p-8 text-neutral-900">
    <p className="text-xs font-bold tracking-[0.2em]">BRIXELER</p>
    <h1 className="text-3xl font-bold">Agent resume</h1>
    <p className="text-neutral-600">Open this resume in the Brixeler app. Sign in if prompted.</p>
    <a href={`brixeler://resume/${token}`} className="rounded-full bg-neutral-950 px-6 py-3 text-center font-semibold text-white">Open in Brixeler</a>
    <p className="text-sm text-neutral-500">If the app does not open, install Brixeler and return to this link.</p>
  </main>;
}
