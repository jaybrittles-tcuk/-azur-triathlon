#!/usr/bin/env bash
set -euo pipefail
# Disposable CI postgres only. Distinct psql processes create genuine concurrent transactions.
athlete="00000000-0000-4000-8000-000000000001"
sql="select outcome from public.stage_intervals_activity('$athlete','concurrent-ride','2026-10-28 06:49:22+00',4026,41840,214,234,'{}'::jsonb)"
psql -v ON_ERROR_STOP=1 -Atqc "$sql" > /tmp/azur_stage_one.txt &
p1=$!
psql -v ON_ERROR_STOP=1 -Atqc "$sql" > /tmp/azur_stage_two.txt &
p2=$!
wait "$p1"
wait "$p2"
combined="$(cat /tmp/azur_stage_one.txt /tmp/azur_stage_two.txt | sort)"
expected="$(printf 'already_staged\npending_review')"
if [[ "$combined" != "$expected" ]]; then
 echo "Unexpected concurrent outcomes: $combined" >&2
 exit 1
fi
actual="$(psql -v ON_ERROR_STOP=1 -Atqc "select count(*) from public.intervals_import_inbox where athlete_id='$athlete' and source_activity_id='concurrent-ride'")"
[[ "$actual" == "1" ]] || { echo "Expected one staged row, got $actual" >&2; exit 1; }
echo 'PASS: two concurrent independent connections produced one staged record.'
# Accept the same staged ride from independent connections. The athlete lock
# must yield one insert and one idempotent replay, never two activity records.
stage_id="$(psql -v ON_ERROR_STOP=1 -Atqc "select id from public.intervals_import_inbox where athlete_id='$athlete' and source_activity_id='concurrent-ride'")"
accept_sql="select outcome from public.accept_staged_intervals_ride('$athlete','$stage_id',true)"
psql -v ON_ERROR_STOP=1 -Atqc "$accept_sql" > /tmp/azur_accept_one.txt &
p1=$!
psql -v ON_ERROR_STOP=1 -Atqc "$accept_sql" > /tmp/azur_accept_two.txt &
p2=$!
wait "$p1"
wait "$p2"
combined="$(cat /tmp/azur_accept_one.txt /tmp/azur_accept_two.txt | sort)"
expected="$(printf 'already_imported\nimported_pending_load_review')"
[[ "$combined" == "$expected" ]] || { echo "Unexpected acceptance outcomes: $combined" >&2; exit 1; }
actual="$(psql -v ON_ERROR_STOP=1 -Atqc "select count(*) from public.completed_activity where athlete_id='$athlete' and source='intervals' and source_activity_id='concurrent-ride' and processed_metrics->>'load_status'='pending_validation' and planned_session_id is null")"
[[ "$actual" == "1" ]] || { echo "Expected one quarantined accepted record, got $actual" >&2; exit 1; }
echo 'PASS: concurrent acceptance produced one quarantined completed activity.'
# Load approval must update that same row once under the same athlete lock.
activity_id="$(psql -v ON_ERROR_STOP=1 -Atqc "select id from public.completed_activity where athlete_id='$athlete' and source='intervals' and source_activity_id='concurrent-ride'")"
load_sql="select outcome from public.validate_intervals_training_load('$athlete','$activity_id',true)"
psql -v ON_ERROR_STOP=1 -Atqc "$load_sql" > /tmp/azur_load_one.txt &
p1=$!
psql -v ON_ERROR_STOP=1 -Atqc "$load_sql" > /tmp/azur_load_two.txt &
p2=$!
wait "$p1"
wait "$p2"
combined="$(cat /tmp/azur_load_one.txt /tmp/azur_load_two.txt | sort)"
expected="$(printf 'already_validated\nvalidated')"
[[ "$combined" == "$expected" ]] || { echo "Unexpected load-validation outcomes: $combined" >&2; exit 1; }
actual="$(psql -v ON_ERROR_STOP=1 -Atqc "select count(*) from public.completed_activity where athlete_id='$athlete' and source='intervals' and source_activity_id='concurrent-ride' and processed_metrics->>'load_status'='validated' and planned_session_id is null")"
[[ "$actual" == "1" ]] || { echo "Expected one validated activity, got $actual" >&2; exit 1; }
echo 'PASS: concurrent load approval retained one activity and one saved stress score.'
