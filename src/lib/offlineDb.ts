import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { InventoryItem, SalePayload } from "@/types/domain";

export type QueuedSale = {
  clientId: string;
  payload: SalePayload;
  queuedAt: string;
  attempts: number;
  lastError: string | null;
  /** 'failed' means the server rejected it (not a network issue); a manager must review it. */
  state: "pending" | "failed";
};

interface PosDB extends DBSchema {
  sales_queue: {
    key: string;
    value: QueuedSale;
    indexes: { by_state: QueuedSale["state"] };
  };
  inventory_cache: {
    key: string; // branch_id
    value: { branchId: string; items: InventoryItem[]; cachedAt: string };
  };
}

let dbPromise: Promise<IDBPDatabase<PosDB>> | null = null;

function db(): Promise<IDBPDatabase<PosDB>> {
  dbPromise ??= openDB<PosDB>("bakery-pos", 1, {
    upgrade(database) {
      const q = database.createObjectStore("sales_queue", { keyPath: "clientId" });
      q.createIndex("by_state", "state");
      database.createObjectStore("inventory_cache", { keyPath: "branchId" });
    },
  });
  return dbPromise;
}

export const salesQueue = {
  async add(payload: SalePayload): Promise<void> {
    await (await db()).put("sales_queue", {
      clientId: payload.client_id,
      payload,
      queuedAt: new Date().toISOString(),
      attempts: 0,
      lastError: null,
      state: "pending",
    });
  },
  async pending(): Promise<QueuedSale[]> {
    return (await db()).getAllFromIndex("sales_queue", "by_state", "pending");
  },
  async all(): Promise<QueuedSale[]> {
    return (await db()).getAll("sales_queue");
  },
  async remove(clientId: string): Promise<void> {
    await (await db()).delete("sales_queue", clientId);
  },
  async markAttempt(clientId: string, error: string, permanent: boolean): Promise<void> {
    const d = await db();
    const row = await d.get("sales_queue", clientId);
    if (!row) return;
    await d.put("sales_queue", {
      ...row,
      attempts: row.attempts + 1,
      lastError: error,
      state: permanent ? "failed" : "pending",
    });
  },
};

export const inventoryCache = {
  async save(branchId: string, items: InventoryItem[]): Promise<void> {
    await (await db()).put("inventory_cache", { branchId, items, cachedAt: new Date().toISOString() });
  },
  async load(branchId: string): Promise<InventoryItem[] | null> {
    return (await (await db()).get("inventory_cache", branchId))?.items ?? null;
  },
};
