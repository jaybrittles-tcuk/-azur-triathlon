export function dailyReadiness(input: {
  hrvVs30dPct: number;
  rhrVs30dPct: number;
  sleepVs30dPct: number;
  priorDayRpe: number;
  loadFatigueSignal: number;
  niggleSeverity: number;
  poorDaysLast3: number;
}) {
  let flags = 0;
  if (input.hrvVs30dPct < -5) flags++;
  if (input.rhrVs30dPct > 4) flags++;
  if (input.sleepVs30dPct < -5) flags++;
  if (input.priorDayRpe >= 8) flags++;
  if (input.loadFatigueSignal >= 80) flags++;
  if (input.niggleSeverity >= 5) flags += 2;

  if (flags >= 4 || (input.poorDaysLast3 >= 3 && input.loadFatigueSignal >= 75) || input.niggleSeverity >= 6) {
    return { color: 'red' as const, implication: 'reduce_training_stress' as const };
  }
  if (flags >= 2 || input.poorDaysLast3 >= 2 || (input.niggleSeverity >= 3 && input.poorDaysLast3 >= 1)) {
    return { color: 'amber' as const, implication: 'hold_or_trim_cost' as const };
  }
  return { color: 'green' as const, implication: 'proceed_as_planned' as const };
}
