"use client";

import { useState, type ReactNode } from "react";

export function DeveloperProjectRequestTabs({
  requestCount,
  overviewContent,
  requestContent,
}: {
  requestCount: number;
  overviewContent: ReactNode;
  requestContent: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "requests">("overview");

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-black/10 bg-neutral-50 p-1">
        <button
          className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
            activeTab === "overview" ? "bg-black text-white" : "text-neutral-600 hover:text-black"
          }`}
          type="button"
          onClick={() => setActiveTab("overview")}
        >
          Overview
        </button>
        <button
          className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
            activeTab === "requests" ? "bg-black text-white" : "text-neutral-600 hover:text-black"
          }`}
          type="button"
          onClick={() => setActiveTab("requests")}
        >
          Contact requests
          <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-[11px] text-inherit">
            {requestCount}
          </span>
        </button>
      </div>
      <div className="mt-4">{activeTab === "overview" ? overviewContent : requestContent}</div>
    </div>
  );
}
