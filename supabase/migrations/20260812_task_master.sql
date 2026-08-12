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
create function public.can_access_project(pid uuid, required_access text default 'VIEW') returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.projects p where p.id=pid and p.owner_id=(select auth.uid())) or exists(select 1 from public.project_members m where m.project_id=pid and m.user_id=(select auth.uid()) and m.accepted_at is not null and case required_access when 'VIEW' then true when 'EDIT' then m.access in ('EDIT','MANAGE') when 'MANAGE' then m.access='MANAGE' end) $$;
revoke all on function public.can_access_project(uuid,text) from public; grant execute on function public.can_access_project(uuid,text) to authenticated;
create policy "project read" on public.projects for select to authenticated using(public.can_access_project(id));
create policy "project create" on public.projects for insert to authenticated with check(owner_id=(select auth.uid()));
create policy "project update owner" on public.projects for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy "member read" on public.project_members for select to authenticated using(public.can_access_project(project_id) or user_id=(select auth.uid()));
create policy "member manage" on public.project_members for all to authenticated using(public.can_access_project(project_id,'MANAGE')) with check(public.can_access_project(project_id,'MANAGE'));
-- An invitee may only accept their own pending row; they can never change access or project_id.
create policy "member accepts own invite" on public.project_members for update to authenticated
 using(user_id=(select auth.uid()) and accepted_at is null)
 with check(user_id=(select auth.uid()) and accepted_at is not null and access=(select access from public.project_members old where old.project_id=project_members.project_id and old.user_id=project_members.user_id));
create policy "task read" on public.tasks for select to authenticated using(project_id is null and owner_id=(select auth.uid()) or project_id is not null and public.can_access_project(project_id));
create policy "task write" on public.tasks for all to authenticated using(project_id is null and owner_id=(select auth.uid()) or project_id is not null and public.can_access_project(project_id,'EDIT')) with check(owner_id=(select auth.uid()) and (project_id is null or public.can_access_project(project_id,'EDIT')));
alter publication supabase_realtime add table public.projects,public.project_members,public.tasks;
