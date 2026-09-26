-- Run in the SQL editor AFTER creating users in Authentication > Users.
-- Replace the emails with your real accounts.

-- 1) Make the owner a super admin (sees all 10 branches)
update public.profiles set is_super_admin = true, full_name = 'Owner'
where id = (select id from auth.users where email = 'owner@example.com');

-- 2) Assign a branch manager to Lipa and Ibaan
insert into public.user_branch_roles (user_id, branch_id, role)
select u.id, b.id, 'branch_manager'
from auth.users u, public.branches b
where u.email = 'manager.lipa@example.com' and b.code in ('JMD-LPA', 'HJMD-IBN');

-- 3) Assign a cashier to Ibaan only
insert into public.user_branch_roles (user_id, branch_id, role)
select u.id, b.id, 'cashier'
from auth.users u, public.branches b
where u.email = 'cashier.ibaan@example.com' and b.code = 'HJMD-IBN';

update public.profiles p set default_branch_id = r.branch_id
from public.user_branch_roles r
where r.user_id = p.id and p.default_branch_id is null;
