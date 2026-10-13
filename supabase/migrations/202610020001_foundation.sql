-- Softema Hub: future Supabase foundation. NOT connected to the current demo.
-- Apply first to a disposable Supabase project and run tests/tenant-isolation.sql.
-- Organization creation, invitations, role changes, credentials and runs are server-only.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  kind text not null check (kind in ('agency', 'business')),
  created_at timestamptz not null default now()
);
create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'guest')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members(user_id, organization_id);
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('internal', 'client')),
  client_name text,
  timezone text not null default 'Europe/Prague',
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);
create index workspaces_organization_idx on public.workspaces(organization_id);
create table public.workspace_members (
  organization_id uuid not null,
  workspace_id uuid not null,
  user_id uuid not null,
  role text not null check (role in ('manager', 'editor', 'viewer')),
  primary key (workspace_id, user_id),
  foreign key (workspace_id, organization_id) references public.workspaces(id, organization_id) on delete cascade,
  foreign key (organization_id, user_id) references public.organization_members(organization_id, user_id) on delete cascade
);
create index workspace_members_user_idx on public.workspace_members(user_id, workspace_id);

-- Definer helpers are outside exposed schemas, have a pinned search path and
-- derive identity from auth.uid(), never from caller-supplied user IDs.
create function private.organization_role(org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.organization_members m
  where m.organization_id = org and m.user_id = (select auth.uid());
$$;
create function private.workspace_access(ws uuid, required_access text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = ws and required_access in ('read','write','manage') and (
      private.organization_role(w.organization_id) in ('owner', 'admin')
      or exists (
        select 1 from public.workspace_members m
        where m.workspace_id = w.id and m.organization_id = w.organization_id
          and m.user_id = (select auth.uid())
          and case required_access
            when 'read' then m.role in ('manager', 'editor', 'viewer')
            when 'write' then m.role in ('manager', 'editor')
            when 'manage' then m.role = 'manager'
            else false end
      )
    )
  );
$$;
revoke all on function private.organization_role(uuid) from public, anon;
revoke all on function private.workspace_access(uuid, text) from public, anon;
grant execute on function private.organization_role(uuid), private.workspace_access(uuid, text) to authenticated, service_role;

create table public.contacts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, workspace_id uuid not null,
  name text not null, email text, company text, phone text,
  tags text[] not null default '{}', status text not null default 'Zájemce',
  value_minor bigint not null default 0, currency text not null default 'CZK',
  source text, owner_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (workspace_id, organization_id) references public.workspaces(id, organization_id) on delete cascade,
  unique (id, workspace_id, organization_id)
);
create table public.contact_notes (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, workspace_id uuid not null,
  contact_id uuid not null, body text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (workspace_id, organization_id) references public.workspaces(id, organization_id) on delete cascade,
  foreign key (contact_id, workspace_id, organization_id) references public.contacts(id, workspace_id, organization_id) on delete cascade
);
create table public.campaigns (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, workspace_id uuid not null,
  name text not null, subject text not null default '', preheader text not null default '',
  sender_name text, sender_email text, audience jsonb not null default '{}',
  blocks jsonb not null default '[]' check (jsonb_typeof(blocks) = 'array'),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  scheduled_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (workspace_id, organization_id) references public.workspaces(id, organization_id) on delete cascade
);
create table public.ai_connections (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, workspace_id uuid not null,
  name text not null, provider text not null check (provider in ('OpenAI', 'Anthropic', 'Google')),
  status text not null default 'pending' check (status in ('pending', 'connected', 'revoked', 'error')),
  masked_suffix text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (workspace_id, organization_id) references public.workspaces(id, organization_id) on delete cascade,
  unique (id, workspace_id, organization_id)
);
create table private.ai_credentials (
  connection_id uuid primary key references public.ai_connections(id) on delete cascade,
  encrypted_token bytea not null, nonce bytea not null, key_version text not null,
  updated_at timestamptz not null default now()
);
alter table private.ai_credentials enable row level security;
revoke all on private.ai_credentials from public, anon, authenticated;
grant select, insert, update, delete on private.ai_credentials to service_role;

