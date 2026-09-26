import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json } from "@/types/database.types";

const SELECT = `
  *,
  from_branch:branches!stock_transfers_from_branch_id_fkey ( id, name ),
  to_branch:branches!stock_transfers_to_branch_id_fkey ( id, name ),
  items:stock_transfer_items ( id, product_id, qty_requested, qty_dispatched, qty_received,
    product:products ( name, unit ) )
` as const;

export type TransferLineInput = { product_id: string; qty: number };

/** Transfers where the branch is sender or receiver, kept fresh by Realtime. */
export function useTransfers(branchId: string) {
  const qc = useQueryClient();
  const key = ["transfers", branchId] as const;

  const list = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_transfers")
        .select(SELECT)
        .or(`from_branch_id.eq.${branchId},to_branch_id.eq.${branchId}`)
        .order("requested_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const invalidate = () => void qc.invalidateQueries({ queryKey: ["transfers", branchId] });
    const channel = supabase
      .channel(`transfers:${branchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_transfers", filter: `from_branch_id=eq.${branchId}` }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_transfers", filter: `to_branch_id=eq.${branchId}` }, invalidate)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [branchId, qc]);

  const done = () => qc.invalidateQueries({ queryKey: key });

  const request = useMutation({
    mutationFn: async (input: { fromBranchId: string; items: TransferLineInput[]; notes?: string }) => {
      const { data, error } = await supabase.rpc("request_transfer", {
        p_from_branch: input.fromBranchId,
        p_to_branch: branchId,
        p_items: input.items as unknown as Json,
        p_notes: input.notes ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: done,
  });

  const dispatch = useMutation({
    mutationFn: async (input: { transferId: string; items?: TransferLineInput[] }) => {
      const { error } = await supabase.rpc("dispatch_transfer", {
        p_transfer_id: input.transferId,
        p_items: (input.items ?? null) as unknown as Json,
      });
      if (error) throw error;
    },
    onSuccess: done,
  });

  const receive = useMutation({
    mutationFn: async (input: { transferId: string; items?: TransferLineInput[] }) => {
      const { error } = await supabase.rpc("receive_transfer", {
        p_transfer_id: input.transferId,
        p_items: (input.items ?? null) as unknown as Json,
      });
      if (error) throw error;
    },
    onSuccess: done,
  });

  const cancel = useMutation({
    mutationFn: async (transferId: string) => {
      const { error } = await supabase.rpc("cancel_transfer", { p_transfer_id: transferId });
      if (error) throw error;
    },
    onSuccess: done,
  });

  return { transfers: list.data ?? [], loading: list.isLoading, error: list.error, request, dispatch, receive, cancel };
}
