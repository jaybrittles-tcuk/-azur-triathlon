/** AZUR swim intelligence: conservative, explainable coaching cues.
 * Decision support only; does not modify athlete plans or diagnose stroke faults.
 */
export type SwimFocus = "breathing" | "alignment" | "kick" | "catch" | "timing" | "rhythm";
export type SwimAssessment = {
  observedFocus?: SwimFocus;
  cssSecondsPer100m?: number;
  cssMeasuredAt?: string;
  recentRepeatSplitsSecondsPer100m?: number[];
  athleteReportedRpe?: number;
  coachApproved?: boolean;
};
export type SwimInsight = {
  focus: SwimFocus | "pacing";
  headline: string;
  whyTodayMatters: string;
  coachingCue: string;
  evidence: string[];
  requiresCoachReview: boolean;
};
const cues: Record<SwimFocus, { headline: string; why: string; cue: string }> = {
  breathing: { headline: "Relaxed breathing", why: "Controlled exhalation and breathing timing can help you stay relaxed and keep your stroke organised.", cue: "Exhale comfortably underwater; avoid holding your breath or forcing bilateral breathing." },
  alignment: { headline: "Stable body position", why: "Reducing unnecessary side-to-side movement can help preserve momentum and improve efficiency.", cue: "Keep the head quiet and hands entering on their own tracks." },
  kick: { headline: "Economical kick", why: "For long-distance triathlon, an effective but economical kick can help limit unnecessary leg fatigue.", cue: "Use a compact kick from the hips; avoid exaggerated knee bend." },
  catch: { headline: "Consistent catch", why: "A controlled catch helps you direct force backwards rather than waste energy pressing down.", cue: "Set the forearm before pressing water backwards; never force a painful shoulder position." },
  timing: { headline: "Coordinated stroke timing", why: "Maintaining support through the front of the stroke may reduce interruptions to forward movement.", cue: "Keep the lead arm supported as you turn to breathe." },
  rhythm: { headline: "Sustainable swim rhythm", why: "A repeatable stroke rhythm supports consistent pacing over longer distances.", cue: "Find a smooth cadence you can sustain without rushing the catch." },
};
export function assessSwim(input: SwimAssessment): SwimInsight {
  const splits = (input.recentRepeatSplitsSecondsPer100m ?? []).filter(v => Number.isFinite(v) && v > 0);
  const evidence: string[] = [];
  if (input.cssSecondsPer100m && input.cssSecondsPer100m > 0) evidence.push("CSS benchmark available");
  if (splits.length >= 4) {
    const half = Math.floor(splits.length / 2);
    const avg = (xs: number[]) => xs.reduce((a,b)=>a+b,0)/xs.length;
    const drift = (avg(splits.slice(-half)) / avg(splits.slice(0,half)) - 1)*100;
    if (drift > 3) evidence.push("Later repeat pace >3% slower than early repeats; investigate effort, rest and conditions");
  }
  if (input.observedFocus) {
    const c = cues[input.observedFocus];
    evidence.push("Technique focus explicitly recorded by coach or athlete");
    return { focus: input.observedFocus, headline: c.headline, whyTodayMatters: c.why, coachingCue: c.cue, evidence, requiresCoachReview: !input.coachApproved };
  }
  return {
    focus: "pacing", headline: "Controlled swim pacing",
    whyTodayMatters: "Today develops repeatable pacing and stroke consistency without assuming that a slower split proves a technique fault.",
    coachingCue: "Aim for even repeats with controlled breathing; note perceived effort and any loss of technique.",
    evidence: evidence.length ? evidence : ["No validated technique assessment supplied"],
    requiresCoachReview: true,
  };
}
export function cssTargetSeconds(cssSecondsPer100m: number, distanceMetres: number, offsetSecondsPer100m = 0): number | null {
  if (![cssSecondsPer100m,distanceMetres,offsetSecondsPer100m].every(Number.isFinite) || cssSecondsPer100m <= 0 || distanceMetres <= 0 || cssSecondsPer100m + offsetSecondsPer100m <= 0) return null;
  return Math.round((cssSecondsPer100m + offsetSecondsPer100m)*distanceMetres/100);
}
