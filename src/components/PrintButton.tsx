"use client";

export function PrintButton({ label = "Print / save PDF", className }: { label?: string; className?: string }) {
  return <button type="button" className={className} onClick={() => window.print()}>{label}</button>;
}

