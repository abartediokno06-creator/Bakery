import { create } from "zustand";
import type { CartLine } from "@/types/domain";

type CartState = {
  lines: CartLine[];
  add: (line: Omit<CartLine, "quantity" | "lineDiscount">, qty?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
};

export const useCartStore = create<CartState>((set) => ({
  lines: [],
  add: (line, qty = 1) =>
    set((s) => {
      const existing = s.lines.find((l) => l.productId === line.productId);
      if (existing) {
        return {
          lines: s.lines.map((l) =>
            l.productId === line.productId ? { ...l, quantity: l.quantity + qty } : l,
          ),
        };
      }
      return { lines: [...s.lines, { ...line, quantity: qty, lineDiscount: 0 }] };
    }),
  setQuantity: (productId, quantity) =>
    set((s) => ({
      lines:
        quantity <= 0
          ? s.lines.filter((l) => l.productId !== productId)
          : s.lines.map((l) => (l.productId === productId ? { ...l, quantity } : l)),
    })),
  remove: (productId) => set((s) => ({ lines: s.lines.filter((l) => l.productId !== productId) })),
  clear: () => set({ lines: [] }),
}));
