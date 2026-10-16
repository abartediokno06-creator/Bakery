-- =====================================================================
-- Migration 0002: owner tools and day-to-day POS features
--   * stock rows for new products/branches, product photo storage
--   * staff accounts managed from the app (owner only)
--   * cash drawer status for the dashboard
--   * end-of-day leftovers, reports, Senior/PWD discount log
--   * special orders (cakes, bulk orders) with deposits
-- =====================================================================

-- ---------------------------------------------------------------------
-- New products / branches get a stock row everywhere (quantity 0), so a
-- product added from the app shows up on the Sell and Stock screens.
-- ---------------------------------------------------------------------
create or replace function public.trg_product_stock_rows()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.branch_inventory (branch_id, product_id, quantity)
  select b.id, new.id, 0 from public.branches b
  on conflict (branch_id, product_id) do nothing;
  return new;
end $$;

create trigger trg_products_stock_rows after insert on public.products
  for each row execute function public.trg_product_stock_rows();

create or replace function public.trg_branch_stock_rows()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.branch_inventory (branch_id, product_id, quantity)
  select new.id, p.id, 0 from public.products p
  on conflict (branch_id, product_id) do nothing;
  insert into public.branch_counters (branch_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger trg_branches_stock_rows after insert on public.branches
  for each row execute function public.trg_branch_stock_rows();

-- ---------------------------------------------------------------------
-- Product photos: public bucket, only the owner uploads.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy product_images_read on storage.objects for select
  using (bucket_id = 'product-images');
create policy product_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_super_admin());
create policy product_images_update on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_super_admin());
create policy product_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_super_admin());

-- ---------------------------------------------------------------------
-- Staff accounts (owner only). Auth users are created in SQL so the
-- owner can add staff from the app; the service role key never reaches
-- the browser.
-- ---------------------------------------------------------------------

