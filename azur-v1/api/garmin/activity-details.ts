export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed.',
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
      firstSample:
        activityDetails?.[0]?.samples?.[0] ?? null,
      manual:
  activityDetails?.[0]?.summary?.manual ??
  activityDetails?.[0]?.manual ??
  null,

deviceName:
  activityDetails?.[0]?.summary?.deviceName ??
  activityDetails?.[0]?.deviceName ??
  null,

summaryKeys:
  Object.keys(
    activityDetails?.[0]?.summary ?? {},
  ),
    });
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
