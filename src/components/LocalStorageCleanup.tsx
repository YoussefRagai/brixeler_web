"use client";

import { useEffect } from "react";

/** Remove a browser-only draft after the server confirms a successful save. */
export function LocalStorageCleanup({ storageKey }: { storageKey: string }) {
  useEffect(() => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Browser storage is optional; successful server writes remain authoritative.
    }
  }, [storageKey]);

  return null;
}
