import { useEffect, useMemo, useState } from 'react';
import FitParser from 'fit-file-parser';
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Cloud,
  Database,
  Gauge,
  HeartPulse,
  Home,
  Lock,
  LogOut,
  Medal,
  RefreshCw,
  Save,
  TrendingUp,
  Unlock,
  User,
ChevronRight,
Bike,
Footprints,
Waves,
} from 'lucide-react';

import type { PlannedSession, Sport } from '../domain/types';
import { supabase } from '../lib/supabase';
import { keySessionExecution } from '../lib/calculations/sessionExecution';
import { dailyReadiness } from '../lib/calculations/recovery';
import {
  calculateBikeTrainingStress,
  calculateRunTrainingStress,
  calculateSwimTrainingStress,
  calculateTrainingLoad,
  isTrainingLoadEligible,
} from '../lib/calculations/trainingLoad';
const navigation = [
  [Home, 'Home'],
  [CalendarDays, 'Calendar'],
  [TrendingUp, 'Performance'],
  [HeartPulse, 'Recovery'],
  [Medal, 'Races'],
  [Gauge, 'Benchmarks'],
  [Activity, 'Weekly Review'],
  [Database, 'Data Sources'],
  [RefreshCw, 'Strava Feed'],
] as const;

type Session = PlannedSession & {
  dayLabel: string;
  accent: string;

  completedDurationSec?: number;
  completedDistanceM?: number;
completedSource?: string;
  completedIntervals?: Array<{
  durationSec: number;
  averagePower?: number;
  averageHeartRate?: number;
}>;
  completedMetrics?: {
  averagePower?: number;
  normalizedPower?: number;
  averageHeartRate?: number;
  maxHeartRate?: number;
  calories?: number;
  trainingLoad?: number;
  isTest?: boolean;
};
};

