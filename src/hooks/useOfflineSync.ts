import { useEffect } from "react";
import { useSyncStore } from "@/stores/syncStore";

const RETRY_MS = 30_000;

/** Mount once near the app root. Flushes the offline sales queue on reconnect and on an interval. */
export function useOfflineSync(): void {
  const flush = useSyncStore((s) => s.flush);
  const refreshCounts = useSyncStore((s) => s.refreshCounts);

  useEffect(() => {
    void refreshCounts();
    void flush();

    const onOnline = () => void flush();
    const onVisible = () => {
      if (document.visibilityState === "visible") void flush();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => void flush(), RETRY_MS);

    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [flush, refreshCounts]);
}
