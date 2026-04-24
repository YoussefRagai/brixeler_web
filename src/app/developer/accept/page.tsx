import { Suspense } from "react";
import { AcceptInviteClient } from "./AcceptInviteClient";

export const dynamic = "force-dynamic";

export default function DeveloperAcceptPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f8f8] px-6">
      <Suspense
        fallback={
          <div className="w-full max-w-lg rounded-3xl border border-black/10 bg-white p-8 text-sm text-neutral-500 shadow-xl shadow-black/5">
            Loading invite…
          </div>
        }
      >
        <AcceptInviteClient />
      </Suspense>
    </div>
  );
}
