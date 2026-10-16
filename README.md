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

Create the first owner in Studio (http://127.0.0.1:54323 > Authentication > Add user), then run
`supabase/bootstrap_users.sql` in the SQL editor to make them the owner. After that, the owner adds
all other staff from the **Staff** screen in the app.

## Screens and who sees them

| Screen | Who | What it does |
| --- | --- | --- |
| Sell | cashier, manager, owner | tap products, Pay, change to give, print receipt; Senior/PWD discount asks for name + ID |
| Sales | everyone (own branches) | a day's sales, items per sale, reprint receipt; managers and owner can void |
| Orders | cashier, manager, owner | special orders (cakes, bulk) with deposits, balance, pickup date |
| Drawer | cashier, manager, owner | open/close drawer, pay-in/out, X and Z reports, link to end-of-day leftovers |
| Stock | everyone | stock per branch; managers adjust stock and record bakes |
| End of day | cashier, manager, owner | unsold goods removed as spoilage (feeds the waste report) |
| Transfers | everyone | request > dispatch > receive between branches |
| Dashboard | everyone (owner lands here) | today's sales per branch, open drawers with expected cash, pickups due |
| Reports | manager, owner | best sellers, sales by hour, waste %, cashier over/short, stock history, transfers, Senior/PWD log, special orders (CSV export) |
| Products | owner | add/edit products, photos, per-branch prices and reorder levels |
| Staff | owner | add staff, assign branches and roles, reset passwords, turn accounts off |

The header has a low-stock bell and an English/Tagalog switch (cashier screens are translated).

## Folder map

```
supabase/
  migrations/20260926000001_init.sql          schema, RLS, triggers, RPCs, realtime, JWT hook
  migrations/20260927000001_pos_features.sql  staff admin, drawer status, leftovers, reports,
                                              Senior/PWD log, special orders, product photos
  seed.sql                                    10 branches, products, pandesal recipe, opening stock
  bootstrap_users.sql                         make the first owner
src/
  lib/supabase.ts                      typed Supabase client
  lib/offlineDb.ts                     IndexedDB: offline sales queue + stock snapshot
  lib/i18n.tsx                         English / Tagalog text for cashier screens
  lib/printReceipt.ts                  58 mm thermal receipt printing
  lib/dates.ts, lib/csv.ts             Manila-time date ranges, CSV export
  types/database.types.ts              Database type (hand-kept; regenerate with npm run db:types)
  types/domain.ts                      app-level types (CartLine, SalePayload, ShiftReport)
  context/BranchContext.tsx            branch switcher context + role permissions
  hooks/useBranchInventory.ts          realtime stock per branch, offline fallback
  hooks/useOfflineSync.ts              auto-upload queued sales on reconnect
  hooks/useShift.ts                    open drawer, X report, close with Z report
  hooks/useTransfers.ts                request > dispatch > receive
  stores/syncStore.ts                  submitSale(): online RPC or offline queue
  stores/cartStore.ts                  cart state
  components/layout/                   app shell, branch switcher, low-stock bell, language switch
  components/pos/checkoutMath.ts       pure totals/discount/change math
  components/pos/POSCheckout.tsx       order totals + payment step
  components/pos/ProductGrid.tsx       touch grid + barcode scan (Enter key)
  pages/                               one file per screen in the table above
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
| Only the owner manages staff | `admin_*` functions check `is_super_admin()`; accounts are created in SQL, so the service role key never reaches the browser |
| Turned-off staff are locked out | `admin_set_staff_active` clears `is_active` (RLS) and bans sign-in |
| Senior/PWD log can't be edited | `discount_logs` is written only inside `process_sale()` |
| Only the owner uploads product photos | storage policy on the `product-images` bucket |

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

Migration 0002 was tested inside a rolled-back transaction on the hosted project (Senior/PWD sale,
void, leftovers, reports, special-order rules, staff create/update/password/turn-off, and cashier
permission blocks), and staff accounts created by `admin_create_staff` were confirmed to sign in
through Supabase Auth.
