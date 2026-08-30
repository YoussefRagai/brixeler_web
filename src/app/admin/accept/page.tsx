import { Suspense } from "react";
import { AdminInviteAcceptClient } from "./AdminInviteAcceptClient";

export default function AdminInviteAcceptPage() {
  return <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#f8f8f8] text-sm text-neutral-500">Loading invite…</div>}><AdminInviteAcceptClient /></Suspense>;
}
