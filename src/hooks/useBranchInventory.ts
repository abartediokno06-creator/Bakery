import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { inventoryCache } from "@/lib/offlineDb";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import type { BranchInventoryRow, InventoryItem } from "@/types/domain";
import type { Enums } from "@/types/database.types";

export type RealtimeState = "connecting" | "live" | "offline" | "error";

export type UseBranchInventoryOptions = {
  /** Only return these item kinds (e.g. POS shows finished goods only). */
  kinds?: ReadonlyArray<Enums<"item_kind">>;
  /** Only return products flagged sellable. */
  sellableOnly?: boolean;
};

export type UseBranchInventoryResult = {
  items: InventoryItem[];
  byProductId: ReadonlyMap<string, InventoryItem>;
  lowStock: InventoryItem[];
  isLoading: boolean;
  error: string | null;
  /** True when the list came from the IndexedDB snapshot, not the server. */
  fromCache: boolean;
  realtime: RealtimeState;
  refetch: () => void;
  /** Optimistically change stock locally (used after an offline sale). */
  applyLocalDelta: (productId: string, delta: number) => void;
};

const SELECT = `
  id, branch_id, product_id, quantity, reorder_level, price_override, updated_at,
  product:products!inner ( id, sku, barcode, name, category, kind, unit, price, is_sellable, is_active, image_url )
` as const;

export const inventoryKey = (branchId: string) => ["branch-inventory", branchId] as const;

type CachedResult = { items: InventoryItem[]; fromCache: boolean };

/**
 * Live stock for one branch.
 *  1. Loads branch_inventory joined with products (RLS limits rows to the user's branches).
 *  2. Saves a snapshot to IndexedDB so the POS still works when the internet drops.
 *  3. Subscribes to Supabase Realtime and patches the cache on every UPDATE/INSERT/DELETE.
 */
export function useBranchInventory(
  branchId: string | null | undefined,
  options: UseBranchInventoryOptions = {},
): UseBranchInventoryResult {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [realtime, setRealtime] = useState<RealtimeState>("connecting");

  const query = useQuery<CachedResult>({
    queryKey: inventoryKey(branchId ?? "none"),
    enabled: Boolean(branchId),
    networkMode: "always", // run the queryFn offline so it can fall back to IndexedDB
    queryFn: async () => {
      const id = branchId!;
      try {
        if (!navigator.onLine) throw new TypeError("offline");
        const { data, error } = await supabase
          .from("branch_inventory")
          .select(SELECT)
          .eq("branch_id", id)
          .eq("product.is_active", true)
          .order("name", { referencedTable: "products" });
        if (error) throw error;
        const items = data as unknown as InventoryItem[];
        void inventoryCache.save(id, items);
        return { items, fromCache: false };
      } catch (err) {
        const cached = await inventoryCache.load(id);
        if (cached) return { items: cached, fromCache: true };
        throw err;
      }
    },
    staleTime: 60_000,
  });

  // ---- Realtime subscription ---------------------------------------
  useEffect(() => {
    if (!branchId || !online) {
      setRealtime(online ? "connecting" : "offline");
      return;
    }
    const key = inventoryKey(branchId);

    const handle = (payload: RealtimePostgresChangesPayload<BranchInventoryRow>) => {
      if (payload.eventType === "DELETE") {
        const oldId = (payload.old as Partial<BranchInventoryRow>).id;
        queryClient.setQueryData<CachedResult>(key, (prev) =>
          prev ? { ...prev, items: prev.items.filter((i) => i.id !== oldId) } : prev,
        );
        return;
      }
      const row = payload.new;
      let found = false;
      queryClient.setQueryData<CachedResult>(key, (prev) => {
        if (!prev) return prev;
        const items = prev.items.map((i) => {
          if (i.id !== row.id) return i;
          found = true;
          return { ...i, ...row, product: i.product };
        });
        return { ...prev, items };
      });
      // New product row: we need the joined product, so refetch once.
      if (!found) void queryClient.invalidateQueries({ queryKey: key });
    };

    const channel = supabase
      .channel(`inventory:${branchId}`)
      .on<BranchInventoryRow>(
        "postgres_changes",
        { event: "*", schema: "public", table: "branch_inventory", filter: `branch_id=eq.${branchId}` },
        handle,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtime("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setRealtime("error");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [branchId, online, queryClient]);

  // Refresh from server when the connection comes back.
  useEffect(() => {
    if (online && branchId) void queryClient.invalidateQueries({ queryKey: inventoryKey(branchId) });
  }, [online, branchId, queryClient]);

  const applyLocalDelta = useCallback(
    (productId: string, delta: number) => {
      if (!branchId) return;
      queryClient.setQueryData<CachedResult>(inventoryKey(branchId), (prev) => {
        if (!prev) return prev;
        const items = prev.items.map((i) =>
          i.product_id === productId ? { ...i, quantity: i.quantity + delta } : i,
        );
        void inventoryCache.save(branchId, items);
        return { ...prev, items };
      });
    },
    [branchId, queryClient],
  );

  const { kinds, sellableOnly } = options;
  const kindsKey = kinds?.join(",") ?? "";

  const items = useMemo(() => {
    const all = query.data?.items ?? [];
    return all.filter(
      (i) =>
        (!kindsKey || kindsKey.split(",").includes(i.product.kind)) &&
        (!sellableOnly || i.product.is_sellable),
    );
  }, [query.data, kindsKey, sellableOnly]);

  const byProductId = useMemo(() => new Map(items.map((i) => [i.product_id, i])), [items]);
  const lowStock = useMemo(() => items.filter((i) => i.quantity <= i.reorder_level), [items]);

  return {
    items,
    byProductId,
    lowStock,
    isLoading: query.isLoading,
    error: query.error ? String(query.error) : null,
    fromCache: query.data?.fromCache ?? false,
    realtime: online ? realtime : "offline",
    refetch: () => void query.refetch(),
    applyLocalDelta,
  };
}
