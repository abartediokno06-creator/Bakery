# HJMD / GMD / DJMD Bakery Group: Inventory + POS

Multi-branch inventory and point of sale for 10 bakery branches.
React 18 + TypeScript (strict) + Vite + Tailwind + TanStack Query + Zustand + Supabase.

## Quick start (local)

```bash
npm install
npx supabase start                 # needs Docker Desktop
npx supabase db reset              # runs migrations/ + seed.sql (10 branches, sample catalog)
cp .env.example .env.local         # paste the API URL + anon key printed by `supabase start`
npm run db:types                   # regenerate src/types/database.types.ts from the real DB
npm run dev                        # http://localhost:5173
```

Create users in Studio (http://127.0.0.1:54323 > Authentication > Add user), then run
`supabase/bootstrap_users.sql` in the SQL editor to make an owner and assign branch roles.

## Folder map

```
supabase/
  migrations/20260926000001_init.sql   schema, RLS, triggers, RPCs, realtime, JWT hook
  seed.sql                             10 branches, products, pandesal recipe, opening stock
  bootstrap_users.sql                  make owner / assign managers and cashiers
src/
  lib/supabase.ts                      typed Supabase client
  lib/offlineDb.ts                     IndexedDB: offline sales queue + stock snapshot
  types/database.types.ts              Database type (regenerate with npm run db:types)
  types/domain.ts                      app-level types (CartLine, SalePayload, ShiftReport)
  context/BranchContext.tsx            branch switcher context + role permissions
  hooks/useBranchInventory.ts          realtime stock per branch, offline fallback
  hooks/useOfflineSync.ts              auto-upload queued sales on reconnect
  hooks/useShift.ts                    open drawer, X report, close with Z report
  hooks/useTransfers.ts                request > dispatch > receive
  stores/syncStore.ts                  submitSale(): online RPC or offline queue
  stores/cartStore.ts                  cart state
  components/pos/checkoutMath.ts       pure totals/discount/change math
  components/pos/POSCheckout.tsx       checkout panel (strict props)
  components/pos/ProductGrid.tsx       touch grid + barcode scan (Enter key)
  pages/                               POS, Drawer, Stock, Transfers, Dashboard, Login
docs/ROADMAP.md                        phased plan to production
```

## How security works

| Rule | Where it is enforced |
| --- | --- |
| Cashier/manager only sees own branch rows | RLS using `has_branch_access(branch_id)` |
| Super admin sees all 10 branches | `profiles.is_super_admin` checked inside every helper |
| Stock quantity can't be edited from the browser | `revoke update` on `branch_inventory`; only RPCs change stock |
| Every stock change is audited | `apply_stock_movement()` writes `inventory_movements` |
| Sales can't be forged or duplicated | `process_sale()` recomputes totals; `client_id` is unique (safe retries) |
| Users can't make themselves admin | column-level grant on `profiles` (only `full_name`, `default_branch_id`) |

Roles live in `user_branch_roles` (one user can manage several branches).
The optional `custom_access_token_hook` copies them into the JWT for the UI; RLS never trusts the JWT copy.

## Offline flow

1. Stock list is saved to IndexedDB every time it loads.
2. If the internet drops, `submitSale()` stores the sale in IndexedDB with its `client_id`.
3. `useOfflineSync` retries on reconnect, on tab focus, and every 30 s.
4. `process_sale` is idempotent, so a sale that reached the server before the drop is never counted twice.
5. Sales the server rejects (not network errors) are flagged "need review" in the top bar.

Stock may go negative after offline sales; it shows as "Out" in red and managers correct it with a count adjustment.

## Tested

The migration, seed, and a scripted scenario (sale, idempotent retry, cross-branch block,
direct stock edit block, X/Z report, transfer workflow, production deduction, self-promotion block)
were run against PostgreSQL 16. `tsc --noEmit` and `vite build` pass.