-- Replaces a user's branch roles. p_roles: [{ "branch_id": uuid, "role": app_role }]
create or replace function public._set_staff_roles(p_user_id uuid, p_roles jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_first uuid := nullif(coalesce(p_roles, '[]'::jsonb)->0->>'branch_id', '')::uuid;
begin
  delete from public.user_branch_roles where user_id = p_user_id;
  insert into public.user_branch_roles (user_id, branch_id, role)
  select p_user_id, (e->>'branch_id')::uuid, (e->>'role')::public.app_role
  from jsonb_array_elements(coalesce(p_roles, '[]'::jsonb)) e;

  -- Keep the default branch valid: it must be one of the assigned branches.
  update public.profiles p set default_branch_id = v_first
  where p.id = p_user_id
    and (p.default_branch_id is null
         or not exists (select 1 from public.user_branch_roles r
                        where r.user_id = p_user_id and r.branch_id = p.default_branch_id));
end $$;

create or replace function public.admin_list_staff()
returns table (
  id uuid, email text, full_name text, is_active boolean, is_super_admin boolean,
  default_branch_id uuid, last_sign_in_at timestamptz, created_at timestamptz, roles jsonb
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner can manage staff' using errcode = '42501';
  end if;
  return query
  select p.id, u.email::text, p.full_name, p.is_active, p.is_super_admin, p.default_branch_id,
         u.last_sign_in_at, p.created_at,
         coalesce((select jsonb_agg(jsonb_build_object('branch_id', r.branch_id, 'role', r.role) order by r.created_at)
                   from public.user_branch_roles r where r.user_id = p.id), '[]'::jsonb)
  from public.profiles p
  join auth.users u on u.id = p.id
  order by p.is_super_admin desc, p.is_active desc, p.full_name;
end $$;

create or replace function public.admin_create_staff(
  p_email text, p_password text, p_full_name text, p_roles jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id    uuid := gen_random_uuid();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name  text := trim(coalesce(p_full_name, ''));
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner can add staff' using errcode = '42501';
  end if;
  if v_name = '' then raise exception 'Enter the staff member''s name'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if jsonb_array_length(coalesce(p_roles, '[]'::jsonb)) = 0 then
    raise exception 'Choose at least one branch';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'That email is already used by another account';
  end if;

  -- Same shape as users created by the Auth admin API (confirmed email).
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', v_name),
    now(), now(), '', '', '', ''
  );
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  values (v_id::text, v_id,
          jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
          'email', now(), now());

  -- handle_new_user() already made the profile; set the exact name and roles.
  update public.profiles set full_name = v_name where id = v_id;
  perform public._set_staff_roles(v_id, p_roles);
  return v_id;
end $$;

create or replace function public.admin_update_staff(p_user_id uuid, p_full_name text, p_roles jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner can manage staff' using errcode = '42501';
  end if;
  if trim(coalesce(p_full_name, '')) = '' then raise exception 'Enter the staff member''s name'; end if;
  update public.profiles set full_name = trim(p_full_name) where id = p_user_id;
  if not found then raise exception 'Staff account not found'; end if;
  -- The owner sees every branch already; branch roles only apply to staff.
  if not (select is_super_admin from public.profiles where id = p_user_id) then
    if jsonb_array_length(coalesce(p_roles, '[]'::jsonb)) = 0 then
      raise exception 'Choose at least one branch';
    end if;
    perform public._set_staff_roles(p_user_id, p_roles);
  end if;
end $$;

create or replace function public.admin_set_password(p_user_id uuid, p_password text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner can reset passwords' using errcode = '42501';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  update auth.users
    set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)), updated_at = now()
    where id = p_user_id;
  if not found then raise exception 'Staff account not found'; end if;
end $$;

-- Turning an account off blocks data access at once (RLS checks is_active)
-- and blocks new sign-ins (banned_until).
create or replace function public.admin_set_staff_active(p_user_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner can manage staff' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() and not p_active then
    raise exception 'You cannot turn off your own account';
  end if;
  update public.profiles set is_active = p_active where id = p_user_id;
  if not found then raise exception 'Staff account not found'; end if;
  update auth.users
    set banned_until = case when p_active then null else '2999-12-31'::timestamptz end, updated_at = now()
    where id = p_user_id;
end $$;

-- ---------------------------------------------------------------------
-- Cash drawer status (open drawers with the cash that should be inside).
-- Same expected-cash formula as shift_report().
-- ---------------------------------------------------------------------
create or replace view public.v_open_drawers
with (security_invoker = true) as
select
  s.id as shift_id,
  s.branch_id,
  s.cashier_id,
  p.full_name as cashier_name,
  s.opened_at,
  s.opening_float,
  coalesce(t.txn_count, 0) as txn_count,
  coalesce(t.cash_sales, 0) as cash_sales,
  s.opening_float + coalesce(t.cash_sales, 0)
    + coalesce(d.pay_in, 0) - coalesce(d.pay_out, 0) - coalesce(d.cash_drop, 0) as expected_cash
from public.cash_shifts s
left join public.profiles p on p.id = s.cashier_id
left join lateral (
  select count(*) filter (where x.status = 'completed') as txn_count,
         sum(x.total) filter (where x.status = 'completed' and x.payment_method = 'cash') as cash_sales
  from public.transactions x where x.shift_id = s.id
) t on true
left join lateral (
  select sum(e.amount) filter (where e.kind = 'pay_in') as pay_in,
         sum(e.amount) filter (where e.kind = 'pay_out') as pay_out,
         sum(e.amount) filter (where e.kind = 'cash_drop') as cash_drop
  from public.cash_drawer_events e where e.shift_id = s.id
) d on true
where s.status = 'open';

-- ---------------------------------------------------------------------
-- End-of-day leftovers: unsold goods that will not be sold tomorrow are
-- removed from stock as spoilage (feeds the waste report).
-- p_items: [{ "product_id": uuid, "qty": number }]
-- ---------------------------------------------------------------------
create or replace function public.record_leftovers(p_branch_id uuid, p_items jsonb, p_note text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_item  jsonb;
  v_qty   numeric;
  v_count integer := 0;
begin
  if not public.has_branch_role(p_branch_id, array['cashier','branch_manager']::public.app_role[]) then
    raise exception 'No access to this branch' using errcode = '42501';
  end if;
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_qty := (v_item->>'qty')::numeric;
    if v_qty is null or v_qty < 0 then
      raise exception 'Leftover quantity must be zero or more';
    end if;
    if v_qty > 0 then
      perform public.apply_stock_movement(
        p_branch_id, (v_item->>'product_id')::uuid, -v_qty, 'spoilage', null, null,
        coalesce(nullif(trim(p_note), ''), 'End-of-day leftovers'));
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- Reports. SECURITY INVOKER: RLS limits every row to the caller's branches.
-- p_branch_ids null = every branch the caller can see.
-- ---------------------------------------------------------------------
create or replace function public.report_best_sellers(p_branch_ids uuid[], p_from timestamptz, p_to timestamptz)
returns table (product_id uuid, product_name text, qty numeric, revenue numeric)
language sql stable security invoker set search_path = public as $$
  select ti.product_id, max(ti.product_name), sum(ti.quantity), sum(ti.line_total)
  from public.transaction_items ti
  join public.transactions t on t.id = ti.transaction_id
  where t.status = 'completed' and t.sold_at >= p_from and t.sold_at < p_to
    and (p_branch_ids is null or t.branch_id = any(p_branch_ids))
  group by ti.product_id
  order by 3 desc, 4 desc;
$$;

create or replace function public.report_sales_by_hour(p_branch_ids uuid[], p_from timestamptz, p_to timestamptz)
returns table (hour integer, txn_count bigint, net_sales numeric)
language sql stable security invoker set search_path = public as $$
  select extract(hour from t.sold_at at time zone 'Asia/Manila')::integer, count(*), sum(t.total)
  from public.transactions t
  where t.status = 'completed' and t.sold_at >= p_from and t.sold_at < p_to
    and (p_branch_ids is null or t.branch_id = any(p_branch_ids))
  group by 1
  order by 1;
$$;

create or replace function public.report_waste(p_branch_ids uuid[], p_from timestamptz, p_to timestamptz)
returns table (product_id uuid, product_name text, unit text, sold_qty numeric, wasted_qty numeric)
language sql stable security invoker set search_path = public as $$
  with sold as (
    select ti.product_id, sum(ti.quantity) as qty
    from public.transaction_items ti
    join public.transactions t on t.id = ti.transaction_id
    where t.status = 'completed' and t.sold_at >= p_from and t.sold_at < p_to
      and (p_branch_ids is null or t.branch_id = any(p_branch_ids))
    group by ti.product_id
  ), wasted as (
    select m.product_id, sum(-m.qty_change) as qty
    from public.inventory_movements m
    where m.reason = 'spoilage' and m.created_at >= p_from and m.created_at < p_to
      and (p_branch_ids is null or m.branch_id = any(p_branch_ids))
    group by m.product_id
  )
  select p.id, p.name, p.unit, coalesce(s.qty, 0), coalesce(w.qty, 0)
  from public.products p
  left join sold s on s.product_id = p.id
  left join wasted w on w.product_id = p.id
  where p.kind = 'finished_good' and (s.qty is not null or w.qty is not null)
  order by coalesce(w.qty, 0) desc, p.name;
$$;

-- ---------------------------------------------------------------------
-- Senior citizen / PWD discount log (name + ID number per sale, for BIR).
-- Written only by process_sale().
-- ---------------------------------------------------------------------
create table public.discount_logs (
  id              bigserial primary key,
  transaction_id  uuid not null references public.transactions(id) on delete cascade,
  branch_id       uuid not null references public.branches(id) on delete restrict,
  discount_type   text not null check (discount_type in ('senior', 'pwd')),
  customer_name   text not null,
  id_number       text not null,
  discount_amount numeric(12,2) not null check (discount_amount >= 0),
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index idx_discount_logs_branch_time on public.discount_logs(branch_id, created_at desc);
create index idx_discount_logs_txn on public.discount_logs(transaction_id);

-- process_sale(): unchanged except for the optional "discount_log" field:
--   "discount_log": { "type": "senior"|"pwd", "customer_name": text, "id_number": text } | null
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
  v_log        jsonb := p_payload->'discount_log';
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

  if v_log is not null and jsonb_typeof(v_log) = 'object' then
    if coalesce(v_log->>'type', '') not in ('senior', 'pwd') then
      raise exception 'Unknown discount type';
    end if;
    if trim(coalesce(v_log->>'customer_name', '')) = '' or trim(coalesce(v_log->>'id_number', '')) = '' then
      raise exception 'Senior/PWD discount needs the customer name and ID number';
    end if;
  else
    v_log := null;
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

  if v_log is not null then
    insert into public.discount_logs
      (transaction_id, branch_id, discount_type, customer_name, id_number, discount_amount, created_by)
    values
      (v_txn.id, v_branch, v_log->>'type', trim(v_log->>'customer_name'), trim(v_log->>'id_number'),
       v_discount, auth.uid());
  end if;

  return v_txn;
end $$;

-- ---------------------------------------------------------------------
-- Special orders (cakes, bulk pandesal) with deposits. Cash payments go
-- into the taker's open drawer as a pay-in so the drawer still balances.
-- ---------------------------------------------------------------------
alter table public.branch_counters add column if not exists order_seq bigint not null default 0;

create type public.order_status as enum ('pending', 'ready', 'picked_up', 'cancelled');

create table public.special_orders (
  id              uuid primary key default gen_random_uuid(),
  order_no        text not null unique,
  branch_id       uuid not null references public.branches(id) on delete restrict,
  customer_name   text not null,
  customer_phone  text,
  items           text not null,
  total           numeric(12,2) not null check (total >= 0),
  pickup_at       timestamptz not null,
  status          public.order_status not null default 'pending',
  notes           text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_orders_branch_pickup on public.special_orders(branch_id, pickup_at);
create trigger trg_orders_updated before update on public.special_orders
  for each row execute function public.set_updated_at();

create table public.special_order_payments (
  id              bigserial primary key,
  order_id        uuid not null references public.special_orders(id) on delete cascade,
  amount          numeric(12,2) not null check (amount > 0),
  method          public.payment_method not null,
  payment_ref     text,
  drawer_event_id bigint references public.cash_drawer_events(id) on delete set null,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index idx_order_payments_order on public.special_order_payments(order_id);

create or replace view public.v_special_orders
with (security_invoker = true) as
select o.*, coalesce(pay.paid, 0) as paid, o.total - coalesce(pay.paid, 0) as balance
from public.special_orders o
left join lateral (
  select sum(sp.amount) as paid from public.special_order_payments sp where sp.order_id = o.id
) pay on true;

-- Internal: records a payment; cash also becomes a pay-in on the caller's open drawer.
create or replace function public._order_payment(
  p_order public.special_orders, p_amount numeric, p_method public.payment_method, p_ref text
) returns public.special_order_payments
language plpgsql security definer set search_path = public as $$
declare
  v_shift uuid;
  v_event bigint;
  v_paid  numeric;
  v_row   public.special_order_payments;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment must be more than zero';
  end if;
  if p_method in ('gcash', 'qrph') and trim(coalesce(p_ref, '')) = '' then
    raise exception 'Reference number is required for % payments', p_method;
  end if;
  select coalesce(sum(amount), 0) into v_paid from public.special_order_payments where order_id = p_order.id;
  if v_paid + p_amount > p_order.total then
    raise exception 'Payment is more than the balance of %', p_order.total - v_paid;
  end if;

  if p_method = 'cash' then
    select id into v_shift from public.cash_shifts
    where branch_id = p_order.branch_id and cashier_id = auth.uid() and status = 'open';
    if v_shift is not null then
      insert into public.cash_drawer_events (shift_id, kind, amount, note, created_by)
      values (v_shift, 'pay_in', p_amount, 'Special order ' || p_order.order_no, auth.uid())
      returning id into v_event;
    end if;
  end if;

  insert into public.special_order_payments (order_id, amount, method, payment_ref, drawer_event_id, created_by)
  values (p_order.id, p_amount, p_method, nullif(trim(p_ref), ''), v_event, auth.uid())
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.create_special_order(
  p_branch_id uuid, p_customer_name text, p_customer_phone text, p_items text,
  p_total numeric, p_pickup_at timestamptz, p_notes text default null,
  p_deposit numeric default 0, p_deposit_method public.payment_method default 'cash',
  p_deposit_ref text default null
) returns public.special_orders
language plpgsql security definer set search_path = public as $$
declare
  v_row  public.special_orders;
  v_seq  bigint;
  v_code text;
begin
  if not public.has_branch_role(p_branch_id, array['cashier','branch_manager']::public.app_role[]) then
    raise exception 'No access to this branch' using errcode = '42501';
  end if;
  if trim(coalesce(p_customer_name, '')) = '' then raise exception 'Enter the customer name'; end if;
  if trim(coalesce(p_items, '')) = '' then raise exception 'Write what the customer ordered'; end if;
  if p_total is null or p_total <= 0 then raise exception 'Enter the order price'; end if;
  if p_pickup_at is null then raise exception 'Choose the pickup date and time'; end if;
  if coalesce(p_deposit, 0) > p_total then raise exception 'Deposit cannot be more than the order price'; end if;

  insert into public.branch_counters (branch_id) values (p_branch_id) on conflict do nothing;
  update public.branch_counters set order_seq = order_seq + 1
    where branch_id = p_branch_id returning order_seq into v_seq;
  select code into v_code from public.branches where id = p_branch_id;

  insert into public.special_orders
    (order_no, branch_id, customer_name, customer_phone, items, total, pickup_at, notes, created_by)
  values
    ('SO-' || v_code || '-' || lpad(v_seq::text, 4, '0'), p_branch_id, trim(p_customer_name),
     nullif(trim(p_customer_phone), ''), trim(p_items), p_total, p_pickup_at, nullif(trim(p_notes), ''), auth.uid())
  returning * into v_row;

  if coalesce(p_deposit, 0) > 0 then
    perform public._order_payment(v_row, p_deposit, p_deposit_method, p_deposit_ref);
  end if;
  return v_row;
end $$;

create or replace function public.pay_special_order(
  p_order_id uuid, p_amount numeric, p_method public.payment_method, p_ref text default null
) returns public.special_order_payments
language plpgsql security definer set search_path = public as $$
declare v_order public.special_orders;
begin
  select * into v_order from public.special_orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if not public.has_branch_role(v_order.branch_id, array['cashier','branch_manager']::public.app_role[]) then
    raise exception 'No access to this branch' using errcode = '42501';
  end if;
  if v_order.status = 'cancelled' then raise exception 'This order was cancelled'; end if;
  return public._order_payment(v_order, p_amount, p_method, p_ref);
end $$;

create or replace function public.set_special_order_status(p_order_id uuid, p_status public.order_status)
returns public.special_orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.special_orders;
  v_paid  numeric;
begin
  select * into v_order from public.special_orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if not public.has_branch_role(v_order.branch_id, array['cashier','branch_manager']::public.app_role[]) then
    raise exception 'No access to this branch' using errcode = '42501';
  end if;
  if v_order.status in ('picked_up', 'cancelled') then
    raise exception 'This order is already closed';
  end if;
  if p_status = 'picked_up' then
    select coalesce(sum(amount), 0) into v_paid from public.special_order_payments where order_id = p_order_id;
    if v_paid < v_order.total then
      raise exception 'Collect the balance of % before marking it picked up', v_order.total - v_paid;
    end if;
  end if;
  update public.special_orders set status = p_status where id = p_order_id returning * into v_order;
  return v_order;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security for the new tables (read branch-scoped, write via RPC)
-- ---------------------------------------------------------------------
alter table public.discount_logs          enable row level security;
alter table public.special_orders         enable row level security;
alter table public.special_order_payments enable row level security;

create policy discount_logs_select on public.discount_logs for select to authenticated
  using (public.has_branch_access(branch_id));
revoke insert, update, delete on public.discount_logs from authenticated;

create policy orders_select on public.special_orders for select to authenticated
  using (public.has_branch_access(branch_id));
revoke insert, update, delete on public.special_orders from authenticated;

create policy order_payments_select on public.special_order_payments for select to authenticated
  using (exists (select 1 from public.special_orders o
                 where o.id = order_id and public.has_branch_access(o.branch_id)));
revoke insert, update, delete on public.special_order_payments from authenticated;

-- ---------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------
revoke execute on function public.trg_product_stock_rows() from public, anon, authenticated;
revoke execute on function public.trg_branch_stock_rows() from public, anon, authenticated;
revoke execute on function public._set_staff_roles(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public._order_payment(public.special_orders, numeric, public.payment_method, text) from public, anon, authenticated;

revoke execute on function public.admin_list_staff() from public, anon;
revoke execute on function public.admin_create_staff(text, text, text, jsonb) from public, anon;
revoke execute on function public.admin_update_staff(uuid, text, jsonb) from public, anon;
revoke execute on function public.admin_set_password(uuid, text) from public, anon;
revoke execute on function public.admin_set_staff_active(uuid, boolean) from public, anon;
revoke execute on function public.record_leftovers(uuid, jsonb, text) from public, anon;
revoke execute on function public.report_best_sellers(uuid[], timestamptz, timestamptz) from public, anon;
revoke execute on function public.report_sales_by_hour(uuid[], timestamptz, timestamptz) from public, anon;
revoke execute on function public.report_waste(uuid[], timestamptz, timestamptz) from public, anon;
revoke execute on function public.create_special_order(uuid, text, text, text, numeric, timestamptz, text, numeric, public.payment_method, text) from public, anon;
revoke execute on function public.pay_special_order(uuid, numeric, public.payment_method, text) from public, anon;
revoke execute on function public.set_special_order_status(uuid, public.order_status) from public, anon;

grant execute on function public.admin_list_staff() to authenticated;
grant execute on function public.admin_create_staff(text, text, text, jsonb) to authenticated;
grant execute on function public.admin_update_staff(uuid, text, jsonb) to authenticated;
grant execute on function public.admin_set_password(uuid, text) to authenticated;
grant execute on function public.admin_set_staff_active(uuid, boolean) to authenticated;
grant execute on function public.record_leftovers(uuid, jsonb, text) to authenticated;
grant execute on function public.report_best_sellers(uuid[], timestamptz, timestamptz) to authenticated;
grant execute on function public.report_sales_by_hour(uuid[], timestamptz, timestamptz) to authenticated;
grant execute on function public.report_waste(uuid[], timestamptz, timestamptz) to authenticated;
grant execute on function public.create_special_order(uuid, text, text, text, numeric, timestamptz, text, numeric, public.payment_method, text) to authenticated;
grant execute on function public.pay_special_order(uuid, numeric, public.payment_method, text) to authenticated;
grant execute on function public.set_special_order_status(uuid, public.order_status) to authenticated;
