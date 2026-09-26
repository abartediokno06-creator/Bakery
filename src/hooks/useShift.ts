import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import type { CashShift, ShiftReport } from "@/types/domain";

const shiftKey = (branchId: string, userId: string) => ["open-shift", branchId, userId] as const;

/** The signed-in cashier's open drawer in this branch, plus open/close/X-report actions. */
export function useShift(branchId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = shiftKey(branchId, user?.id ?? "");

  const shift = useQuery({
    queryKey: key,
    enabled: Boolean(user),
    queryFn: async (): Promise<CashShift | null> => {
      const { data, error } = await supabase
        .from("cash_shifts")
        .select("*")
        .eq("branch_id", branchId)
        .eq("cashier_id", user!.id)
        .eq("status", "open")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const open = useMutation({
    mutationFn: async (openingFloat: number) => {
      const { data, error } = await supabase.rpc("open_shift", {
        p_branch_id: branchId,
        p_opening_float: openingFloat,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const close = useMutation({
    mutationFn: async ({ shiftId, closingCount }: { shiftId: string; closingCount: number }) => {
      const { data, error } = await supabase.rpc("close_shift", {
        p_shift_id: shiftId,
        p_closing_count: closingCount,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const xReport = async (shiftId: string): Promise<ShiftReport> => {
    const { data, error } = await supabase.rpc("shift_report", { p_shift_id: shiftId });
    if (error) throw error;
    return data as unknown as ShiftReport;
  };

  return { shift: shift.data ?? null, loading: shift.isLoading, open, close, xReport };
}
