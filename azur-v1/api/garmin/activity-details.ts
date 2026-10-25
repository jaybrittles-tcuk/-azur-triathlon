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

  try {
    const activityDetails = Array.isArray(
      req.body?.activityDetails,
    )
      ? req.body.activityDetails
      : [];

    console.log('GARMIN ACTIVITY DETAILS RECEIVED', {
      bodyKeys: Object.keys(req.body ?? {}),
      detailCount: activityDetails.length,
      firstSummaryId:
        activityDetails?.[0]?.summaryId ?? null,
      firstActivityId:
        activityDetails?.[0]?.activityId ?? null,
      firstActivityType:
        activityDetails?.[0]?.summary?.activityType ??
        activityDetails?.[0]?.activityType ??
        null,
      sampleCount: Array.isArray(
        activityDetails?.[0]?.samples,
      )
        ? activityDetails[0].samples.length
        : 0,
    });

    for (const detail of activityDetails) {
      const summary = detail.summary ?? {};
      const samples = Array.isArray(detail.samples)
        ? detail.samples
        : [];

      const sourceActivityId = String(
        detail.activityId ??
          summary.activityId ??
          '',
      );

      if (!sourceActivityId) {
        continue;
      }

      const route = samples
        .filter(
          (sample: any) =>
            sample.latitudeInDegree != null &&
            sample.longitudeInDegree != null,
        )
        .map((sample: any) => ({
          lat: Number(sample.latitudeInDegree),
          lng: Number(sample.longitudeInDegree),
        }));

      const series = samples.map((sample: any) => ({
        elapsedSec:
          sample.timerDurationInSeconds != null
            ? Number(sample.timerDurationInSeconds)
            : sample.startTimeInSeconds != null &&
                summary.startTimeInSeconds != null
              ? Number(sample.startTimeInSeconds) -
                Number(summary.startTimeInSeconds)
              : null,

        heartRate:
          sample.heartRate != null
            ? Number(sample.heartRate)
            : null,

        speedKmh:
          sample.speedMetersPerSecond != null
            ? Number(sample.speedMetersPerSecond) * 3.6
            : null,

        altitudeM:
          sample.elevationInMeters != null
            ? Number(sample.elevationInMeters)
            : null,
      }));
const powerSamples = samples
  .map((sample: any) =>
    sample.powerInWatts != null
      ? Number(sample.powerInWatts)
      : null,
  )
  .filter(
    (value: number | null): value is number =>
      value != null && value > 0,
  );

const averagePower =
  powerSamples.length > 0
    ? Math.round(
        powerSamples.reduce(
          (sum: number, value: number) => sum + value,
          0,
        ) / powerSamples.length,
      )
    : null;
      const processedMetrics = {
        averagePower,
        
        averageHeartRate:
          summary.averageHeartRateInBeatsPerMinute ??
          null,

        maxHeartRate:
          summary.maxHeartRateInBeatsPerMinute ??
          null,

        averagePaceSecPerKm:
          summary.averagePaceInMinutesPerKilometer != null
            ? Number(
                summary.averagePaceInMinutesPerKilometer,
              ) * 60
            : null,

        bestPaceSecPerKm:
          summary.maxPaceInMinutesPerKilometer != null
            ? Number(
                summary.maxPaceInMinutesPerKilometer,
              ) * 60
            : null,

        averageSpeedKmh:
          summary.averageSpeedInMetersPerSecond != null
            ? Number(
                summary.averageSpeedInMetersPerSecond,
              ) * 3.6
            : null,

        maxSpeedKmh:
          summary.maxSpeedInMetersPerSecond != null
            ? Number(
                summary.maxSpeedInMetersPerSecond,
              ) * 3.6
            : null,

        calories:
          summary.activeKilocalories ?? null,

        averageRunCadence:
          summary.averageRunCadenceInStepsPerMinute ??
          null,

        maxRunCadence:
          summary.maxRunCadenceInStepsPerMinute ??
          null,

        averageBikeCadence:
          summary.averageBikeCadenceInRoundsPerMinute ??
          null,

        maxBikeCadence:
          summary.maxBikeCadenceInRoundsPerMinute ??
          null,
      };

let enriched = false;

for (let attempt = 1; attempt <= 3; attempt += 1) {
  const updateResponse = await fetch(
    `${supabaseUrl}/rest/v1/completed_activity?source=eq.garmin&source_activity_id=eq.${encodeURIComponent(
      sourceActivityId,
    )}`,
    {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        duration_sec:
          summary.durationInSeconds != null
            ? Number(summary.durationInSeconds)
            : undefined,

        distance_m:
          summary.distanceInMeters != null
            ? Number(summary.distanceInMeters)
            : undefined,

        raw_payload: {
          detail,
          route,
          series,
        },

        processed_metrics: processedMetrics,
      }),
    },
  );

  if (!updateResponse.ok) {
    console.error(
      'Unable to enrich Garmin activity:',
      await updateResponse.text(),
    );
    break;
  }

  const updatedRows = await updateResponse.json();

  if (Array.isArray(updatedRows) && updatedRows.length > 0) {
    enriched = true;

    console.log(
      'GARMIN ACTIVITY ENRICHED:',
      sourceActivityId,
    );

    break;
  }

  await new Promise((resolve) =>
    setTimeout(resolve, 1000),
  );
}

if (!enriched) {
  console.warn(
    'Garmin activity details arrived before summary row:',
    sourceActivityId,
  );
}
    }
  } catch (error) {
    console.error(
      'Garmin Activity Details webhook error:',
      error,
    );
  }

  return res.status(200).json({
    received: true,
  });
}
