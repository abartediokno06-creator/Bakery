import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import type { AppRole, Branch, BranchAccess, Profile } from "@/types/domain";

/**
 * Permissions the UI checks. RLS and the RPCs enforce the same rules on the
 * server; this map only decides what to show.
 */
export type Permission =
  | "pos.sell"
  | "pos.void"
  | "inventory.adjust"
  | "production.record"
  | "transfer.request"
  | "transfer.dispatch"
  | "transfer.receive"
  | "reports.global";

const ROLE_PERMISSIONS: Record<AppRole | "super_admin", readonly Permission[]> = {
  super_admin: [
    "pos.sell", "pos.void", "inventory.adjust", "production.record",
    "transfer.request", "transfer.dispatch", "transfer.receive", "reports.global",
  ],
  branch_manager: [
    "pos.sell", "pos.void", "inventory.adjust", "production.record",
    "transfer.request", "transfer.dispatch", "transfer.receive",
  ],
  cashier: ["pos.sell", "transfer.receive"],
  baker: ["production.record", "transfer.request", "transfer.dispatch", "transfer.receive"],
};

type BranchContextValue = {
  profile: Profile | null;
  isSuperAdmin: boolean;
  /** Every branch this user may open. Super admins get all active branches. */
  branches: BranchAccess[];
  /** Branch the user is working in. `null` = "All branches" (super admin dashboard only). */
  activeBranch: Branch | null;
  activeRole: AppRole | "super_admin" | null;
  setActiveBranchId: (branchId: string | null) => void;
  can: (permission: Permission, branchId?: string) => boolean;
  loading: boolean;
  error: string | null;
};

const BranchContext = createContext<BranchContextValue | null>(null);
const STORAGE_KEY = "bakery-pos-active-branch";
const ACCESS_CACHE_KEY = "bakery-pos-branch-access";

type AccessPayload = { profile: Profile; branches: BranchAccess[] };

async function fetchAccess(userId: string): Promise<AccessPayload> {
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (pErr) throw pErr;

  if (profile.is_super_admin) {
    const { data, error } = await supabase
      .from("branches")
      .select("*")
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    return { profile, branches: data.map((branch) => ({ branch, role: "super_admin" as const })) };
  }

  const { data, error } = await supabase
    .from("user_branch_roles")
    .select("role, branch:branches(*)")
    .eq("user_id", userId);
  if (error) throw error;

  const branches: BranchAccess[] = data
    .filter((r): r is typeof r & { branch: Branch } => r.branch !== null && r.branch.is_active)
    .map((r) => ({ branch: r.branch, role: r.role }))
    .sort((a, b) => a.branch.name.localeCompare(b.branch.name));

  return { profile, branches };
}

export function BranchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["branch-access", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const result = await fetchAccess(user!.id);
      localStorage.setItem(ACCESS_CACHE_KEY, JSON.stringify(result));
      return result;
    },
    // Offline start: fall back to the last known access list.
    initialData: () => {
      const raw = localStorage.getItem(ACCESS_CACHE_KEY);
      if (!raw) return undefined;
      const cached = JSON.parse(raw) as AccessPayload;
      return cached.profile.id === user?.id ? cached : undefined;
    },
    staleTime: 5 * 60_000,
  });

  const profile = query.data?.profile ?? null;
  const branches = useMemo(() => query.data?.branches ?? [], [query.data]);
  const isSuperAdmin = profile?.is_super_admin ?? false;

  const [activeBranchId, setActiveBranchIdState] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY),
  );

  // Keep the selection valid: fall back to default branch, then first branch.
  useEffect(() => {
    if (branches.length === 0) return;
    const valid = activeBranchId && branches.some((b) => b.branch.id === activeBranchId);
    if (valid) return;
    if (activeBranchId === null && isSuperAdmin) return; // "All branches"
    const fallback =
      branches.find((b) => b.branch.id === profile?.default_branch_id) ?? branches[0];
    setActiveBranchIdState(fallback?.branch.id ?? null);
  }, [branches, activeBranchId, isSuperAdmin, profile?.default_branch_id]);

  const setActiveBranchId = useCallback(
    (branchId: string | null) => {
      if (branchId === null && !isSuperAdmin) return;
      setActiveBranchIdState(branchId);
      if (branchId) localStorage.setItem(STORAGE_KEY, branchId);
      else localStorage.removeItem(STORAGE_KEY);
    },
    [isSuperAdmin],
  );

  const active = branches.find((b) => b.branch.id === activeBranchId) ?? null;

  const can = useCallback(
    (permission: Permission, branchId?: string) => {
      if (isSuperAdmin) return true;
      const target = branchId ?? activeBranchId;
      const access = branches.find((b) => b.branch.id === target);
      return access ? ROLE_PERMISSIONS[access.role].includes(permission) : false;
    },
    [branches, activeBranchId, isSuperAdmin],
  );

  const value = useMemo<BranchContextValue>(
    () => ({
      profile,
      isSuperAdmin,
      branches,
      activeBranch: active?.branch ?? null,
      activeRole: active?.role ?? (isSuperAdmin ? "super_admin" : null),
      setActiveBranchId,
      can,
      loading: query.isLoading,
      error: query.error ? String(query.error) : null,
    }),
    [profile, isSuperAdmin, branches, active, setActiveBranchId, can, query.isLoading, query.error],
  );

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch(): BranchContextValue {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch must be used inside <BranchProvider>");
  return ctx;
}

/** For screens that require a concrete branch (POS, stock). */
export function useRequiredBranch(): Branch {
  const { activeBranch } = useBranch();
  if (!activeBranch) throw new Error("Select a branch first");
  return activeBranch;
}
