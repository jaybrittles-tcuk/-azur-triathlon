-- Development only: layer restrictions over the existing athlete ownership policies.
-- Permissive ownership rules alone must not allow imported-ride validation bypass.
alter table public.completed_activity enable row level security;
create policy intervals_activity_server_insert on public.completed_activity
 as restrictive for insert to authenticated
 with check (lower(btrim(source)) <> 'intervals');
create policy intervals_activity_server_update on public.completed_activity
 as restrictive for update to authenticated
 using (lower(btrim(source)) <> 'intervals')
 with check (lower(btrim(source)) <> 'intervals');
create policy intervals_activity_server_delete on public.completed_activity
 as restrictive for delete to authenticated
 using (lower(btrim(source)) <> 'intervals');
-- SELECT policies, manual writes, and service-role transactions are unchanged.
