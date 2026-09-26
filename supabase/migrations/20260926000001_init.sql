-- =====================================================================
-- HJMD / GMD / DJMD Bakery Group: Multi-branch Inventory + POS
-- Migration 0001: schema, access helpers, business RPCs, RLS, realtime
-- =====================================================================
-- Design notes
--  * branch_inventory.quantity is NEVER written directly by clients.
--    Every stock change goes through apply_stock_movement(), which also
--    writes an inventory_movements ledger row (audit trail).
--  * Sales are inserted only through process_sale() (idempotent on
--    client_id) so offline-queued checkouts can be retried safely.
--  * RLS reads access from user_branch_roles (source of truth).
--    The optional JWT claims hook at the bottom is for the UI only.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.app_role as enum ('branch_manager', 'cashier', 'baker');
create type public.item_kind as enum ('ingredient', 'finished_good', 'packaging');
create type public.payment_method as enum ('cash', 'gcash', 'qrph', 'card');
create type public.txn_status as enum ('completed', 'voided');
create type public.transfer_status as enum ('requested', 'dispatched', 'received', 'cancelled');
create type public.shift_status as enum ('open', 'closed');
create type public.movement_reason as enum (
  'sale', 'sale_void', 'transfer_out', 'transfer_in',
  'production_consume', 'production_output',
  'adjustment', 'spoilage', 'initial'
);

-- ---------------------------------------------------------------------
-- Utility: updated_at trigger
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Branches
-- ---------------------------------------------------------------------
create table public.branches (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z0-9-]{3,20}$'),
  brand       text not null check (brand in ('HJMD', 'GMD', 'DJMD', 'JMD')),
  name        text not null,
  city        text not null,
  address     text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_branches_updated before update on public.branches
  for each row execute function public.set_updated_at();

-- Per-branch receipt / transfer counters (gap-free per branch)
create table public.branch_counters (
  branch_id    uuid primary key references public.branches(id) on delete cascade,
  receipt_seq  bigint not null default 0,
  transfer_seq bigint not null default 0
);

-- ---------------------------------------------------------------------
-- Profiles + role mapping
-- ---------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  full_name         text not null default '',
  is_super_admin    boolean not null default false,
  default_branch_id uuid references public.branches(id) on delete set null,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- A user can hold a role in one or more branches (e.g. area manager).
create table public.user_branch_roles (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  branch_id  uuid not null references public.branches(id) on delete cascade,
  role       public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, branch_id)
);
create index idx_ubr_branch on public.user_branch_roles(branch_id);

-- Auto-create a profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Access helper functions (SECURITY DEFINER so RLS on the lookup
-- tables does not recurse). Marked STABLE so Postgres caches per query.
-- ---------------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.is_super_admin and p.is_active from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

create or replace function public.has_branch_access(p_branch_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select 1
    from public.user_branch_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = auth.uid() and r.branch_id = p_branch_id and p.is_active
  );
$$;

create or replace function public.has_branch_role(p_branch_id uuid, p_roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select 1
    from public.user_branch_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = auth.uid() and r.branch_id = p_branch_id
      and r.role = any(p_roles) and p.is_active
  );
$$;

create or replace function public.my_branch_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select b.id from public.branches b where public.is_super_admin()
  union
  select r.branch_id from public.user_branch_roles r where r.user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Product catalog (global, shared by all branches)
