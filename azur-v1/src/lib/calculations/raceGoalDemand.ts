export type RaceGoalDemandInput = {
  swimSplit?: string | null;
  bikeSplit?: string | null;
  runSplit?: string | null;
  swimDistanceM?: number | null;
  bikeDistanceKm?: number | null;
  runDistanceKm?: number | null;
};

export type RaceGoalDemand = {
  swimPaceSecPer100m: number | null;
  swimPaceLabel: string | null;
  bikeAverageKph: number | null;
  bikeAverageKphLabel: string | null;
  runPaceSecPerKm: number | null;
  runPaceLabel: string | null;
};

export function parseRaceSplitSeconds(
  value?: string | null,
) {
  if (!value) return null;

  const parts = value.split(':').map(Number);

  if (
    parts.some(
      (part) => !Number.isFinite(part) || part < 0,
    ) ||
    parts.length < 2 ||
    parts.length > 3
  ) {
    return null;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;

    if (minutes > 59 || seconds > 59) return null;

    return hours * 3600 + minutes * 60 + seconds;
  }

  const [hours, minutes] = parts;

  if (minutes > 59) return null;

  return hours * 3600 + minutes * 60;
}

export function formatRacePace(
  seconds: number | null,
) {
  if (
    seconds == null ||
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    return null;
  }

  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;

  return `${minutes}:${String(
    remainingSeconds,
  ).padStart(2, '0')}`;
}

export function calculateRaceGoalDemand({
  swimSplit,
  bikeSplit,
  runSplit,
  swimDistanceM,
  bikeDistanceKm,
  runDistanceKm,
}: RaceGoalDemandInput): RaceGoalDemand {
  const swimSeconds = parseRaceSplitSeconds(swimSplit);
  const bikeSeconds = parseRaceSplitSeconds(bikeSplit);
  const runSeconds = parseRaceSplitSeconds(runSplit);

  const swimPaceSecPer100m =
    swimSeconds != null &&
    swimDistanceM != null &&
    swimDistanceM > 0
      ? swimSeconds / (swimDistanceM / 100)
      : null;

  const bikeAverageKph =
    bikeSeconds != null &&
    bikeSeconds > 0 &&
    bikeDistanceKm != null &&
    bikeDistanceKm > 0
      ? bikeDistanceKm / (bikeSeconds / 3600)
      : null;

  const runPaceSecPerKm =
    runSeconds != null &&
    runDistanceKm != null &&
    runDistanceKm > 0
      ? runSeconds / runDistanceKm
      : null;

  return {
    swimPaceSecPer100m,
    swimPaceLabel: formatRacePace(
      swimPaceSecPer100m,
    ),
    bikeAverageKph,
    bikeAverageKphLabel:
      bikeAverageKph != null &&
      Number.isFinite(bikeAverageKph)
        ? bikeAverageKph.toFixed(1)
        : null,
    runPaceSecPerKm,
    runPaceLabel: formatRacePace(runPaceSecPerKm),
  };
}
