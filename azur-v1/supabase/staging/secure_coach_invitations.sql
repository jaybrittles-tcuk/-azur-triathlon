-- STAGING ONLY: athlete-controlled coach invitation acceptance.
create table if not exists public.coach_athlete_invitation(
 id uuid primary key default gen_random_uuid(),
 coach_user_id uuid not null references auth.users(id) on delete cascade,
 invitee_email text not null check (length(invitee_email) between 5 and 254),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '14 days'),
 accepted_at timestamptz,
 accepted_by uuid references auth.users(id) on delete set null,
 email_sent_at timestamptz,
 constraint invitation_acceptance_consistent check ((accepted_at is null and accepted_by is null) or (accepted_at is not null and accepted_by is not null))
);
create index if not exists coach_invitation_email_idx on public.coach_athlete_invitation (lower(invitee_email));
create index if not exists coach_invitation_owner_idx on public.coach_athlete_invitation(coach_user_id);
alter table public.coach_athlete_invitation enable row level security;
revoke all on public.coach_athlete_invitation from public,anon,authenticated;
grant select,insert on public.coach_athlete_invitation to authenticated;
grant update(accepted_at) on public.coach_athlete_invitation to authenticated;
create policy "Coach reads own invitations" on public.coach_athlete_invitation for select to authenticated
 using (coach_user_id=(select auth.uid()) and (auth.jwt()->'app_metadata'->>'role')='coach');
create policy "Athlete reads invitations for their email" on public.coach_athlete_invitation for select to authenticated
 using (lower(invitee_email)=lower(coalesce(auth.jwt()->>'email','')));
create policy "Verified coaches create invitations" on public.coach_athlete_invitation for insert to authenticated
 with check (coach_user_id=(select auth.uid()) and (auth.jwt()->'app_metadata'->>'role')='coach' and accepted_at is null and accepted_by is null and email_sent_at is null);
create policy "Athlete accepts their own pending invitation" on public.coach_athlete_invitation for update to authenticated
 using (accepted_at is null and expires_at>now() and lower(invitee_email)=lower(coalesce(auth.jwt()->>'email','')))
 with check (lower(invitee_email)=lower(coalesce(auth.jwt()->>'email','')));
create or replace function public.azur_accept_coach_invitation()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_athlete uuid; v_email text; v_confirmed timestamptz;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if old.accepted_at is not null or old.expires_at<=now() then raise exception 'Invitation is no longer available'; end if;
 if new.coach_user_id is distinct from old.coach_user_id or
    new.invitee_email is distinct from old.invitee_email or
    new.expires_at is distinct from old.expires_at or
    new.email_sent_at is distinct from old.email_sent_at then
    raise exception 'Invitation details cannot be changed'; end if;
 select email,email_confirmed_at into v_email,v_confirmed from auth.users where id=auth.uid();
 if v_confirmed is null or lower(coalesce(v_email,''))<>lower(old.invitee_email) then
   raise exception 'Verified invitation email required'; end if;
 select id into v_athlete from public.athlete_profile where user_id=auth.uid();
 if v_athlete is null then raise exception 'Complete athlete setup before accepting'; end if;
 new.accepted_at:=now();new.accepted_by:=auth.uid();
 insert into public.coach_athlete_assignment(coach_user_id,athlete_id)
 values(old.coach_user_id,v_athlete) on conflict(coach_user_id,athlete_id) do nothing;
 return new;
end $$;
revoke execute on function public.azur_accept_coach_invitation() from public,anon,authenticated;
drop trigger if exists azur_secure_accept_invitation on public.coach_athlete_invitation;
create trigger azur_secure_accept_invitation before update on public.coach_athlete_invitation
 for each row execute function public.azur_accept_coach_invitation();
