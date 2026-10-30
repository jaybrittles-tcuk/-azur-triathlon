-- Read-only deployment preflight. Reads schema metadata only, never athlete data.
with expected(table_name,column_name,udt_name) as (values
 ('athlete_profile','id','uuid'),('athlete_profile','user_id','uuid'),('athlete_profile','ftp_w','int4'),
 ('completed_activity','athlete_id','uuid'),('completed_activity','source','text'),
 ('completed_activity','source_activity_id','text'),('completed_activity','start_time','timestamptz'),
 ('completed_activity','duration_sec','int4'),('completed_activity','distance_m','numeric'),
 ('completed_activity','planned_session_id','uuid'),('completed_activity','processed_metrics','jsonb'),
 ('completed_activity','raw_payload','jsonb'),('completed_activity','duplicate_group_key','text'),
 ('athlete_integration','athlete_id','uuid'),('athlete_integration','provider','text'),
 ('athlete_integration','access_token','text'),('planned_session','athlete_id','uuid'),
 ('planned_session','planned_date','date'),('planned_session','is_active_version','bool')
), mismatches as (
 select e.table_name,e.column_name,e.udt_name as expected_type,c.udt_name as actual_type
 from expected e left join information_schema.columns c on c.table_schema='public'
 and c.table_name=e.table_name and c.column_name=e.column_name
 where c.udt_name is distinct from e.udt_name
)
select jsonb_build_object(
 'schema_compatible',not exists(select 1 from mismatches),
 'column_mismatches',coalesce((select jsonb_agg(to_jsonb(m)) from mismatches m),'[]'::jsonb),
 'completed_activity_rls',coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.completed_activity')),false),
 'server_can_write_activities',coalesce((has_table_privilege('service_role',to_regclass('public.completed_activity'),'SELECT') and has_table_privilege('service_role',to_regclass('public.completed_activity'),'INSERT') and has_table_privilege('service_role',to_regclass('public.completed_activity'),'UPDATE')),false),
 'inbox_installed',to_regclass('public.intervals_import_inbox') is not null,
 'acceptance_installed',to_regprocedure('public.accept_staged_intervals_ride(uuid,uuid,boolean)') is not null,
 'load_validation_installed',to_regprocedure('public.validate_intervals_training_load(uuid,uuid,boolean)') is not null,
 'import_write_protection_installed',(select count(*)=3 from pg_policies
 where schemaname='public' and tablename='completed_activity' and permissive='RESTRICTIVE'
 and policyname in ('intervals_activity_server_insert','intervals_activity_server_update','intervals_activity_server_delete'))
) as preflight;