create table public.ai_agents (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, workspace_id uuid not null,
  name text not null, description text not null default '', connection_id uuid,
  model text not null, instructions text not null,
  kind text not null default 'custom' check (kind in ('copy', 'analysis', 'custom')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (workspace_id, organization_id) references public.workspaces(id, organization_id) on delete cascade,
  foreign key (connection_id, workspace_id, organization_id) references public.ai_connections(id, workspace_id, organization_id),
  unique (id, workspace_id, organization_id)
);
create table public.ai_automations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, workspace_id uuid not null,
  name text not null, agent_id uuid not null,
  trigger_type text not null check (trigger_type in ('manual', 'daily', 'weekly', 'webhook')),
  schedule_time time, timezone text not null default 'Europe/Prague', input text not null,
  enabled boolean not null default false, next_run_at timestamptz, revision integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (workspace_id, organization_id) references public.workspaces(id, organization_id) on delete cascade,
  foreign key (agent_id, workspace_id, organization_id) references public.ai_agents(id, workspace_id, organization_id),
  unique (id, workspace_id, organization_id),
  check (trigger_type not in ('daily', 'weekly') or schedule_time is not null)
);
create table public.ai_runs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, workspace_id uuid not null,
  automation_id uuid, agent_id uuid,
  title text not null, agent_name text not null, provider text not null, model text not null,
  instructions_snapshot text not null, input text not null, output text,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  is_simulation boolean not null default false, token_usage jsonb not null default '{}',
  idempotency_key text not null, error_code text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (workspace_id, organization_id) references public.workspaces(id, organization_id) on delete cascade,
  foreign key (agent_id, workspace_id, organization_id) references public.ai_agents(id, workspace_id, organization_id),
  foreign key (automation_id, workspace_id, organization_id) references public.ai_automations(id, workspace_id, organization_id),
  unique (workspace_id, idempotency_key)
);
create index ai_runs_history_idx on public.ai_runs(workspace_id, created_at desc);
create index ai_automations_due_idx on public.ai_automations(next_run_at) where enabled;

create function private.keep_record_scope() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.organization_id <> old.organization_id or new.workspace_id <> old.workspace_id then
    raise exception 'Record scope cannot be changed' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.keep_record_scope() from public, anon, authenticated;

-- Never rely on Supabase's default grants. Anonymous visitors cannot read app data.
do $$
declare t text;
begin
  foreach t in array array['organizations','organization_members','workspaces','workspace_members','contacts','contact_notes','campaigns','ai_connections','ai_agents','ai_automations','ai_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
  foreach t in array array['contacts','contact_notes','campaigns','ai_connections','ai_agents','ai_automations','ai_runs'] loop
    execute format('create index %I on public.%I(workspace_id)', t || '_workspace_idx', t);
    execute format('create policy workspace_read on public.%I for select to authenticated using (private.workspace_access(workspace_id, ''read''))', t);
    execute format('create trigger immutable_scope before update on public.%I for each row execute function private.keep_record_scope()', t);
  end loop;
  -- Only ordinary content is writable from authenticated, RLS-scoped clients.
  -- Connection provisioning, scheduler configuration and runs use server endpoints.
  foreach t in array array['contacts','contact_notes','ai_agents'] loop
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    execute format('create policy workspace_insert on public.%I for insert to authenticated with check (private.workspace_access(workspace_id, ''write''))', t);
    execute format('create policy workspace_update on public.%I for update to authenticated using (private.workspace_access(workspace_id, ''write'')) with check (private.workspace_access(workspace_id, ''write''))', t);
    execute format('create policy workspace_delete on public.%I for delete to authenticated using (private.workspace_access(workspace_id, ''write''))', t);
  end loop;
end;
$$;
create policy organization_read on public.organizations for select to authenticated using (private.organization_role(id) is not null);
create policy organization_members_read on public.organization_members for select to authenticated using (user_id = (select auth.uid()) or private.organization_role(organization_id) in ('owner', 'admin'));
create policy workspaces_read on public.workspaces for select to authenticated using (private.workspace_access(id, 'read'));
create policy workspace_members_read on public.workspace_members for select to authenticated using (user_id = (select auth.uid()) or private.workspace_access(workspace_id, 'manage'));
commit;
