import Link from 'next/link';
import { AdminLayout } from '@/components/AdminLayout';
import { AdminAccessDenied } from '@/components/AdminAccessDenied';
import { buildAdminUi } from '@/lib/adminUi';
import { supabaseServer } from '@/lib/supabaseServer';
import { appUsageFilters, usagePercentage, type AppUsageSummary } from '@/lib/appUsageAnalytics';

export default async function AppUsagePage({ searchParams }: { searchParams: Promise<{ days?: string; platform?: string }> }) {
  const ui = await buildAdminUi(['super_admin']);
  const filters = appUsageFilters(...await searchParams.then(p => [p.days,p.platform] as const));
  const result = ui.hasAccess ? await supabaseServer.rpc('app_usage_summary',{p_days:filters.days,p_platform:filters.platform}) : null;
  const data = result?.data as AppUsageSummary | null;
  const maxUsers = Math.max(1,...(data?.daily.map(d=>d.users) ?? []));
  return <AdminLayout title="App usage" navItems={ui.navItems} meta={ui.meta}>
    {!ui.hasAccess ? <AdminAccessDenied/> : <div className="space-y-5">
      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-black/10 bg-white p-4">
        <label className="text-sm">Window<select name="days" defaultValue={filters.days} className="ml-2 rounded-lg border p-2">{[7,30,90].map(d=><option key={d} value={d}>{d} days</option>)}</select></label>
        <label className="text-sm">Platform<select name="platform" defaultValue={filters.platform} className="ml-2 rounded-lg border p-2">{['all','ios','android','web'].map(p=><option key={p} value={p}>{p === 'all' ? 'All platforms' : p}</option>)}</select></label>
        <button className="rounded-full bg-black px-4 py-2 text-sm text-white">Apply / refresh</button>
        <Link href="/analytics" className="ml-auto text-sm underline">Business analytics</Link>
      </form>
      {result?.error || !data ? <section role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5">Usage analytics is unavailable. Apply the analytics migration and check database access; no substitute data is shown.</section> : <>
        <p className="text-xs text-neutral-500">Opted-in, active, non-demo accounts only · UTC · Last received: {data.last_event_at ? new Date(data.last_event_at).toLocaleString('en-GB',{timeZone:'UTC'}) : 'No events yet'}</p>
        <section className="grid gap-3 sm:grid-cols-3">{[['Active users',data.active_users],['Sessions',data.sessions],['Screen views',data.screen_views]].map(([label,value])=><article key={label} className="rounded-2xl border border-black/10 bg-white p-5"><h2 className="text-sm text-neutral-500">{label}</h2><p className="mt-2 text-3xl font-semibold tabular-nums">{Number(value).toLocaleString()}</p></article>)}</section>
        {!data.events ? <section className="rounded-2xl border border-dashed p-6 text-sm text-neutral-600">No participating app activity in this window. Events start after the instrumented mobile release and user opt-in in Settings. Older builds and opted-out users are not measured.</section> : null}
        <section className="rounded-2xl border border-black/10 bg-white p-5"><h2 className="font-semibold">Daily active users</h2><p className="mb-4 text-xs text-neutral-500">Distinct participating accounts per UTC day; daily values are not additive.</p><div className="flex h-36 items-end gap-1 overflow-x-auto" role="img" aria-label="Daily active users; exact values in the table below">{data.daily.map(d=><div key={d.day} title={`${d.day}: ${d.users} users`} className="min-w-2 flex-1 rounded-t bg-[#70852f]" style={{height:`${Math.max(2,d.users/maxUsers*100)}%`}}/>)}</div><details className="mt-3 text-xs"><summary className="cursor-pointer">Daily values</summary><table className="mt-2 w-full text-left"><thead><tr><th>Date (UTC)</th><th>Users</th><th>Events</th></tr></thead><tbody>{data.daily.map(d=><tr key={d.day}><td>{d.day}</td><td>{d.users}</td><td>{d.events}</td></tr>)}</tbody></table></details></section>
        <div className="grid gap-4 lg:grid-cols-2"><section className="rounded-2xl border border-black/10 bg-white p-5"><h2 className="font-semibold">Browse → contact</h2><p className="mb-4 text-xs text-neutral-500">Ordered actions within the same session and selected window.</p>{[['Browse inventory',data.funnel.browse_sessions],['Open project / property',data.funnel.detail_sessions],['Send contact request',data.funnel.contact_sessions]].map(([label,n])=><div key={label} className="my-3"><div className="mb-1 flex justify-between text-sm"><span>{label}</span><span>{n} · {usagePercentage(Number(n),data.funnel.browse_sessions)}</span></div><div className="h-2 rounded bg-neutral-100"><div className="h-2 rounded bg-[#70852f]" style={{width:`${data.funnel.browse_sessions ? Number(n)/data.funnel.browse_sessions*100 : 0}%`}}/></div></div>)}</section>
        <section className="rounded-2xl border border-black/10 bg-white p-5"><h2 className="mb-3 font-semibold">Popular screens</h2><table className="w-full text-left text-sm"><thead className="text-xs text-neutral-500"><tr><th>Screen</th><th>Views</th><th>Users</th></tr></thead><tbody>{data.screens.map(s=><tr key={s.screen} className="border-t border-black/5"><td className="py-2">{s.screen}</td><td>{s.views}</td><td>{s.users}</td></tr>)}</tbody></table></section></div>
        <section className="rounded-2xl border border-black/10 bg-white p-5"><h2 className="mb-3 font-semibold">Feature activity</h2><table className="w-full text-left text-sm"><thead className="text-xs text-neutral-500"><tr><th>Action</th><th>Events</th><th>Users</th></tr></thead><tbody>{data.features.map(f=><tr key={f.event_name} className="border-t border-black/5"><td className="py-2">{f.event_name.replaceAll('_',' ')}</td><td>{f.events}</td><td>{f.users}</td></tr>)}</tbody></table></section>
        <details className="rounded-2xl border border-black/10 bg-white p-4 text-sm text-neutral-600"><summary className="cursor-pointer font-medium">Definitions & privacy</summary><p className="mt-2">Active users = distinct accounts with an accepted event in this window. Sessions restart after 30 minutes without tracked interaction or after login/app restart. Views count navigation and foreground entries. Client-reported success/failure events are diagnostic, not financial records. No search text, messages, URLs, attachments, device identifiers or personal profile fields are collected. Event IDs deduplicate retries. Opt-out deletes retained events, so historical totals can decrease. Raw events expire after 90 days. Network failures, older builds and opt-out cause undercounting; no population-wide adoption claim is made.</p></details>
      </>}
    </div>}
  </AdminLayout>;
}
