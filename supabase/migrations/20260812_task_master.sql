-- Apply with Supabase CLI/SQL editor. Every exposed table is protected by RLS.
create table if not exists public.projects (
 id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(char_length(title) between 1 and 200), description text not null default '',
 status text not null default 'TODO' check(status in ('TODO','IN_PROGRESS','COMPLETED')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.project_members (
 project_id uuid not null references public.projects(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
 access text not null default 'VIEW' check(access in ('VIEW','EDIT','MANAGE')), accepted_at timestamptz, primary key(project_id,user_id));
create table if not exists public.tasks (
 id uuid primary key, project_id uuid references public.projects(id) on delete cascade, owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(char_length(title) between 1 and 300), description text not null default '', status text not null default 'TODO' check(status in ('TODO','IN_PROGRESS','COMPLETED')),
 priority text not null default 'MEDIUM' check(priority in ('LOW','MEDIUM','HIGH')), due_at timestamptz, created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index if not exists tasks_project_updated_idx on public.tasks(project_id,updated_at desc);
alter table public.projects enable row level security; alter table public.project_members enable row level security; alter table public.tasks enable row level security;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function private.can_access_project(pid uuid, required_access text default 'VIEW')
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select (select auth.uid()) is not null and (
  exists(select 1 from public.projects p where p.id=pid and p.owner_id=(select auth.uid()))
  or exists(select 1 from public.project_members m where m.project_id=pid and m.user_id=(select auth.uid()) and m.accepted_at is not null and
   case required_access when 'VIEW' then true when 'EDIT' then m.access in ('EDIT','MANAGE') when 'MANAGE' then m.access='MANAGE' else false end)
 )
$$;
revoke all on function private.can_access_project(uuid,text) from public, anon, authenticated;

create policy "project read" on public.projects for select to authenticated using(private.can_access_project(id));
create policy "project create" on public.projects for insert to authenticated with check(owner_id=(select auth.uid()));
create policy "project update owner" on public.projects for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy "member read" on public.project_members for select to authenticated using(private.can_access_project(project_id) or user_id=(select auth.uid()));
create policy "member manage" on public.project_members for all to authenticated using(private.can_access_project(project_id,'MANAGE')) with check(private.can_access_project(project_id,'MANAGE'));
create policy "task read" on public.tasks for select to authenticated using(project_id is null and owner_id=(select auth.uid()) or project_id is not null and private.can_access_project(project_id));
create policy "task insert" on public.tasks for insert to authenticated with check(owner_id=(select auth.uid()) and (project_id is null or private.can_access_project(project_id,'EDIT')));
create policy "task update" on public.tasks for update to authenticated using(project_id is null and owner_id=(select auth.uid()) or project_id is not null and private.can_access_project(project_id,'EDIT')) with check(project_id is null and owner_id=(select auth.uid()) or project_id is not null and private.can_access_project(project_id,'EDIT'));
create policy "task delete" on public.tasks for delete to authenticated using(project_id is null and owner_id=(select auth.uid()) or project_id is not null and private.can_access_project(project_id,'EDIT'));

-- Editors may update shared tasks, but cannot rewrite who originally created them.
create function private.preserve_task_owner() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' then new.owner_id=old.owner_id; end if;
 return new;
end $$;
create trigger preserve_task_owner before update on public.tasks
for each row execute function private.preserve_task_owner();

-- Public RPC is SECURITY INVOKER; its privileged helper remains in a non-exposed schema.
create function private.accept_project_invite(pid uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
 update public.project_members set accepted_at=now()
 where project_id=pid and user_id=(select auth.uid()) and accepted_at is null;
 if not found then raise exception 'Pending invitation not found'; end if;
end $$;
revoke all on function private.accept_project_invite(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.can_access_project(uuid,text) to authenticated;
grant execute on function private.accept_project_invite(uuid) to authenticated;
create function public.accept_project_invite(pid uuid) returns void language sql security invoker set search_path=public,private,pg_temp as $$ select private.accept_project_invite(pid) $$;
revoke all on function public.accept_project_invite(uuid) from public, anon;
grant execute on function public.accept_project_invite(uuid) to authenticated;

grant usage on schema public to authenticated;
grant select,insert,update,delete on public.projects,public.project_members,public.tasks to authenticated;
alter publication supabase_realtime add table public.projects,public.project_members,public.tasks;
