import { create } from "zustand";
import { supabase, isNetworkError, toErrorMessage } from "@/lib/supabase";
import { salesQueue } from "@/lib/offlineDb";
import type { Json } from "@/types/database.types";
import type { SalePayload, Transaction } from "@/types/domain";

type SyncState = {
  pending: number;
  failed: number;
  syncing: boolean;
  lastSyncAt: string | null;
  refreshCounts: () => Promise<void>;
  flush: () => Promise<void>;
};

export const useSyncStore = create<SyncState>((set, get) => ({
  pending: 0,
  failed: 0,
  syncing: false,
  lastSyncAt: null,

  async refreshCounts() {
    const all = await salesQueue.all();
    set({
      pending: all.filter((s) => s.state === "pending").length,
      failed: all.filter((s) => s.state === "failed").length,
    });
  },

  /** Push queued offline sales to Supabase, oldest first. Safe to call repeatedly. */
  async flush() {
    if (get().syncing || !navigator.onLine) return;
    set({ syncing: true });
    try {
      const queue = (await salesQueue.pending()).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
      for (const sale of queue) {
        const { error } = await supabase.rpc("process_sale", {
          p_payload: sale.payload as unknown as Json,
        });
        if (!error) {
          await salesQueue.remove(sale.clientId);
          continue;
        }
        const network = isNetworkError(error);
        await salesQueue.markAttempt(sale.clientId, toErrorMessage(error), !network);
        if (network) break; // still offline; try again later
      }
      set({ lastSyncAt: new Date().toISOString() });
    } finally {
      set({ syncing: false });
      await get().refreshCounts();
    }
  },
}));

export type SubmitSaleResult =
  | { status: "synced"; transaction: Transaction }
  | { status: "queued" }
  | { status: "rejected"; message: string };

/**
 * Submit a sale. Online: calls process_sale directly. Offline or on a network
 * failure: stores it in IndexedDB (idempotent client_id) for later sync.
 */
export async function submitSale(payload: SalePayload): Promise<SubmitSaleResult> {
  const store = useSyncStore.getState();

  if (navigator.onLine) {
    const { data, error } = await supabase.rpc("process_sale", {
      p_payload: payload as unknown as Json,
    });
    if (!error && data) return { status: "synced", transaction: data };
    if (error && !isNetworkError(error)) return { status: "rejected", message: toErrorMessage(error) };
  }

  await salesQueue.add({ ...payload, was_offline: true });
  await store.refreshCounts();
  return { status: "queued" };
}
