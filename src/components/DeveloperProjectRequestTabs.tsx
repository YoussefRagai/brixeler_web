"use client";

import { useEffect, useState, type ReactNode } from "react";

export function DeveloperProjectRequestTabs({
  requestCount,
  overviewContent,
  requestContent,
  sectionIdSuffix,
  initialTab = "overview",
  showRequests = true,
}: {
  requestCount: number;
  overviewContent: ReactNode;
  requestContent: ReactNode;
  sectionIdSuffix?: string;
  initialTab?: "overview" | "requests";
  showRequests?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "requests">(initialTab);
  const inventoryId = sectionIdSuffix ? `project-inventory-${sectionIdSuffix}` : "project-inventory";
  const leadsId = sectionIdSuffix ? `project-leads-${sectionIdSuffix}` : "project-leads";
  const inventoryTabId = `${inventoryId}-tab`;
  const leadsTabId = `${leadsId}-tab`;

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  if (!showRequests) {
    return <div className="mt-4">{overviewContent}</div>;
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-black/10 bg-neutral-50 p-1" role="tablist" aria-label="Project workspace sections">
        <button
          className={`rounded-full px-4 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/60 ${
            activeTab === "overview" ? "bg-black text-white" : "text-neutral-600 hover:text-black"
          }`}
          type="button"
          onClick={() => setActiveTab("overview")}
          role="tab"
          id={inventoryTabId}
          aria-selected={activeTab === "overview"}
          aria-controls={inventoryId}
        >
          Inventory
        </button>
        <button
          className={`rounded-full px-4 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/60 ${
            activeTab === "requests" ? "bg-black text-white" : "text-neutral-600 hover:text-black"
          }`}
          type="button"
          onClick={() => setActiveTab("requests")}
          role="tab"
          id={leadsTabId}
          aria-selected={activeTab === "requests"}
          aria-controls={leadsId}
        >
          Leads
          <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-[11px] text-inherit">
            {requestCount}
          </span>
        </button>
      </div>
      <div
        id={inventoryId}
        role="tabpanel"
        aria-labelledby={inventoryTabId}
        hidden={activeTab !== "overview"}
        className="mt-4"
      >
        {overviewContent}
      </div>
      <div
        id={leadsId}
        role="tabpanel"
        aria-labelledby={leadsTabId}
        hidden={activeTab !== "requests"}
        className="mt-4"
      >
        {requestContent}
      </div>
    </div>
  );
}
