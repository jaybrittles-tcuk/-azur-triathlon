const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));

export function bikeDurability(args: {
  earlyPower: number;
  latePower: number;
  earlyHr: number;
  lateHr: number;
}) {
  const fadePct = ((args.earlyPower - args.latePower) / args.earlyPower) * 100;
  const driftPct = ((args.lateHr / args.latePower) / (args.earlyHr / args.earlyPower) - 1) * 100;
  const fadeScore = clamp(100 - Math.max(0, fadePct) * 7);
  const driftScore = clamp(100 - Math.max(0, driftPct) * 6);
  return { fadePct, driftPct, score: (fadeScore + driftScore) / 2 };
}

export function keySessionExecution(args: {
  plannedDurationMin: number;
  completedDurationMin: number;
  targetPower?: number;
  actualPower?: number;
  plannedRunPaceSecPerKm?: number;
  actualRunPaceSecPerKm?: number;
  durabilityScore?: number;
  rpe?: number;
}) {
  const duration = clamp(100 - Math.abs(args.completedDurationMin - args.plannedDurationMin) / args.plannedDurationMin * 100);
  const power = args.targetPower && args.actualPower
    ? clamp(100 - Math.abs(args.actualPower - args.targetPower) / args.targetPower * 250)
    : undefined;
  const run = args.plannedRunPaceSecPerKm && args.actualRunPaceSecPerKm
    ? clamp(100 - Math.abs(args.actualRunPaceSecPerKm - args.plannedRunPaceSecPerKm) / args.plannedRunPaceSecPerKm * 300)
    : undefined;
  const rpeContext = args.rpe == null ? 100 : args.rpe <= 7.5 ? 100 : args.rpe <= 8.5 ? 85 : 70;
  const values = [duration, power, run, args.durabilityScore, rpeContext].filter((v): v is number => v != null);
  return { score: values.reduce((a,b)=>a+b,0)/values.length, duration, power, run };
}
