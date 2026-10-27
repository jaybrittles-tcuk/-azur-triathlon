export type DisciplineGapStatus =
  | 'ahead'
  | 'on_track'
  | 'development'
  | 'insufficient_data';

export type DisciplineGap = {
  status: DisciplineGapStatus;
  gapPct: number | null;
  label: string;
  explanation: string;
};

export type AthleteRaceGapInput = {
  swimThresholdSecPer100m?: number | null;
  swimGoalSecPer100m?: number | null;
  runThresholdSecPerKm?: number | null;
  runGoalSecPerKm?: number | null;
  ftpW?: number | null;
  bikeGoalAverageKph?: number | null;
};

function paceGap(
  thresholdSeconds: number | null | undefined,
  goalSeconds: number | null | undefined,
  discipline: 'swim' | 'run',
): DisciplineGap {
  if (
    thresholdSeconds == null ||
    goalSeconds == null ||
    thresholdSeconds <= 0 ||
    goalSeconds <= 0
  ) {
    return {
      status: 'insufficient_data',
      gapPct: null,
      label: 'More data needed',
      explanation:
        discipline === 'swim'
          ? 'Add a current swim threshold and race goal pace to assess the swim gap.'
          : 'Add a current run threshold and race goal pace to assess the run gap.',
    };
  }

  const reservePct =
    ((goalSeconds - thresholdSeconds) / thresholdSeconds) * 100;

  if (reservePct >= 15) {
    return {
      status: 'ahead',
      gapPct: Number(reservePct.toFixed(1)),
      label: 'Strong reserve',
      explanation:
        discipline === 'swim'
          ? 'Current swim threshold is comfortably faster than the required race pace.'
          : 'Current run threshold is comfortably faster than the required race pace.',
    };
  }

  if (reservePct >= 8) {
    return {
      status: 'on_track',
      gapPct: Number(reservePct.toFixed(1)),
      label: 'On track',
      explanation:
        discipline === 'swim'
          ? 'Current swim threshold provides a useful margin above the required race pace.'
          : 'Current run threshold provides a useful margin above the required race pace.',
    };
  }

  return {
    status: 'development',
    gapPct: Number(reservePct.toFixed(1)),
    label: 'Development priority',
    explanation:
      reservePct >= 0
        ? discipline === 'swim'
          ? 'Race pace is close to current swim threshold, so aerobic efficiency and durability need development.'
          : 'Race pace is close to current run threshold, so durability and sustainable race pace need development.'
        : discipline === 'swim'
          ? 'The required race pace is currently faster than the recorded swim threshold.'
          : 'The required race pace is currently faster than the recorded run threshold.',
  };
}

export function calculateAthleteRaceGap({
  swimThresholdSecPer100m,
  swimGoalSecPer100m,
  runThresholdSecPerKm,
  runGoalSecPerKm,
  ftpW,
  bikeGoalAverageKph,
}: AthleteRaceGapInput) {
  const swim = paceGap(
    swimThresholdSecPer100m,
    swimGoalSecPer100m,
    'swim',
  );

  const run = paceGap(
    runThresholdSecPerKm,
    runGoalSecPerKm,
    'run',
  );

  const bike: DisciplineGap =
    ftpW != null &&
    ftpW > 0 &&
    bikeGoalAverageKph != null &&
    bikeGoalAverageKph > 0
      ? {
          status: 'insufficient_data',
          gapPct: null,
          label: 'Power model required',
          explanation:
            'AZUR has FTP and target bike speed, but speed alone is not enough to calculate a valid bike performance gap. Course profile, aerodynamic demand and sustainable race power are still required.',
        }
      : {
          status: 'insufficient_data',
          gapPct: null,
          label: 'More data needed',
          explanation:
            'Add current bike performance data and a valid race-power model before assessing the bike gap.',
        };

  return {
    swim,
    bike,
    run,
  };
}