const sessions: Session[] = [
  {
    id: 'mon-swim',
    seasonWeekId: 'w1',
    plannedDate: '2026-09-21',
    sport: 'swim',
    title: 'Aerobic Technique Swim',
    sessionClass: 'easy',
    priority: 2,
    durationMin: 45,
    targets: { rpe: 'RPE 4–5' },
    prescription: {},
    rationale: 'Low-cost aerobic work with a focus on technique quality.',
    terrain: 'Pool',
    status: 'planned',
    locked: false,
    version: 1,
    dayLabel: 'MON',
    accent: 'swim',
  },
  {
    id: 'tue-bike',
    seasonWeekId: 'w1',
    plannedDate: '2026-09-22',
    sport: 'bike',
    title: 'Threshold Development',
    sessionClass: 'intensity',
    priority: 1,
    durationMin: 100,
    targets: { power: '4 × 10 min @ 299–315 W' },
    prescription: {},
    rationale:
      'Raises the power ceiling so full-distance race power costs less physiologically.',
    terrain: 'Indoor / Road',
    status: 'planned',
    locked: true,
    version: 1,
    dayLabel: 'TUE',
    accent: 'bike',
  },
  {
    id: 'wed-run',
    seasonWeekId: 'w1',
    plannedDate: '2026-09-23',
    sport: 'run',
    title: 'Controlled Threshold Run',
    sessionClass: 'intensity',
    priority: 1,
    durationMin: 70,
    targets: { pace: '3 × 12 min @ 3:32–3:40/km' },
    prescription: {},
    rationale:
      'Maintains threshold strength while developing long-course run resilience.',
    terrain: 'Flat / Rolling',
    status: 'planned',
    locked: false,
    version: 1,
    dayLabel: 'WED',
    accent: 'run',
  },
  {
    id: 'thu-bike',
    seasonWeekId: 'w1',
    plannedDate: '2026-09-24',
    sport: 'bike',
    title: 'Strength Endurance Bike',
    sessionClass: 'endurance',
    priority: 1,
    durationMin: 85,
    targets: { power: '3 × 15 min @ 258–277 W' },
    prescription: {},
    rationale:
      'Builds sustainable torque without turning Thursday into another threshold day.',
    terrain: 'Road / Indoor',
    status: 'planned',
    locked: false,
    version: 1,
    dayLabel: 'THU',
    accent: 'bike',
  },
  {
    id: 'fri-swim',
    seasonWeekId: 'w1',
    plannedDate: '2026-09-25',
    sport: 'swim',
    title: 'Endurance Swim',
    sessionClass: 'endurance',
    priority: 2,
    durationMin: 70,
    targets: { rpe: 'RPE 5–6' },
    prescription: {},
    rationale: 'Builds aerobic endurance and pace consistency.',
    terrain: 'Pool',
    status: 'planned',
    locked: false,
    version: 1,
    dayLabel: 'FRI',
    accent: 'swim',
  },
  {
    id: 'sat-brick',
    seasonWeekId: 'w1',
    plannedDate: '2026-09-26',
    sport: 'bike',
    title: 'Long-Course Brick',
    sessionClass: 'race_specific',
    priority: 1,
    durationMin: 220,
    targets: { power: 'Bike 221–239 W + progressive run' },
    prescription: {},
    rationale:
      'Develops race-specific bike durability and efficient running under fatigue.',
    terrain: 'Rolling',
    status: 'planned',
    locked: true,
    version: 1,
    dayLabel: 'SAT',
    accent: 'bike',
  },
  {
    id: 'sun-run',
    seasonWeekId: 'w1',
    plannedDate: '2026-09-27',
    sport: 'run',
    title: 'Progressive Long Run',
    sessionClass: 'endurance',
    priority: 1,
    durationMin: 85,
    targets: { pace: 'Easy → steady' },
    prescription: {},
    rationale:
      'Develops long-course durability without unnecessary marathon-style intensity.',
    terrain: 'Rolling',
    status: 'planned',
    locked: false,
    version: 1,
    dayLabel: 'SUN',
    accent: 'run',
  },
];

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="metric-card">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}
function WorkoutShape({
  sessionClass,
}: {
  sessionClass: string;
}) {
  const blocks =
    sessionClass === 'intensity'
      ? [28, 28, 82, 34, 82, 34, 82, 34, 28]
      : sessionClass === 'race_specific'
        ? [24, 38, 56, 70, 70, 70, 56, 38, 24]
        : sessionClass === 'endurance'
          ? [24, 34, 44, 50, 50, 50, 44, 34, 24]
          : [22, 28, 32, 34, 34, 32, 28, 22];

  return (
    <div className="workout-shape" aria-hidden="true">
      {blocks.map((height, index) => (
        <span
          key={index}
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
}

function ProgressRow({
  label,
  value,
  text,
}: {
  label: string;
  value: number | null;
  text: string;
}) {
  return (
    <div className="progress-row">
      <div className="progress-copy">
        <strong>{label}</strong>
        <small>{text}</small>
      </div>

      <div className="progress-track">
        <span
          style={{
            width: value != null ? `${value}%` : '0%',
          }}
        />
      </div>

      <b>{value != null ? `${value}%` : '—'}</b>
    </div>
  );
}


function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (!hours) return `${remainder}m`;

  return `${hours}h ${remainder ? `${remainder}m` : ''}`.trim();
}

function sportName(sport: Sport) {
  return sport.charAt(0).toUpperCase() + sport.slice(1);
}

export function App() {
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [athleteName, setAthleteName] = useState('Athlete');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
const [profileSaveMessage, setProfileSaveMessage] = useState('');
  function formatPaceInput(seconds: number | null) {
  if (!seconds) return '';

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function parsePaceInput(value: string) {
  const parts = value.split(':');

  if (parts.length !== 2) return null;

  const minutes = Number(parts[0]);
  const seconds = Number(parts[1]);

  if (
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    minutes < 0 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }

  return minutes * 60 + seconds;
}
  const [profileDraft, setProfileDraft] = useState({
  ftp: '',
  runThreshold: '',
  swimThreshold: '',
  weight: '',
  targetWeight: '',
});
  const [athleteProfile, setAthleteProfile] = useState({
  ftp: null as number | null,
  runThreshold: null as number | null,
  swimThreshold: null as number | null,
  weight: null as number | null,
  targetWeight: null as number | null,
});
  const [primaryRace, setPrimaryRace] = useState({
  name: '',
  raceDate: '',
  priority: '',
  location: '',
  targetSplits: null as null | {
    swim?: string;
    bike?: string;
    run?: string;
    target_total?: string;
  },
});
  const [activeNav, setActiveNav] = useState('Home');
  const [weekSessions, setWeekSessions] = useState<Session[]>(sessions);
  const [selectedId, setSelectedId] = useState('tue-bike');
  const [sessionDetailOpen, setSessionDetailOpen] = useState(false);
  const [calendarWeekOffset, setCalendarWeekOffset] = useState(0);
  const [selectedStravaActivity, setSelectedStravaActivity] =
  useState<number | null>(null);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importStatus, setImportStatus] = useState('');
const [importLoading, setImportLoading] = useState(false);
  const [weekVersion, setWeekVersion] = useState(1);
const [sessionFeedback, setSessionFeedback] = useState({
  rpe: '',
  notes: '',
});

const [sessionFeedbackSaving, setSessionFeedbackSaving] = useState(false);
const [sessionFeedbackMessage, setSessionFeedbackMessage] = useState('');

const [trainingLoad, setTrainingLoad] = useState({
  fitness: null as number | null,
  fatigue: null as number | null,
  form: null as number | null,
  weeklyStress: null as number | null,
  eligibleActivities: 0,
});

const [trainingLoadActivities, setTrainingLoadActivities] = useState<any[]>([]);
  const [completedActivityFeed, setCompletedActivityFeed] = useState<any[]>([]);
useEffect(() => {
  if (trainingLoadActivities.length === 0) {
    return;
  }

  const activitiesWithStress = trainingLoadActivities
    .map((activity) => {
      let result = null;

      if (
        activity.sport === 'bike' &&
        athleteProfile.ftp &&
        activity.duration_sec > 0 &&
        activity.processed_metrics?.normalized_power != null
      ) {
        result = calculateBikeTrainingStress({
          durationSec: Number(activity.duration_sec),
          normalizedPower: Number(
            activity.processed_metrics.normalized_power,
          ),
          ftp: athleteProfile.ftp,
        });
      }

      if (
        activity.sport === 'run' &&
        athleteProfile.runThreshold &&
        activity.duration_sec > 0 &&
        activity.distance_m != null
      ) {
        result = calculateRunTrainingStress({
          durationSec: Number(activity.duration_sec),
          distanceM: Number(activity.distance_m),
          thresholdSecPerKm: athleteProfile.runThreshold,
        });
      }

      if (
        activity.sport === 'swim' &&
        athleteProfile.swimThreshold &&
        activity.duration_sec > 0 &&
        activity.distance_m != null
      ) {
        result = calculateSwimTrainingStress({
          durationSec: Number(activity.duration_sec),
          distanceM: Number(activity.distance_m),
          thresholdSecPer100m: athleteProfile.swimThreshold,
        });
      }

      return {
        ...activity,
        calculatedStress: result?.stress ?? null,
      };
    })
    .filter((activity) => activity.calculatedStress != null);

  if (activitiesWithStress.length === 0) {
    return;
  }

  const stressByDate = new Map<string, number>();

  activitiesWithStress.forEach((activity) => {
    const date = new Date(activity.start_time)
      .toISOString()
      .slice(0, 10);

    stressByDate.set(
      date,
      (stressByDate.get(date) ?? 0) + activity.calculatedStress,
    );
  });

  const firstDate = new Date(activitiesWithStress[0].start_time);
  const today = new Date();

  const dailyStress = [];

  for (
    let date = new Date(firstDate);
    date <= today;
    date.setDate(date.getDate() + 1)
  ) {
    const dateKey = date.toISOString().slice(0, 10);

    dailyStress.push({
      date: dateKey,
      stress: stressByDate.get(dateKey) ?? 0,
    });
  }

  const loadSeries = calculateTrainingLoad(dailyStress);

  const latestLoad =
    loadSeries.length > 0
      ? loadSeries[loadSeries.length - 1]
      : null;

const last7Days = dailyStress.slice(-7);

const weeklyStress = last7Days.reduce(
  (total, day) => total + day.stress,
  0,
);

const hasSufficientHistory =
  dailyStress.length >= 42 &&
  activitiesWithStress.length >= 8;

setTrainingLoad({
  fitness:
    hasSufficientHistory && latestLoad
      ? Math.round(latestLoad.fitness)
      : null,

  fatigue:
    hasSufficientHistory && latestLoad
      ? Math.round(latestLoad.fatigue)
      : null,

  form:
    hasSufficientHistory && latestLoad
      ? Math.round(latestLoad.form)
      : null,

  weeklyStress: Math.round(weeklyStress),

  eligibleActivities: activitiesWithStress.length,
});

console.log('Azur daily training stress:', dailyStress);
console.log('Azur combined training load series:', loadSeries);
console.log('Azur latest combined training load:', latestLoad);
}, [
  trainingLoadActivities,
  athleteProfile.ftp,
  athleteProfile.runThreshold,
  athleteProfile.swimThreshold,
]);
  const [recoveryContext, setRecoveryContext] = useState({
  hrvVs30dPct: null as number | null,
  rhrVs30dPct: null as number | null,
  sleepVs30dPct: null as number | null,
  priorDayRpe: null as number | null,
  loadFatigueSignal: null as number | null,
  niggleSeverity: null as number | null,
  poorDaysLast3: 0,
});
  const [decision, setDecision] = useState<
    'pending' | 'accepted' | 'rejected'
  >('pending');
async function loadAthleteProfile(userId: string) {
  const { data, error } = await supabase
    .from('athlete_profile')
.select(
  'display_name, avatar_url, ftp_w, run_threshold_sec_per_km, swim_threshold_sec_per_100m, weight_kg, target_weight_kg'
)
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error('Unable to load athlete profile:', error);
    return;
  }

  if (data?.display_name) {
    setAthleteName(data.display_name);
  }
if (data?.avatar_url) {
  setAvatarUrl(data.avatar_url);
}  setAthleteProfile({
    ftp: data?.ftp_w ?? null,
    runThreshold: data?.run_threshold_sec_per_km ?? null,
    swimThreshold: data?.swim_threshold_sec_per_100m ?? null,
    weight: data?.weight_kg ?? null,
    targetWeight: data?.target_weight_kg ?? null,
  });
}

async function loadPrimaryRace(userId: string) {
  const { data: athlete, error: athleteError } = await supabase
    .from('athlete_profile')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (athleteError || !athlete) {
    console.error('Unable to load athlete id:', athleteError);
    return;
  }

  const { data, error } = await supabase
    .from('race')
    .select('name, race_date, priority, location, target_splits')
    .eq('athlete_id', athlete.id)
    .eq('priority', 'A')
    .order('race_date', { ascending: true })
    .limit(1)
    .single();

  if (error) {
    console.error('Unable to load primary race:', error);
    return;
  }

  setPrimaryRace({
    name: data.name,
    raceDate: data.race_date,
    priority: data.priority,
    location: data.location ?? '',
    targetSplits: data.target_splits,
  });
}

async function loadPlannedSessions(userId: string) {
  const { data: athlete, error: athleteError } = await supabase
    .from('athlete_profile')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (athleteError || !athlete) {
    console.error('Unable to load athlete id for sessions:', athleteError);
    return;
  }

  const { data, error } = await supabase
    .from('planned_session')
    .select(
      'id, planned_date, sport, title, session_class, priority, duration_min, targets, prescription, rationale, terrain, status, locked, version',
    )
    .eq('athlete_id', athlete.id)
    .eq('is_active_version', true)
    .order('planned_date', { ascending: true });

  if (error) {
    console.error('Unable to load planned sessions:', error);
    return;
  }

  if (!data || data.length === 0) {
    return;
  }

const { data: completedActivities, error: completedError } =
  await supabase
    .from('completed_activity')
    .select(
      'planned_session_id, sport, start_time, duration_sec, distance_m, source, processed_metrics',
    )
    .eq('athlete_id', athlete.id)
    .order('start_time', { ascending: true });

  if (completedError) {
    console.error(
      'Unable to load completed activities:',
      completedError,
    );
  }
  setCompletedActivityFeed(
  [...(completedActivities ?? [])].reverse(),
);
const eligibleTrainingLoadActivities = (completedActivities ?? []).filter(
  (activity) =>
    isTrainingLoadEligible({
      source: activity.source,
      isTest: activity.processed_metrics?.is_test === true,
    }),
);

setTrainingLoadActivities(eligibleTrainingLoadActivities);
  const completedSessionIds = new Set(
    (completedActivities ?? [])
      .map((activity) => activity.planned_session_id)
      .filter(Boolean),
  );
const completedBySessionId = new Map(
  (completedActivities ?? []).map((activity) => [
    activity.planned_session_id,
    activity,
  ]),
);
  const liveSessions: Session[] = data.map((session) => ({
    id: session.id,
    seasonWeekId: '',
    plannedDate: session.planned_date,
    sport: session.sport,
    title: session.title,
    sessionClass: session.session_class,
    priority: session.priority,
durationMin: session.duration_min,

completedDurationSec:
  completedBySessionId.get(session.id)?.duration_sec ?? undefined,

completedDistanceM:
  completedBySessionId.get(session.id)?.distance_m != null
    ? Number(completedBySessionId.get(session.id)?.distance_m)
    : undefined,
    
completedSource:
  completedBySessionId.get(session.id)?.source ?? undefined,
    completedIntervals: (() => {
  const metrics =
    completedBySessionId.get(session.id)?.processed_metrics ?? {};

  const intervals = metrics.completed_intervals;

  if (!Array.isArray(intervals)) {
    return undefined;
  }

  return intervals.map((interval) => ({
    durationSec: Number(interval.duration_sec),
    averagePower:
      interval.average_power != null
        ? Number(interval.average_power)
        : undefined,
    averageHeartRate:
      interval.average_heart_rate != null
        ? Number(interval.average_heart_rate)
        : undefined,
  }));
})(),
completedMetrics: (() => {
  const metrics =
    completedBySessionId.get(session.id)?.processed_metrics ?? {};

  return {
    averagePower: metrics.average_power,
    normalizedPower: metrics.normalized_power,
    averageHeartRate: metrics.average_heart_rate,
    maxHeartRate: metrics.max_heart_rate,
    calories: metrics.calories,
    trainingLoad: metrics.training_load,
    isTest: metrics.test_fixture === true,
  };
})(),

targets: session.targets ?? {},
    prescription: session.prescription ?? {},
    rationale: session.rationale ?? '',
    terrain: session.terrain ?? '',
       status: completedSessionIds.has(session.id)
      ? 'completed'
      : session.status,
    locked: session.locked,
    version: session.version,
    dayLabel: new Date(
      `${session.planned_date}T12:00:00`,
    )
      .toLocaleDateString('en-GB', { weekday: 'short' })
      .toUpperCase(),
    accent: session.sport,
  }));

  setWeekSessions(liveSessions);
  setSelectedId(liveSessions[0].id);
}


useEffect(() => {
  supabase.auth.getSession().then(({ data }) => {
    setIsAuthenticated(!!data.session);

if (data.session?.user) {
  loadAthleteProfile(data.session.user.id);
  loadPrimaryRace(data.session.user.id);
  loadPlannedSessions(data.session.user.id);
}

    setAuthReady(true);
  });

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    setIsAuthenticated(!!session);

if (session?.user) {
  loadAthleteProfile(session.user.id);
  loadPrimaryRace(session.user.id);
  loadPlannedSessions(session.user.id);
}

    setAuthReady(true);
  });

  return () => {
    subscription.unsubscribe();
  };
}, []);
  const selected =
    weekSessions.find((session) => session.id === selectedId) ||
    weekSessions[0];
  const selectedExecution =
  selected?.status === 'completed' &&
  selected.completedDurationSec
    ? keySessionExecution({
        plannedDurationMin: selected.durationMin,
        completedDurationMin:
          selected.completedDurationSec / 60,
        rpe: sessionFeedback.rpe
          ? Number(sessionFeedback.rpe)
          : undefined,
      })
    : null;
  const plannedMainSet =
  Array.isArray(selected?.prescription?.main_set)
    ? selected.prescription.main_set[0]
    : null;
  const recoveryReadiness =
  recoveryContext.hrvVs30dPct != null &&
  recoveryContext.rhrVs30dPct != null &&
  recoveryContext.sleepVs30dPct != null &&
  recoveryContext.priorDayRpe != null &&
  recoveryContext.loadFatigueSignal != null &&
  recoveryContext.niggleSeverity != null
    ? dailyReadiness({
        hrvVs30dPct: recoveryContext.hrvVs30dPct,
        rhrVs30dPct: recoveryContext.rhrVs30dPct,
        sleepVs30dPct: recoveryContext.sleepVs30dPct,
        priorDayRpe: recoveryContext.priorDayRpe,
        loadFatigueSignal: recoveryContext.loadFatigueSignal,
        niggleSeverity: recoveryContext.niggleSeverity,
        poorDaysLast3: recoveryContext.poorDaysLast3,
      })
    : null;
  const plannedPowerRange = (() => {
  if (
    selected?.sport !== 'bike' ||
    !plannedMainSet?.ftp_percent ||
    !athleteProfile.ftp
  ) {
    return null;
  }

  const percentages = String(plannedMainSet.ftp_percent)
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number);

  if (!percentages || percentages.length < 2) {
    return null;
  }

  return {
    min: Math.round(
      athleteProfile.ftp * (percentages[0] / 100),
    ),
    max: Math.round(
      athleteProfile.ftp * (percentages[1] / 100),
    ),
  };
})();
  const intervalPowerAnalysis = (() => {
  if (
    !plannedPowerRange ||
    !selected?.completedIntervals?.length
  ) {
    return null;
  }

const plannedIntervalDurationSec =
  Number(plannedMainSet?.duration_min ?? 0) * 60;

const intervals = selected.completedIntervals.map(
  (interval, index) => {
    const durationDifference =
      plannedIntervalDurationSec > 0
        ? Math.abs(
            interval.durationSec - plannedIntervalDurationSec,
          ) / plannedIntervalDurationSec
        : null;

    return {
      number: index + 1,
power: interval.averagePower,
heartRate: interval.averageHeartRate,
durationSec: interval.durationSec,

onTarget:
  interval.averagePower != null &&
  interval.averagePower >= plannedPowerRange.min &&
  interval.averagePower <= plannedPowerRange.max &&
  durationDifference != null &&
  durationDifference <= 0.05,

      durationOnTarget:
        durationDifference != null &&
        durationDifference <= 0.05,
    };
  },
);
const firstInterval = intervals[0];
const lastInterval = intervals[intervals.length - 1];

const powerFadePct =
  firstInterval?.power != null &&
  lastInterval?.power != null &&
  firstInterval.power > 0
    ? ((firstInterval.power - lastInterval.power) /
        firstInterval.power) *
      100
    : null;

const heartRateRiseBpm =
  firstInterval?.heartRate != null &&
  lastInterval?.heartRate != null
    ? lastInterval.heartRate - firstInterval.heartRate
    : null;

return {
  intervals,
  planned: Number(plannedMainSet?.reps ?? intervals.length),
  completed: intervals.length,
  powerFadePct,
heartRateRiseBpm,
  onTarget: intervals.filter(
    (interval) => interval.onTarget,
  ).length,
};
})();
  const intervalInterpretation = (() => {
  if (!intervalPowerAnalysis) {
    return null;
  }

  const allIntervalsOnTarget =
    intervalPowerAnalysis.onTarget ===
    intervalPowerAnalysis.planned;

  const powerChange =
    intervalPowerAnalysis.powerFadePct != null
      ? `${intervalPowerAnalysis.powerFadePct > 0 ? '−' : '+'}${Math.abs(
          intervalPowerAnalysis.powerFadePct,
        ).toFixed(1)}%`
      : null;

  const heartRateChange =
    intervalPowerAnalysis.heartRateRiseBpm != null
      ? `${intervalPowerAnalysis.heartRateRiseBpm > 0 ? '+' : ''}${intervalPowerAnalysis.heartRateRiseBpm} bpm`
      : null;

  return {
    title: allIntervalsOnTarget
      ? 'Planned interval stimulus achieved'
      : 'Planned interval stimulus partially achieved',

    summary: allIntervalsOnTarget
      ? `All ${intervalPowerAnalysis.planned} prescribed work intervals were completed within the required power and duration targets.`
      : `${intervalPowerAnalysis.onTarget} of ${intervalPowerAnalysis.planned} prescribed work intervals were completed within the required power and duration targets.`,

    trend:
      powerChange && heartRateChange
        ? `From the first to final work interval, power changed by ${powerChange} while heart rate changed by ${heartRateChange}.`
        : null,
  };
})();
  const coachingImpact = (() => {
  if (!intervalPowerAnalysis) {
    return null;
  }

  const allIntervalsOnTarget =
    intervalPowerAnalysis.onTarget ===
    intervalPowerAnalysis.planned;
const athleteRpe = sessionFeedback.rpe
  ? Number(sessionFeedback.rpe)
  : null;

const prescribedRpeValues = plannedMainSet?.rpe
  ? String(plannedMainSet.rpe)
      .match(/\d+(?:\.\d+)?/g)
      ?.map(Number)
  : null;

const prescribedRpeMax =
  prescribedRpeValues?.length
    ? Math.max(...prescribedRpeValues)
    : null;
const prescribedRpeMin =
  prescribedRpeValues?.length
    ? Math.min(...prescribedRpeValues)
    : null;const rpeAboveTarget =
  athleteRpe != null &&
  prescribedRpeMax != null &&
  athleteRpe > prescribedRpeMax;
    const recoveryNeedsReview =
  recoveryReadiness?.color === 'amber' ||
  recoveryReadiness?.color === 'red';

const recoveryIsRed =
  recoveryReadiness?.color === 'red';

return {
  status:
    !allIntervalsOnTarget ||
    rpeAboveTarget ||
    recoveryNeedsReview
      ? 'REVIEW'
      : 'MAINTAIN',

  title:
    recoveryIsRed
      ? 'Recovery signals require attention'
      : recoveryNeedsReview
        ? 'Recovery signals suggest caution'
        : allIntervalsOnTarget && rpeAboveTarget
          ? 'Execution achieved — monitor response'
          : allIntervalsOnTarget
            ? 'Continue current progression'
            : 'Review before progressing',

  summary:
    recoveryIsRed
      ? 'Your recovery signals indicate elevated strain around this session. Workout execution should be considered alongside this recovery context before increasing training demand.'
      : recoveryNeedsReview
        ? 'Your recovery signals suggest some accumulated fatigue. This does not automatically require a plan change, but it adds important context to the session response.'
        : allIntervalsOnTarget && rpeAboveTarget
          ? `The prescribed interval work was achieved, but your reported RPE of ${athleteRpe} was above the prescribed RPE range of ${prescribedRpeMin}–${prescribedRpeMax}. This suggests the session required more effort than intended.`
          : allIntervalsOnTarget
            ? 'This session supports your current threshold development focus. One successful workout is not enough evidence to increase training demand.'
            : 'Part of the prescribed interval work was missed. Azur will consider this alongside recovery and athlete feedback before recommending any change.',

  nextStep:
    recoveryIsRed
      ? 'Review recovery and training stress before progressing the next key session. Azur will not change the plan without athlete approval.'
      : recoveryNeedsReview
        ? 'Maintain or adjust training only when the wider recovery trend and upcoming session demands support it. Any plan change requires athlete approval.'
        : allIntervalsOnTarget && rpeAboveTarget
          ? 'No plan change is recommended from this session alone. Azur will compare your next sessions and recovery data before deciding whether progression is appropriate.'
          : allIntervalsOnTarget
            ? 'Azur will compare this execution with upcoming threshold sessions, recovery and athlete feedback before recommending progression.'
            : 'Maintain the current plan until execution, recovery and athlete feedback provide enough evidence for a coaching decision.',
};
  
})();
useEffect(() => {
  async function loadSessionFeedback() {
    if (!selected?.id) return;

    setSessionFeedbackMessage('');

    const { data, error } = await supabase
      .from('session_feedback')
      .select('session_rpe, notes')
      .eq('planned_session_id', selected.id)
      .maybeSingle();

    if (error) {
      console.error(
        'Unable to load session feedback:',
        error,
      );
      return;
    }

    setSessionFeedback({
      rpe: data?.session_rpe?.toString() ?? '',
      notes: data?.notes ?? '',
    });
  }

  loadSessionFeedback();
}, [selected?.id]);
useEffect(() => {
  async function loadRecoveryContext() {
    if (!selected?.plannedDate) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data: athlete, error: athleteError } =
      await supabase
        .from('athlete_profile')
        .select('id')
        .eq('user_id', user.id)
        .single();

    if (athleteError || !athlete) {
      console.error(
        'Unable to load athlete for recovery:',
        athleteError,
      );
      return;
    }

    const { data, error } = await supabase
      .from('recovery_record')
      .select(
        'hrv_vs_30d_pct, rhr_vs_30d_pct, sleep_vs_30d_pct, prior_day_rpe, load_fatigue_signal, niggle_severity',
      )
      .eq('athlete_id', athlete.id)
      .eq('record_date', selected.plannedDate)
      .maybeSingle();

    if (error) {
      console.error(
        'Unable to load recovery context:',
        error,
      );
      return;
    }

    setRecoveryContext({
      hrvVs30dPct: data?.hrv_vs_30d_pct ?? null,
      rhrVs30dPct: data?.rhr_vs_30d_pct ?? null,
      sleepVs30dPct: data?.sleep_vs_30d_pct ?? null,
      priorDayRpe: data?.prior_day_rpe ?? null,
      loadFatigueSignal: data?.load_fatigue_signal ?? null,
      niggleSeverity: data?.niggle_severity ?? null,
      poorDaysLast3: 0,
    });
  }

  loadRecoveryContext();
}, [selected?.plannedDate]);
  const hasRecoveryData =
  recoveryContext.hrvVs30dPct != null &&
  recoveryContext.rhrVs30dPct != null &&
  recoveryContext.sleepVs30dPct != null &&
  recoveryContext.priorDayRpe != null &&
  recoveryContext.loadFatigueSignal != null &&
  recoveryContext.niggleSeverity != null;
  const totalMinutes = useMemo(
    () =>
      weekSessions.reduce(
        (total, session) => total + session.durationMin,
        0,
      ),
    [weekSessions],
  );

  const totalHours = totalMinutes / 60;

