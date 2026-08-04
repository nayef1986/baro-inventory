-- Helper functions used by both RLS policies and RPCs.
-- security definer + stable so they can be used cheaply inside policies.

create or replace function current_profile_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function current_profile_company()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from profiles where id = auth.uid();
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid()), false);
$$;

create or replace function is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_active from profiles where id = auth.uid()), false);
$$;

create or replace function has_branch_access(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_branches
    where user_id = auth.uid() and branch_id = p_branch_id
  );
$$;

create or replace function is_supervisor_of_assignment(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from task_assignments ta
    join user_branches ub on ub.branch_id = ta.branch_id and ub.user_id = auth.uid()
    where ta.id = p_assignment_id and current_profile_role() = 'supervisor'
  );
$$;