-- ---------------------------------------------------------------------
create table public.products (
  id          uuid primary key default gen_random_uuid(),
  sku         text not null unique,
  barcode     text unique,
  name        text not null,
  category    text not null default 'Uncategorized',
  kind        public.item_kind not null default 'finished_good',
  unit        text not null default 'pc',          -- pc, kg, g, L, pack, tray
  price       numeric(12,2) not null default 0 check (price >= 0),
  cost        numeric(12,2) not null default 0 check (cost >= 0),
  is_sellable boolean not null default true,
  is_active   boolean not null default true,
  image_url   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_products_name on public.products using gin (to_tsvector('simple', name));
create index idx_products_category on public.products(category);
create trigger trg_products_updated before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Branch inventory (one row per branch x product)
-- ---------------------------------------------------------------------
create table public.branch_inventory (
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references public.branches(id) on delete cascade,
  product_id     uuid not null references public.products(id) on delete cascade,
  quantity       numeric(14,3) not null default 0,  -- may go negative after offline sales; flagged in UI
  reorder_level  numeric(14,3) not null default 0 check (reorder_level >= 0),
  price_override numeric(12,2) check (price_override is null or price_override >= 0),
  updated_at     timestamptz not null default now(),
  unique (branch_id, product_id)
);
create index idx_inv_branch on public.branch_inventory(branch_id);
create trigger trg_inv_updated before update on public.branch_inventory
  for each row execute function public.set_updated_at();

-- Immutable stock ledger
create table public.inventory_movements (
  id          bigserial primary key,
  branch_id   uuid not null references public.branches(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete restrict,
  qty_change  numeric(14,3) not null check (qty_change <> 0),
  qty_after   numeric(14,3) not null,
  reason      public.movement_reason not null,
  ref_table   text,
  ref_id      uuid,
  note        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index idx_mov_branch_time on public.inventory_movements(branch_id, created_at desc);
create index idx_mov_ref on public.inventory_movements(ref_table, ref_id);

-- Core stock mutator. NOT callable by clients (execute revoked below).
create or replace function public.apply_stock_movement(
  p_branch_id  uuid,
  p_product_id uuid,
  p_delta      numeric,
  p_reason     public.movement_reason,
  p_ref_table  text default null,
  p_ref_id     uuid default null,
  p_note       text default null
) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_after numeric;
begin
  if p_delta = 0 then
    return null;
  end if;

  insert into public.branch_inventory as bi (branch_id, product_id, quantity)
  values (p_branch_id, p_product_id, p_delta)
  on conflict (branch_id, product_id)
  do update set quantity = bi.quantity + excluded.quantity
  returning quantity into v_after;

  insert into public.inventory_movements
    (branch_id, product_id, qty_change, qty_after, reason, ref_table, ref_id, note, created_by)
  values
    (p_branch_id, p_product_id, p_delta, v_after, p_reason, p_ref_table, p_ref_id, p_note, auth.uid());

  return v_after;
end $$;

-- ---------------------------------------------------------------------
-- Recipes + production (recipe-to-inventory mapping)
-- ---------------------------------------------------------------------
create table public.recipes (
  id              uuid primary key default gen_random_uuid(),
  output_product_id uuid not null references public.products(id) on delete cascade,
  name            text not null,
  yield_qty       numeric(14,3) not null check (yield_qty > 0),  -- output per 1 batch
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create table public.recipe_items (
  recipe_id     uuid not null references public.recipes(id) on delete cascade,
  ingredient_id uuid not null references public.products(id) on delete restrict,
  quantity      numeric(14,3) not null check (quantity > 0),     -- per 1 batch, in ingredient unit
  primary key (recipe_id, ingredient_id)
);

create table public.production_batches (
  id           uuid primary key default gen_random_uuid(),
  branch_id    uuid not null references public.branches(id) on delete cascade,
  recipe_id    uuid not null references public.recipes(id) on delete restrict,
  batches      numeric(10,2) not null check (batches > 0),
  output_qty   numeric(14,3) not null,
  note         text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index idx_prod_branch_time on public.production_batches(branch_id, created_at desc);

-- Trigger: inserting a production batch consumes ingredients and adds finished goods.
create or replace function public.trg_production_apply()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_output_product uuid;
  v_yield numeric;
begin
  select output_product_id, yield_qty into v_output_product, v_yield
  from public.recipes where id = new.recipe_id and is_active;

  if v_output_product is null then
    raise exception 'Recipe % is missing or inactive', new.recipe_id;
  end if;

  new.output_qty := v_yield * new.batches;

  for r in select ingredient_id, quantity from public.recipe_items where recipe_id = new.recipe_id loop
    perform public.apply_stock_movement(
      new.branch_id, r.ingredient_id, -(r.quantity * new.batches),
      'production_consume', 'production_batches', new.id
    );
  end loop;

  perform public.apply_stock_movement(
    new.branch_id, v_output_product, new.output_qty,
    'production_output', 'production_batches', new.id
  );
  return new;
end $$;

create trigger trg_production_before_insert
  before insert on public.production_batches
  for each row execute function public.trg_production_apply();

-- ---------------------------------------------------------------------
-- Cash drawer shifts (X/Z reports)
-- ---------------------------------------------------------------------
create table public.cash_shifts (
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references public.branches(id) on delete cascade,
  cashier_id     uuid not null references public.profiles(id) on delete restrict,
  status         public.shift_status not null default 'open',
  opening_float  numeric(12,2) not null default 0 check (opening_float >= 0),
  closing_count  numeric(12,2),
  expected_cash  numeric(12,2),
  variance       numeric(12,2),
  z_report       jsonb,
  opened_at      timestamptz not null default now(),
  closed_at      timestamptz
);
-- Only one open drawer per cashier per branch
create unique index uq_open_shift on public.cash_shifts(branch_id, cashier_id) where status = 'open';

create table public.cash_drawer_events (
  id         bigserial primary key,
  shift_id   uuid not null references public.cash_shifts(id) on delete cascade,
  kind       text not null check (kind in ('pay_in', 'pay_out', 'cash_drop')),
  amount     numeric(12,2) not null check (amount > 0),
  note       text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Sales
-- ---------------------------------------------------------------------
create table public.transactions (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null unique,               -- generated on device; idempotency key
  branch_id       uuid not null references public.branches(id) on delete restrict,
  shift_id        uuid references public.cash_shifts(id) on delete set null,
  cashier_id      uuid not null references public.profiles(id) on delete restrict,
  receipt_no      text not null unique,
  subtotal        numeric(12,2) not null check (subtotal >= 0),
  discount_total  numeric(12,2) not null default 0 check (discount_total >= 0),
  total           numeric(12,2) not null check (total >= 0),
  payment_method  public.payment_method not null,
  amount_tendered numeric(12,2) not null check (amount_tendered >= 0),
  change_due      numeric(12,2) not null default 0 check (change_due >= 0),
  payment_ref     text,                               -- GCash / QRPH reference no.
  status          public.txn_status not null default 'completed',
  void_reason     text,
  voided_by       uuid references public.profiles(id) on delete set null,
  was_offline     boolean not null default false,
  sold_at         timestamptz not null,               -- device time of sale
  created_at      timestamptz not null default now()  -- server receive time
);
create index idx_txn_branch_time on public.transactions(branch_id, sold_at desc);
create index idx_txn_shift on public.transactions(shift_id);

create table public.transaction_items (
  id              bigserial primary key,
  transaction_id  uuid not null references public.transactions(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete restrict,
  product_name    text not null,                      -- snapshot for receipts
  quantity        numeric(12,3) not null check (quantity > 0),
  unit_price      numeric(12,2) not null check (unit_price >= 0),
  line_discount   numeric(12,2) not null default 0 check (line_discount >= 0),
  line_total      numeric(12,2) not null check (line_total >= 0)
);
create index idx_txn_items_txn on public.transaction_items(transaction_id);

-- ---------------------------------------------------------------------
-- Inter-branch stock transfers
-- ---------------------------------------------------------------------
create table public.stock_transfers (
  id              uuid primary key default gen_random_uuid(),
  transfer_no     text not null unique,
  from_branch_id  uuid not null references public.branches(id) on delete restrict,
  to_branch_id    uuid not null references public.branches(id) on delete restrict,
  status          public.transfer_status not null default 'requested',
  notes           text,
  requested_by    uuid references public.profiles(id) on delete set null,
  dispatched_by   uuid references public.profiles(id) on delete set null,
  received_by     uuid references public.profiles(id) on delete set null,
  requested_at    timestamptz not null default now(),
  dispatched_at   timestamptz,
  received_at     timestamptz,
  updated_at      timestamptz not null default now(),
  check (from_branch_id <> to_branch_id)
);
create index idx_transfers_from on public.stock_transfers(from_branch_id, status);
create index idx_transfers_to on public.stock_transfers(to_branch_id, status);
create trigger trg_transfers_updated before update on public.stock_transfers
  for each row execute function public.set_updated_at();

create table public.stock_transfer_items (
  id              bigserial primary key,
  transfer_id     uuid not null references public.stock_transfers(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete restrict,
  qty_requested   numeric(14,3) not null check (qty_requested > 0),
  qty_dispatched  numeric(14,3) check (qty_dispatched >= 0),
  qty_received    numeric(14,3) check (qty_received >= 0),
  unique (transfer_id, product_id)
);

-- =====================================================================
-- Business RPCs (called from the app with supabase.rpc)
-- =====================================================================

-- ---- Sale checkout (idempotent) -------------------------------------
-- p_payload shape:
-- {
--   "client_id": uuid, "branch_id": uuid, "shift_id": uuid|null,
--   "payment_method": "cash"|"gcash"|"qrph"|"card",
--   "amount_tendered": number, "payment_ref": text|null,
--   "discount_total": number, "sold_at": timestamptz, "was_offline": bool,
--   "items": [{ "product_id": uuid, "quantity": number,
--               "unit_price": number, "line_discount": number }]
-- }
create or replace function public.process_sale(p_payload jsonb)
returns public.transactions
language plpgsql security definer set search_path = public as $$
declare
  v_existing   public.transactions;
  v_txn        public.transactions;
  v_branch     uuid := (p_payload->>'branch_id')::uuid;
  v_client_id  uuid := (p_payload->>'client_id')::uuid;
  v_item       jsonb;
  v_subtotal   numeric := 0;
  v_discount   numeric := coalesce((p_payload->>'discount_total')::numeric, 0);
  v_total      numeric;
  v_tendered   numeric := coalesce((p_payload->>'amount_tendered')::numeric, 0);
  v_method     public.payment_method := (p_payload->>'payment_method')::public.payment_method;
  v_seq        bigint;
  v_code       text;
  v_line       numeric;
  v_name       text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not public.has_branch_role(v_branch, array['cashier','branch_manager']::public.app_role[]) then
    raise exception 'No POS access to this branch' using errcode = '42501';
  end if;

  -- Idempotency: a retried offline sync returns the original row.
  select * into v_existing from public.transactions where client_id = v_client_id;
  if found then
    return v_existing;
  end if;

  if jsonb_array_length(coalesce(p_payload->'items', '[]'::jsonb)) = 0 then
    raise exception 'Sale has no items';
  end if;

  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    v_subtotal := v_subtotal
      + round((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric, 2)
      - coalesce((v_item->>'line_discount')::numeric, 0);
  end loop;

  v_total := greatest(v_subtotal - v_discount, 0);

  if v_method = 'cash' and v_tendered < v_total then
    raise exception 'Cash tendered (%) is less than total (%)', v_tendered, v_total;
  end if;
  if v_method in ('gcash', 'qrph') and coalesce(p_payload->>'payment_ref', '') = '' then
    raise exception 'Reference number is required for % payments', v_method;
  end if;

  -- Gap-free per-branch receipt number, e.g. HJMD-IBN-000123
  insert into public.branch_counters (branch_id) values (v_branch) on conflict do nothing;
  update public.branch_counters set receipt_seq = receipt_seq + 1
    where branch_id = v_branch returning receipt_seq into v_seq;
  select code into v_code from public.branches where id = v_branch;

  insert into public.transactions (
    client_id, branch_id, shift_id, cashier_id, receipt_no,
    subtotal, discount_total, total, payment_method,
    amount_tendered, change_due, payment_ref, was_offline, sold_at
  ) values (
    v_client_id, v_branch, nullif(p_payload->>'shift_id', '')::uuid, auth.uid(),
    v_code || '-' || lpad(v_seq::text, 6, '0'),
    v_subtotal, v_discount, v_total, v_method,
    case when v_method = 'cash' then v_tendered else v_total end,
    case when v_method = 'cash' then v_tendered - v_total else 0 end,
    nullif(p_payload->>'payment_ref', ''),
    coalesce((p_payload->>'was_offline')::boolean, false),
    coalesce((p_payload->>'sold_at')::timestamptz, now())
  ) returning * into v_txn;

  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    select name into v_name from public.products where id = (v_item->>'product_id')::uuid;
    if v_name is null then
      raise exception 'Unknown product %', v_item->>'product_id';
    end if;
    v_line := round((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric, 2)
              - coalesce((v_item->>'line_discount')::numeric, 0);

    insert into public.transaction_items
      (transaction_id, product_id, product_name, quantity, unit_price, line_discount, line_total)
    values
      (v_txn.id, (v_item->>'product_id')::uuid, v_name, (v_item->>'quantity')::numeric,
       (v_item->>'unit_price')::numeric, coalesce((v_item->>'line_discount')::numeric, 0), v_line);

    perform public.apply_stock_movement(
      v_branch, (v_item->>'product_id')::uuid, -((v_item->>'quantity')::numeric),
      'sale', 'transactions', v_txn.id
    );
  end loop;

  return v_txn;
end $$;

-- ---- Void a sale (manager only) -------------------------------------
create or replace function public.void_sale(p_transaction_id uuid, p_reason text)
returns public.transactions
language plpgsql security definer set search_path = public as $$
declare
  v_txn public.transactions;
  r record;
begin
  select * into v_txn from public.transactions where id = p_transaction_id for update;
  if not found then raise exception 'Sale not found'; end if;
  if not public.has_branch_role(v_txn.branch_id, array['branch_manager']::public.app_role[]) then
    raise exception 'Only a branch manager can void sales' using errcode = '42501';
  end if;
  if v_txn.status = 'voided' then return v_txn; end if;

  for r in select product_id, quantity from public.transaction_items where transaction_id = p_transaction_id loop
    perform public.apply_stock_movement(v_txn.branch_id, r.product_id, r.quantity,
      'sale_void', 'transactions', v_txn.id, p_reason);
  end loop;

  update public.transactions
    set status = 'voided', void_reason = p_reason, voided_by = auth.uid()
    where id = p_transaction_id
    returning * into v_txn;
  return v_txn;
end $$;

-- ---- Manual stock adjustment (manager) ------------------------------
create or replace function public.adjust_stock(
  p_branch_id uuid, p_product_id uuid, p_delta numeric,
  p_reason public.movement_reason, p_note text default null
) returns numeric
language plpgsql security definer set search_path = public as $$
begin
  if p_reason not in ('adjustment', 'spoilage', 'initial') then
    raise exception 'Reason must be adjustment, spoilage, or initial';
  end if;
  if not public.has_branch_role(p_branch_id, array['branch_manager']::public.app_role[]) then
    raise exception 'Only a branch manager can adjust stock' using errcode = '42501';
  end if;
  return public.apply_stock_movement(p_branch_id, p_product_id, p_delta, p_reason, null, null, p_note);
end $$;

-- ---- Production (baker / manager) -----------------------------------
create or replace function public.record_production(
  p_branch_id uuid, p_recipe_id uuid, p_batches numeric, p_note text default null
) returns public.production_batches
language plpgsql security definer set search_path = public as $$
declare v_row public.production_batches;
begin
  if not public.has_branch_role(p_branch_id, array['baker','branch_manager']::public.app_role[]) then
    raise exception 'No production access to this branch' using errcode = '42501';
  end if;
  insert into public.production_batches (branch_id, recipe_id, batches, output_qty, note, created_by)
  values (p_branch_id, p_recipe_id, p_batches, 0, p_note, auth.uid())
  returning * into v_row;   -- output_qty is filled by the BEFORE INSERT trigger
  return v_row;
end $$;

-- ---- Transfers: Request -> Dispatch -> Receive ----------------------
-- p_items: [{ "product_id": uuid, "qty": number }]
create or replace function public.request_transfer(
  p_from_branch uuid, p_to_branch uuid, p_items jsonb, p_notes text default null
) returns public.stock_transfers
language plpgsql security definer set search_path = public as $$
declare
  v_row public.stock_transfers;
  v_seq bigint;
  v_code text;
  v_item jsonb;
begin
  -- The receiving branch requests stock from the source branch.
  if not public.has_branch_role(p_to_branch, array['branch_manager','baker']::public.app_role[]) then
    raise exception 'You can only request stock for your own branch' using errcode = '42501';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'Transfer has no items';
  end if;

  insert into public.branch_counters (branch_id) values (p_to_branch) on conflict do nothing;
  update public.branch_counters set transfer_seq = transfer_seq + 1
    where branch_id = p_to_branch returning transfer_seq into v_seq;
  select code into v_code from public.branches where id = p_to_branch;

  insert into public.stock_transfers (transfer_no, from_branch_id, to_branch_id, notes, requested_by)
  values ('TR-' || v_code || '-' || lpad(v_seq::text, 5, '0'), p_from_branch, p_to_branch, p_notes, auth.uid())
  returning * into v_row;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.stock_transfer_items (transfer_id, product_id, qty_requested)
    values (v_row.id, (v_item->>'product_id')::uuid, (v_item->>'qty')::numeric);
  end loop;
  return v_row;
end $$;

-- p_items (optional): [{ "product_id": uuid, "qty": number }]; defaults to qty_requested
create or replace function public.dispatch_transfer(p_transfer_id uuid, p_items jsonb default null)
returns public.stock_transfers
language plpgsql security definer set search_path = public as $$
declare
  v_row public.stock_transfers;
  r record;
  v_qty numeric;
begin
  select * into v_row from public.stock_transfers where id = p_transfer_id for update;
  if not found then raise exception 'Transfer not found'; end if;
  if v_row.status <> 'requested' then
    raise exception 'Only requested transfers can be dispatched (current: %)', v_row.status;
  end if;
  if not public.has_branch_role(v_row.from_branch_id, array['branch_manager','baker']::public.app_role[]) then
    raise exception 'Only the source branch can dispatch' using errcode = '42501';
  end if;

  for r in select * from public.stock_transfer_items where transfer_id = p_transfer_id loop
    v_qty := coalesce(
      (select (e->>'qty')::numeric from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
        where (e->>'product_id')::uuid = r.product_id limit 1),
      r.qty_requested);
    update public.stock_transfer_items set qty_dispatched = v_qty where id = r.id;
    if v_qty > 0 then
      perform public.apply_stock_movement(v_row.from_branch_id, r.product_id, -v_qty,
        'transfer_out', 'stock_transfers', v_row.id);
    end if;
  end loop;

  update public.stock_transfers
    set status = 'dispatched', dispatched_by = auth.uid(), dispatched_at = now()
    where id = p_transfer_id returning * into v_row;
  return v_row;
end $$;

-- p_items (optional): [{ "product_id": uuid, "qty": number }]; defaults to qty_dispatched
create or replace function public.receive_transfer(p_transfer_id uuid, p_items jsonb default null)
returns public.stock_transfers
language plpgsql security definer set search_path = public as $$
declare
  v_row public.stock_transfers;
  r record;
  v_qty numeric;
begin
  select * into v_row from public.stock_transfers where id = p_transfer_id for update;
  if not found then raise exception 'Transfer not found'; end if;
  if v_row.status <> 'dispatched' then
    raise exception 'Only dispatched transfers can be received (current: %)', v_row.status;
  end if;
  if not public.has_branch_role(v_row.to_branch_id, array['branch_manager','baker','cashier']::public.app_role[]) then
    raise exception 'Only the destination branch can receive' using errcode = '42501';
  end if;

  for r in select * from public.stock_transfer_items where transfer_id = p_transfer_id loop
    v_qty := coalesce(
      (select (e->>'qty')::numeric from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
        where (e->>'product_id')::uuid = r.product_id limit 1),
      r.qty_dispatched, 0);
    update public.stock_transfer_items set qty_received = v_qty where id = r.id;
    if v_qty > 0 then
      perform public.apply_stock_movement(v_row.to_branch_id, r.product_id, v_qty,
        'transfer_in', 'stock_transfers', v_row.id);
    end if;
  end loop;

  update public.stock_transfers
    set status = 'received', received_by = auth.uid(), received_at = now()
    where id = p_transfer_id returning * into v_row;
  return v_row;
end $$;

create or replace function public.cancel_transfer(p_transfer_id uuid)
returns public.stock_transfers
language plpgsql security definer set search_path = public as $$
declare v_row public.stock_transfers;
begin
  select * into v_row from public.stock_transfers where id = p_transfer_id for update;
  if not found then raise exception 'Transfer not found'; end if;
  if v_row.status <> 'requested' then
    raise exception 'Only requested transfers can be cancelled';
  end if;
  if not (public.has_branch_role(v_row.to_branch_id, array['branch_manager']::public.app_role[])
       or public.has_branch_role(v_row.from_branch_id, array['branch_manager']::public.app_role[])) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.stock_transfers set status = 'cancelled' where id = p_transfer_id returning * into v_row;
  return v_row;
end $$;

-- ---- Cash drawer: open / X report / close with Z report -------------
create or replace function public.open_shift(p_branch_id uuid, p_opening_float numeric)
returns public.cash_shifts
language plpgsql security definer set search_path = public as $$
declare v_row public.cash_shifts;
begin
  if not public.has_branch_role(p_branch_id, array['cashier','branch_manager']::public.app_role[]) then
    raise exception 'No POS access to this branch' using errcode = '42501';
  end if;
  insert into public.cash_shifts (branch_id, cashier_id, opening_float)
  values (p_branch_id, auth.uid(), p_opening_float)
  returning * into v_row;
  return v_row;
end $$;

-- X report: running totals for a shift without closing it.
create or replace function public.shift_report(p_shift_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_shift public.cash_shifts;
  v_report jsonb;
begin
  select * into v_shift from public.cash_shifts where id = p_shift_id;
  if not found then raise exception 'Shift not found'; end if;
  if not public.has_branch_access(v_shift.branch_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  with sales as (
    select * from public.transactions where shift_id = p_shift_id
  ), by_method as (
    select payment_method, count(*) as txn_count, coalesce(sum(total), 0) as amount
    from sales where status = 'completed' group by payment_method
  ), drawer as (
    select
      coalesce(sum(amount) filter (where kind = 'pay_in'), 0)    as pay_in,
      coalesce(sum(amount) filter (where kind = 'pay_out'), 0)   as pay_out,
      coalesce(sum(amount) filter (where kind = 'cash_drop'), 0) as cash_drop
    from public.cash_drawer_events where shift_id = p_shift_id
  )
  select jsonb_build_object(
    'shift_id', v_shift.id,
    'branch_id', v_shift.branch_id,
    'cashier_id', v_shift.cashier_id,
    'opened_at', v_shift.opened_at,
    'generated_at', now(),
    'opening_float', v_shift.opening_float,
    'gross_sales', (select coalesce(sum(subtotal), 0) from sales where status = 'completed'),
    'discounts', (select coalesce(sum(discount_total), 0) from sales where status = 'completed'),
    'net_sales', (select coalesce(sum(total), 0) from sales where status = 'completed'),
    'txn_count', (select count(*) from sales where status = 'completed'),
    'void_count', (select count(*) from sales where status = 'voided'),
    'void_amount', (select coalesce(sum(total), 0) from sales where status = 'voided'),
    'by_method', coalesce((select jsonb_agg(to_jsonb(b)) from by_method b), '[]'::jsonb),
    'pay_in', d.pay_in, 'pay_out', d.pay_out, 'cash_drop', d.cash_drop,
    'expected_cash', v_shift.opening_float
        + coalesce((select amount from by_method where payment_method = 'cash'), 0)
        + d.pay_in - d.pay_out - d.cash_drop
  ) into v_report
  from drawer d;

  return v_report;
end $$;

create or replace function public.close_shift(p_shift_id uuid, p_closing_count numeric)
returns public.cash_shifts
language plpgsql security definer set search_path = public as $$
declare
  v_shift public.cash_shifts;
  v_report jsonb;
  v_expected numeric;
begin
  select * into v_shift from public.cash_shifts where id = p_shift_id for update;
  if not found then raise exception 'Shift not found'; end if;
  if v_shift.status = 'closed' then return v_shift; end if;
  if v_shift.cashier_id <> auth.uid()
     and not public.has_branch_role(v_shift.branch_id, array['branch_manager']::public.app_role[]) then
    raise exception 'Only the cashier or a manager can close this drawer' using errcode = '42501';
  end if;

  v_report := public.shift_report(p_shift_id);
  v_expected := (v_report->>'expected_cash')::numeric;

  update public.cash_shifts set
    status = 'closed',
    closing_count = p_closing_count,
    expected_cash = v_expected,
    variance = p_closing_count - v_expected,
    z_report = v_report || jsonb_build_object('closing_count', p_closing_count,
                                              'variance', p_closing_count - v_expected),
    closed_at = now()
  where id = p_shift_id
  returning * into v_shift;
  return v_shift;
end $$;

-- ---- Reporting view for the central dashboard -----------------------
create or replace view public.v_branch_daily_sales
with (security_invoker = true) as
select
  t.branch_id,
  (t.sold_at at time zone 'Asia/Manila')::date as sale_date,
  count(*) filter (where t.status = 'completed')                  as txn_count,
  coalesce(sum(t.total) filter (where t.status = 'completed'), 0) as net_sales,
  coalesce(sum(t.total) filter (where t.status = 'completed' and t.payment_method = 'cash'), 0) as cash_sales,
  coalesce(sum(t.total) filter (where t.status = 'completed' and t.payment_method in ('gcash','qrph')), 0) as ewallet_sales
from public.transactions t
group by 1, 2;

create or replace view public.v_low_stock
with (security_invoker = true) as
select bi.branch_id, bi.product_id, p.name as product_name, p.unit, p.kind,
       bi.quantity, bi.reorder_level
from public.branch_inventory bi
join public.products p on p.id = bi.product_id
where p.is_active and bi.quantity <= bi.reorder_level;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.branches             enable row level security;
alter table public.branch_counters      enable row level security;
alter table public.profiles             enable row level security;
alter table public.user_branch_roles    enable row level security;
alter table public.products             enable row level security;
alter table public.branch_inventory     enable row level security;
alter table public.inventory_movements  enable row level security;
alter table public.recipes              enable row level security;
alter table public.recipe_items         enable row level security;
alter table public.production_batches   enable row level security;
alter table public.cash_shifts          enable row level security;
alter table public.cash_drawer_events   enable row level security;
alter table public.transactions         enable row level security;
alter table public.transaction_items    enable row level security;
alter table public.stock_transfers      enable row level security;
alter table public.stock_transfer_items enable row level security;

-- Branches: everyone signed in sees active branches (needed to pick a
-- transfer source). Only super admins manage them.
create policy branches_select on public.branches for select to authenticated
  using (is_active or public.is_super_admin());
create policy branches_admin_all on public.branches for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- branch_counters: no client policies (RPC only).

-- Profiles: own row, same-branch colleagues, or super admin.
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.is_super_admin()
    or exists (select 1 from public.user_branch_roles r
               where r.user_id = profiles.id and public.has_branch_access(r.branch_id))
  );
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
create policy profiles_admin_all on public.profiles for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
-- Users must not promote themselves: only allow editing safe columns.
-- NOTE: is_super_admin is set via SQL editor or service role (admin tooling), never from the browser.
revoke update on public.profiles from authenticated;
grant update (full_name, default_branch_id) on public.profiles to authenticated;

-- Role mapping: see own rows; managers see their branch staff; admins manage.
create policy ubr_select on public.user_branch_roles for select to authenticated
  using (user_id = auth.uid() or public.has_branch_role(branch_id, array['branch_manager']::public.app_role[]));
create policy ubr_admin_all on public.user_branch_roles for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- Products + recipes: readable by all staff, managed by super admin.
create policy products_select on public.products for select to authenticated using (true);
create policy products_admin_all on public.products for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy recipes_select on public.recipes for select to authenticated using (true);
create policy recipes_admin_all on public.recipes for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy recipe_items_select on public.recipe_items for select to authenticated using (true);
create policy recipe_items_admin_all on public.recipe_items for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- Branch inventory: branch-scoped read. Managers may edit reorder level
-- and price override only (quantity changes go through RPCs).
create policy inv_select on public.branch_inventory for select to authenticated
  using (public.has_branch_access(branch_id));
create policy inv_manager_update on public.branch_inventory for update to authenticated
  using (public.has_branch_role(branch_id, array['branch_manager']::public.app_role[]))
  with check (public.has_branch_role(branch_id, array['branch_manager']::public.app_role[]));
revoke insert, update, delete on public.branch_inventory from authenticated;
grant update (reorder_level, price_override) on public.branch_inventory to authenticated;

-- Ledger: read-only, branch-scoped.
create policy mov_select on public.inventory_movements for select to authenticated
  using (public.has_branch_access(branch_id));
revoke insert, update, delete on public.inventory_movements from authenticated;

-- Production: read branch-scoped; insert via record_production RPC.
create policy prod_select on public.production_batches for select to authenticated
  using (public.has_branch_access(branch_id));
revoke insert, update, delete on public.production_batches from authenticated;

-- Cash shifts: branch-scoped read; writes via RPC. Drawer events can be
-- inserted by the shift owner or a manager.
create policy shifts_select on public.cash_shifts for select to authenticated
  using (public.has_branch_access(branch_id));
revoke insert, update, delete on public.cash_shifts from authenticated;

create policy drawer_select on public.cash_drawer_events for select to authenticated
  using (exists (select 1 from public.cash_shifts s where s.id = shift_id and public.has_branch_access(s.branch_id)));
create policy drawer_insert on public.cash_drawer_events for insert to authenticated
  with check (exists (
    select 1 from public.cash_shifts s
    where s.id = shift_id and s.status = 'open'
      and (s.cashier_id = auth.uid()
           or public.has_branch_role(s.branch_id, array['branch_manager']::public.app_role[]))
  ));

-- Sales: branch-scoped read. Inserts / voids only via RPC.
create policy txn_select on public.transactions for select to authenticated
  using (public.has_branch_access(branch_id));
revoke insert, update, delete on public.transactions from authenticated;

create policy txn_items_select on public.transaction_items for select to authenticated
  using (exists (select 1 from public.transactions t
                 where t.id = transaction_id and public.has_branch_access(t.branch_id)));
revoke insert, update, delete on public.transaction_items from authenticated;

-- Transfers: visible to both source and destination branch.
create policy transfers_select on public.stock_transfers for select to authenticated
  using (public.has_branch_access(from_branch_id) or public.has_branch_access(to_branch_id));
revoke insert, update, delete on public.stock_transfers from authenticated;

create policy transfer_items_select on public.stock_transfer_items for select to authenticated
  using (exists (select 1 from public.stock_transfers s
                 where s.id = transfer_id
                   and (public.has_branch_access(s.from_branch_id) or public.has_branch_access(s.to_branch_id))));
revoke insert, update, delete on public.stock_transfer_items from authenticated;

-- ---------------------------------------------------------------------
-- Function privileges: internal helpers are not callable from the API.
-- ---------------------------------------------------------------------
revoke execute on function public.apply_stock_movement(uuid, uuid, numeric, public.movement_reason, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.trg_production_apply() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.process_sale(jsonb) from public, anon;
revoke execute on function public.void_sale(uuid, text) from public, anon;
revoke execute on function public.adjust_stock(uuid, uuid, numeric, public.movement_reason, text) from public, anon;
revoke execute on function public.record_production(uuid, uuid, numeric, text) from public, anon;
revoke execute on function public.request_transfer(uuid, uuid, jsonb, text) from public, anon;
revoke execute on function public.dispatch_transfer(uuid, jsonb) from public, anon;
revoke execute on function public.receive_transfer(uuid, jsonb) from public, anon;
revoke execute on function public.cancel_transfer(uuid) from public, anon;
revoke execute on function public.open_shift(uuid, numeric) from public, anon;
revoke execute on function public.shift_report(uuid) from public, anon;
revoke execute on function public.close_shift(uuid, numeric) from public, anon;

grant execute on function public.process_sale(jsonb) to authenticated;
grant execute on function public.void_sale(uuid, text) to authenticated;
grant execute on function public.adjust_stock(uuid, uuid, numeric, public.movement_reason, text) to authenticated;
grant execute on function public.record_production(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.request_transfer(uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.dispatch_transfer(uuid, jsonb) to authenticated;
grant execute on function public.receive_transfer(uuid, jsonb) to authenticated;
grant execute on function public.cancel_transfer(uuid) to authenticated;
grant execute on function public.open_shift(uuid, numeric) to authenticated;
grant execute on function public.shift_report(uuid) to authenticated;
grant execute on function public.close_shift(uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- Realtime: stream stock and transfer changes (RLS still applies).
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.branch_inventory;
alter publication supabase_realtime add table public.stock_transfers;
alter publication supabase_realtime add table public.transactions;

-- ---------------------------------------------------------------------
-- OPTIONAL: Custom Access Token Hook (adds claims to the JWT for the UI).
-- Enable in Dashboard > Authentication > Hooks > Custom Access Token,
-- pointing at public.custom_access_token_hook. RLS does not rely on it.
-- ---------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $$
declare
  v_claims jsonb := coalesce(event->'claims', '{}'::jsonb);
  v_uid uuid := (event->>'user_id')::uuid;
  v_admin boolean;
  v_roles jsonb;
begin
  select is_super_admin into v_admin from public.profiles where id = v_uid;
  select coalesce(jsonb_agg(jsonb_build_object('branch_id', branch_id, 'role', role)), '[]'::jsonb)
    into v_roles from public.user_branch_roles where user_id = v_uid;

  v_claims := jsonb_set(v_claims, '{app_metadata}', coalesce(v_claims->'app_metadata', '{}'::jsonb));
  v_claims := jsonb_set(v_claims, '{app_metadata,is_super_admin}', to_jsonb(coalesce(v_admin, false)));
  v_claims := jsonb_set(v_claims, '{app_metadata,branch_roles}', v_roles);
  return jsonb_set(event, '{claims}', v_claims);
end $$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on public.profiles, public.user_branch_roles to supabase_auth_admin;
create policy auth_admin_read_profiles on public.profiles for select to supabase_auth_admin using (true);
create policy auth_admin_read_roles on public.user_branch_roles for select to supabase_auth_admin using (true);
