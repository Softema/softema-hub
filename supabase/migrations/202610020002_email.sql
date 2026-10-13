-- Prepared schema only. No Resend key or outbound call is made by this migration.
begin;
create table public.email_senders (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, workspace_id uuid not null,
  provider text not null default 'resend' check (provider = 'resend'),
  name text not null, from_email text not null, reply_to text,
  resend_domain_id text, domain_status text not null default 'pending' check (domain_status in ('pending','verified','failed','revoked')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (workspace_id, organization_id) references public.workspaces(id, organization_id) on delete cascade,
  unique (id, workspace_id, organization_id)
);
create table public.email_subscriptions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, workspace_id uuid not null,
  email text not null check (email = lower(trim(email))),
  status text not null default 'pending' check (status in ('pending','subscribed','unsubscribed','suppressed')),
  consent_source text, consent_at timestamptz, unsubscribed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (workspace_id, organization_id) references public.workspaces(id, organization_id) on delete cascade,
  unique (workspace_id, email)
);
alter table public.campaigns add constraint campaigns_scoped_id unique (id, workspace_id, organization_id);
create table public.email_messages (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, workspace_id uuid not null,
  campaign_id uuid, sender_id uuid not null,
  recipient_email text not null, subject text not null, html_body text not null, text_body text not null,
  provider text not null default 'resend' check (provider = 'resend'),
  provider_message_id text unique,
  status text not null default 'queued' check (status in ('queued','sending','accepted','delivered','delayed','bounced','complained','suppressed','failed','cancelled')),
  idempotency_key text not null, attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz, error_code text, accepted_at timestamptz, delivered_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (workspace_id, organization_id) references public.workspaces(id, organization_id) on delete cascade,
  foreign key (campaign_id, workspace_id, organization_id) references public.campaigns(id, workspace_id, organization_id),
  foreign key (sender_id, workspace_id, organization_id) references public.email_senders(id, workspace_id, organization_id),
  unique (workspace_id, idempotency_key), unique (id, workspace_id, organization_id)
);
create index email_messages_due_idx on public.email_messages(next_attempt_at) where status in ('queued','failed');
create table public.email_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, workspace_id uuid not null,
  message_id uuid not null, provider_event_id text not null unique, event_type text not null,
  occurred_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (workspace_id, organization_id) references public.workspaces(id, organization_id) on delete cascade,
  foreign key (message_id, workspace_id, organization_id) references public.email_messages(id, workspace_id, organization_id) on delete cascade
);
do $$
declare t text;
begin
  foreach t in array array['email_senders','email_subscriptions','email_messages','email_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    execute format('create index %I on public.%I(workspace_id)', t || '_workspace_idx', t);
    execute format('create policy workspace_read on public.%I for select to authenticated using (private.workspace_access(workspace_id, ''read''))', t);
    execute format('create trigger immutable_scope before update on public.%I for each row execute function private.keep_record_scope()', t);
  end loop;
end;
$$;
commit;
