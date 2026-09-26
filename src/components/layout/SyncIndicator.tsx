import { CloudOff, RefreshCw, TriangleAlert, Wifi } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useSyncStore } from "@/stores/syncStore";

export function SyncIndicator() {
  const online = useOnlineStatus();
  const { pending, failed, syncing, flush } = useSyncStore();

  if (failed > 0) {
    return (
      <span className="flex items-center gap-1 text-sm font-semibold text-danger" role="status">
        <TriangleAlert className="h-4 w-4" aria-hidden /> {failed} sale(s) need review
      </span>
    );
  }
  if (!online) {
    return (
      <span className="flex items-center gap-1 text-sm font-semibold text-amber" role="status">
        <CloudOff className="h-4 w-4" aria-hidden /> Offline{pending > 0 && `, ${pending} sale(s) saved on this device`}
      </span>
    );
  }
  if (pending > 0) {
    return (
      <button onClick={() => void flush()} className="flex items-center gap-1 text-sm font-semibold text-ube-dark">
        <RefreshCw className={syncing ? "h-4 w-4 animate-spin motion-reduce:animate-none" : "h-4 w-4"} aria-hidden />
        Uploading {pending} sale(s)
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1 text-sm text-muted" role="status">
      <Wifi className="h-4 w-4" aria-hidden /> Online
    </span>
  );
}
