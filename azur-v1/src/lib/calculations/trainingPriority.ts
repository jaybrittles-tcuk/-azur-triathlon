export type TrainingPrioritySport =
  | 'swim'
  | 'bike'
  | 'run'
  | 'balanced';

export type ObjectiveGapStatus =
  | 'ahead'
  | 'on_track'
  | 'development'
  | 'insufficient_data';

export type TrainingPriorityInput = {
  developmentSport?: TrainingPrioritySport | string | null;
  strongestSport?: TrainingPrioritySport | string | null;
  phase?: string | null;
  swimGapStatus?: ObjectiveGapStatus | null;
  bikeGapStatus?: ObjectiveGapStatus | null;
  runGapStatus?: ObjectiveGapStatus | null;
  swimGapPct?: number | null;
  bikeGapPct?: number | null;
  runGapPct?: number | null;
};

export type TrainingPriorityResult = {
  resolvedPriority: TrainingPrioritySport;
  objectivePriority: TrainingPrioritySport;
  conflict: boolean;
  multipliers: {
    swim: number;
    bike: number;
    run: number;
  };
  rationale: string;
};

const SPORTS: Array<'swim' | 'bike' | 'run'> = [
  'swim',
  'bike',
  'run',
];

function normaliseSport(
  sport?: string | null,
): TrainingPrioritySport {
  return SPORTS.includes(
    sport as 'swim' | 'bike' | 'run',
  )
    ? (sport as 'swim' | 'bike' | 'run')
    : 'balanced';
}

function objectivePriorityFromGaps({
  swimGapStatus,
  bikeGapStatus,
  runGapStatus,
  swimGapPct,
  bikeGapPct,
  runGapPct,
}: Pick<
  TrainingPriorityInput,
  | 'swimGapStatus'
  | 'bikeGapStatus'
  | 'runGapStatus'
  | 'swimGapPct'
  | 'bikeGapPct'
  | 'runGapPct'
>): TrainingPrioritySport {
  const gaps = {
    swim: {
      status: swimGapStatus,
      gapPct: swimGapPct,
    },
    bike: {
      status: bikeGapStatus,
      gapPct: bikeGapPct,
    },
    run: {
      status: runGapStatus,
      gapPct: runGapPct,
    },
  };

  const developmentSports = SPORTS.filter(
    (sport) => gaps[sport].status === 'development',
  );

  if (developmentSports.length === 0) {
    return 'balanced';
  }

  if (developmentSports.length === 1) {
    return developmentSports[0];
  }

  const rankedDevelopmentSports = developmentSports
    .filter((sport) => Number.isFinite(gaps[sport].gapPct))
    .sort(
      (a, b) =>
        Number(gaps[a].gapPct) - Number(gaps[b].gapPct),
    );

  if (rankedDevelopmentSports.length === 0) {
    return 'balanced';
  }

  if (
    rankedDevelopmentSports.length > 1 &&
    Number(gaps[rankedDevelopmentSports[0]].gapPct) ===
      Number(gaps[rankedDevelopmentSports[1]].gapPct)
  ) {
    return 'balanced';
  }

  return rankedDevelopmentSports[0];
}

function phasePriorityStrength(phase?: string | null) {
  const phaseKey = String(phase ?? '').toLowerCase();

  if (phaseKey === 'race' || phaseKey.includes('taper')) {
    return 0;
  }

  if (phaseKey.includes('peak')) {
    return 0.35;
  }

  if (phaseKey.includes('race specific')) {
    return 0.65;
  }

  return 1;
}

export function resolveTrainingPriority({
  developmentSport,
  strongestSport,
  phase,
  swimGapStatus,
  bikeGapStatus,
  runGapStatus,
  swimGapPct,
  bikeGapPct,
  runGapPct,
}: TrainingPriorityInput): TrainingPriorityResult {
  const athletePriority = normaliseSport(developmentSport);
  const strongest = normaliseSport(strongestSport);

  const objectivePriority = objectivePriorityFromGaps({
    swimGapStatus,
    bikeGapStatus,
    runGapStatus,
    swimGapPct,
    bikeGapPct,
    runGapPct,
  });

  const conflict =
    athletePriority !== 'balanced' &&
    objectivePriority !== 'balanced' &&
    athletePriority !== objectivePriority;

  let resolvedPriority: TrainingPrioritySport;

  if (
    athletePriority !== 'balanced' &&
    objectivePriority === athletePriority
  ) {
    resolvedPriority = athletePriority;
  } else if (
    athletePriority === 'balanced' &&
    objectivePriority !== 'balanced'
  ) {
    resolvedPriority = objectivePriority;
  } else if (
    athletePriority !== 'balanced' &&
    objectivePriority === 'balanced'
  ) {
    resolvedPriority = athletePriority;
  } else if (conflict) {
    resolvedPriority = athletePriority;
  } else {
    resolvedPriority = 'balanced';
  }

  const phaseStrength = phasePriorityStrength(phase);

  const multipliers = {
    swim: 1,
    bike: 1,
    run: 1,
  };

  if (phaseStrength > 0) {
    for (const sport of SPORTS) {
      if (sport === strongest) {
        multipliers[sport] -= 0.06 * phaseStrength;
      }
    }

    if (resolvedPriority !== 'balanced') {
      const aligned =
        resolvedPriority === athletePriority &&
        resolvedPriority === objectivePriority;

      const baseBoost = aligned ? 0.18 : 0.12;

      multipliers[resolvedPriority] +=
        baseBoost * phaseStrength;
    }
  }

  for (const sport of SPORTS) {
    multipliers[sport] = Number(
      Math.max(0.9, multipliers[sport]).toFixed(3),
    );
  }

  let rationale: string;

  if (phaseStrength === 0) {
    rationale =
      'Taper and race week protect freshness and race execution, so AZUR does not increase discipline volume from development-priority signals.';
  } else if (conflict) {
    rationale =
      `Athlete-selected development priority is ${athletePriority}, while the objective race-gap signal points to ${objectivePriority}. AZUR keeps the athlete/coach priority for now and flags the mismatch for review rather than silently overriding it.`;
  } else if (
    resolvedPriority !== 'balanced' &&
    resolvedPriority === athletePriority &&
    resolvedPriority === objectivePriority
  ) {
    rationale =
      `Athlete-selected development priority and objective race-gap analysis both point to ${resolvedPriority}, so AZUR applies a stronger phase-adjusted emphasis.`;
  } else if (
    athletePriority === 'balanced' &&
    objectivePriority !== 'balanced'
  ) {
    rationale =
      `Objective race-gap analysis identifies ${objectivePriority} as the clearest development need, so AZUR applies a phase-adjusted emphasis there.`;
  } else if (
    athletePriority !== 'balanced' &&
    objectivePriority === 'balanced'
  ) {
    rationale =
      `AZUR retains the athlete/coach-selected ${athletePriority} development priority because the current objective gap data does not identify a single competing priority.`;
  } else {
    rationale =
      'No single discipline currently dominates the development signals, so AZUR keeps the plan balanced.';
  }

  return {
    resolvedPriority,
    objectivePriority,
    conflict,
    multipliers,
    rationale,
  };
}
