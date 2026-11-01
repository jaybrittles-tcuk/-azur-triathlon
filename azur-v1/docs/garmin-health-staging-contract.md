# Garmin Health V1 — verified staging data contract (1 Nov 2026)

## Staging database
Project: AZUR Staging `juvceqrzkeethontnezw`. Changes were executed and metadata-verified **only in staging**. Production was not changed.

Tables created:
- `public.athlete_health_consent`: athlete_id, metric, enabled (default false), updated_at; unique athlete/metric.
- `public.athlete_health_observation`: athlete_id, provider (Garmin), provider_record_id, metric, observed_date, value, ingested_at; per-provider-record uniqueness and lookup index.
- Accepted metrics: `hrv`, `resting_hr`, `sleep_minutes`, `stress`, `body_battery`.

Both tables have RLS enabled. Athlete consent policies require ownership from `athlete_profile.user_id = auth.uid()`. Athlete observations permit authenticated **SELECT** only where both ownership and enabled metric consent are present. No authenticated INSERT privilege on observation table. Service role has privileges for future verified ingestion; no server ingestion code has been activated.

Verified in staging through catalog query: both RLS=true; authenticated INSERT enabled for consent only, not observations.

## Important remaining safety gates

1. Verify official authenticated Garmin webhook specification (transport signature or authentication, retry and payload formats). The existing PR #19 test receiver is **synthetic-only** and cannot be used as a real Garmin URL.
2. Create server-only provider-user-ID mapping; never trust athlete IDs sent by webhook callers. Verify ownership against `athlete_integration` and active consent before writing.
3. Review duplicate handling, multi-record daily resolution, metrics' units and realistic bounds. Existing generic database range 0–1440 is a basic guard, **not** an approved per-metric validation contract.
4. Decide retention policy, revocation and disconnect deletion workflow. Row-level filtering alone does not erase previously ingested data.
5. Restrict backend access to service credentials, avoid sensitive logs, and test user isolation including disabled consent and cross-athlete access.
6. Do not merge clinical-sounding readiness alerts into workout adaptation without coach review and evidence assessment.
7. Produce proper Supabase CLI-generated migration from reviewed schema, run database permission tests, and verify staging end to end before any production schema change.

## Performance UI
PR #21 shipped to production with placeholders and existing recoveryContext only. It **does not** read these new staging tables or confirm that Garmin Health data is arriving.

## Do not activate
Do not enter a webhook URL or enable Garmin production feeds yet. There is no production-compatible verified receiver.
