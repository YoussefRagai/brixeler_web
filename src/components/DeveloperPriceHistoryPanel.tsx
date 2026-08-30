import type { DeveloperPropertyPriceHistory } from "@/lib/developerQueries";

export function DeveloperPriceHistoryPanel({ history }: { history: DeveloperPropertyPriceHistory[] }) {
  return (
    <section className="rounded-3xl border border-black/5 bg-white p-4 sm:p-5" aria-label="Inventory price history">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Price history</p><h3 className="mt-1 text-lg font-semibold text-neutral-950">Effective-date commercial trail</h3><p className="mt-1 text-xs text-neutral-500">Every price edit keeps the previous value and effective timestamp.</p></div>
      {history.length ? <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="border-b border-black/10 text-[10px] uppercase tracking-[0.16em] text-neutral-400"><tr><th className="px-2 py-2">Unit</th><th className="px-2 py-2">Previous</th><th className="px-2 py-2">New price</th><th className="px-2 py-2">Effective</th></tr></thead><tbody>{history.slice(0, 15).map((entry) => <tr key={entry.id} className="border-b border-black/5"><td className="px-2 py-2 font-mono text-[10px]">{entry.property_id.slice(0, 8)}</td><td className="px-2 py-2 text-neutral-500">{entry.previous_price == null ? "—" : `EGP ${entry.previous_price.toLocaleString()}`}</td><td className="px-2 py-2 font-semibold">EGP {entry.price.toLocaleString()}</td><td className="px-2 py-2 text-neutral-500">{new Date(entry.effective_from).toLocaleString()}</td></tr>)}</tbody></table></div> : <p className="mt-4 rounded-2xl bg-neutral-50 p-4 text-xs text-neutral-500">No price changes have been recorded for this phase.</p>}
    </section>
  );
}
