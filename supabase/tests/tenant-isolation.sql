-- Run as the migration owner ONLY in a disposable Supabase database after both migrations.
-- All fixtures roll back. This test has not been executed against hosted Supabase yet.
begin;
insert into auth.users(id) values
 ('90000000-0000-4000-8000-000000000001'),
 ('90000000-0000-4000-8000-000000000002'),
 ('90000000-0000-4000-8000-000000000003');
insert into public.organizations(id,name,kind) values
 ('91000000-0000-4000-8000-000000000001','Agency A','agency'),
 ('91000000-0000-4000-8000-000000000002','Company B','business');
insert into public.organization_members(organization_id,user_id,role) values
 ('91000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','owner'),
 ('91000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000002','guest'),
 ('91000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000003','owner');
insert into public.workspaces(id,organization_id,name,kind) values
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','Client A1','client'),
 ('92000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','Client A2','client'),
 ('92000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000002','Company B','internal');
insert into public.workspace_members(organization_id,workspace_id,user_id,role) values
 ('91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000002','viewer');
insert into public.contacts(organization_id,workspace_id,name) values
 ('91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','A1'),
 ('91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000002','A2'),
 ('91000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000003','B');

set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
do $$ begin
  if (select count(*) from public.contacts) <> 1 then raise exception 'Viewer can see another client'; end if;
  if (select count(*) from public.workspaces) <> 1 then raise exception 'Workspace list leaks'; end if;
  if has_table_privilege('authenticated','private.ai_credentials','SELECT') then raise exception 'Credentials exposed'; end if;
  if has_table_privilege('authenticated','public.organization_members','UPDATE') then raise exception 'Role escalation possible'; end if;
  if has_table_privilege('authenticated','public.email_messages','INSERT') then raise exception 'Outbox accepts client writes'; end if;
  begin
    insert into public.contacts(organization_id,workspace_id,name) values ('91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','Forbidden');
    raise exception 'Viewer wrote a record';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
do $$ begin
  if (select count(*) from public.contacts) <> 2 then raise exception 'Owner scope wrong'; end if;
  begin
    insert into public.contacts(organization_id,workspace_id,name) values ('91000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000003','Forbidden');
    raise exception 'Owner wrote another organization';
  exception when insufficient_privilege then null; end;
  begin
    update public.contacts set workspace_id='92000000-0000-4000-8000-000000000002' where name='A1';
    raise exception 'Record scope was mutable';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000003',true);
do $$ begin
  if (select count(*) from public.contacts) <> 1 then raise exception 'Business B sees Agency A'; end if;
end $$;
set local role anon;
do $$ begin
  if has_table_privilege('anon','public.contacts','SELECT') then raise exception 'Anonymous read exposed'; end if;
end $$;
reset role;
rollback;