const daysToRace = primaryRace.raceDate
  ? Math.max(
      0,
      Math.ceil(
        (new Date(primaryRace.raceDate).getTime() -
          new Date().getTime()) /
          86400000,
      ),
    )
  : 0;

  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

  function toggleLock() {
    setWeekSessions((current) =>
      current.map((session) =>
        session.id === selected.id
          ? { ...session, locked: !session.locked }
          : session,
      ),
    );
  }

  function updateDuration(value: number) {
    setWeekSessions((current) =>
      current.map((session) =>
        session.id === selected.id
          ? {
              ...session,
              durationMin: value,
              version: session.version + 1,
              status: 'edited',
            }
          : session,
      ),
    );

    setWeekVersion((current) => current + 1);
  }
const now = new Date();

const todayKey = `${now.getFullYear()}-${String(
  now.getMonth() + 1,
).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const calendarWeekSessions = useMemo(() => {
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );

  const daysFromMonday = (start.getDay() + 6) % 7;

  start.setDate(
    start.getDate() -
      daysFromMonday +
      calendarWeekOffset * 7,
  );

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const toDateKey = (date: Date) =>
    `${date.getFullYear()}-${String(
      date.getMonth() + 1,
    ).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`;

  const startKey = toDateKey(start);
  const endKey = toDateKey(end);

  return weekSessions.filter(
    (session) =>
      session.plannedDate >= startKey &&
      session.plannedDate <= endKey,
  );
}, [weekSessions, calendarWeekOffset, todayKey]);

const calendarWeekDates = useMemo(() => {
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );

  const daysFromMonday = (start.getDay() + 6) % 7;

  start.setDate(
    start.getDate() -
      daysFromMonday +
      calendarWeekOffset * 7,
  );

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);

    const dateKey = `${date.getFullYear()}-${String(
      date.getMonth() + 1,
    ).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`;

    return {
      date,
      dateKey,
      dayLabel: date
        .toLocaleDateString('en-GB', {
          weekday: 'short',
        })
        .toUpperCase(),
      dayNumber: date.getDate(),
    };
  });
}, [calendarWeekOffset, todayKey]);

const todaySession = weekSessions.find(
  (session) => session.plannedDate === todayKey,
);function HomeView() {
    return (
      <>
        <section className="mobile-home-hero">
          <div
            className="race-hero-card"
    style={{
      backgroundImage:
        "linear-gradient(180deg, rgba(4,15,28,0.10) 0%, rgba(4,15,28,0.92) 100%), url('/race-images/roth.jpg')",
    }}
  >
    <div className="race-hero-top">
      <span className="race-current-dot" />
      <span>CURRENT · A RACE</span>
    </div>

    <div className="race-hero-content">
      <div className="race-countdown-number">
        {daysToRace}
        <span> days</span>
      </div>

      <p>until</p>

   <h2>{primaryRace.name || 'Primary race'}</h2>
<div className="race-hero-meta">
  <span>
    {weekSessions.length} sessions planned
  </span>

  <span>
    {totalHours.toFixed(1)}h this week
  </span>
</div>
    </div>
  </div>
</section>
        <section className="hero-grid">
    <div
  className={`readiness-panel ${
    recoveryReadiness?.color ?? ''
  }`}
>
  <span className="eyebrow light">
    DAILY READINESS
  </span>

  <strong>
    {recoveryReadiness
      ? recoveryReadiness.color.toUpperCase()
      : '—'}
  </strong>

  <p>
    {recoveryReadiness
      ? recoveryReadiness.implication === 'proceed_as_planned'
        ? 'Recovery signals support proceeding with the planned training.'
        : recoveryReadiness.implication === 'hold_or_trim_cost'
          ? 'Recovery signals suggest holding or slightly reducing training cost today.'
          : 'Recovery signals suggest reducing training stress today.'
      : 'Add recovery data to generate today’s readiness guidance.'}
  </p>
</div>

          <Metric
            label="RACE READINESS"
            value="62%"
            hint="+2 points this week"
          />

 <Metric
  label="FITNESS"
  value={
    trainingLoad.fitness != null
      ? String(trainingLoad.fitness)
      : '—'
  }
  hint={
    trainingLoad.fitness != null
      ? 'Long-term load'
      : 'Building history'
  }
/>

<Metric
  label="FORM"
  value={
    trainingLoad.form != null
      ? String(trainingLoad.form)
      : '—'
  }
  hint={
    trainingLoad.form != null
      ? 'Fitness minus fatigue'
      : 'Building history'
  }
/>
        </section>

<section className="panel today-training-card">
  <div className="today-training-heading">
    <div>
      <span className="eyebrow">TODAY</span>
      <h3>
        {now.toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
      </h3>
    </div>

    <button onClick={() => setActiveNav('Calendar')}>
      View calendar
    </button>
  </div>

  {todaySession ? (
    <div
      className={`today-workout ${todaySession.sport}`}
      onClick={() => {
        setSelectedId(todaySession.id);
        setActiveNav('Calendar');
      }}
    >
      <div className="today-workout-top">
        <span className="today-sport">
          {sportName(todaySession.sport)}
        </span>

        <span className="today-priority">
          P{todaySession.priority}
        </span>
      </div>

      <h2>{todaySession.title}</h2>

      <p className="today-target">
        {Object.values(todaySession.targets)[0]?.toString()}
      </p>

      <div className="today-workout-stats">
<div>
  <span>
    {todaySession.status === 'completed'
      ? 'PLANNED / DONE'
      : 'DURATION'}
  </span>

  <strong>
    {todaySession.status === 'completed' &&
    todaySession.completedDurationSec
      ? `${formatDuration(todaySession.durationMin)} / ${formatDuration(
          Math.round(todaySession.completedDurationSec / 60),
        )}`
      : formatDuration(todaySession.durationMin)}
  </strong>
</div>

        <div>
          <span>SESSION</span>
          <strong>{todaySession.sessionClass}</strong>
        </div>

        <div>
          <span>STATUS</span>
          <strong>{todaySession.status}</strong>
        </div>
      </div>

      <div className="today-workout-cta">
        View workout
        <span>→</span>
      </div>
    </div>
  ) : (
    <div className="today-rest">
      <strong>Recovery day</strong>
      <p>No structured training is planned for today.</p>
    </div>
  )}
</section>

        <section className="coach-insight-card">
          <div className="coach-insight-top">
            <span className="coach-insight-label">
              AZUR COACH INSIGHT
            </span>

            <span className="coach-insight-status">
              ON TRACK
            </span>
          </div>

<h3>Why today matters</h3>

<p>
  {todaySession
    ? todaySession.rationale ||
      `Today's ${sportName(
        todaySession.sport,
      ).toLowerCase()} session supports your current training focus.`
    : 'Today is a recovery day. Recovery supports adaptation from recent training.'}
</p>

          <div className="coach-insight-focus">
<div>
  <span>FOCUS</span>
  <strong>
    {todaySession
      ? todaySession.sessionClass
      : 'Recovery'}
  </strong>
</div>

<div>
  <span>LONG-TERM BENEFIT</span>
  <strong>
    {todaySession
      ? todaySession.sport === 'bike'
        ? 'Bike durability'
        : todaySession.sport === 'run'
          ? 'Run durability'
          : todaySession.sport === 'swim'
            ? 'Swim efficiency'
            : 'Training adaptation'
      : 'Recovery and adaptation'}
  </strong>
</div>
          </div>

          <button onClick={() => setActiveNav('Weekly Review')}>
            View coaching rationale
            <span>→</span>
          </button>
        </section>
      </>
    );
  }

  function CalendarView() {
    return (
      <div className="calendar-layout">
        <div>
<section className="panel calendar-toolbar calendar-week-strip">
  <div className="calendar-strip-top">
    <button
      type="button"
      onClick={() =>
        setCalendarWeekOffset((current) => current - 1)
      }
      aria-label="Previous week"
    >
      ‹
    </button>

    <div>
      <span className="eyebrow">TRAINING CALENDAR</span>

      <h3>
        {calendarWeekDates[0]?.date.toLocaleDateString(
          'en-GB',
          {
            month: 'long',
            year: 'numeric',
          },
        )}
      </h3>
    </div>

    <button
      type="button"
      onClick={() =>
        setCalendarWeekOffset((current) => current + 1)
      }
      aria-label="Next week"
    >
      ›
    </button>
  </div>

  <div className="calendar-strip-days">
    {calendarWeekDates.map((day) => {
      const sessionsForDate =
        calendarWeekSessions.filter(
          (session) =>
            session.plannedDate === day.dateKey,
        );

      return (
        <div
          key={day.dateKey}
          className={`calendar-strip-day ${
            day.dateKey === todayKey ? 'today' : ''
          }`}
        >
          <span>{day.dayLabel.slice(0, 1)}</span>

          <strong>{day.dayNumber}</strong>

          <div className="calendar-strip-dots">
            {sessionsForDate.slice(0, 3).map((session) => (
              <i
                key={session.id}
                className={session.sport}
              />
            ))}
          </div>
        </div>
      );
    })}
  </div>

  <div className="calendar-strip-footer">
    <small>
      {calendarWeekSessions.length} sessions ·{' '}
      {(
        calendarWeekSessions.reduce(
          (total, session) =>
            total + session.durationMin,
          0,
        ) / 60
      ).toFixed(1)}
      h planned
    </small>

    {calendarWeekOffset !== 0 && (
      <button
        type="button"
        onClick={() => setCalendarWeekOffset(0)}
      >
        This week
      </button>
    )}
  </div>
</section>

<section className="panel calendar-grid">
  {calendarWeekSessions.length === 0 ? (
    <div className="calendar-empty-state">
      <span className="eyebrow">NO SESSIONS</span>

      <h3>No structured training planned</h3>

      <p>
        There are no planned sessions in this week yet.
        Use the week controls above to browse your training calendar.
      </p>

      {calendarWeekOffset !== 0 && (
        <button
          type="button"
          onClick={() => setCalendarWeekOffset(0)}
        >
          Return to this week
        </button>
      )}
    </div>
  ) : (
    days.map((day) => {
             const daySessions = calendarWeekSessions.filter(
                (session) => session.dayLabel === day,
              );

return (
<div
  className={`calendar-day ${
    daySessions.length === 0 ? 'empty-day' : ''
  }`}
  key={day}
>
    <div
      className={`calendar-day-head ${
        daySessions.some(
          (session) => session.plannedDate === todayKey,
        )
          ? 'today'
          : ''
      }`}
    >
      <div>
        <span>{day}</span>

        <strong>
          {daySessions[0]
            ? new Date(
                `${daySessions[0].plannedDate}T12:00:00`,
              ).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
              })
            : ''}
        </strong>
      </div>

{daySessions.some(
  (session) => session.plannedDate === todayKey,
) && <small>TODAY</small>}
</div>

                  <div className="day-stack">
                    {daySessions.map((session) => (
                      <button
                        key={session.id}
                        className={`calendar-session ${
                          session.accent
                        } ${
                          selected.id === session.id
                            ? 'selected'
                            : ''
                        }`}
onClick={() => {
  setSelectedId(session.id);
  setSessionDetailOpen(true);
}}
                      >
<div className="calendar-session-top">
  <span>{sportName(session.sport)}</span>

  <div className="calendar-session-status">
    <span>{session.status}</span>

    {session.locked && <Lock size={13} />}
  </div>
</div>

                        <strong>{session.title}</strong>
<WorkoutShape sessionClass={session.sessionClass} />
 <div className="calendar-session-meta">
  <span>{formatDuration(session.durationMin)}</span>
  <span>Priority {session.priority}</span>
</div>

<span className="calendar-session-target">
  {Object.values(session.targets)[0]?.toString()}
</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
    })
  )}
</section>
        </div>

{sessionDetailOpen && (
  <div
    className="session-detail-overlay"
    onClick={() => setSessionDetailOpen(false)}
  >
    <aside
      className="editor-panel session-detail-modal"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        className="session-detail-close"
        onClick={() => setSessionDetailOpen(false)}
        aria-label="Close session detail"
      >
        ×
      </button>
          <div className="section-heading">
            <div>
              <span className="eyebrow">SESSION DETAIL</span>
              <h3>{selected.title}</h3>
              <div className="session-detail-meta">
  <span>{sportName(selected.sport)}</span>

  <span>
    {new Date(
      `${selected.plannedDate}T12:00:00`,
    ).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })}
  </span>

  <span>{formatDuration(selected.durationMin)}</span>

  <span>Priority {selected.priority}</span>
</div>
            </div>

            <button className="icon-button" onClick={toggleLock}>
              {selected.locked ? (
                <Lock size={18} />
              ) : (
                <Unlock size={18} />
              )}
            </button>
          </div>

          <div className="editor-grid">
            {selected.prescription?.focus && (
 <div className="wide session-block">
    <span className="eyebrow">FOCUS</span>
    <strong>{selected.prescription.focus}</strong>
  </div>
)}
{Array.isArray(selected.prescription?.warmup) && (
 <div className="wide session-block">
    <span className="eyebrow">WARM-UP</span>

{selected.prescription.warmup.map(
  (block: any, index: number) => (
    <div key={index} className="session-block-item">
    <strong>
            {block.reps ? `${block.reps} × ` : ''}
            {block.distance_m
  ? `${block.distance_m} m`
  : block.duration_min
    ? `${block.duration_min} min`
    : block.duration_sec
      ? `${block.duration_sec} sec`
      : ''}
          </strong>

          {block.target && (
            <div>{block.target}</div>
          )}

          {block.notes && (
            <small>{block.notes}</small>
          )}

          {block.recovery_sec && (
            <div>
              <small>
                {block.recovery_sec} sec easy recovery
              </small>
            </div>
          )}
        </div>
      ),
    )}
  </div>
)}
{Array.isArray(selected.prescription?.main_set) && (
<div className="wide session-block">
    <span className="eyebrow">MAIN SET</span>

    {selected.prescription.main_set.map(
      (block: any, index: number) => (
      <div key={index} className="session-block-item">
        {block.discipline && (
  <span className="eyebrow">
    {block.discipline.toUpperCase()}
  </span>
)}
<strong>
  {block.reps ? `${block.reps} × ` : ''}
  {block.distance_m
    ? `${block.distance_m} m`
    : `${block.duration_min} min`}
</strong>

          <div>
            {block.target}
          </div>

          {block.ftp_percent && (
            <small>
              {block.ftp_percent} FTP
            </small>
          )}

          {block.cadence && (
            <small>
              · {block.cadence}
            </small>
          )}

          {block.rpe && (
            <small>
              · RPE {block.rpe}
            </small>
          )}
{block.pace && (
  <div>
    <small>
      Pace: {block.pace}
    </small>
  </div>
)}

{block.notes && (
  <div>
    <small>
      {block.notes}
    </small>
  </div>
)}          {block.recovery_min && (
            <div>
              <small>
                {block.recovery_min} min easy recovery
              </small>
            </div>
          )}
        </div>
      ),
    )}
  </div>
)}
{Array.isArray(selected.prescription?.cooldown) && (
  <div className="wide session-block">
    <span className="eyebrow">COOL-DOWN</span>

    {selected.prescription.cooldown.map(
      (block: any, index: number) => (
       <div key={index} className="session-block-item">
<strong>
  {block.reps ? `${block.reps} × ` : ''}
  {block.distance_m
    ? `${block.distance_m} m`
    : `${block.duration_min} min`}
</strong>

          {block.target && (
            <div>{block.target}</div>
          )}

          {block.notes && (
            <small>{block.notes}</small>
          )}
        </div>
      ),
    )}
  </div>
)}          
{selected.prescription?.fueling && (
  <div className="wide session-block">
    <span className="eyebrow">FUELING</span>

    {selected.prescription.fueling.carbs_per_hour && (
      <div className="session-block-item">
        <strong>
          {selected.prescription.fueling.carbs_per_hour}
        </strong>
        <small> carbohydrate per hour</small>
      </div>
    )}

    {selected.prescription.fueling.fluid_per_hour && (
      <div className="session-block-item">
        <strong>
          {selected.prescription.fueling.fluid_per_hour}
        </strong>
        <small> fluid per hour</small>
      </div>
    )}
{selected.prescription.fueling.sodium_per_hour && (
  <div className="session-block-item">
    <strong>
      {selected.prescription.fueling.sodium_per_hour}
    </strong>
    <small> sodium per hour</small>
  </div>
)}

{selected.prescription.fueling.notes && (
  <div className="session-block-item">
    <strong>Fueling note</strong>
    <div>
      {selected.prescription.fueling.notes}
    </div>
  </div>
)}
    {selected.prescription.fueling.pre_session && (
      <div className="session-block-item">
        <strong>Before session</strong>
        <div>
          {selected.prescription.fueling.pre_session}
        </div>
      </div>
    )}

    {selected.prescription.fueling.during_session && (
      <div className="session-block-item">
        <strong>During session</strong>
        <div>
          {selected.prescription.fueling.during_session}
        </div>
      </div>
    )}
  </div>
)}

<div className="session-block">
  <span className="eyebrow">DURATION</span>
  <strong>{formatDuration(selected.durationMin)}</strong>
</div>
{selected.status === 'completed' &&
  selected.completedDurationSec && (
    <div className="wide session-block completed-session-summary">
      <div className="completed-session-heading">
        <div>
          <span className="eyebrow">SESSION COMPLETE</span>
          <strong>Workout matched successfully</strong>
        </div>

        <span className="completed-check">✓</span>
      </div>

      <div className="completed-session-metrics">
        <div>
          <span>PLANNED</span>
          <strong>
            {formatDuration(selected.durationMin)}
          </strong>
        </div>

        <div>
          <span>COMPLETED</span>
          <strong>
            {formatDuration(
              Math.round(selected.completedDurationSec / 60),
            )}
          </strong>
        </div>

<div>
  <span>MATCH STATUS</span>
  <strong>Matched</strong>
</div>
      </div>

      {selected.completedMetrics && (
        <div className="completed-activity-details">
          <div className="completed-activity-title">
            <span>ACTIVITY DATA</span>

            {selected.completedMetrics.isTest && (
              <span className="test-data-badge">TEST DATA</span>
            )}
          </div>

          <div className="completed-activity-grid">
            <div>
              <span>DISTANCE</span>
              <strong>
                {selected.completedDistanceM
                  ? `${(selected.completedDistanceM / 1000).toFixed(1)} km`
                  : '—'}
              </strong>
            </div>

            <div>
              <span>AVG POWER</span>
              <strong>
                {selected.completedMetrics.averagePower
                  ? `${selected.completedMetrics.averagePower} W`
                  : '—'}
              </strong>
            </div>

            <div>
              <span>NORMALIZED POWER</span>
              <strong>
                {selected.completedMetrics.normalizedPower
                  ? `${selected.completedMetrics.normalizedPower} W`
                  : '—'}
              </strong>
            </div>

            <div>
              <span>AVG HR</span>
              <strong>
                {selected.completedMetrics.averageHeartRate
                  ? `${selected.completedMetrics.averageHeartRate} bpm`
                  : '—'}
              </strong>
            </div>

            <div>
              <span>MAX HR</span>
              <strong>
                {selected.completedMetrics.maxHeartRate
                  ? `${selected.completedMetrics.maxHeartRate} bpm`
                  : '—'}
              </strong>
            </div>

            <div>
              <span>TRAINING LOAD</span>
              <strong>
                {selected.completedMetrics.trainingLoad ?? '—'}
              </strong>
            </div>
            <div>
  <span>CALORIES</span>
  <strong>
    {selected.completedMetrics.calories
      ? `${selected.completedMetrics.calories} kcal`
      : '—'}
  </strong>
</div>

<div>
  <span>SOURCE</span>
  <strong>
    {selected.completedSource
      ? selected.completedSource
          .replaceAll('_', ' ')
          .toUpperCase()
      : '—'}
  </strong>
</div>
          </div>
        </div>
      )}
    </div>
  )}
{selectedExecution && (
  <div className="wide session-block session-analysis-card">
    <span className="eyebrow">AZUR SESSION ANALYSIS</span>

    <div className="session-analysis-row">
      <div>
        <span>DURATION ADHERENCE</span>
        <strong>
          {Math.round(selectedExecution.duration)}%
        </strong>
      </div>

<p>
  {selectedExecution.duration >= 95
    ? 'Planned training time was completed. This supports the intended session load without adding unnecessary volume.'
    : selectedExecution.duration >= 85
      ? 'Most of the planned training time was completed. The session still contributed meaningfully to the intended training load.'
      : 'Completed training time was below plan. Azur will consider this alongside recovery, athlete feedback and upcoming sessions.'}
</p>
    </div>
   
    {intervalPowerAnalysis && (
  <div className="interval-analysis">
    <div className="interval-analysis-heading">
      <span>INTERVAL EXECUTION</span>

      <strong>
        {intervalPowerAnalysis.onTarget}/
        {intervalPowerAnalysis.planned} on target
      </strong>
    </div>

    <div className="interval-analysis-grid">
      {intervalPowerAnalysis.intervals.map((interval) => (
        <div key={interval.number}>
          <span>INTERVAL {interval.number}</span>

          <strong>
            {interval.power != null
              ? `${interval.power} W`
              : '—'}
          </strong>

          <small>
            {interval.onTarget ? '✓ ON TARGET' : 'OUTSIDE TARGET'}
          </small>
        </div>
      ))}
    </div>
<div className="execution-trend">
  <span>EXECUTION TREND</span>

  <div className="execution-trend-grid">
    <div>
      <small>POWER CHANGE</small>
      <strong>
        {intervalPowerAnalysis.powerFadePct != null
          ? `${intervalPowerAnalysis.powerFadePct > 0 ? '−' : '+'}${Math.abs(
              intervalPowerAnalysis.powerFadePct,
            ).toFixed(1)}%`
          : '—'}
      </strong>
      <p>First to last work interval</p>
    </div>

    <div>
      <small>HEART RATE CHANGE</small>
      <strong>
        {intervalPowerAnalysis.heartRateRiseBpm != null
          ? `${intervalPowerAnalysis.heartRateRiseBpm > 0 ? '+' : ''}${intervalPowerAnalysis.heartRateRiseBpm} bpm`
          : '—'}
      </strong>
      <p>First to last work interval</p>
    </div>
  </div>
</div>

{intervalInterpretation && (
  <div className="azur-interpretation">
    <span>AZUR INTERPRETATION</span>

    <strong>{intervalInterpretation.title}</strong>

    <p>{intervalInterpretation.summary}</p>

    {intervalInterpretation.trend && (
      <p>{intervalInterpretation.trend}</p>
    )}
  </div>
)}

  </div>
)}

{coachingImpact && (
  <div className="coaching-impact">
    <div className="coaching-impact-heading">
      <span>COACHING IMPACT</span>
      <strong>{coachingImpact.status}</strong>
    </div>

    <h4>{coachingImpact.title}</h4>

    <p>{coachingImpact.summary}</p>

    <div className="coaching-impact-next">
      <span>WHAT HAPPENS NEXT</span>
      <p>{coachingImpact.nextStep}</p>
    </div>
  </div>
)}

  </div>
)}

<div className="wide session-block">
  <span className="eyebrow">PRIMARY TARGET</span>

  <div className="session-block-item">
    <strong>
      {Object.values(selected.targets)[0]?.toString() || ''}
    </strong>
  </div>
</div>

<div className="wide session-block">
  <span className="eyebrow">WHY THIS MATTERS</span>

  <div className="session-block-item">
    <div>{selected.rationale}</div>
  </div>
</div>
<div className="wide session-block">
  <span className="eyebrow">ATHLETE FEEDBACK</span>

  <div className="session-block-item">
    <label>
      <span>Session RPE</span>

      <input
        type="number"
        min="1"
        max="10"
        value={sessionFeedback.rpe}
        onChange={(event) =>
          setSessionFeedback({
            ...sessionFeedback,
            rpe: event.target.value,
          })
        }
        placeholder="1–10"
      />
    </label>
  </div>

  <div className="session-block-item">
    <label>
      <span>Notes</span>

      <textarea
        rows={4}
        value={sessionFeedback.notes}
        onChange={(event) =>
          setSessionFeedback({
            ...sessionFeedback,
            notes: event.target.value,
          })
        }
        placeholder="How did the session feel?"
      />
    </label>
  </div>
</div>

          </div>

<button
  className="primary-button"
  onClick={handleSessionFeedbackSave}
  disabled={sessionFeedbackSaving}
>
  <Save size={17} />

  {sessionFeedbackSaving
    ? 'Saving feedback...'
    : 'Save athlete feedback'}
</button>

{sessionFeedbackMessage && (
  <small className="feedback-message">
    {sessionFeedbackMessage}
  </small>
)}         
          </aside>
  </div>
)}
      </div>
    );
  }

  function PerformanceView() {
    return (
      <>
        <section className="hero-grid">
          <Metric
  label="FITNESS · CTL"
  value={
    trainingLoad.fitness != null
      ? String(trainingLoad.fitness)
      : '—'
  }
  hint={
    trainingLoad.fitness != null
      ? 'Long-term training load'
      : 'Building history'
  }
/>

<Metric
  label="FATIGUE · ATL"
  value={
    trainingLoad.fatigue != null
      ? String(trainingLoad.fatigue)
      : '—'
  }
  hint={
    trainingLoad.fatigue != null
      ? 'Short-term training load'
      : 'Building history'
  }
/>

<Metric
  label="FORM · TSB"
  value={
    trainingLoad.form != null
      ? String(trainingLoad.form)
      : '—'
  }
  hint={
    trainingLoad.form != null
      ? 'Fitness minus fatigue'
      : 'Building history'
  }
/>

<Metric
  label="WEEKLY LOAD"
  value={
    trainingLoad.weeklyStress != null
      ? String(trainingLoad.weeklyStress)
      : '—'
  }
  hint={`${trainingLoad.eligibleActivities} eligible activities`}
/>
</section> 
        <div className="two-column">
          <section className="panel">
            <span className="eyebrow">
              DISCIPLINE READINESS
            </span>

            <h3>Current long-course profile</h3>

            <div className="progress-list">
<ProgressRow
  label="Bike"
  value={null}
  text="Building history"
/>

<ProgressRow
  label="Run"
  value={null}
  text="Building history"
/>

<ProgressRow
  label="Swim"
  value={null}
  text="Building history"
/>
            </div>
          </section>

          <section className="panel">
            <span className="eyebrow">
              INTENSITY DISTRIBUTION
            </span>

            <h3>Planned this week</h3>

<div className="distribution-grid">
  <div>
    <strong>—</strong>
    <span>Easy / endurance</span>
  </div>

  <div>
    <strong>—</strong>
    <span>Threshold / quality</span>
  </div>

  <div>
    <strong>—</strong>
    <span>Race specific</span>
  </div>
</div>

<p className="panel-note">
  Azur will calculate your intensity distribution from your planned
  and completed sessions once enough training data is available.
</p>
          </section>
        </div>
      </>
    );
  }

  function RecoveryView() {
    return (
      <>
        <section className="hero-grid">
<div
  className={`readiness-panel ${
    recoveryReadiness?.color ?? ''
  }`}
>
  <span className="eyebrow light">
    TODAY'S READINESS
  </span>

  <strong>
    {recoveryReadiness
      ? recoveryReadiness.color.toUpperCase()
      : '—'}
  </strong>

 <p>
  {recoveryReadiness
    ? recoveryReadiness.implication === 'proceed_as_planned'
      ? 'Recovery signals support proceeding with the planned training.'
      : recoveryReadiness.implication === 'hold_or_trim_cost'
        ? 'Recovery signals suggest holding or slightly reducing training cost today.'
        : 'Recovery signals suggest reducing training stress today.'
    : 'Add recovery data to generate today’s readiness guidance.'}
</p>
          </div>

<Metric
  label="HRV"
  value={
    recoveryContext.hrvVs30dPct != null
      ? `${recoveryContext.hrvVs30dPct > 0 ? '+' : ''}${recoveryContext.hrvVs30dPct}%`
      : '—'
  }
  hint="vs 30-day baseline"
/>

<Metric
  label="RESTING HR"
  value={
    recoveryContext.rhrVs30dPct != null
      ? `${recoveryContext.rhrVs30dPct > 0 ? '+' : ''}${recoveryContext.rhrVs30dPct}%`
      : '—'
  }
  hint="vs 30-day baseline"
/>

<Metric
  label="SLEEP"
  value={
    recoveryContext.sleepVs30dPct != null
      ? `${recoveryContext.sleepVs30dPct > 0 ? '+' : ''}${recoveryContext.sleepVs30dPct}%`
      : '—'
  }
  hint="vs 30-day baseline"
/>
        </section>

        <div className="two-column">
          <section className="panel">
            <span className="eyebrow">
              RECOVERY SIGNALS
            </span>

            <h3>Rolling context</h3>

<div className="signal-list">
  <div>
    {recoveryContext.hrvVs30dPct != null &&
    recoveryContext.hrvVs30dPct < -5 ? (
      <AlertTriangle size={18} />
    ) : (
      <CheckCircle2 size={18} />
    )}

    <div>
      <strong>
        {recoveryContext.hrvVs30dPct == null
          ? 'HRV data unavailable'
          : recoveryContext.hrvVs30dPct < -5
            ? 'HRV below baseline'
            : 'HRV within expected range'}
      </strong>

      <small>
        {recoveryContext.hrvVs30dPct == null
          ? 'Add recovery data to assess HRV against your 30-day baseline.'
          : `${recoveryContext.hrvVs30dPct > 0 ? '+' : ''}${recoveryContext.hrvVs30dPct}% vs 30-day baseline.`}
      </small>
    </div>
  </div>

  <div>
    {recoveryContext.sleepVs30dPct != null &&
    recoveryContext.sleepVs30dPct < -5 ? (
      <AlertTriangle size={18} />
    ) : (
      <CheckCircle2 size={18} />
    )}

    <div>
      <strong>
        {recoveryContext.sleepVs30dPct == null
          ? 'Sleep data unavailable'
          : recoveryContext.sleepVs30dPct < -5
            ? 'Sleep below baseline'
            : 'Sleep within expected range'}
      </strong>

      <small>
        {recoveryContext.sleepVs30dPct == null
          ? 'Add recovery data to assess sleep against your 30-day baseline.'
          : `${recoveryContext.sleepVs30dPct > 0 ? '+' : ''}${recoveryContext.sleepVs30dPct}% vs 30-day baseline.`}
      </small>
    </div>
  </div>

  <div>
    {recoveryContext.loadFatigueSignal != null &&
    recoveryContext.loadFatigueSignal >= 80 ? (
      <AlertTriangle size={18} />
    ) : (
      <CheckCircle2 size={18} />
    )}

    <div>
      <strong>
        {recoveryContext.loadFatigueSignal == null
          ? 'Fatigue data unavailable'
          : recoveryContext.loadFatigueSignal >= 80
            ? 'Fatigue elevated'
            : 'Fatigue within expected range'}
      </strong>

      <small>
        {recoveryContext.loadFatigueSignal == null
          ? 'Add recovery data to assess current fatigue.'
          : `Current fatigue signal: ${recoveryContext.loadFatigueSignal}.`}
      </small>
    </div>
  </div>
</div>
          </section>

          <section className="panel">
            <span className="eyebrow">
              RECOVERY WARNING
            </span>

  <h3>
  {!recoveryReadiness
    ? 'Building recovery history'
    : recoveryReadiness.color === 'red'
      ? 'Recovery warning active'
      : recoveryReadiness.color === 'amber'
        ? 'Recovery caution'
        : 'No active warning'}
</h3>

<p className="panel-note">
  {!recoveryReadiness
    ? 'Add recovery data to allow Azur to identify meaningful recovery warnings.'
    : recoveryReadiness.color === 'red'
      ? 'Multiple recovery signals are outside the expected range. Training stress should be reviewed before completing the planned session.'
      : recoveryReadiness.color === 'amber'
        ? 'Some recovery signals require attention. Azur will consider these alongside training load, RPE and any reported niggle.'
        : 'Current recovery signals do not meet the threshold for an active warning. Azur will continue to assess changes across recovery, training load, RPE and reported niggles.'}
</p>
          </section>
        </div>
      </>
    );
  }

  function RacesView() {
    return (
      <>
        <section className="panel race-hero">
          <div>
<span className="eyebrow">
 {primaryRace.priority
  ? `${primaryRace.priority} RACE · `
  : 'PRIMARY RACE · '}
  {primaryRace.raceDate
    ? new Date(primaryRace.raceDate).toLocaleDateString(
        'en-GB',
        {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        },
      )
    : '—'}
</span>

<h3>{primaryRace.name || 'Primary Race'}</h3>

            <p>
  {primaryRace.targetSplits?.target_total
    ? `Primary race target · ${primaryRace.targetSplits.target_total.slice(0, 5)}`
    : 'Primary race target'}
</p>
          </div>

<div className="race-total">
  <span>Target</span>
  <strong>
    {primaryRace.targetSplits?.target_total
      ? primaryRace.targetSplits.target_total.slice(0, 5)
      : '—'}
  </strong>
  <small>{daysToRace} days remaining</small>
</div>
        </section>

        <section className="panel">
          <span className="eyebrow">
            TARGET EXECUTION
          </span>

<h3>
  {primaryRace.name
    ? `${primaryRace.name} race model`
    : 'Primary race model'}
</h3>

          <div className="race-splits">
            <div>
              <span>Swim</span>
           <strong>
  {primaryRace.targetSplits?.swim
    ? primaryRace.targetSplits.swim.slice(0, 5)
    : '—'}
</strong>
              <small>
                Controlled start and efficient rhythm.
              </small>
            </div>

            <div>
              <span>Bike</span>
              <strong>
  {primaryRace.targetSplits?.bike
    ? primaryRace.targetSplits.bike.slice(0, 5)
    : '—'}
</strong>
      <small>
  {athleteProfile.ftp
    ? `Target power guidance will be based on your current FTP of ${athleteProfile.ftp} W.`
    : 'Add a current FTP to generate race-specific bike power guidance.'}
</small>
            </div>

            <div>
              <span>Run</span>
            <strong>
  {primaryRace.targetSplits?.run
    ? primaryRace.targetSplits.run.slice(0, 5)
    : '—'}
</strong>
              <small>
                Durability and late-race control.
              </small>
            </div>

  <div>
  <span>Transitions</span>
  <strong>—</strong>
  <small>
    Transition targets will be added when race-specific execution data is available.
  </small>
</div>
          </div>
        </section>

<div className="two-column">
  <section className="panel">
    <span className="eyebrow">PREP RACE</span>
    <h3>Not set</h3>

    <p className="panel-note">
      Add a preparation race to track race-specific pacing, execution and durability.
    </p>
  </section>

  <section className="panel">
    <span className="eyebrow">
      NEXT TRAINING BLOCK
    </span>

    <h3>Not set</h3>

    <p className="panel-note">
      Azur will use your primary race and future race schedule to shape the next training block.
    </p>
  </section>
</div>
      </>
    );
  }

  function BenchmarksView() {
    return (
      <>
<section className="hero-grid">
  <Metric
    label="BIKE FTP"
    value={
      athleteProfile.ftp
        ? `${athleteProfile.ftp} W`
        : '—'
    }
    hint={
      athleteProfile.ftp && athleteProfile.weight
        ? `${(athleteProfile.ftp / athleteProfile.weight).toFixed(2)} W/kg`
        : 'Current FTP'
    }
  />

  <Metric
    label="RUN THRESHOLD"
    value={
      athleteProfile.runThreshold
        ? `${Math.floor(athleteProfile.runThreshold / 60)}:${String(
            athleteProfile.runThreshold % 60
          ).padStart(2, '0')}/km`
        : '—'
    }
    hint="Current threshold"
  />

  <Metric
    label="SWIM THRESHOLD"
    value={
      athleteProfile.swimThreshold
        ? `${Math.floor(athleteProfile.swimThreshold / 60)}:${String(
            athleteProfile.swimThreshold % 60
          ).padStart(2, '0')}/100m`
        : '—'
    }
    hint="Current benchmark"
  />

  <Metric
    label="BODY WEIGHT"
    value={
      athleteProfile.weight
        ? `${athleteProfile.weight} kg`
        : '—'
    }
    hint={
      athleteProfile.targetWeight
        ? `Target: ${athleteProfile.targetWeight} kg`
        : 'Current weight'
    }
  />
</section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                BENCHMARK CYCLE
              </span>

              <h3>Current coaching interpretation</h3>
            </div>

            <span className="status-pill">
              8-WEEK CYCLE
            </span>
          </div>

          <div className="benchmark-table">
            <div className="benchmark-head">
              <span>Metric</span>
              <span>Current</span>
              <span>Direction</span>
              <span>Interpretation</span>
            </div>

            <div>
              <strong>Bike FTP</strong>
              <span>
  {athleteProfile.ftp
    ? `${athleteProfile.ftp} W`
    : '—'}
</span>
              <span className="good-text">
                Maintain / build
              </span>
              <small>
                Extend durability rather than chasing FTP alone.
              </small>
            </div>

            <div>
              <strong>Run threshold</strong>
              <span>
  {athleteProfile.runThreshold
    ? `${Math.floor(athleteProfile.runThreshold / 60)}:${String(
        athleteProfile.runThreshold % 60
      ).padStart(2, '0')}/km`
    : '—'}
</span>
              <span className="good-text">Maintain</span>
              <small>
                Bigger opportunity exists in long-course durability.
              </small>
            </div>

            <div>
              <strong>Swim threshold</strong>
              <span>
  {athleteProfile.swimThreshold
    ? `${Math.floor(athleteProfile.swimThreshold / 60)}:${String(
        athleteProfile.swimThreshold % 60
      ).padStart(2, '0')}/100m`
    : '—'}
</span>
              <span>Build economy</span>
              <small>
                Improve repeatability and relaxed aerobic speed.
              </small>
            </div>

            <div>
              <strong>Weight</strong>
              <span>
  {athleteProfile.weight
    ? `${athleteProfile.weight} kg`
    : '—'}
</span>
              <span>Context only</span>
              <small>
                Track trend without compromising recovery.
              </small>
            </div>
          </div>
        </section>
      </>
    );
  }

function ProfileView() {
  return (
    <>
      <section className="panel">
        <div className="profile-header">
          <div className="profile-avatar-large">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={`${athleteName} profile`}
              />
            ) : (
              <User size={34} />
            )}
          </div>

          <div className="profile-header-copy">
            <span className="eyebrow">ATHLETE PROFILE</span>
            <h3>{athleteName}</h3>
            <p className="panel-note">
              Your current Azur athlete profile and performance settings.
            </p>
          </div>

<button
  className="profile-edit-button"
  onClick={() => {
    if (!profileEditing) {
      setProfileDraft({
        ftp: athleteProfile.ftp?.toString() || '',
 runThreshold:
  formatPaceInput(athleteProfile.runThreshold),
swimThreshold:
  formatPaceInput(athleteProfile.swimThreshold),
        weight: athleteProfile.weight?.toString() || '',
        targetWeight:
          athleteProfile.targetWeight?.toString() || '',
      });
    }

    setProfileEditing((current) => !current);
  }}
>
  {profileEditing ? 'Cancel editing' : 'Edit profile'}
</button>
        </div>
      </section>

      <div className="two-column">
        <section className="panel">
          <span className="eyebrow">PERFORMANCE PROFILE</span>
          <h3>Current thresholds</h3>

<div className="profile-settings-list">
  <div>
    <span>Bike FTP</span>

    {profileEditing ? (
      <input
        type="number"
        value={profileDraft.ftp}
        onChange={(event) =>
          setProfileDraft({
            ...profileDraft,
            ftp: event.target.value,
          })
        }
      />
    ) : (
      <strong>
        {athleteProfile.ftp
          ? `${athleteProfile.ftp} W`
          : '—'}
      </strong>
    )}
  </div>

  <div>
    <span>Run threshold</span>

    {profileEditing ? (
      <input
        type="text"
        value={profileDraft.runThreshold}
        onChange={(event) =>
          setProfileDraft({
            ...profileDraft,
            runThreshold: event.target.value,
          })
        }
      />
    ) : (
      <strong>
        {athleteProfile.runThreshold
          ? `${Math.floor(
              athleteProfile.runThreshold / 60,
            )}:${String(
              athleteProfile.runThreshold % 60,
            ).padStart(2, '0')}/km`
          : '—'}
      </strong>
    )}
  </div>

  <div>
    <span>Swim threshold</span>

    {profileEditing ? (
      <input
        type="text"
        value={profileDraft.swimThreshold}
        onChange={(event) =>
          setProfileDraft({
            ...profileDraft,
            swimThreshold: event.target.value,
          })
        }
      />
    ) : (
      <strong>
        {athleteProfile.swimThreshold
          ? `${Math.floor(
              athleteProfile.swimThreshold / 60,
            )}:${String(
              athleteProfile.swimThreshold % 60,
            ).padStart(2, '0')}/100m`
          : '—'}
      </strong>
    )}
  </div>

  <div>
    <span>Current weight</span>

    {profileEditing ? (
      <input
        type="number"
        step="0.1"
        value={profileDraft.weight}
        onChange={(event) =>
          setProfileDraft({
            ...profileDraft,
            weight: event.target.value,
          })
        }
      />
    ) : (
      <strong>
        {athleteProfile.weight
          ? `${athleteProfile.weight} kg`
          : '—'}
      </strong>
    )}
  </div>

  <div>
    <span>Target weight</span>

    {profileEditing ? (
      <input
        type="number"
        step="0.1"
        value={profileDraft.targetWeight}
        onChange={(event) =>
          setProfileDraft({
            ...profileDraft,
            targetWeight: event.target.value,
          })
        }
      />
    ) : (
      <strong>
        {athleteProfile.targetWeight
          ? `${athleteProfile.targetWeight} kg`
          : '—'}
      </strong>
    )}
  </div>
</div>
{profileEditing && (
  <button
    className="primary-button"
    onClick={handleProfileSave}
  >
    <Save size={17} />
    Save changes
  </button>
)}
        </section>

        <section className="panel">
          <span className="eyebrow">PRIMARY TARGET</span>
          <h3>{primaryRace.name || 'No race selected'}</h3>

          <div className="profile-settings-list">
            <div>
              <span>Priority</span>
              <strong>
                {primaryRace.priority
                  ? `${primaryRace.priority} Race`
                  : '—'}
              </strong>
            </div>

            <div>
              <span>Location</span>
              <strong>{primaryRace.location || '—'}</strong>
            </div>

            <div>
              <span>Race date</span>
              <strong>
                {primaryRace.raceDate
                  ? new Date(
                      primaryRace.raceDate,
                    ).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })
                  : '—'}
              </strong>
            </div>

            <div>
              <span>Target time</span>
              <strong>
                {primaryRace.targetSplits?.target_total
                  ? primaryRace.targetSplits.target_total.slice(
                      0,
                      5,
                    )
                  : '—'}
              </strong>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function WeeklyReviewView() {
  return (
    <>
      <section className="hero-grid">
        <Metric
          label="PLANNED VOLUME"
          value={`${totalHours.toFixed(1)} h`}
          hint="Current working week"
        />

        <Metric
          label="KEY SESSIONS"
          value="5"
          hint="Priority 1 sessions"
        />

        <Metric
          label="RACE READINESS"
          value="62%"
          hint="+2 points"
        />

<Metric
  label="WEEKLY LOAD"
  value={
    trainingLoad.weeklyStress != null
      ? String(trainingLoad.weeklyStress)
      : '—'
  }
  hint={`${trainingLoad.eligibleActivities} eligible activities`}
/>
      </section>

      <div className="two-column">
        <section className="panel">
          <span className="eyebrow">IMPROVING</span>
          <h3>Bike durability</h3>

          <p className="panel-note">
            Stable power late in longer work is improving. Continue
            extending controlled race-relevant output.
          </p>
        </section>

        <section className="panel">
          <span className="eyebrow">LAGGING</span>
          <h3>Run durability</h3>

          <p className="panel-note">
            Threshold is strong enough. Long-course resilience remains
            the largest current opportunity.
          </p>
        </section>
      </div>

      <section className="panel coach-review">
        <span className="eyebrow">
          COACH RECOMMENDATION
        </span>

<h3>
  {trainingLoad.fitness != null
    ? 'Training load review'
    : 'Building enough history'}
</h3>

<p>
  <strong>Why:</strong>{' '}
  {trainingLoad.fitness != null
    ? `Azur is currently tracking ${trainingLoad.weeklyStress ?? 0} stress points across the last seven days, with Fitness at ${trainingLoad.fitness}, Fatigue at ${trainingLoad.fatigue}, and Form at ${trainingLoad.form}.`
    : 'Azur is still collecting enough eligible swim, bike and run history before making a load-based coaching recommendation.'}
</p>

<p>
  <strong>Long-term benefit:</strong>{' '}
  Using genuine completed training data allows future recommendations to reflect your actual training response rather than assumed or placeholder load values.
</p>

        <div className="decision-actions">
          <button
            className={
              decision === 'accepted'
                ? 'decision active'
                : 'decision'
            }
            onClick={() => setDecision('accepted')}
          >
            Accept recommendation
          </button>

          <button
            className={
              decision === 'rejected'
                ? 'decision reject active'
                : 'decision reject'
            }
            onClick={() => setDecision('rejected')}
          >
            Keep plan manually
          </button>
        </div>

        {decision !== 'pending' && (
          <small className="decision-result">
            Decision recorded: {decision}. Azur never changes the
            training plan without your approval.
          </small>
        )}
      </section>
    </>
  );
}
  function StravaFeedView() {
  return (
    <>
     <section className="strava-feed-hero">
  <div>
    <span className="eyebrow">CONNECTED ACCOUNT</span>
    <h2>Strava is connected</h2>
    <p>
      New activities will sync automatically into Azur.
    </p>
  </div>

  <div className="strava-connected-pill">
    <span>▲</span>
    <strong>Live sync active</strong>
    <i />
  </div>
</section>

<section className="panel strava-sync-card">
  <div className="strava-sync-icon">
    <RefreshCw size={19} />
  </div>

  <div className="strava-sync-copy">
    <span className="eyebrow">LIVE SYNC</span>
    <strong>Latest sync: 2 min ago</strong>
    <small>
      5 activities this week · Training load updated
    </small>
  </div>

  <span className="strava-sync-status">
    Active
  </span>
</section>

      <section className="strava-feed-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">RECENT ACTIVITIES</span>
          </div>
        </div>

        <div className="strava-activity-list">
{completedActivityFeed.map((activity, index) => (
  <article
    key={`${activity.source}-${activity.start_time}-${index}`}
    className={`strava-activity-card ${activity.sport}`}
    onClick={() => setSelectedStravaActivity(index)}
  >
    <div className="strava-activity-top">
      <div className="strava-activity-title">
        <div className={`strava-sport-icon ${activity.sport}`}>
          {activity.sport === 'run' ? (
            <Footprints size={18} />
          ) : activity.sport === 'bike' ? (
            <Bike size={18} />
          ) : (
            <Waves size={18} />
          )}
        </div>

        <div>
          <span>
            {activity.sport.toUpperCase()} ·{' '}
            {new Date(activity.start_time).toLocaleString('en-GB', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>

          <h3>
            {activity.source === 'manual_fit'
              ? 'Garmin FIT Activity'
              : 'Completed Activity'}
          </h3>
        </div>
      </div>

      <div className="strava-activity-actions">
        <small>
          {activity.source === 'manual_fit'
            ? 'Manual FIT'
            : activity.source}
        </small>
        <ChevronRight size={18} />
      </div>
    </div>

    <div className="strava-activity-metrics">
      <div>
        <strong>
          {Math.round(activity.duration_sec / 60)} min
        </strong>
        <span>Duration</span>
      </div>

      <div>
        <strong>
          {(Number(activity.distance_m ?? 0) / 1000).toFixed(2)} km
        </strong>
        <span>Distance</span>
      </div>

      <div>
        <strong>
          {activity.processed_metrics?.averageHeartRate ?? '—'}
        </strong>
        <span>Avg HR</span>
      </div>

      <div>
        <strong>
          {activity.processed_metrics?.averagePower ?? '—'}
        </strong>
        <span>Avg Power</span>
      </div>
    </div>
  </article>
))}

        </div>
      </section>
{selectedStravaActivity !== null &&
  completedActivityFeed[selectedStravaActivity] && (
  <div className="session-detail-overlay">
    <aside className="session-detail-panel">
      <button
        className="session-detail-close"
        type="button"
        onClick={() => setSelectedStravaActivity(null)}
      >
        ×
      </button>

      <span className="eyebrow">COMPLETED ACTIVITY</span>

      <h2>Garmin FIT Activity</h2>

    <p>
  {new Date(
    completedActivityFeed[selectedStravaActivity].start_time,
  ).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}
</p>

<div className="strava-activity-metrics">
  <div>
    <strong>
      {Math.round(
        completedActivityFeed[selectedStravaActivity].duration_sec / 60,
      )}{' '}
      min
    </strong>
    <span>Duration</span>
  </div>

  <div>
    <strong>
      {(
        Number(
          completedActivityFeed[selectedStravaActivity].distance_m ?? 0,
        ) / 1000
      ).toFixed(2)}{' '}
      km
    </strong>
    <span>Distance</span>
  </div>

  <div>
    <strong>
      {completedActivityFeed[selectedStravaActivity].processed_metrics
        ?.averageHeartRate ?? '—'}
    </strong>
    <span>Avg HR</span>
  </div>

 <div>
  <strong>
    {completedActivityFeed[selectedStravaActivity].sport === 'bike'
      ? `${completedActivityFeed[selectedStravaActivity].processed_metrics
          ?.averagePower ?? '—'} W`
      : completedActivityFeed[selectedStravaActivity].sport === 'run'
        ? (() => {
            const activity =
              completedActivityFeed[selectedStravaActivity];

            const distanceKm =
              Number(activity.distance_m ?? 0) / 1000;

            if (!distanceKm || !activity.duration_sec) return '—';

            const paceSecPerKm =
              activity.duration_sec / distanceKm;

            const minutes = Math.floor(paceSecPerKm / 60);
            const seconds = Math.round(paceSecPerKm % 60);

            return `${minutes}:${String(seconds).padStart(2, '0')}/km`;
          })()
        : '—'}
  </strong>

  <span>
    {completedActivityFeed[selectedStravaActivity].sport === 'bike'
      ? 'Avg Power'
      : completedActivityFeed[selectedStravaActivity].sport === 'run'
        ? 'Avg Pace'
        : 'Pace'}
  </span>
</div>
</div>

      <p className="panel-note">
        Imported from Garmin FIT and stored in your Azur activity history.
      </p>
    </aside>
  </div>
)}
     
    </>
  );
}
 async function handleImportActivities() {
  if (importFiles.length === 0) return;

  const fitFile = importFiles.find((file) =>
    file.name.toLowerCase().endsWith('.fit'),
  );

  if (!fitFile) {
    setImportStatus('Select a FIT file to import.');
    return;
  }

  try {
    setImportLoading(true);

    setImportStatus(
      `Reading ${fitFile.name} · ${(fitFile.size / 1024).toFixed(0)} KB...`,
    );

    await new Promise((resolve) => setTimeout(resolve, 150));

    const arrayBuffer = await fitFile.arrayBuffer();

    setImportStatus('File loaded · parsing FIT activity...');

    await new Promise((resolve) => setTimeout(resolve, 150));

    const parser = new FitParser({
      mode: 'list',
      speedUnit: 'km/h',
      lengthUnit: 'km',
    });

    const parsed = await parser.parseAsync(arrayBuffer);

   const firstSession = parsed.sessions?.[0] as any;

const durationSec = Number(
  firstSession?.total_timer_time ??
  firstSession?.total_elapsed_time ??
  0,
);

const distanceKm = Number(
  firstSession?.total_distance ?? 0,
);

const averageHeartRate =
  firstSession?.avg_heart_rate ?? null;

const maxHeartRate =
  firstSession?.max_heart_rate ?? null;

const averagePower =
  firstSession?.avg_power ?? null;

const normalizedPower =
  firstSession?.normalized_power ?? null;

const startTime =
  firstSession?.start_time ??
  firstSession?.timestamp ??
  null;
const sportMap: Record<string, 'swim' | 'bike' | 'run'> = {
  running: 'run',
  run: 'run',
  cycling: 'bike',
  bike: 'bike',
  swimming: 'swim',
  swim: 'swim',
};

const mappedSport =
  sportMap[String(firstSession?.sport ?? '').toLowerCase()];
    if (!mappedSport || !startTime || durationSec <= 0) {
  throw new Error('FIT activity is missing required activity data.');
}

const {
  data: { user },
} = await supabase.auth.getUser();

if (!user) {
  throw new Error('No signed-in athlete found.');
}

const { data: athlete, error: athleteError } = await supabase
  .from('athlete_profile')
  .select('id')
  .eq('user_id', user.id)
  .single();

if (athleteError || !athlete) {
  throw new Error('Unable to resolve athlete profile.');
}

const sourceActivityId = [
  new Date(startTime).toISOString(),
  mappedSport,
  Math.round(durationSec),
  Math.round(distanceKm * 1000),
].join('-');

const { error: insertError } = await supabase
  .from('completed_activity')
  .upsert(
    {
      athlete_id: athlete.id,
      sport: mappedSport,
      source: 'manual_fit',
      source_activity_id: sourceActivityId,
      start_time: new Date(startTime).toISOString(),
      duration_sec: Math.round(durationSec),
      distance_m: Math.round(distanceKm * 1000),

      processed_metrics: {
        averageHeartRate,
        maxHeartRate,
        averagePower,
      },

      raw_payload: {
        file_name: fitFile.name,
        session: firstSession,
      },
    },
    {
      onConflict: 'source,source_activity_id',
      ignoreDuplicates: true,
    },
  );

if (insertError) {
  throw insertError;
}
setImportStatus(
  [
   `Activity imported successfully`,
    `${firstSession?.sport ?? 'activity'}`,
    startTime ? `Start ${String(startTime)}` : null,
    durationSec ? `${Math.round(durationSec / 60)} min` : null,
    distanceKm ? `${distanceKm.toFixed(2)} km` : null,
    averageHeartRate ? `${averageHeartRate} bpm avg HR` : null,
    maxHeartRate ? `${maxHeartRate} bpm max HR` : null,
    averagePower ? `${averagePower} W avg` : null,
  ]
    .filter(Boolean)
    .join(' · '),
);
  } catch (error) {
    console.error('FIT import error:', error);

    setImportStatus(
      `FIT parse failed · ${String(error)}`,
    );
  } finally {
    setImportLoading(false);
  }
}

function DataSourcesView() {
  return (
    <>
      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              DATA SOURCES
            </span>

            <h3>Connections & sync status</h3>
          </div>

            <Cloud size={21} />
          </div>

          <div className="source-list">
            <div className="source-row">
              <div>
                <strong>Garmin</strong>
                <small>
                  Primary activity + recovery source
                </small>
              </div>

              <span className="source-state">Planned</span>

              <small>Awaiting API connection</small>
            </div>

            <div className="source-row">
              <div>
                <strong>TrainingPeaks</strong>
                <small>Reference source</small>
              </div>

              <span className="source-state">Planned</span>

              <small>No write-back in v1</small>
            </div>

         <div
  className="source-row source-row-action"
  onClick={() => setActiveNav('Strava Feed')}
>
  <div>
    <strong>Strava</strong>
    <small>Activity sync + live feed</small>
  </div>

  <span className="source-state">Preview</span>

  <small>Open feed →</small>
</div>


            <div className="source-row">
              <div>
                <strong>Intervals.icu</strong>
                <small>Secondary analysis source</small>
              </div>

              <span className="source-state">Optional</span>

              <small>Not connected</small>
            </div>
          </div>
        </section>

        <div className="two-column">
          <section className="panel">
            <span className="eyebrow">
              MANUAL IMPORT
            </span>

            <h3>CSV · FIT · TCX · GPX</h3>

            <p className="panel-note">
              Manual activities will be de-duplicated automatically.
              Raw source data and processed analysis remain separate.
            </p>
<label className="manual-import-picker">
  <span>Select activity files</span>

  <input
  type="file"
  onChange={(event) => {
    const files = Array.from(event.target.files ?? []);

    setImportFiles(files);

    if (files.length > 0) {
      setImportStatus(`Selected: ${files[0].name}`);
    } else {
      setImportStatus('No file selected.');
    }
  }}
/>
</label>

{importFiles.length > 0 && (
  <small className="manual-import-count">
    {importFiles.length} file
    {importFiles.length === 1 ? '' : 's'} selected
  </small>
)}
<button
  type="button"
  className="primary-button manual-import-button"
  disabled={importFiles.length === 0 || importLoading}
onClick={handleImportActivities}
>
  {importLoading ? 'Importing...' : 'Import activities'}
</button>

{importStatus && (
  <small className="manual-import-status">
    {importStatus}
  </small>
)}
          </section>

          <section className="panel">
            <span className="eyebrow">
              DATA PRINCIPLE
            </span>

            <h3>Garmin first</h3>

            <p className="panel-note">
              Garmin will become the primary source for activity,
              recovery and morning health data.
            </p>
          </section>
        </div>
      </>
    );
  }

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();

    setAuthLoading(true);
    setAuthError('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setAuthError(error.message);
    }

    setAuthLoading(false);
  }
async function handleSignOut() {
  await supabase.auth.signOut();

  setAccountOpen(false);
  setIsAuthenticated(false);
}
 async function handleAvatarUpload(
  event: React.ChangeEvent<HTMLInputElement>,
) {
  const file = event.target.files?.[0];

  if (!file) return;

  setAvatarUploading(true);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    setAvatarUploading(false);
    return;
  }

  const fileExtension = file.name.split('.').pop() || 'jpg';
  const filePath = `${user.id}/profile.${fileExtension}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, file, {
      upsert: true,
    });

  if (uploadError) {
    console.error('Unable to upload avatar:', uploadError);
    setAvatarUploading(false);
    return;
  }

  const { data: publicUrlData } = supabase.storage
    .from('avatars')
    .getPublicUrl(filePath);

  const newAvatarUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const { error: profileError } = await supabase
    .from('athlete_profile')
    .update({
      avatar_url: newAvatarUrl,
    })
    .eq('user_id', user.id);

  if (profileError) {
    console.error(
      'Unable to save avatar to athlete profile:',
      profileError,
    );

    setAvatarUploading(false);
    return;
  }

  setAvatarUrl(newAvatarUrl);
  setAvatarUploading(false);
}

