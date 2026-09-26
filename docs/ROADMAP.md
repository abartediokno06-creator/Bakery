# Implementation Roadmap

## Phase 0: Setup (Day 1 to 2)
1. Install Node 20+, Docker Desktop, and the Supabase CLI (`npm i -D supabase` is already in package.json).
2. `npm install`, `npx supabase init` (skip if `supabase/config.toml` exists), `npx supabase start`.
3. `npx supabase db reset` to apply the migration and seed.
4. Copy `.env.example` to `.env.local`, add the local URL and anon key.
5. `npm run db:types`, then `npm run dev`.

Exit check: you can sign in, pick a branch, and see seeded products.

## Phase 1: Data and security (Week 1)
1. Replace sample products in `seed.sql` with the real catalog, prices, and barcodes.
2. Enter real recipes (`recipes`, `recipe_items`) per product with yield per batch.
3. Create staff accounts; run `bootstrap_users.sql` with real emails.
4. RLS test matrix: log in as a cashier of each brand and confirm only that branch is visible.
5. Decide on the Lipa branch brand code: the brief lists it as "JMD"; change to HJMD in `seed.sql` if that was a typo.

Exit check: owner sees 10 branches; a cashier sees 1; stock edits only work through the app screens.

## Phase 2: POS pilot (Week 2 to 3)
1. Pilot at one branch (suggest JMD Lipa, near the main office).
2. Test barcode scanners (USB HID mode, suffix = Enter).
3. Test offline: turn off Wi-Fi, make 5 sales, turn it on, confirm they upload with the right receipt numbers.
4. Run the drawer daily: open float, X report mid-day, Z report at close. Compare with the manual count sheet for a week.
5. Add receipt printing (58 mm thermal via browser print CSS or a local print bridge).

Exit check: one full week of Z reports within an agreed variance.

## Phase 3: Inventory and transfers (Week 3 to 4)
1. Opening stock count per branch using "Count correction".
2. Bakers record bakes; confirm ingredients drop by the recipe amounts.
3. Run real inter-branch transfers (e.g. Lipa commissary to Ibaan) through Request > Dispatch > Receive.
4. Set reorder levels per branch so low-stock alerts are meaningful.

## Phase 4: Rollout (Week 5 to 6)
1. Roll out brand by brand: HJMD (Ibaan, Bolbok, Malvar, Rosario), then GMD (San Jose 1 and 2), then DJMD (Batangas, Taal, Tagaytay).
2. One-page cashier guide in Tagalog/English; 30-minute training per branch.
3. Owner dashboard live on the main office PC and phone.

## Phase 5: Production deployment
1. Create the hosted Supabase project (Singapore region, closest to PH).
2. `npx supabase link --project-ref <ref>` then `npx supabase db push`.
3. Run seed data once in the SQL editor (do not run `seed.sql` against production blindly).
4. Auth settings: disable public sign-ups; invite staff by email only.
5. Optional: enable the Custom Access Token hook (`public.custom_access_token_hook`).
6. Deploy the frontend to Vercel or Netlify: build `npm run build`, output `dist`, set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_FACEBOOK_PAGE_URL`. Add an SPA rewrite to `/index.html`.
7. Turn on daily backups (Pro plan) or schedule `pg_dump`.
8. Add a PWA service worker (vite-plugin-pwa) so the POS loads with no internet at all, not just stays working after load.

## Phase 6: After launch
- Senior/PWD discount log (ID number, name) for BIR compliance; VAT handling if registered.
- Reports: sales by product, waste %, transfer history, cashier variance trend.
- Supplier purchase orders feeding ingredient stock.
- Scheduled low-stock alerts to Messenger or email via Edge Functions.
