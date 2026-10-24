function mapGarminSport(activityType: string) {
  const type = String(activityType ?? '').toUpperCase();

  if (
    type.includes('RUN') ||
    type === 'WALKING' ||
    type === 'CASUAL_WALKING' ||
    type === 'SPEED_WALKING'
  ) {
    return 'run';
  }

  if (
    type.includes('CYCL') ||
    type.includes('BIKE') ||
    type === 'VIRTUAL_RIDE'
  ) {
    return 'bike';
  }

  if (
    type.includes('SWIM') ||
    type === 'LAP_SWIMMING' ||
    type === 'OPEN_WATER_SWIMMING'
  ) {
    return 'swim';
  }

  return null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed.',
    });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({
      error: 'Server configuration is incomplete.',
    });
  }

  // Garmin requires a fast 200 response.
  res.status(200).json({ received: true });

  try {
    const activities = Array.isArray(req.body?.activities)
      ? req.body.activities
      : [];

    for (const activity of activities) {
      const sport = mapGarminSport(activity.activityType);

      if (!sport) {
        continue;
      }

      const integrationResponse = await fetch(
        `${supabaseUrl}/rest/v1/athlete_integration?provider=eq.garmin&provider_athlete_id=eq.${encodeURIComponent(
          activity.userId,
        )}&select=athlete_id&limit=1`,
        {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
        },
      );

      if (!integrationResponse.ok) {
        console.error(
          'Unable to resolve Garmin athlete:',
          await integrationResponse.text(),
        );
        continue;
      }

      const integrations = await integrationResponse.json();
      const athleteId = integrations?.[0]?.athlete_id;

      if (!athleteId) {
        console.warn(
          'No Azur athlete found for Garmin user:',
          activity.userId,
        );
        continue;
      }

      const sourceActivityId = String(
        activity.activityId ??
          activity.summaryId ??
          '',
      );

      if (!sourceActivityId) {
        continue;
      }

      const startTime = new Date(
        Number(activity.startTimeInSeconds) * 1000,
      ).toISOString();

      const activityResponse = await fetch(
        `${supabaseUrl}/rest/v1/completed_activity?on_conflict=source,source_activity_id`,
        {
          method: 'POST',
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal',
          },
          body: JSON.stringify({
            athlete_id: athleteId,
            planned_session_id: null,
            sport,
            source: 'garmin',
            source_activity_id: sourceActivityId,
            start_time: startTime,
            duration_sec: Number(
              activity.durationInSeconds ?? 0,
            ),
            distance_m:
              activity.distanceInMeters != null
                ? Number(activity.distanceInMeters)
                : null,
            raw_payload: activity,
          }),
        },
      );

      if (!activityResponse.ok) {
        console.error(
          'Unable to save Garmin activity:',
          await activityResponse.text(),
        );
      }
    }
  } catch (error) {
    console.error('Garmin activity webhook error:', error);
  }
}
