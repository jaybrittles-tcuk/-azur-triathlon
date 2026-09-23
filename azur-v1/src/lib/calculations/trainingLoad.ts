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
