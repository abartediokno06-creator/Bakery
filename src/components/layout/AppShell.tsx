import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ArrowLeftRight,
  BarChart3,
  CakeSlice,
  ClipboardList,
  Ellipsis,
  LogOut,
  Package,
  ReceiptText,
  ShoppingBasket,
  Tags,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { BranchSwitcher } from "@/components/layout/BranchSwitcher";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { LowStockBell } from "@/components/layout/LowStockBell";
import { SyncIndicator } from "@/components/layout/SyncIndicator";
import { useAuth } from "@/context/AuthContext";
import { useBranch, type Permission } from "@/context/BranchContext";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; Icon: LucideIcon; perm?: Permission };

const NAV: ReadonlyArray<NavItem> = [
  { to: "/pos", label: "Sell", Icon: ShoppingBasket, perm: "pos.sell" },
  { to: "/sales", label: "Sales", Icon: ReceiptText },
  { to: "/orders", label: "Orders", Icon: CakeSlice, perm: "orders.manage" },
  { to: "/drawer", label: "Drawer", Icon: Wallet, perm: "pos.sell" },
  { to: "/inventory", label: "Stock", Icon: Package },
  { to: "/transfers", label: "Transfers", Icon: ArrowLeftRight },
  { to: "/dashboard", label: "Dashboard", Icon: BarChart3 },
  { to: "/reports", label: "Reports", Icon: ClipboardList, perm: "reports.view" },
  { to: "/products", label: "Products", Icon: Tags, perm: "catalog.manage" },
  { to: "/staff", label: "Staff", Icon: Users, perm: "staff.manage" },
];

/** Phones show this many items in the bottom bar; the rest go under "More". */
const PHONE_SLOTS = 4;

const itemClass = (isActive: boolean) =>
  cn(
    "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:flex-none md:py-2.5 md:text-sm",
    isActive ? "bg-brand text-white" : "text-muted hover:bg-brand-light hover:text-brand-dark",
  );

export function AppShell() {
  const { t } = useT();
  const { signOut } = useAuth();
  const { can, profile, isSuperAdmin } = useBranch();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const allowed = NAV.filter((n) => !n.perm || can(n.perm));
  // The owner mostly monitors, so their home (Dashboard) comes first.
  const items = isSuperAdmin
    ? [...allowed.filter((n) => n.to === "/dashboard"), ...allowed.filter((n) => n.to !== "/dashboard")]
    : allowed;
  const needsMore = items.length > PHONE_SLOTS + 1;
  const extra = needsMore ? items.slice(PHONE_SLOTS) : [];
  const extraActive = extra.some((n) => pathname.startsWith(n.to));

  // Close the phone menu after navigating.
  useEffect(() => setMoreOpen(false), [pathname]);

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Logo has a white background, so it sits on a small white badge against the green bar. */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-brand px-3 py-2 text-white shadow-md sm:px-4">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <img
            src="/logo-mark.png"
            alt="GMD Bakery"
            width={40}
            height={44}
            className="h-11 w-auto shrink-0 rounded-md bg-white p-0.5"
          />
          <BranchSwitcher />
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3">
          <SyncIndicator />
          <LowStockBell />
          <LanguageToggle onDark />
          <span className="hidden text-sm font-semibold text-white/85 lg:inline">{profile?.full_name}</span>
          <button
            onClick={() => void signOut()}
            aria-label={t("Sign out")}
            className="flex h-10 items-center gap-1.5 rounded-xl px-2 text-sm font-bold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:px-3"
          >
            <LogOut className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">{t("Sign out")}</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
        <nav
          aria-label="Main"
          className="flex shrink-0 justify-around gap-1 border-t border-line bg-white p-1 md:w-28 md:flex-col md:justify-start md:gap-1.5 md:overflow-y-auto md:border-r md:border-t-0 md:px-2 md:py-3"
        >
          {items.map(({ to, label, Icon }, i) => (
            <NavLink
              key={to}
              to={to}
              // Items past the phone slots only show on wider screens.
              className={({ isActive }) => cn(itemClass(isActive), needsMore && i >= PHONE_SLOTS && "hidden md:flex")}
            >
              <Icon className="h-6 w-6" aria-hidden />
              {t(label)}
            </NavLink>
          ))}
          {needsMore && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={cn(itemClass(extraActive), "md:hidden")}
            >
              <Ellipsis className="h-6 w-6" aria-hidden />
              {t("More")}
            </button>
          )}
        </nav>
        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      {moreOpen && <MoreSheet items={extra} onClose={() => setMoreOpen(false)} />}
    </div>
  );
}

/** Phone-only sheet with the menu items that don't fit in the bottom bar. */
function MoreSheet({ items, onClose }: { items: ReadonlyArray<NavItem>; onClose: () => void }) {
  const { t } = useT();
  const firstRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label={t("More")}>
      <button type="button" aria-label={t("Close")} onClick={onClose} className="absolute inset-0 h-full w-full bg-ink/40" />
      <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line" aria-hidden />
        <div className="grid grid-cols-3 gap-2">
          {items.map(({ to, label, Icon }, i) => (
            <NavLink key={to} to={to} ref={i === 0 ? firstRef : undefined} className={({ isActive }) => cn(itemClass(isActive), "py-4")}>
              <Icon className="h-6 w-6" aria-hidden />
              {t(label)}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}
