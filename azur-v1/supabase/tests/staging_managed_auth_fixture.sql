-- Disposable CI database ONLY; substitutes managed Auth objects for baseline testing.
-- Roles already exist in the PostgreSQL cluster from intervals_fixture.sql.
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,service_role;