async function handleProfileSave() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const updatedProfile = {
    ftp_w: profileDraft.ftp
      ? Number(profileDraft.ftp)
      : null,
run_threshold_sec_per_km: profileDraft.runThreshold
  ? parsePaceInput(profileDraft.runThreshold)
  : null,
swim_threshold_sec_per_100m: profileDraft.swimThreshold
  ? parsePaceInput(profileDraft.swimThreshold)
  : null,
    weight_kg: profileDraft.weight
      ? Number(profileDraft.weight)
      : null,
    target_weight_kg: profileDraft.targetWeight
      ? Number(profileDraft.targetWeight)
      : null,
  };

  const { error } = await supabase
    .from('athlete_profile')
    .update(updatedProfile)
    .eq('user_id', user.id);

  if (error) {
    console.error('Unable to update athlete profile:', error);
    return;
  }

  setAthleteProfile({
    ftp: updatedProfile.ftp_w,
    runThreshold: updatedProfile.run_threshold_sec_per_km,
    swimThreshold: updatedProfile.swim_threshold_sec_per_100m,
    weight: updatedProfile.weight_kg,
    targetWeight: updatedProfile.target_weight_kg,
  });

  setProfileEditing(false);
}
  async function handleSessionFeedbackSave() {
  setSessionFeedbackSaving(true);
  setSessionFeedbackMessage('');

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    setSessionFeedbackSaving(false);
    return;
  }

  const { data: athlete, error: athleteError } = await supabase
    .from('athlete_profile')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (athleteError || !athlete) {
    console.error(
      'Unable to load athlete for session feedback:',
      athleteError,
    );
    setSessionFeedbackSaving(false);
    setSessionFeedbackMessage('Unable to save feedback.');
    return;
  }

  const { error } = await supabase
    .from('session_feedback')
    .upsert(
      {
        athlete_id: athlete.id,
        planned_session_id: selected.id,
        session_rpe: sessionFeedback.rpe
          ? Number(sessionFeedback.rpe)
          : null,
        notes: sessionFeedback.notes.trim() || null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'planned_session_id',
      },
    );

  if (error) {
    console.error('Unable to save session feedback:', error);
    setSessionFeedbackSaving(false);
    setSessionFeedbackMessage('Unable to save feedback.');
    return;
  }

  setSessionFeedbackSaving(false);
  setSessionFeedbackMessage('Feedback saved.');
}
  if (!authReady) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <img
            src="/brand/azur-logo.png"
            alt="Azur Triathlon Coaching"
            className="login-logo"
          />

          <p>Loading Azur...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="login-screen">
        <form className="login-card" onSubmit={handleLogin}>
          <img
            src="/brand/azur-logo.png"
            alt="Azur Triathlon Coaching"
            className="login-logo"
          />

          <span className="eyebrow">ATHLETE LOGIN</span>

          <h2>Welcome to Azur</h2>

          <p>
            Sign in to access your training, performance and recovery data.
          </p>

          <label>
            <span>Email</span>

            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label>
            <span>Password</span>

            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {authError && (
            <div className="login-error">{authError}</div>
          )}

          <button
            className="primary-button"
            type="submit"
            disabled={authLoading}
          >
            {authLoading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <img
            src="/brand/azur-logo.png"
            alt="Azur Triathlon Coaching"
            className="brand-logo"
          />

          <div>
            <span className="brand-kicker">
              PERSONAL PERFORMANCE
            </span>

            <h1>Azur</h1>
          </div>
        </div>

        <nav>
          {navigation.map(([Icon, label]) => (
            <button
              key={label}
              className={
                activeNav === label
                  ? 'nav-item active'
                  : 'nav-item'
              }
              onClick={() => setActiveNav(label)}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

<div className="sidebar-footer">
  <span className="eyebrow">
    PRIMARY TARGET
  </span>

  <strong>
    {primaryRace.name || 'Primary Race'}
  </strong>

  <small>
    {primaryRace.raceDate
      ? new Date(primaryRace.raceDate).toLocaleDateString(
          'en-GB',
          {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          },
        )
      : '—'}
    {' · '}
    {primaryRace.targetSplits?.target_total
      ? `Target ${primaryRace.targetSplits.target_total.slice(0, 5)}`
      : 'Target not set'}
  </small>
</div>
      </aside>

      <main>
        <header className="topbar">
          <div>
 <span className="eyebrow">
  {activeNav === 'Strava Feed'
    ? 'INTEGRATIONS'
    : 'WEEK 1 · BASE 1'}
</span>

<h2>
  {activeNav === 'Home'
    ? `Good morning, ${athleteName}.`
    : activeNav}
</h2>

          <p>
  {activeNav === 'Strava Feed'
    ? 'Recent activities and sync status'
    : 'Aerobic consistency + durability'}
</p>
          </div>

<div className="topbar-actions">
  <div className="race-countdown">
    <span className="eyebrow">
      DAYS TO{' '}
      {primaryRace.name
        ? primaryRace.name.toUpperCase()
        : 'A RACE'}
    </span>

    <strong>{daysToRace}</strong>
  </div>

  <div className="account-menu">
    <button
      className="account-button"
      onClick={() => setAccountOpen((current) => !current)}
    >
<div className="account-avatar">
  {avatarUrl ? (
    <img
      src={avatarUrl}
      alt={`${athleteName} profile`}
    />
  ) : (
    <User size={20} />
  )}
</div>

      <div className="account-copy">
        <strong>{athleteName}</strong>
        <small>Athlete</small>
      </div>
    </button>

{accountOpen && (
  <div className="account-dropdown">
    <div className="account-dropdown-head">
      <strong>{athleteName}</strong>
      <small>Azur athlete account</small>
    </div>

    <button
      onClick={() => {
        setActiveNav('Profile');
        setAccountOpen(false);
      }}
    >
      <User size={16} />
      Profile & settings
    </button>

    <label className="avatar-upload-button">
      <User size={16} />

      {avatarUploading
        ? 'Uploading...'
        : avatarUrl
          ? 'Change profile photo'
          : 'Add profile photo'}

      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleAvatarUpload}
        disabled={avatarUploading}
      />
    </label>

    <button onClick={handleSignOut}>
      <LogOut size={16} />
      Sign out
    </button>
  </div>
)}
  </div>
</div>
        </header>

        {activeNav === 'Home' && <HomeView />}
        {activeNav === 'Calendar' && CalendarView()}
        {activeNav === 'Performance' && <PerformanceView />}
        {activeNav === 'Recovery' && <RecoveryView />}
        {activeNav === 'Races' && <RacesView />}
{activeNav === 'Benchmarks' && <BenchmarksView />}
{activeNav === 'Profile' && <ProfileView />}
{activeNav === 'Weekly Review' && <WeeklyReviewView />}
        {activeNav === 'Data Sources' && <DataSourcesView />}
        {activeNav === 'Strava Feed' && <StravaFeedView />}
      </main>
    </div>
  );
}
