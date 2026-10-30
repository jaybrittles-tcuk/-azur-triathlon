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
