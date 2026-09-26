import { NavLink, Outlet } from "react-router-dom";
import { ArrowLeftRight, BarChart3, LogOut, Package, ShoppingBasket, Wallet } from "lucide-react";
import { BranchSwitcher } from "@/components/layout/BranchSwitcher";
import { SyncIndicator } from "@/components/layout/SyncIndicator";
import { useAuth } from "@/context/AuthContext";
import { useBranch, type Permission } from "@/context/BranchContext";
import { cn } from "@/lib/utils";

const NAV: ReadonlyArray<{ to: string; label: string; Icon: typeof Package; perm?: Permission }> = [
  { to: "/pos", label: "Sell", Icon: ShoppingBasket, perm: "pos.sell" },
  { to: "/drawer", label: "Drawer", Icon: Wallet, perm: "pos.sell" },
  { to: "/inventory", label: "Stock", Icon: Package },
  { to: "/transfers", label: "Transfers", Icon: ArrowLeftRight },
  { to: "/dashboard", label: "Dashboard", Icon: BarChart3 },
];

export function AppShell() {
  const { signOut } = useAuth();
  const { can, profile } = useBranch();

  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-4 py-2">
        <div className="flex items-center gap-4">
          <span className="text-lg font-extrabold text-ube">HJMD / GMD / DJMD Bakery</span>
          <BranchSwitcher />
        </div>
        <div className="flex items-center gap-4">
          <SyncIndicator />
          <span className="hidden text-sm text-muted md:inline">{profile?.full_name}</span>
          <button
            onClick={() => void signOut()}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-muted hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ube"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
        <nav aria-label="Main" className="flex shrink-0 justify-around border-t border-line bg-white md:w-24 md:flex-col md:justify-start md:gap-1 md:border-r md:border-t-0 md:py-3">
          {NAV.filter((n) => !n.perm || can(n.perm)).map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 px-2 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ube md:mx-2 md:rounded-lg md:py-3",
                  isActive ? "text-ube md:bg-ube-light" : "text-muted hover:text-ink",
                )
              }
            >
              <Icon className="h-6 w-6" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
