export type DailyTrainingLoad = {
  date: string;
  stress: number;
};

export type TrainingLoadPoint = {
  date: string;
  stress: number;
  fitness: number;
  fatigue: number;
  form: number;
};

export function calculateTrainingLoad(
  days: DailyTrainingLoad[],
  startingFitness = 0,
  startingFatigue = 0,
): TrainingLoadPoint[] {
  let fitness = startingFitness;
  let fatigue = startingFatigue;

  return days.map((day) => {
    const form = fitness - fatigue;

    fitness =
      fitness + (day.stress - fitness) / 42;

    fatigue =
      fatigue + (day.stress - fatigue) / 7;

    return {
      date: day.date,
      stress: day.stress,
      fitness,
      fatigue,
      form,
    };
  });
}
export function calculateBikeTrainingStress(args: {
  durationSec: number;
  normalizedPower: number;
  ftp: number;
}) {
  if (
    args.durationSec <= 0 ||
    args.normalizedPower <= 0 ||
    args.ftp <= 0
  ) {
    return null;
  }

  const intensityFactor =
    args.normalizedPower / args.ftp;

  const stress =
    (args.durationSec / 3600) *
    Math.pow(intensityFactor, 2) *
    100;

  return {
    stress: Math.round(stress),
    intensityFactor,
  };
}
export function isTrainingLoadEligible(args: {
  source?: string;
  isTest?: boolean;
}) {
  if (args.isTest === true) {
    return false;
  }

  if (args.source === 'manual_test') {
    return false;
  }

  return true;
}
