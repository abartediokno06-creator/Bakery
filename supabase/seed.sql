-- Seed data: 10 branches, sample catalog, sample recipe.
-- Runs automatically on `supabase db reset` (local only).

insert into public.branches (code, brand, name, city) values
  ('HJMD-IBN',  'HJMD', 'HJMD - Ibaan Branch',            'Ibaan'),
  ('HJMD-BLB',  'HJMD', 'HJMD - Bolbok Branch',           'Batangas City'),
  ('HJMD-MLV',  'HJMD', 'HJMD - Malvar Branch',           'Malvar'),
  ('JMD-LPA',   'JMD',  'JMD - Lipa Branch',              'Lipa City'),
  ('GMD-SJ1',   'GMD',  'GMD - San Jose Branch (Branch 1)','San Jose'),
  ('GMD-SJ2',   'GMD',  'GMD - San Jose Branch (Branch 2)','San Jose'),
  ('DJMD-BTG',  'DJMD', 'DJMD - Batangas Branch',         'Batangas City'),
  ('DJMD-TAL',  'DJMD', 'DJMD - Taal Branch',             'Taal'),
  ('DJMD-TGY',  'DJMD', 'DJMD - Tagaytay Branch',         'Tagaytay'),
  ('HJMD-RSR',  'HJMD', 'HJMD - Rosario Branch',          'Rosario');

insert into public.branch_counters (branch_id) select id from public.branches;

-- Finished goods
insert into public.products (sku, barcode, name, category, kind, unit, price, cost) values
  ('BRD-PANDESAL',   '4800001000011', 'Pandesal',            'Bread',   'finished_good', 'pc',   3.00,  1.40),
  ('BRD-SPANISH',    '4800001000028', 'Spanish Bread',       'Bread',   'finished_good', 'pc',   8.00,  3.50),
  ('BRD-ENSAYMADA',  '4800001000035', 'Ensaymada',           'Bread',   'finished_good', 'pc',  15.00,  6.50),
  ('BRD-UBECHEESE',  '4800001000042', 'Ube Cheese Pandesal', 'Bread',   'finished_good', 'pc',  12.00,  5.00),
  ('BRD-MONAY',      '4800001000059', 'Monay',               'Bread',   'finished_good', 'pc',   6.00,  2.50),
  ('BRD-PANDECOCO',  '4800001000066', 'Pan de Coco',         'Bread',   'finished_good', 'pc',   8.00,  3.20),
  ('BRD-LOAF',       '4800001000073', 'Tasty Loaf',          'Loaf',    'finished_good', 'pc',  65.00, 32.00),
  ('CAK-MAMON',      '4800001000080', 'Mamon',               'Cakes',   'finished_good', 'pc',  18.00,  7.50),
  ('CAK-UBEROLL',    '4800001000097', 'Ube Roll',            'Cakes',   'finished_good', 'pc', 180.00, 85.00),
  ('PST-HOPIA',      '4800001000103', 'Hopia Munggo',        'Pastry',  'finished_good', 'pack',45.00, 20.00),
  ('DRK-COFFEE',     '4800001000110', 'Brewed Coffee',       'Drinks',  'finished_good', 'cup', 35.00, 10.00);

-- Ingredients (not sellable)
insert into public.products (sku, name, category, kind, unit, price, cost, is_sellable) values
  ('ING-FLOUR',  'Bread Flour',   'Ingredients', 'ingredient', 'kg', 0, 52.00, false),
  ('ING-SUGAR',  'White Sugar',   'Ingredients', 'ingredient', 'kg', 0, 70.00, false),
  ('ING-YEAST',  'Instant Yeast', 'Ingredients', 'ingredient', 'kg', 0, 380.00, false),
  ('ING-BUTTER', 'Butter',        'Ingredients', 'ingredient', 'kg', 0, 420.00, false),
  ('ING-CRUMBS', 'Bread Crumbs',  'Ingredients', 'ingredient', 'kg', 0, 60.00, false),
  ('ING-SALT',   'Salt',          'Ingredients', 'ingredient', 'kg', 0, 25.00, false),
  ('PKG-BAG',    'Paper Bag (S)', 'Packaging',   'packaging',  'pc', 0, 0.80, false);

-- Pandesal recipe: 1 batch = 120 pcs
with r as (
  insert into public.recipes (output_product_id, name, yield_qty)
  select id, 'Pandesal (120 pcs)', 120 from public.products where sku = 'BRD-PANDESAL'
  returning id
)
insert into public.recipe_items (recipe_id, ingredient_id, quantity)
select r.id, p.id, x.qty
from r
cross join (values
  ('ING-FLOUR', 3.000), ('ING-SUGAR', 0.300), ('ING-YEAST', 0.030),
  ('ING-BUTTER', 0.150), ('ING-SALT', 0.050), ('ING-CRUMBS', 0.200)
) as x(sku, qty)
join public.products p on p.sku = x.sku;

-- Opening stock for every branch (direct insert is fine here: seed runs as postgres)
insert into public.branch_inventory (branch_id, product_id, quantity, reorder_level)
select b.id, p.id,
       case p.kind when 'ingredient' then 50 when 'packaging' then 500 else 60 end,
       case p.kind when 'ingredient' then 10 when 'packaging' then 100 else 15 end
from public.branches b cross join public.products p;

insert into public.inventory_movements (branch_id, product_id, qty_change, qty_after, reason, note)
select branch_id, product_id, quantity, quantity, 'initial', 'Seed opening stock'
from public.branch_inventory;
