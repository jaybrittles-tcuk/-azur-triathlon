-- Harden the existing staging publisher without changing its approval or write path.
-- Reject questionnaire-only publication when reported recent volume is zero or
-- insufficient for the approved weekly prescription. No calendar writes here.
do $migration$
declare original text; patched text; needle text; replacement text;
begin
 select pg_get_functiondef(p.oid) into original
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='publish_verified_weekly_draft'
   and pg_get_function_identity_arguments(p.oid)='p_draft_id uuid';
 if original is null then raise exception 'Publisher function missing'; end if;
 needle:='if recent_hours is not null and (recent_hours<0 or recent_hours>40 or (recent_hours>0 and total>recent_hours*66))';
 replacement:='if recent_hours is not null and (recent_hours<=0 or recent_hours>40 or total>recent_hours*66)';
 if position(replacement in original)>0 then return; end if;
 if position(needle in original)=0 then raise exception 'Publisher version changed; review required'; end if;
 patched:=replace(original,needle,replacement);
 execute patched;
end $migration$;
