export type DisciplineReadiness = {
  threshold: number;
  durability: number;
  consistency: number;
  benchmarkTrend: number;
};

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));

export function disciplineScore(input: DisciplineReadiness): number {
  return mean([input.threshold, input.durability, input.consistency, input.benchmarkTrend]);
}

export function seasonalCeiling(daysToRace: number): number {
  if (daysToRace >= 250) return 70;
  if (daysToRace >= 180) return 70 + ((250 - daysToRace) / 70) * 8;
  if (daysToRace >= 120) return 78 + ((180 - daysToRace) / 60) * 8;
  if (daysToRace >= 60) return 86 + ((120 - daysToRace) / 60) * 8;
  if (daysToRace >= 28) return 94 + ((60 - daysToRace) / 32) * 6;
  return 100;
}

export function raceReadiness(args: {
  bike: DisciplineReadiness;
  run: DisciplineReadiness;
  swim: DisciplineReadiness;
  daysToRace: number;
}) {
  const bike = disciplineScore(args.bike);
  const run = disciplineScore(args.run);
  const swim = disciplineScore(args.swim);
  const raw = bike * 0.4 + run * 0.4 + swim * 0.2;
  const ceiling = seasonalCeiling(args.daysToRace);
  return {
    bike: clamp(bike),
    run: clamp(run),
    swim: clamp(swim),
    raw: clamp(raw),
    seasonalCeiling: clamp(ceiling),
    displayed: clamp(Math.min(raw, ceiling)),
  };
}
