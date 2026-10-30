import CoachInvitations from './CoachInvitations';
import AthleteOnboardingDraft from './AthleteOnboardingDraft';
import PremiumWorkoutTabs from './PremiumWorkoutTabs';
import { auditAthleteInstructions } from '../lib/calculations/prescriptionAudit';
import WorkoutTargetDetails from './WorkoutTargetDetails';
import CoachAttentionInbox from './CoachAttentionInbox';
import CoachAthletePerformance from './CoachAthletePerformance';
import CoachAthleteRoster from './CoachAthleteRoster';
import type { AssignedAthlete } from './CoachAthleteRoster';
import CoachCyclingLibraryReview from './CoachCyclingLibraryReview';
import MultisportPlannedStress from './MultisportPlannedStress';
import { estimatePlannedStress } from '../lib/calculations/plannedStress';
import { useEffect, useMemo, useRef, useState } from 'react';
import FitParser from 'fit-file-parser';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import PrivacyPolicy from './PrivacyPolicy';
import CalendarIntensityProfile from './CalendarIntensityProfile';
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
import { calculateRaceGoalDemand } from '../lib/calculations/raceGoalDemand';
import { calculateAthleteRaceGap } from '../lib/calculations/athleteRaceGap';
import { resolveTrainingPriority } from '../lib/calculations/trainingPriority';
import {
  calculateBikeTrainingStress,
  calculateRunTrainingStress,
  calculateSwimTrainingStress,
  calculateTrainingLoad,
  isTrainingLoadEligible,
} from '../lib/calculations/trainingLoad';
type RoutePoint = {
  lat: number;
  lng: number;
};

function RouteMap({ points }: { points: RoutePoint[] }) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!mapRef.current || points.length < 2) return;

    setMapLoaded(false);

    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
    });

    const tiles = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
      },
    );

    tiles.on('load', () => {
      setMapLoaded(true);
    });

    tiles.addTo(map);

    const latLngs = points.map(
      (point) => [point.lat, point.lng] as [number, number],
    );

    const route = L.polyline(latLngs, {
      weight: 4,
    }).addTo(map);

    map.fitBounds(route.getBounds(), {
      padding: [18, 18],
    });

    return () => {
      map.remove();
    };
  }, [points]);

  if (points.length < 2) {
    return null;
  }

  return (
    <div className="activity-route-map-wrap">
      {!mapLoaded && (
        <div className="activity-route-loading">
          Loading route map…
        </div>
      )}

      <div
        ref={mapRef}
        className={`activity-route-map ${
          mapLoaded ? 'loaded' : ''
        }`}
        aria-label="Activity route map"
      />
    </div>
  );
}
function HeartRateChart({
  points,
}: {
  points: Array<{
    elapsedSec: number | null;
    heartRate: number | null;
  }>;
}) {
  const validPoints = points.filter(
    (point) =>
      point.elapsedSec != null &&
      point.heartRate != null,
  );

  if (validPoints.length < 2) {
    return null;
  }

  const width = 600;
  const height = 200;
  const paddingX = 24;
  const paddingTop = 18;
  const paddingBottom = 30;

  const maxTime = Math.max(
    ...validPoints.map((point) => point.elapsedSec ?? 0),
  );

  const heartRates = validPoints.map(
    (point) => point.heartRate ?? 0,
  );

  const minHr = Math.min(...heartRates);
  const maxHr = Math.max(...heartRates);
  const hrRange = Math.max(1, maxHr - minHr);

  const chartHeight =
    height - paddingTop - paddingBottom;

  const chartPoints = validPoints.map((point) => {
    const x =
      paddingX +
      ((point.elapsedSec ?? 0) / maxTime) *
        (width - paddingX * 2);

    const y =
      paddingTop +
      (1 -
        ((point.heartRate ?? minHr) - minHr) /
          hrRange) *
        chartHeight;

    return { x, y };
  });

  const linePoints = chartPoints
    .map((point) => `${point.x},${point.y}`)
    .join(' ');

  const areaPoints = [
    `${paddingX},${height - paddingBottom}`,
    ...chartPoints.map(
      (point) => `${point.x},${point.y}`,
    ),
    `${width - paddingX},${height - paddingBottom}`,
  ].join(' ');

  const averageHr = Math.round(
    heartRates.reduce((total, value) => total + value, 0) /
      heartRates.length,
  );

  const formatElapsed = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m`;
  };

  const timeMarkers = [
    0,
    maxTime * 0.25,
    maxTime * 0.5,
    maxTime * 0.75,
    maxTime,
  ];

  return (
    <div className="activity-chart heart-rate-chart">
     <div className="activity-chart-heading">
  <span>HEART RATE</span>
</div>

<div className="activity-chart-stats">
  <div>
    <strong>{averageHr}</strong>
    <span>bpm avg</span>
  </div>

  <div>
    <strong>{Math.round(maxHr)}</strong>
    <span>bpm max</span>
  </div>
</div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Heart rate over time"
      >
        <defs>
          <linearGradient
            id="heartRateFill"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="0%"
              stopColor="#ef4444"
              stopOpacity="0.22"
            />
            <stop
              offset="100%"
              stopColor="#ef4444"
              stopOpacity="0.02"
            />
          </linearGradient>
        </defs>
{[0.25, 0.5, 0.75].map((ratio) => {
  const y =
    paddingTop +
    chartHeight * ratio;

  return (
    <line
      key={`hr-horizontal-${ratio}`}
      x1={paddingX}
      x2={width - paddingX}
      y1={y}
      y2={y}
      className="activity-chart-gridline horizontal"
    />
  );
})}
        {timeMarkers.map((time) => {
          const x =
            paddingX +
            (time / maxTime) *
              (width - paddingX * 2);

          return (
            <line
              key={time}
              x1={x}
              x2={x}
              y1={paddingTop}
              y2={height - paddingBottom}
              className="activity-chart-gridline"
            />
          );
        })}

        <polygon
          points={areaPoints}
          fill="url(#heartRateFill)"
        />

        <polyline
          points={linePoints}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />

        {timeMarkers.map((time) => {
          const x =
            paddingX +
            (time / maxTime) *
              (width - paddingX * 2);

          return (
            <text
              key={`label-${time}`}
              x={x}
              y={height - 8}
              textAnchor={
                time === 0
                  ? 'start'
                  : time === maxTime
                    ? 'end'
                    : 'middle'
              }
              className="activity-chart-time-label"
            >
              {formatElapsed(time)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
function PaceChart({
  points,
}: {
  points: Array<{
    elapsedSec: number | null;
    speedKmh: number | null;
  }>;
}) {
const validPoints = points
  .filter(
    (point) =>
      point.elapsedSec != null &&
      point.speedKmh != null &&
      point.speedKmh > 0 &&
      point.elapsedSec > 20,
  )
  .map((point) => ({
    elapsedSec: point.elapsedSec,
    paceSecPerKm: 3600 / (point.speedKmh ?? 1),
  }))
  .filter(
    (point) =>
      point.paceSecPerKm >= 180 &&
      point.paceSecPerKm <= 420,
  );

  if (validPoints.length < 2) {
    return null;
  }

  const width = 600;
  const height = 200;
  const paddingX = 24;
  const paddingTop = 18;
  const paddingBottom = 30;

  const maxTime = Math.max(
    ...validPoints.map((point) => point.elapsedSec ?? 0),
  );

  const paces = validPoints.map(
    (point) => point.paceSecPerKm,
  );

  const minPace = Math.min(...paces);
  const maxPace = Math.max(...paces);
  const paceRange = Math.max(1, maxPace - minPace);

  const chartHeight =
    height - paddingTop - paddingBottom;

  const chartPoints = validPoints.map((point) => {
    const x =
      paddingX +
      ((point.elapsedSec ?? 0) / maxTime) *
        (width - paddingX * 2);

    const y =
      paddingTop +
      ((point.paceSecPerKm - minPace) / paceRange) *
        chartHeight;

    return { x, y };
  });

  const linePoints = chartPoints
    .map((point) => `${point.x},${point.y}`)
    .join(' ');

  const areaPoints = [
    `${paddingX},${height - paddingBottom}`,
    ...chartPoints.map(
      (point) => `${point.x},${point.y}`,
    ),
    `${width - paddingX},${height - paddingBottom}`,
  ].join(' ');

  const averagePace =
    paces.reduce((total, value) => total + value, 0) /
    paces.length;

  const formatPace = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);

    return `${minutes}:${String(secs).padStart(2, '0')}`;
  };

  const formatElapsed = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m`;
  };

  const timeMarkers = [
    0,
    maxTime * 0.25,
    maxTime * 0.5,
    maxTime * 0.75,
    maxTime,
  ];

  return (
    <div className="activity-chart pace-chart">
<div className="activity-chart-heading">
  <span>PACE</span>
</div>

<div className="activity-chart-stats">
  <div>
    <strong>{formatPace(averagePace)}</strong>
    <span>/km avg</span>
  </div>

  <div>
    <strong>{formatPace(minPace)}</strong>
    <span>/km best</span>
  </div>
</div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Pace over time"
      >
        <defs>
          <linearGradient
            id="paceFill"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="0%"
              stopColor="#1687e8"
              stopOpacity="0.22"
            />
            <stop
              offset="100%"
              stopColor="#1687e8"
              stopOpacity="0.02"
            />
          </linearGradient>
        </defs>
{[0.25, 0.5, 0.75].map((ratio) => {
  const y =
    paddingTop +
    chartHeight * ratio;

  return (
    <line
      key={`pace-horizontal-${ratio}`}
      x1={paddingX}
      x2={width - paddingX}
      y1={y}
      y2={y}
      className="activity-chart-gridline horizontal"
    />
  );
})}
        {timeMarkers.map((time) => {
          const x =
            paddingX +
            (time / maxTime) *
              (width - paddingX * 2);

          return (
            <line
              key={time}
              x1={x}
              x2={x}
              y1={paddingTop}
              y2={height - paddingBottom}
              className="activity-chart-gridline"
            />
          );
        })}

        <polygon
          points={areaPoints}
          fill="url(#paceFill)"
        />

        <polyline
          points={linePoints}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />

        {timeMarkers.map((time) => {
          const x =
            paddingX +
            (time / maxTime) *
              (width - paddingX * 2);

          return (
            <text
              key={`pace-label-${time}`}
              x={x}
              y={height - 8}
              textAnchor={
                time === 0
                  ? 'start'
                  : time === maxTime
                    ? 'end'
                    : 'middle'
              }
              className="activity-chart-time-label"
            >
              {formatElapsed(time)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
function calculateHrDrift(
  points: Array<{
    elapsedSec: number | null;
    heartRate: number | null;
    speedKmh: number | null;
  }>,
) {
  const validPoints = points.filter(
    (point) =>
      point.elapsedSec != null &&
      point.heartRate != null &&
      point.heartRate > 0 &&
      point.speedKmh != null &&
      point.speedKmh > 0 &&
      point.elapsedSec > 120,
  );

  if (validPoints.length < 10) {
    return null;
  }

  const midpoint =
    Math.max(
      ...validPoints.map((point) => point.elapsedSec ?? 0),
    ) / 2;

  const firstHalf = validPoints.filter(
    (point) => (point.elapsedSec ?? 0) <= midpoint,
  );

  const secondHalf = validPoints.filter(
    (point) => (point.elapsedSec ?? 0) > midpoint,
  );

  const averageEfficiency = (
    segment: typeof validPoints,
  ) => {
    if (!segment.length) return null;

    const values = segment.map(
      (point) =>
        (point.speedKmh ?? 0) /
        (point.heartRate ?? 1),
    );

    return (
      values.reduce((total, value) => total + value, 0) /
      values.length
    );
  };

  const firstEfficiency = averageEfficiency(firstHalf);
  const secondEfficiency = averageEfficiency(secondHalf);

  if (
    firstEfficiency == null ||
    secondEfficiency == null ||
    firstEfficiency <= 0
  ) {
    return null;
  }

  return (
    ((firstEfficiency - secondEfficiency) /
      firstEfficiency) *
    100
  );
}
function calculatePaceConsistency(
  points: Array<{
    elapsedSec: number | null;
    speedKmh: number | null;
  }>,
) {
  const paces = points
    .filter(
      (point) =>
        point.elapsedSec != null &&
        point.speedKmh != null &&
        point.speedKmh > 0 &&
        point.elapsedSec > 20,
    )
    .map((point) => 3600 / (point.speedKmh ?? 1))
    .filter(
      (pace) =>
        pace >= 180 &&
        pace <= 420,
    );

  if (paces.length < 10) {
    return null;
  }

  const average =
    paces.reduce((total, value) => total + value, 0) /
    paces.length;

  const variance =
    paces.reduce(
      (total, value) =>
        total + Math.pow(value - average, 2),
      0,
    ) / paces.length;

  const standardDeviation = Math.sqrt(variance);

  return (standardDeviation / average) * 100;
}
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
const mobileNavigation = [
  [Home, 'Home'],
  [CalendarDays, 'Calendar'],
  [Activity, 'Chat'],
  [TrendingUp, 'Performance'],
  [Gauge, 'More'],
] as const;
type AzurWorkoutStep =
  | {
      type: 'warmup' | 'work' | 'recovery' | 'cooldown';
      durationMin?: number;
      distanceM?: number;
      targetType?: 'ftp' | 'rpe' | 'pace' | 'swim_pace' | 'hr';
      targetLow?: number;
      targetHigh?: number;
      targetText?: string;
    }
  | {
      type: 'repeat';
      reps: number;
      work: AzurWorkoutStep;
      recovery?: AzurWorkoutStep;
    };

type AzurWorkout = {
  sport: 'swim' | 'bike' | 'run' | 'brick';
  title: string;
  durationMin: number;
  sessionClass:
    | 'easy'
    | 'endurance'
    | 'intensity'
    | 'race_specific'
    | 'recovery';
  purpose: string;
  rationale: string;
  steps: AzurWorkoutStep[];
};
type Session = PlannedSession & {
  dayLabel: string;
  accent: string;

  completedDurationSec?: number;
  completedDistanceM?: number;
  completedRpe?: number;
completedSource?: string;
  completedActivityId?: string;
completedMatchConfidence?: number;
  completedRoute?: RoutePoint[];
  completedSeries?: Array<{
  elapsedSec: number | null;
  heartRate: number | null;
  speedKmh: number | null;
  altitudeM: number | null;
}>;
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
averagePaceSecPerKm?: number;
bestPaceSecPerKm?: number;
averageSpeedKmh?: number;
maxSpeedKmh?: number;
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

function CalendarPrescriptionSteps({ prescription }: { prescription: Record<string, unknown> }) {
  const steps: Array<{ kind: string; detail: string }> = [];
  const add = (kind: string, value: unknown) => {
    if (!Array.isArray(value)) return;
    value.forEach((step) => {
      if (!step || typeof step !== 'object') return;
      const item = step as Record<string, unknown>;
      const reps = Number(item.reps ?? 1);
      const duration = Number(item.duration_min ?? 0);
      const distance = Number(item.distance_m ?? 0);
      if (!Number.isFinite(reps) || reps < 1 || reps > 100 || !Number.isFinite(duration) || !Number.isFinite(distance)) return;
      const quantity = duration > 0 ? `${duration} min` : distance > 0 ? `${distance} m` : '';
      if (!quantity) return;
      steps.push({ kind, detail: `${reps > 1 ? `${reps} × ` : ''}${quantity}` });
      if (kind === 'Work') {
        const recovery = Number(item.recovery_min ?? 0) || Number(item.recovery_sec ?? 0) / 60;
        if (recovery > 0 && Number.isFinite(recovery)) {
          steps.push({ kind: 'Recovery', detail: `${Math.round(recovery * 10) / 10} min between efforts` });
        }
      }
    });
  };
  add('Warm-up', prescription.warmup);
  add('Work', prescription.main_set);
  add('Cool-down', prescription.cooldown);
  if (!steps.length) return null;

  // Timed steps are shown proportionally. No estimated intensity is implied.
  const timed: Array<{ kind: string; minutes: number }> = [];
  const pushTimed = (kind: string, source: unknown) => {
    if (!Array.isArray(source)) return;
    for (const raw of source) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const minutes = Number(item.duration_min ?? 0);
      const reps = kind === 'Work' ? Number(item.reps ?? 1) : 1;
      if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440 || !Number.isInteger(reps) || reps < 1 || reps > 30) continue;
      const recovery = kind === 'Work'
        ? Number(item.recovery_min ?? 0) || Number(item.recovery_sec ?? 0) / 60
        : 0;
      for (let i = 0; i < reps; i += 1) {
        timed.push({ kind, minutes });
        if (i < reps - 1 && recovery > 0 && Number.isFinite(recovery)) {
          timed.push({ kind: 'Recovery', minutes: recovery });
        }
      }
    }
  };
  pushTimed('Warm-up', prescription.warmup);
  pushTimed('Work', prescription.main_set);
  pushTimed('Cool-down', prescription.cooldown);
  const allPartsTimed = [prescription.warmup, prescription.main_set, prescription.cooldown]
    .flatMap((group) => Array.isArray(group) ? group : [])
    .every((item) => item && typeof item === 'object' && Number((item as Record<string, unknown>).duration_min) > 0);
  const totalMinutes = timed.reduce((sum, step) => sum + step.minutes, 0);
  const showTimeline = allPartsTimed && timed.length > 0 && timed.length <= 60 && totalMinutes > 0;
  return (
    <>
    {showTimeline && (
      <div className="calendar-duration-timeline" role="img" aria-label={`Prescribed interval timeline, ${Math.round(totalMinutes)} minutes total; widths represent duration, not intensity`}>
        {timed.map((part, index) => (
          <span key={index} className={`timeline-part ${part.kind.toLowerCase().replace('-', '')}`}
            title={`${part.kind}: ${part.minutes} min`}
            style={{ flexGrow: part.minutes, flexBasis: 0, minWidth: 2 }} />
        ))}
      </div>
    )}
    <div className="calendar-prescription-steps" aria-label="Prescribed workout steps">
      {steps.slice(0, 8).map((step, index) => (
        <span key={index} className={`calendar-prescription-step ${step.kind.toLowerCase().replace('-', '')}`}>
          <b>{step.kind}</b> {step.detail}
        </span>
      ))}
      {steps.length > 8 && <span className="calendar-prescription-step">+{steps.length - 8} more</span>}
    </div>
    </>
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

function formatCompletedDuration(seconds: number) {
  if (seconds < 60) {
    return `${Math.round(seconds)} sec`;
  }

  return formatDuration(Math.round(seconds / 60));
}

function formatCompletedDistance(distanceM: number) {
  if (distanceM < 1000) {
    return `${Math.round(distanceM)} m`;
  }

  return `${(distanceM / 1000).toFixed(1)} km`;
}
type MacrocyclePhase =
  | 'Foundation'
  | 'Base'
  | 'Build'
  | 'Race Specific'
  | 'Peak'
  | 'Taper'
  | 'Race';

type MacrocycleWeek = {
  weekStart: string;
  weeksToRace: number;
  phase: MacrocyclePhase;
};

function buildMacrocycle(raceDate: string): MacrocycleWeek[] {
  if (!raceDate) {
    return [];
  }

  const today = new Date();

  const startMonday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  const daysFromMonday =
    (startMonday.getDay() + 6) % 7;

startMonday.setDate(
  startMonday.getDate() - daysFromMonday,
);

  const race = new Date(`${raceDate}T12:00:00`);

  const raceMonday = new Date(
    race.getFullYear(),
    race.getMonth(),
    race.getDate(),
  );

  const raceDaysFromMonday =
    (raceMonday.getDay() + 6) % 7;

  raceMonday.setDate(
    raceMonday.getDate() - raceDaysFromMonday,
  );

  const millisecondsPerWeek =
    7 * 24 * 60 * 60 * 1000;

  const totalWeeks = Math.max(
    1,
    Math.round(
      (raceMonday.getTime() -
        startMonday.getTime()) /
        millisecondsPerWeek,
    ) + 1,
  );

  const formatDate = (date: Date) =>
    `${date.getFullYear()}-${String(
      date.getMonth() + 1,
    ).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`;

  return Array.from(
    { length: totalWeeks },
    (_, index) => {
      const weekStart = new Date(startMonday);

      weekStart.setDate(
        startMonday.getDate() + index * 7,
      );

      const weeksToRace =
        totalWeeks - 1 - index;

      let phase: MacrocyclePhase;

      if (weeksToRace === 0) {
        phase = 'Race';
      } else if (weeksToRace <= 2) {
        phase = 'Taper';
      } else if (weeksToRace <= 5) {
        phase = 'Peak';
      } else if (weeksToRace <= 12) {
        phase = 'Race Specific';
      } else if (weeksToRace <= 24) {
        phase = 'Build';
      } else if (weeksToRace <= 36) {
        phase = 'Base';
      } else {
        phase = 'Foundation';
      }

      return {
        weekStart: formatDate(weekStart),
        weeksToRace,
        phase,
      };
    },
  );
}
function sportName(sport: Sport) {
  return sport.charAt(0).toUpperCase() + sport.slice(1);
}

export function App() {
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const betaRegistrationEnabled = import.meta.env.VITE_ENABLE_BETA_SIGNUP === 'true';
  const [registrationMode, setRegistrationMode] = useState(() => new URLSearchParams(window.location.search).get('join') === '1');
  const [registrationNotice, setRegistrationNotice] = useState('');
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
  const [coachSelectedAthlete, setCoachSelectedAthlete] = useState<AssignedAthlete | null>(null);
  const [coachWorkspace, setCoachWorkspace] = useState<'overview'|'library'|'monitoring'|'invitations'>('overview');
  const [athleteProfile, setAthleteProfile] = useState({
  ftp: null as number | null,
  runThreshold: null as number | null,
  swimThreshold: null as number | null,
  weight: null as number | null,
  targetWeight: null as number | null,
});
const [primaryRace, setPrimaryRace] = useState({
  id: '',
  name: '',
  raceDate: '',
  priority: '',
  location: '',
  swimDistanceM: null as number | null,
  bikeDistanceKm: null as number | null,
  runDistanceKm: null as number | null,
  targetSplits: null as null | {
    swim?: string;
    bike?: string;
    run?: string;
    target_total?: string;
  },
});
  const [activeNav, setActiveNav] = useState('Home');
  const [isCoachAccount, setIsCoachAccount] = useState(false);
  const [homeMode, setHomeMode] = useState<'athlete' | 'coach'>('athlete');
  useEffect(() => {
    let mounted = true;
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!mounted) return;
      const coach = user?.app_metadata?.role === 'coach';
      setIsCoachAccount(coach);
      if (!coach) setHomeMode('athlete');
    });
    return () => { mounted = false; };
  }, [activeNav]);
  const [weekSessions, setWeekSessions] = useState<Session[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [sessionDetailOpen, setSessionDetailOpen] = useState(false);
  const [calendarWeekOffset, setCalendarWeekOffset] = useState(0);
  const [calendarFocusedDate, setCalendarFocusedDate] = useState<string | null>(null);
  const [movingSessionId, setMovingSessionId] = useState<string | null>(null);
  const [moveTargetDate, setMoveTargetDate] = useState('');
  const [moveMessage, setMoveMessage] = useState('');
  const [moveSaving, setMoveSaving] = useState(false);

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
const [nextSessionDecision, setNextSessionDecision] =
  useState<'accepted' | 'kept' | null>(null);const [sessionFeedbackSaving, setSessionFeedbackSaving] = useState(false);
  const [isSavingAdjustment, setIsSavingAdjustment] =
  useState(false);
  const [confirmedMatchSessionId, setConfirmedMatchSessionId] =
  useState<string | null>(null);
const [sessionFeedbackMessage, setSessionFeedbackMessage] = useState('');
const [manualDuration,setManualDuration]=useState('');
const [manualDistance,setManualDistance]=useState('');
const [manualSaving,setManualSaving]=useState(false);
const [manualMessage,setManualMessage]=useState('');
const [editableManualId,setEditableManualId]=useState<string|null>(null);
const [garminConnected, setGarminConnected] = useState(false);
  
  const [trainingLoad, setTrainingLoad] = useState({
  fitness: null as number | null,
  fatigue: null as number | null,
  form: null as number | null,
  weeklyStress: null as number | null,
  eligibleActivities: 0,
});

const [trainingLoadActivities, setTrainingLoadActivities] = useState<any[]>([]);
const [trainingLoadHistory, setTrainingLoadHistory] = useState<ReturnType<typeof calculateTrainingLoad>>([]);
const [loadRangeDays, setLoadRangeDays] = useState<42 | 90 | 180>(42);
const [selectedLoadDate, setSelectedLoadDate] = useState<string | null>(null);
const [performanceRangeDays, setPerformanceRangeDays] = useState<28 | 84 | 180 | 365>(84);
const [performanceWeekKey, setPerformanceWeekKey] = useState<string | null>(null);
  const [completedActivityFeed, setCompletedActivityFeed] = useState<any[]>([]);
useEffect(() => {
  if (trainingLoadActivities.length === 0) {
    setTrainingLoadHistory([]);
    setTrainingLoad({fitness:null,fatigue:null,form:null,weeklyStress:null,eligibleActivities:0});
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
    setTrainingLoadHistory([]);
    setTrainingLoad({fitness:null,fatigue:null,form:null,weeklyStress:null,eligibleActivities:0});
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

  const firstDate = new Date(Math.min(...activitiesWithStress.map(activity => new Date(activity.start_time).getTime())));
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
  setTrainingLoadHistory(loadSeries);

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
  async function loadGarminConnection() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    setGarminConnected(false);
    return;
  }

  const { data: athlete, error: athleteError } = await supabase
    .from('athlete_profile')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (athleteError || !athlete) {
    setGarminConnected(false);
    return;
  }

  const { data, error } = await supabase
    .from('athlete_integration')
    .select('provider')
    .eq('athlete_id', athlete.id)
    .eq('provider', 'garmin')
    .maybeSingle();

  if (error) {
    console.error(
      'Unable to load Garmin connection:',
      error,
    );
    setGarminConnected(false);
    return;
  }

  setGarminConnected(Boolean(data));
}
  async function connectGarmin() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;

  if (!accessToken) {
    window.alert('Please sign in to Azur first.');
    return;
  }

  const response = await fetch('/api/garmin/connect', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('Garmin connection failed:', data);
    window.alert(
      data?.error ?? 'Unable to start Garmin connection.',
    );
    return;
  }

  if (!data?.authorizationUrl) {
    window.alert('Garmin authorization URL was not returned.');
    return;
  }

  window.location.href = data.authorizationUrl;
}
async function connectIntervals() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    window.alert('Please sign in to AZUR before connecting Intervals.icu.');
    return;
  }
  try {
    const response = await fetch('/api/intervals/connect', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await response.json();
    if (!response.ok || !data?.authorizationUrl) {
      throw new Error(data?.error ?? 'Unable to start Intervals.icu connection');
    }
    window.location.assign(data.authorizationUrl);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Intervals.icu connection failed');
  }
}
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
    .select(
  'id, name, race_date, priority, location, swim_distance_m, bike_distance_km, run_distance_km, target_splits',
)
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
  id: data.id,
  name: data.name,
  raceDate: data.race_date,
  priority: data.priority,
  location: data.location ?? '',
  swimDistanceM:
    data.swim_distance_m != null
      ? Number(data.swim_distance_m)
      : null,
  bikeDistanceKm:
    data.bike_distance_km != null
      ? Number(data.bike_distance_km)
      : null,
  runDistanceKm:
    data.run_distance_km != null
      ? Number(data.run_distance_km)
      : null,
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
  setWeekSessions([]);
  setSelectedId('');
  return;
}

const { data: completedActivities, error: completedError } =
  await supabase
    .from('completed_activity')
    .select(
  'id, planned_session_id, sport, start_time, duration_sec, distance_m, session_rpe, source, processed_metrics, raw_payload, match_confidence'
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
const completedBySessionId = new Map();

(completedActivities ?? []).forEach((activity) => {
  if (!activity.planned_session_id) {
    return;
  }

  const existing = completedBySessionId.get(
    activity.planned_session_id,
  );

  if (
    !existing ||
    Number(activity.match_confidence) === 100 ||
    Number(existing.match_confidence) !== 100
  ) {
    completedBySessionId.set(
      activity.planned_session_id,
      activity,
    );
  }
});
  console.log(
  'AZUR completed activities loaded:',
  completedActivities,
);

console.log(
  'AZUR completed activity map:',
  Array.from(completedBySessionId.entries()),
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

completedRpe:
  completedBySessionId.get(session.id)?.source === 'manual' && completedBySessionId.get(session.id)?.session_rpe != null
    ? Number(completedBySessionId.get(session.id)?.session_rpe)
    : undefined,
completedDistanceM:
  completedBySessionId.get(session.id)?.distance_m != null
    ? Number(completedBySessionId.get(session.id)?.distance_m)
    : undefined,
completedActivityId:
  completedBySessionId.get(session.id)?.id ?? undefined,

completedMatchConfidence:
  completedBySessionId.get(session.id)?.match_confidence != null
    ? Number(completedBySessionId.get(session.id)?.match_confidence)
    : undefined,

completedSource:
  completedBySessionId.get(session.id)?.source ?? undefined,
    completedRoute:
  completedBySessionId.get(session.id)?.raw_payload?.route ?? undefined,
    completedSeries:
  completedBySessionId.get(session.id)?.raw_payload?.series ?? undefined,
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
  averagePower:
    metrics.averagePower ?? metrics.average_power,

  normalizedPower:
    metrics.normalizedPower ?? metrics.normalized_power,

  averageHeartRate:
    metrics.averageHeartRate ?? metrics.average_heart_rate,

  maxHeartRate:
    metrics.maxHeartRate ?? metrics.max_heart_rate,
  averagePaceSecPerKm:
  metrics.averagePaceSecPerKm ?? metrics.average_pace_sec_per_km,

bestPaceSecPerKm:
  metrics.bestPaceSecPerKm ?? metrics.best_pace_sec_per_km,

averageSpeedKmh:
  metrics.averageSpeedKmh ?? metrics.average_speed_kmh,

maxSpeedKmh:
  metrics.maxSpeedKmh ?? metrics.max_speed_kmh,

  calories: metrics.calories,

  trainingLoad:
    metrics.trainingLoad ?? metrics.training_load,

  isTest:
    metrics.is_test === true ||
    metrics.test_fixture === true,
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
  const nextPlannedSession = selected
  ? [...weekSessions]
      .filter(
        (session) =>
        (session.status === 'planned' || session.status === 'edited') &&
          session.plannedDate > selected.plannedDate,
      )
      .sort((a, b) =>
        a.plannedDate.localeCompare(b.plannedDate),
      )[0] ?? null
  : null;
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
  const matchCompletionPercent =
  selected?.durationMin && selected.completedDurationSec
    ? Math.round(
        (selected.completedDurationSec / 60 / selected.durationMin) * 100,
      )
    : null;

const matchConfidence =
  Number(selected?.completedMatchConfidence) === 100
    ? 'matched'
    : matchCompletionPercent == null
      ? 'matched'
      : matchCompletionPercent >= 85
        ? 'matched'
        : matchCompletionPercent >= 50
          ? 'partial'
          : 'possible';
  const nextSessionRecommendation = (() => {
  if (!selected || !nextPlannedSession || !selected.completedDurationSec) {
    return null;
  }
  // Manual records carry duration, distance and self-reported RPE, not measured
  // power, heart rate or verified recovery. Never propose an automated change
  // to another session based solely on a manual completion.
  if (selected.completedSource === 'manual') return null;
// Existing accepted plan changes are historical context, not a new
// recommendation caused by this completed activity.
if(nextPlannedSession.prescription?.azur_adaptation?.status==='accepted'){
  return null;
}

if (
  matchConfidence === 'possible' &&
  confirmedMatchSessionId !== selected.id
) {
  return {
    action: 'CONFIRM',
    title: 'Confirm activity match',
    recommendedDurationMin: nextPlannedSession.durationMin,
    adjustment:
      'Azur will not change the next session until you confirm that this completed activity belongs to the planned workout.',
    reason:
      'This activity is currently only a possible match, so it is not safe to adapt your plan from it yet.',
  };
}

const completionPercent =
    selected.durationMin > 0
      ? Math.round(
          (selected.completedDurationSec / 60 / selected.durationMin) * 100,
        )
      : null;

  const recoveryColor = recoveryReadiness?.color ?? null;
  const form = trainingLoad.form;
const reductionFactor =
  nextPlannedSession.sessionClass === 'easy'
    ? 0.9
    : nextPlannedSession.sessionClass === 'intensity'
      ? 0.8
      : nextPlannedSession.sessionClass === 'race_specific'
        ? 0.85
        : 0.85;

const adaptationStrategy =
  nextPlannedSession.sessionClass === 'intensity'
    ? nextPlannedSession.sport === 'bike'
      ? 'Preserve the key power intervals and reduce surrounding volume first.'
      : nextPlannedSession.sport === 'run'
        ? 'Preserve the key quality reps and reduce surrounding easy running first.'
        : 'Preserve the main quality set and reduce supporting volume first.'
    : nextPlannedSession.sessionClass === 'race_specific'
      ? 'Preserve the race-specific work and reduce non-essential volume around it.'
      : nextPlannedSession.sessionClass === 'endurance'
        ? 'Reduce total aerobic volume while keeping the intended endurance focus.'
        : 'Reduce overall duration while keeping the session easy and controlled.';

if (
  recoveryColor === 'red' ||
  (completionPercent != null && completionPercent < 50) ||
  (form != null && form < -20)
) {
   return {
  action: 'REDUCE',
title: 'Reduce volume, preserve intent',
recommendedDurationMin: Math.max(
  20,
  Math.round(nextPlannedSession.durationMin * reductionFactor),
),

adjustment:
  `Reduce from ${nextPlannedSession.durationMin} min to ${Math.max(
    20,
    Math.round(nextPlannedSession.durationMin * reductionFactor),
  )} min. ${adaptationStrategy}`,
  reason:
    recoveryColor === 'red'
      ? 'Recovery signals are currently elevated, so reducing training demand is the safer progression.'
      : completionPercent != null && completionPercent < 50
        ? `Only ${completionPercent}% of the planned session was completed, so Azur recommends reducing the next session rather than progressing load.`
        : 'Current training fatigue is elevated, so Azur recommends reducing the next session demand.',
};
  }
const progressionStrategy =
  nextPlannedSession.sessionClass === 'intensity'
    ? nextPlannedSession.sport === 'bike'
      ? 'Preserve interval quality and only add volume if the key power work remains controlled.'
      : nextPlannedSession.sport === 'run'
        ? 'Preserve pace quality and progress the session cautiously through supporting volume.'
        : 'Preserve the main quality set and progress supporting volume cautiously.'
    : nextPlannedSession.sessionClass === 'race_specific'
      ? 'Progress race-specific volume cautiously while protecting the quality of the key work.'
      : nextPlannedSession.sessionClass === 'endurance'
        ? 'Progress aerobic duration gradually while keeping the session controlled.'
        : 'Keep the session easy and only add a small amount of duration.';
  if (
    recoveryColor === 'green' &&
    completionPercent != null &&
    completionPercent >= 95 &&
    form != null &&
    form >= -10
  ) {
return {
  action: 'PROGRESS',
  title: 'Progression may be appropriate',
  recommendedDurationMin: Math.round(
  nextPlannedSession.durationMin * 1.1,
),

adjustment:
  `Progress from ${nextPlannedSession.durationMin} min to ${Math.round(
    nextPlannedSession.durationMin * 1.1,
  )} min. ${progressionStrategy}`,
  reason:
    'The planned session was completed, recovery is positive, and current form is supportive of a small increase in training demand.',
};
  }
const keepStrategy =
  nextPlannedSession.sessionClass === 'intensity'
    ? nextPlannedSession.sport === 'bike'
      ? 'Keep the key power intervals and supporting volume exactly as planned.'
      : nextPlannedSession.sport === 'run'
        ? 'Keep the quality reps, recoveries and overall volume as planned.'
        : 'Keep the main quality set and supporting volume unchanged.'
    : nextPlannedSession.sessionClass === 'race_specific'
      ? 'Keep the race-specific work and surrounding volume unchanged.'
      : nextPlannedSession.sessionClass === 'endurance'
        ? 'Keep the planned aerobic duration and intensity unchanged.'
        : 'Keep the session easy, controlled and at the planned duration.';
    return {
  action: 'KEEP',
  title: 'Keep next session as planned',
  recommendedDurationMin: nextPlannedSession.durationMin,

adjustment:
  `Keep the planned duration at ${nextPlannedSession.durationMin} min. ${keepStrategy}`,
  reason:
    'Current execution, recovery and training load do not provide a strong reason to either reduce or progress the next session.',
};
})();
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
useEffect(()=>{
  let cancelled=false;
  setEditableManualId(null);
  setManualDuration('');setManualDistance('');setManualMessage('');
  if(selected?.id && selected.status==='completed'){
    void supabase.from('completed_activity').select('id,source,duration_sec,distance_m,session_rpe,notes')
      .eq('planned_session_id',selected.id).then(({data,error})=>{
        if(cancelled||error||!data)return;
        const activity=data.find(row=>row.source==='manual' && row.id===selected.completedActivityId) ?? (data.length===1 && data[0].source==='manual' ? data[0] : null);
        if(!activity)return;
        setEditableManualId(activity.id);
        setManualDuration(String(Number(activity.duration_sec)/60));
        setManualDistance(activity.distance_m == null?'':String(Number(activity.distance_m)/1000));
        setSessionFeedback({rpe:activity.session_rpe==null?'':String(activity.session_rpe),notes:activity.notes??''});
      });
  }
  return()=>{cancelled=true};
},[selected?.id,selected?.status]);
useEffect(() => {
  async function loadSessionFeedback() {
    if (!selected?.id) return;

    // Only query Supabase for real database session IDs.
    const isValidSessionId =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        selected.id,
      );

    if (!isValidSessionId) {
      setSessionFeedback({
        rpe: '',
        notes: '',
      });
      setSessionFeedbackMessage('');
      return;
    }

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
const macrocycle = useMemo(
  () => buildMacrocycle(primaryRace.raceDate),
  [primaryRace.raceDate],
);

const currentMacrocycleWeek =
  macrocycle.length > 0
    ? macrocycle[0]
    : null;
const raceGoalDemand = useMemo(
  () =>
    calculateRaceGoalDemand({
      swimSplit: primaryRace.targetSplits?.swim,
      bikeSplit: primaryRace.targetSplits?.bike,
      runSplit: primaryRace.targetSplits?.run,
      swimDistanceM: primaryRace.swimDistanceM,
      bikeDistanceKm: primaryRace.bikeDistanceKm,
      runDistanceKm: primaryRace.runDistanceKm,
    }),
  [
    primaryRace.targetSplits,
    primaryRace.swimDistanceM,
    primaryRace.bikeDistanceKm,
    primaryRace.runDistanceKm,
  ],
);
  const athleteRaceGap = useMemo(
  () =>
    calculateAthleteRaceGap({
      swimThresholdSecPer100m: athleteProfile.swimThreshold,
      swimGoalSecPer100m: raceGoalDemand.swimPaceSecPer100m,
      runThresholdSecPerKm: athleteProfile.runThreshold,
      runGoalSecPerKm: raceGoalDemand.runPaceSecPerKm,
      ftpW: athleteProfile.ftp,
      bikeGoalAverageKph: raceGoalDemand.bikeAverageKph,
    }),
  [
    athleteProfile.swimThreshold,
    athleteProfile.runThreshold,
    athleteProfile.ftp,
    raceGoalDemand,
  ],
);
  console.log('AZUR MACROCYCLE', {
  race: primaryRace.name,
  raceDate: primaryRace.raceDate,
  totalWeeks: macrocycle.length,
  currentWeek: currentMacrocycleWeek,
});
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
function buildAdaptedPrescription(
  prescription: any,
  originalDurationMin: number,
  recommendedDurationMin: number,
  sessionClass: string,
  sport: string,
) {
  const adapted = JSON.parse(
    JSON.stringify(prescription ?? {}),
  );

  const changes: string[] = [];

  let reductionNeeded = Math.max(
    0,
    originalDurationMin - recommendedDurationMin,
  );

  if (reductionNeeded <= 0) {
    return {
      prescription: adapted,
      changes,
    };
  }

  // 1. Reduce cooldown first.
  if (Array.isArray(adapted.cooldown)) {
    for (
      let index = adapted.cooldown.length - 1;
      index >= 0 && reductionNeeded > 0;
      index--
    ) {
      const step = adapted.cooldown[index];

      if (step.duration_min == null) {
        continue;
      }

      const currentDuration = Number(step.duration_min);

      // Always preserve at least 5 minutes of cooldown.
      const reducible = Math.max(
        0,
        currentDuration - 5,
      );

      const reduction = Math.min(
        reducible,
        reductionNeeded,
      );

      if (reduction > 0) {
        step.duration_min =
          currentDuration - reduction;

        reductionNeeded -= reduction;

        changes.push(
          `Cooldown reduced from ${currentDuration} to ${step.duration_min} min`,
        );
      }
    }
  }

  // 2. Reduce simple warm-up volume while preserving activation drills.
  if (
    reductionNeeded > 0 &&
    Array.isArray(adapted.warmup)
  ) {
    const simpleWarmupSteps =
      adapted.warmup.filter(
        (step: any) =>
          step.duration_min != null &&
          step.reps == null,
      );

    const totalSimpleWarmup =
      simpleWarmupSteps.reduce(
        (total: number, step: any) =>
          total + Number(step.duration_min),
        0,
      );

    // Preserve at least 10 minutes of conventional warm-up.
    let warmupReducible = Math.max(
      0,
      totalSimpleWarmup - 10,
    );

    for (
      let index = adapted.warmup.length - 1;
      index >= 0 &&
      reductionNeeded > 0 &&
      warmupReducible > 0;
      index--
    ) {
      const step = adapted.warmup[index];

      if (
        step.duration_min == null ||
        step.reps != null
      ) {
        continue;
      }

      const currentDuration =
        Number(step.duration_min);

      const reduction = Math.min(
        currentDuration,
        warmupReducible,
        reductionNeeded,
      );

      if (reduction > 0) {
        step.duration_min =
          currentDuration - reduction;

        reductionNeeded -= reduction;
        warmupReducible -= reduction;

        changes.push(
          `Warm-up volume reduced by ${reduction} min`,
        );
      }
    }

    adapted.warmup = adapted.warmup.filter(
      (step: any) =>
        step.duration_min == null ||
        Number(step.duration_min) > 0,
    );
  }

  // 3. For intensity / race-specific sessions,
  // shorten recovery before removing quality reps.
  if (
    reductionNeeded > 0 &&
    (sessionClass === 'intensity' ||
      sessionClass === 'race_specific') &&
    Array.isArray(adapted.main_set)
  ) {
    for (const step of adapted.main_set) {
      if (
        reductionNeeded <= 0 ||
        step.recovery_min == null ||
        step.reps == null
      ) {
        continue;
      }

      const reps = Number(step.reps);
      const recoveries = Math.max(0, reps - 1);

      if (recoveries === 0) {
        continue;
      }

      const currentRecovery =
        Number(step.recovery_min);

      // Protect at least 2 minutes recovery.
      const maxRecoveryReduction =
        Math.max(0, currentRecovery - 2);

      const reductionPerRecovery = Math.min(
        maxRecoveryReduction,
        Math.ceil(
          reductionNeeded / recoveries,
        ),
      );

      if (reductionPerRecovery > 0) {
        step.recovery_min =
          currentRecovery -
          reductionPerRecovery;

        const saved =
          reductionPerRecovery * recoveries;

        reductionNeeded = Math.max(
          0,
          reductionNeeded - saved,
        );

        changes.push(
          `Recovery between key reps reduced from ${currentRecovery} to ${step.recovery_min} min`,
        );
      }
    }
  }
// 4. For run intensity sessions, shorten key reps
// before removing an entire repetition.
if (
  reductionNeeded > 0 &&
  sport === 'run' &&
  (sessionClass === 'intensity' ||
    sessionClass === 'race_specific') &&
  Array.isArray(adapted.main_set)
) {
  for (const step of adapted.main_set) {
    if (
      reductionNeeded <= 0 ||
      step.reps == null ||
      step.duration_min == null
    ) {
      continue;
    }

    const reps = Number(step.reps);
    const currentRepDuration =
      Number(step.duration_min);

    if (
      reps <= 1 ||
      currentRepDuration <= 6
    ) {
      continue;
    }

    // Protect a minimum of 6 minutes per quality rep.
    const maxReductionPerRep =
      currentRepDuration - 6;

    const requiredReductionPerRep =
      Math.ceil(reductionNeeded / reps);

    const reductionPerRep = Math.min(
      maxReductionPerRep,
      requiredReductionPerRep,
    );

    if (reductionPerRep > 0) {
      step.duration_min =
        currentRepDuration - reductionPerRep;

      const saved =
        reductionPerRep * reps;

      reductionNeeded = Math.max(
        0,
        reductionNeeded - saved,
      );

      changes.push(
        `Key run intervals shortened from ${currentRepDuration} to ${step.duration_min} min while preserving ${reps} reps`,
      );
    }
  }
}  
  // 5. For bike intensity sessions, shorten key reps
// before removing an entire repetition.
if (
  reductionNeeded > 0 &&
  sport === 'bike' &&
  (sessionClass === 'intensity' ||
    sessionClass === 'race_specific') &&
  Array.isArray(adapted.main_set)
) {
  for (const step of adapted.main_set) {
    if (
      reductionNeeded <= 0 ||
      step.reps == null ||
      step.duration_min == null
    ) {
      continue;
    }

    const reps = Number(step.reps);
    const currentRepDuration =
      Number(step.duration_min);

    if (
      reps <= 1 ||
      currentRepDuration <= 5
    ) {
      continue;
    }
// 6. For swim sessions, reduce supporting distance first
// while preserving the main aerobic/quality set.
if (
  reductionNeeded > 0 &&
  sport === 'swim'
) {
  // Convert time reduction into an approximate swim distance target.
  // Uses 100 m per 2 minutes as a conservative default.
  let swimDistanceReductionNeeded =
    reductionNeeded * 50;

  // A. Reduce cooldown distance first.
  if (
    swimDistanceReductionNeeded > 0 &&
    Array.isArray(adapted.cooldown)
  ) {
    for (
      let index = adapted.cooldown.length - 1;
      index >= 0 &&
      swimDistanceReductionNeeded > 0;
      index--
    ) {
      const step = adapted.cooldown[index];

      if (step.distance_m == null) {
        continue;
      }

      const currentDistance =
        Number(step.distance_m);

      // Preserve at least 100 m cooldown.
      const reducible = Math.max(
        0,
        currentDistance - 100,
      );

      const reduction = Math.min(
        reducible,
        swimDistanceReductionNeeded,
      );

      if (reduction > 0) {
        step.distance_m =
          currentDistance - reduction;

        swimDistanceReductionNeeded -= reduction;

        changes.push(
          `Swim cooldown reduced from ${currentDistance} m to ${step.distance_m} m`,
        );
      }
    }
  }

  // B. Reduce easy warm-up distance next,
  // but protect drill steps.
  if (
    swimDistanceReductionNeeded > 0 &&
    Array.isArray(adapted.warmup)
  ) {
    for (
      let index = adapted.warmup.length - 1;
      index >= 0 &&
      swimDistanceReductionNeeded > 0;
      index--
    ) {
      const step = adapted.warmup[index];

      if (
        step.distance_m == null ||
        step.reps != null
      ) {
        continue;
      }

      const currentDistance =
        Number(step.distance_m);

      // Preserve at least 200 m easy warm-up.
      const reducible = Math.max(
        0,
        currentDistance - 200,
      );

      const reduction = Math.min(
        reducible,
        swimDistanceReductionNeeded,
      );

      if (reduction > 0) {
        step.distance_m =
          currentDistance - reduction;

        swimDistanceReductionNeeded -= reduction;

        changes.push(
          `Swim warm-up reduced from ${currentDistance} m to ${step.distance_m} m`,
        );
      }
    }
  }

  // C. Reduce secondary main-set blocks before the first/main block.
  if (
    swimDistanceReductionNeeded > 0 &&
    Array.isArray(adapted.main_set) &&
    adapted.main_set.length > 1
  ) {
    for (
      let index = adapted.main_set.length - 1;
      index >= 1 &&
      swimDistanceReductionNeeded > 0;
      index--
    ) {
      const step = adapted.main_set[index];

      if (
        step.reps == null ||
        step.distance_m == null
      ) {
        continue;
      }

      const distancePerRep =
        Number(step.distance_m);

      const originalReps =
        Number(step.reps);

      while (
        swimDistanceReductionNeeded > 0 &&
        Number(step.reps) > 1
      ) {
        step.reps =
          Number(step.reps) - 1;

        swimDistanceReductionNeeded =
          Math.max(
            0,
            swimDistanceReductionNeeded -
              distancePerRep,
          );
      }

      if (Number(step.reps) !== originalReps) {
        changes.push(
          `Secondary swim set reduced from ${originalReps} to ${step.reps} reps`,
        );
      }
    }
  }

  // D. Only reduce the primary main set if required.
  if (
    swimDistanceReductionNeeded > 0 &&
    Array.isArray(adapted.main_set) &&
    adapted.main_set.length > 0
  ) {
    const primarySet = adapted.main_set[0];

    if (
      primarySet.reps != null &&
      primarySet.distance_m != null
    ) {
      const distancePerRep =
        Number(primarySet.distance_m);

      const originalReps =
        Number(primarySet.reps);

      // Preserve at least 4 reps in the primary set.
      while (
        swimDistanceReductionNeeded > 0 &&
        Number(primarySet.reps) > 4
      ) {
        primarySet.reps =
          Number(primarySet.reps) - 1;

        swimDistanceReductionNeeded =
          Math.max(
            0,
            swimDistanceReductionNeeded -
              distancePerRep,
          );
      }

      if (
        Number(primarySet.reps) !== originalReps
      ) {
        changes.push(
          `Primary swim set reduced from ${originalReps} to ${primarySet.reps} reps`,
        );
      }
    }
  }
}    // Protect at least 5 minutes per key bike rep.
    const maxReductionPerRep =
      currentRepDuration - 5;

    const requiredReductionPerRep =
      Math.ceil(reductionNeeded / reps);

    const reductionPerRep = Math.min(
      maxReductionPerRep,
      requiredReductionPerRep,
    );

    if (reductionPerRep > 0) {
      step.duration_min =
        currentRepDuration - reductionPerRep;

      const saved =
        reductionPerRep * reps;

      reductionNeeded = Math.max(
        0,
        reductionNeeded - saved,
      );

      changes.push(
        `Key bike intervals shortened from ${currentRepDuration} to ${step.duration_min} min while preserving ${reps} reps`,
      );
    }
  }
}
  // 7. Only remove a quality rep if supporting volume
  // cannot achieve the required reduction.
  if (
    reductionNeeded > 0 &&
    Array.isArray(adapted.main_set)
  ) {
    for (const step of adapted.main_set) {
      if (
        reductionNeeded <= 0 ||
        step.reps == null ||
        Number(step.reps) <= 1 ||
        step.duration_min == null
      ) {
        continue;
      }

      const currentReps = Number(step.reps);
      const repDuration =
        Number(step.duration_min);

      const originalReps = currentReps;

      while (
        reductionNeeded > 0 &&
        Number(step.reps) > 1
      ) {
        step.reps =
          Number(step.reps) - 1;

        reductionNeeded = Math.max(
          0,
          reductionNeeded - repDuration,
        );
      }

      if (Number(step.reps) !== originalReps) {
        changes.push(
          `Key set reduced from ${originalReps} to ${step.reps} reps`,
        );
      }
    }
  }

  return {
    prescription: adapted,
    changes,
  };
}
async function acceptNextSessionAdjustment() {
  if (
    !nextPlannedSession ||
    !nextSessionRecommendation?.recommendedDurationMin
  ) {
    return;
  }

  setIsSavingAdjustment(true);

  const recommendedDuration =
    nextSessionRecommendation.recommendedDurationMin;

  const adaptedResult = buildAdaptedPrescription(
    nextPlannedSession.prescription ?? {},
    nextPlannedSession.durationMin,
    recommendedDuration,
    nextPlannedSession.sessionClass,
    nextPlannedSession.sport,
  );

  const { error } = await supabase
    .from('planned_session')
    .update({
      duration_min: recommendedDuration,
      prescription: {
        ...adaptedResult.prescription,
  azur_adaptation: {
    status: 'accepted',
    action: nextSessionRecommendation.action,
    original_duration_min: nextPlannedSession.durationMin,
    recommended_duration_min: recommendedDuration,
    source_session_id: selected.id,
    accepted_at: new Date().toISOString(),

    changes: adaptedResult.changes,

       original_prescription:
      nextPlannedSession.prescription ?? {},
  },
},
})
.eq('id', nextPlannedSession.id);

  if (error) {
    console.error(
      'Unable to save adaptive session adjustment:',
      error,
    );
    setIsSavingAdjustment(false);
    return;
  }

  setWeekSessions((current) =>
    current.map((session) =>
      session.id === nextPlannedSession.id
        ? {
            ...session,
            durationMin: recommendedDuration,
            version: session.version + 1,
            status: 'edited',
prescription: {
  ...adaptedResult.prescription,

  azur_adaptation: {
    status: 'accepted',
    action: nextSessionRecommendation.action,
    original_duration_min: nextPlannedSession.durationMin,
    recommended_duration_min: recommendedDuration,
    source_session_id: selected.id,
    accepted_at: new Date().toISOString(),

    changes: adaptedResult.changes,

    original_prescription:
      nextPlannedSession.prescription ?? {},
  },
},
          }
        : session,
    ),
  );

  setWeekVersion((current) => current + 1);
  setNextSessionDecision('accepted');
    setIsSavingAdjustment(false);
}
  async function confirmActivityMatch() {
  if (!selected.completedActivityId) {
    return;
  }

const { error } = await supabase
  .from('completed_activity')
  .update({
    match_confidence: 100,
    planned_session_id: selected.id,
  })
  .eq('id', selected.completedActivityId);;

  if (error) {
    console.error(
      'Unable to confirm activity match:',
      error,
    );
    return;
  }

  setWeekSessions((current) =>
    current.map((session) =>
      session.id === selected.id
        ? {
            ...session,
            completedMatchConfidence: 100,
          }
        : session,
    ),
  );

  setConfirmedMatchSessionId(selected.id);
}
  async function generateCurrentWeekPlan(
  previewOnly = false,
) {
    console.log('AZUR PREVIEW STARTED', {
  previewOnly,
});
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  const { data: athlete, error: athleteError } = await supabase
    .from('athlete_profile')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (athleteError || !athlete) {
    console.error(
      'Unable to resolve athlete for week generation:',
      athleteError,
    );
    return;
  }

  const now = new Date();

  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );

  const daysFromMonday = (monday.getDay() + 6) % 7;

monday.setDate(
  monday.getDate() -
    daysFromMonday +
    (previewOnly ? previewWeekOffset * 7 : 0),
);

  const toDateKey = (date: Date) =>
    `${date.getFullYear()}-${String(
      date.getMonth() + 1,
    ).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`;

  const weekStart = toDateKey(monday);
let { data: seasonWeek, error: seasonWeekError } =
  await supabase
    .from('season_week')
    .select('id, phase, target_hours')
    .eq('athlete_id', athlete.id)
    .eq('week_start', weekStart)
    .maybeSingle();

if (seasonWeekError) {
  console.error(
    'Unable to load season week:',
    seasonWeekError,
  );
  return;
}

if (!seasonWeek) {
  const { data: previousWeek, error: previousWeekError } =
    await supabase
      .from('season_week')
      .select('phase, target_hours')
      .eq('athlete_id', athlete.id)
      .lt('week_start', weekStart)
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle();

  if (previousWeekError) {
    console.error(
      'Unable to load previous season week:',
      previousWeekError,
    );
    return;
  }

  const { data: createdWeek, error: createWeekError } =
    await supabase
      .from('season_week')
      .insert({
        athlete_id: athlete.id,
        week_start: weekStart,
        phase: previousWeek?.phase ?? 'Base 1',
        target_hours: previousWeek?.target_hours ?? 8,
      })
      .select('id, phase, target_hours')
      .single();

  if (createWeekError || !createdWeek) {
    console.error(
      'Unable to create current season week:',
      createWeekError,
    );
    return;
  }

  seasonWeek = createdWeek;
}
    const historyStart = new Date(monday);

historyStart.setDate(
  historyStart.getDate() - 42,
);

const { data: recentActivities, error: recentActivitiesError } =
  await supabase
    .from('completed_activity')
    .select(
      'start_time, duration_sec, sport',
    )
    .eq('athlete_id', athlete.id)
    .gte(
      'start_time',
      historyStart.toISOString(),
    )
    .lt(
      'start_time',
      monday.toISOString(),
    )
    .order('start_time', {
      ascending: true,
    });

if (recentActivitiesError) {
  console.error(
    'Unable to load recent training history:',
    recentActivitiesError,
  );
}
    const {
  data: savedBaseline,
  error: baselineError,
} = await supabase
  .from('athlete_training_baseline')
.select(
  'weekly_hours, max_weekly_hours, sessions_per_week, swims_per_week, longest_ride_minutes, longest_run_minutes, strongest_sport, development_sport',
)
  .eq('athlete_id', athlete.id)
  .maybeSingle();

if (baselineError) {
  console.error(
    'Unable to load athlete training baseline:',
    baselineError,
  );
  return;
}

const hasConfirmedBaseline =
  savedBaseline !== null;
const hasSufficientHistory =
  !recentActivitiesError &&
  (recentActivities?.length ?? 0) >= 12;

if (!hasSufficientHistory && !hasConfirmedBaseline) {
  const message =
    'Azur needs more historical training data ' +
    'or an athlete-confirmed starting baseline ' +
    'before generating a training plan.';

  console.warn(message);

  if (previewOnly) {
    window.alert(message);
  }

  return;
}
    const recentTrainingSeconds =
  (recentActivities ?? []).reduce(
    (total, activity) =>
      total +
      Number(activity.duration_sec ?? 0),
    0,
  );
    const targetHours =
  Number(seasonWeek.target_hours ?? 8);
    
const recentAverageHours =
  recentTrainingSeconds /
  3600 /
  6;
    const recentThreeWeekStart = new Date(monday);

recentThreeWeekStart.setDate(
  recentThreeWeekStart.getDate() - 21,
);

const recentThreeWeekSeconds =
  (recentActivities ?? [])
    .filter(
      (activity) =>
        new Date(activity.start_time) >=
        recentThreeWeekStart,
    )
    .reduce(
      (total, activity) =>
        total +
        Number(activity.duration_sec ?? 0),
      0,
    );

const recentThreeWeekAverageHours =
  recentThreeWeekSeconds /
  3600 /
  3;
const weightedRecentHours =
  !hasSufficientHistory && savedBaseline
    ? Number(savedBaseline.weekly_hours)
    : recentThreeWeekAverageHours > 0
      ? recentAverageHours * 0.4 +
        recentThreeWeekAverageHours * 0.6
      : recentAverageHours;
const weeklyBuckets = new Map<string, number>();

(recentActivities ?? []).forEach((activity) => {
  const activityDate = new Date(activity.start_time);

  const weekMonday = new Date(
    activityDate.getFullYear(),
    activityDate.getMonth(),
    activityDate.getDate(),
  );

  const offset =
    (weekMonday.getDay() + 6) % 7;

  weekMonday.setDate(
    weekMonday.getDate() - offset,
  );

  const weekKey = toDateKey(weekMonday);

  weeklyBuckets.set(
    weekKey,
    (weeklyBuckets.get(weekKey) ?? 0) +
      Number(activity.duration_sec ?? 0),
  );
});

const completedTrainingWeeks =
  Array.from(weeklyBuckets.values()).filter(
    (seconds) =>
      seconds >=
      recentAverageHours *
        3600 *
        0.7,
  ).length;

const consistencyScore =
  completedTrainingWeeks / 6;
    const recentBikeActivities =
  (recentActivities ?? []).filter(
    (activity) => activity.sport === 'bike',
  );

const recentRunActivities =
  (recentActivities ?? []).filter(
    (activity) => activity.sport === 'run',
  );

const recentSwimActivities =
  (recentActivities ?? []).filter(
    (activity) => activity.sport === 'swim',
  );

const longestRecentRideMinutes =
  !hasSufficientHistory && savedBaseline
    ? Number(savedBaseline.longest_ride_minutes)
    : recentBikeActivities.reduce(
        (longest, activity) =>
          Math.max(
            longest,
            Number(activity.duration_sec ?? 0) / 60,
          ),
        0,
      );

const longestRecentRunMinutes =
  !hasSufficientHistory && savedBaseline
    ? Number(savedBaseline.longest_run_minutes)
    : recentRunActivities.reduce(
        (longest, activity) =>
          Math.max(
            longest,
            Number(activity.duration_sec ?? 0) / 60,
          ),
        0,
      );

const recentSwimFrequency =
  !hasSufficientHistory && savedBaseline
    ? Number(savedBaseline.swims_per_week)
    : recentSwimActivities.length / 6;

const recentBikeFrequency =
  recentBikeActivities.length / 6;

const recentRunFrequency =
  recentRunActivities.length / 6;

const recentTotalFrequency =
  !hasSufficientHistory && savedBaseline
    ? Number(savedBaseline.sessions_per_week)
    : (
        recentBikeActivities.length +
        recentRunActivities.length +
        recentSwimActivities.length
      ) / 6;

const confirmedSessionLimit =
  savedBaseline?.sessions_per_week
    ? Math.min(
        6,
        Math.max(
          3,
          Number(savedBaseline.sessions_per_week),
        ),
      )
    : 6;

const historyRecommendedSessionCount =
  recentTotalFrequency > 0
    ? Math.min(
        6,
        Math.max(
          3,
          Math.ceil(recentTotalFrequency + 0.5),
        ),
      )
    : confirmedSessionLimit;

const recommendedSessionCount =
  Math.min(
    confirmedSessionLimit,
    historyRecommendedSessionCount,
  );
const phase =
  String(seasonWeek.phase ?? 'Base 1');

const phaseKey = phase.toLowerCase();
    const isRaceSpecific =
  phaseKey.includes('race specific');

const isTaper =
  phaseKey.includes('taper');

const isRaceWeek =
  phaseKey === 'race';
const shouldIncludeEasyRun =
  recommendedSessionCount >= 5;
const confirmedSwimLimit =
  savedBaseline?.swims_per_week
    ? Math.max(
        1,
        Math.min(
          3,
          Number(savedBaseline.swims_per_week),
        ),
      )
    : 2;

const shouldIncludeSecondSwim =
  !phaseKey.includes('recovery') &&
  recommendedSessionCount >= 6 &&
  confirmedSwimLimit >= 2 &&
  (
    recentSwimFrequency === 0 ||
    recentSwimFrequency >= 1.25
  );

const progressionMultiplier =
  !hasSufficientHistory
    ? 1.0
    : consistencyScore >= 0.8
      ? 1.08
      : consistencyScore >= 0.6
        ? 1.04
        : 1.0;

const safeProgressionHours =
  weightedRecentHours > 0
    ? weightedRecentHours * progressionMultiplier
    : targetHours;

const plannedHours =
  previewOnly && previewWeekOffset > 0
    ? targetHours
    : Math.min(
        targetHours,
        safeProgressionHours,
      );

const targetMinutes =
  Math.round(plannedHours * 60);

const phaseConfig =
  isRaceWeek
    ? {
        swim1Weight: 0.18,
        bikeQualityWeight: 0.18,
        easyRunWeight: 0.14,
        swim2Weight: 0.10,
        longRideWeight: 0.22,
        longRunWeight: 0.18,
      }
    : isTaper
      ? {
        swim1Weight: 0.13,
        bikeQualityWeight: 0.18,
        easyRunWeight: 0.12,
        swim2Weight: 0.10,
        longRideWeight: 0.27,
        longRunWeight: 0.20,
      }
    : isRaceSpecific
      ? {
          swim1Weight: 0.10,
          bikeQualityWeight: 0.18,
          easyRunWeight: 0.10,
          swim2Weight: 0.10,
          longRideWeight: 0.35,
          longRunWeight: 0.17,
        }
      : phaseKey.includes('build')
        ? {
            swim1Weight: 0.10,
            bikeQualityWeight: 0.20,
            easyRunWeight: 0.10,
            swim2Weight: 0.10,
            longRideWeight: 0.32,
            longRunWeight: 0.18,
          }
        : phaseKey.includes('peak')
          ? {
              swim1Weight: 0.10,
              bikeQualityWeight: 0.18,
              easyRunWeight: 0.10,
              swim2Weight: 0.10,
              longRideWeight: 0.34,
              longRunWeight: 0.18,
            }
          : phaseKey.includes('recovery')
            ? {
                swim1Weight: 0.13,
                bikeQualityWeight: 0.17,
                easyRunWeight: 0.14,
                swim2Weight: 0,
                longRideWeight: 0.34,
                longRunWeight: 0.22,
              }
            : {
                swim1Weight: 0.11,
                bikeQualityWeight: 0.19,
                easyRunWeight: 0.11,
                swim2Weight: 0.12,
                longRideWeight: 0.30,
                longRunWeight: 0.17,
              };
const strongestSport =
  savedBaseline?.strongest_sport ?? 'balanced';

const developmentSport =
  savedBaseline?.development_sport ?? 'balanced';

const trainingPriority = resolveTrainingPriority({
  developmentSport,
  strongestSport,
  phase,
  swimGapStatus: athleteRaceGap.swim.status,
  bikeGapStatus: athleteRaceGap.bike.status,
  runGapStatus: athleteRaceGap.run.status,
  swimGapPct: athleteRaceGap.swim.gapPct,
  bikeGapPct: athleteRaceGap.bike.gapPct,
  runGapPct: athleteRaceGap.run.gapPct,
});

const sportBias = trainingPriority.multipliers;
const weightedPhaseConfig = {
  swim1Weight:
    phaseConfig.swim1Weight * sportBias.swim,
  bikeQualityWeight:
    phaseConfig.bikeQualityWeight * sportBias.bike,
  easyRunWeight:
    phaseConfig.easyRunWeight * sportBias.run,
  swim2Weight:
    phaseConfig.swim2Weight * sportBias.swim,
  longRideWeight:
    phaseConfig.longRideWeight * sportBias.bike,
  longRunWeight:
    phaseConfig.longRunWeight * sportBias.run,
};

const activeWeightTotal =
  weightedPhaseConfig.swim1Weight +
  weightedPhaseConfig.bikeQualityWeight +
  (shouldIncludeEasyRun
    ? weightedPhaseConfig.easyRunWeight
    : 0) +
  (shouldIncludeSecondSwim
    ? weightedPhaseConfig.swim2Weight
    : 0) +
  weightedPhaseConfig.longRideWeight +
  weightedPhaseConfig.longRunWeight;

const adjustedWeight = (weight: number) =>
  weight / activeWeightTotal;
const swim1Minutes =
  isRaceWeek
    ? Math.min(
        35,
        Math.round(
          targetMinutes *
           adjustedWeight(weightedPhaseConfig.swim1Weight)
        ),
      )
    : Math.round(
        targetMinutes *
         adjustedWeight(weightedPhaseConfig.swim1Weight)
      );

const bikeQualityMinutes =
  isRaceWeek
    ? Math.min(
        50,
        Math.round(
          targetMinutes *
           adjustedWeight(weightedPhaseConfig.bikeQualityWeight)
        ),
      )
    : isTaper
      ? Math.min(
          75,
          Math.round(
            targetMinutes *
            adjustedWeight(weightedPhaseConfig.bikeQualityWeight)
          ),
        )
: Math.round(
    targetMinutes *
      adjustedWeight(weightedPhaseConfig.bikeQualityWeight),
  );

const easyRunMinutes =
  shouldIncludeEasyRun
    ? Math.round(
        targetMinutes *
          adjustedWeight(weightedPhaseConfig.easyRunWeight)
      )
    : 0;

const swim2Minutes =
  shouldIncludeSecondSwim
    ? isRaceWeek
      ? Math.min(
          25,
          Math.round(
            targetMinutes *
              adjustedWeight(weightedPhaseConfig.swim2Weight)
          ),
        )
      : Math.round(
          targetMinutes *
           adjustedWeight(weightedPhaseConfig.swim2Weight)
        )
    : 0;

const plannedLongRideMinutes =
  Math.round(
    targetMinutes *
      adjustedWeight(weightedPhaseConfig.longRideWeight)
  );

const longRideMinutes =
  isRaceWeek
    ? Math.min(40, plannedLongRideMinutes)
    : isTaper
      ? Math.min(120, plannedLongRideMinutes)
      : previewOnly && previewWeekOffset > 0
        ? plannedLongRideMinutes
        : longestRecentRideMinutes > 0
          ? Math.min(
              plannedLongRideMinutes,
              Math.round(longestRecentRideMinutes * 1.12),
            )
          : plannedLongRideMinutes;

const plannedLongRunMinutes =
  Math.round(
    targetMinutes *
      adjustedWeight(weightedPhaseConfig.longRunWeight)
  );

const longRunMinutes =
  isRaceWeek
    ? Math.min(30, plannedLongRunMinutes)
    : isTaper
      ? Math.min(75, plannedLongRunMinutes)
      : previewOnly && previewWeekOffset > 0
        ? plannedLongRunMinutes
        : longestRecentRunMinutes > 0
          ? Math.min(
              plannedLongRunMinutes,
              Math.round(longestRecentRunMinutes * 1.10),
            )
          : plannedLongRunMinutes;
 
    const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const weekEnd = toDateKey(sunday);

  const { data: existingSessions, error: existingError } =
    await supabase
      .from('planned_session')
      .select('id')
      .eq('athlete_id', athlete.id)
      .eq('is_active_version', true)
      .gte('planned_date', weekStart)
      .lte('planned_date', weekEnd);

if (existingError) {

  return;
}

if (
  !previewOnly &&
  (existingSessions ?? []).length > 0
) {
  console.log(
    'Azur week generation skipped: sessions already exist.',
  );
  return;
}

  const addDays = (offset: number) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + offset);
    return toDateKey(date);
  };
const baseTemplateMinutes = 405;

const scaleFactor =
  targetMinutes / baseTemplateMinutes;

const scaleMinutes = (
  minutes: number,
  minimum: number,
) =>
  Math.max(
    minimum,
    Math.round(minutes * scaleFactor),
  );
    const bikeWarmupMinutes = Math.max(
  10,
  Math.round(bikeQualityMinutes * 0.2),
);

const bikeIntervalReps =
  isRaceWeek
    ? 3
    : isTaper
      ? 3
      : 4;
const bikeRecoveryMinutes = 4;

const bikeNominalCooldownMinutes = Math.max(
  5,
  Math.round(bikeQualityMinutes * 0.15),
);

const bikeIntervalMinutes = Math.max(
  6,
  Math.round(
    (
      bikeQualityMinutes -
      bikeWarmupMinutes -
      bikeNominalCooldownMinutes -
      bikeRecoveryMinutes * (bikeIntervalReps - 1)
    ) / bikeIntervalReps,
  ),
);

const bikeCooldownMinutes = Math.max(
  5,
  bikeQualityMinutes -
    bikeWarmupMinutes -
    bikeIntervalMinutes * bikeIntervalReps -
    bikeRecoveryMinutes * (bikeIntervalReps - 1),
);
    const swimThresholdSecPer100 =
  athleteProfile.swimThreshold ?? 100;

const aerobicSwimPaceSecPer100 =
  swimThresholdSecPer100 * 1.08;

const swim1TargetDistance =
  Math.round(
    (
      (swim1Minutes * 60) /
      aerobicSwimPaceSecPer100 *
      100
    ) / 50,
  ) * 50;

const swim1WarmupDistance =
  Math.max(
    300,
    Math.round(
      (swim1TargetDistance * 0.2) / 50,
    ) * 50,
  );

const swim1CooldownDistance =
  Math.max(
    200,
    Math.round(
      (swim1TargetDistance * 0.1) / 50,
    ) * 50,
  );

const swim1MainDistance =
  Math.max(
    800,
    swim1TargetDistance -
      swim1WarmupDistance -
      swim1CooldownDistance,
  );

const swim1MainReps =
  Math.max(
    4,
    Math.round(swim1MainDistance / 200),
  );
    const swim2TargetDistance =
  Math.round(
    (
      (swim2Minutes * 60) /
      aerobicSwimPaceSecPer100 *
      100
    ) / 50,
  ) * 50;

const swim2WarmupDistance =
  Math.max(
    300,
    Math.round(
      (swim2TargetDistance * 0.15) / 50,
    ) * 50,
  );

const swim2CooldownDistance =
  Math.max(
    200,
    Math.round(
      (swim2TargetDistance * 0.1) / 50,
    ) * 50,
  );

const swim2MainDistance =
  Math.max(
    1000,
    swim2TargetDistance -
      swim2WarmupDistance -
      swim2CooldownDistance,
  );

const swim2MainReps =
  Math.max(
    5,
    Math.round(swim2MainDistance / 200),
  );
    const longRideWarmupMinutes = Math.max(
  10,
  Math.round(longRideMinutes * 0.1),
);

const longRideCooldownMinutes = Math.max(
  10,
  Math.round(longRideMinutes * 0.1),
);

const longRideMainMinutes =
  longRideMinutes -
  longRideWarmupMinutes -
  longRideCooldownMinutes;

const longRideSteadyMinutes =
  isRaceSpecific
    ? Math.round(longRideMainMinutes * 0.4)
    : phaseKey.includes('build') ||
        phaseKey.includes('peak')
      ? Math.round(longRideMainMinutes * 0.6)
      : longRideMainMinutes;

const longRideSpecificMinutes =
  isRaceSpecific
    ? longRideMainMinutes -
      longRideSteadyMinutes
    : phaseKey.includes('build') ||
        phaseKey.includes('peak')
      ? longRideMainMinutes -
        longRideSteadyMinutes
      : 0;
    const longRunWarmupMinutes = Math.max(
  8,
  Math.round(longRunMinutes * 0.1),
);

const longRunCooldownMinutes = Math.max(
  5,
  Math.round(longRunMinutes * 0.08),
);

const longRunMainMinutes =
  longRunMinutes -
  longRunWarmupMinutes -
  longRunCooldownMinutes;

const longRunSteadyMinutes =
  isRaceSpecific
    ? Math.round(longRunMainMinutes * 0.55)
    : phaseKey.includes('build') ||
        phaseKey.includes('peak')
      ? Math.round(longRunMainMinutes * 0.7)
      : longRunMainMinutes;

const longRunSpecificMinutes =
  isRaceSpecific
    ? longRunMainMinutes -
      longRunSteadyMinutes
    : phaseKey.includes('build') ||
        phaseKey.includes('peak')
      ? longRunMainMinutes -
        longRunSteadyMinutes
      : 0;
    const generatedSessions = [
    {
      athlete_id: athlete.id,
      season_week_id: seasonWeek.id,
      planned_date: addDays(0),
      sport: 'swim',
      title: 'Aerobic Technique Swim',
      session_class: 'easy',
      priority: 2,
   duration_min: swim1Minutes,
      targets: {},
      prescription: {
        focus: 'Technique quality and aerobic conditioning',
        warmup: [
          {
            target: 'Easy',
distance_m: swim1WarmupDistance,
            notes: 'Relaxed freestyle',
          },
        ],
        main_set: [
          {
 reps: swim1MainReps,
distance_m: 200,
            target: 'Aerobic',
            recovery_sec: 20,
            notes: 'Smooth and controlled',
          },
        ],
        cooldown: [
          {
            target: 'Easy',
           distance_m: swim1CooldownDistance,
          },
        ],
      },
      rationale:
        'Low-cost aerobic work with a technical focus.',
      terrain: 'Pool',
      status: 'planned',
      locked: false,
      version: 1,
      is_active_version: true,
    },

    {
      athlete_id: athlete.id,
      season_week_id: seasonWeek.id,
      planned_date: addDays(1),
      sport: 'bike',
title:
  isRaceWeek
    ? 'Race Week Bike Activation'
    : isTaper
      ? 'Taper Bike Activation'
      : isRaceSpecific
        ? 'Race-Specific Bike'
        : phaseKey.includes('build')
          ? 'Threshold Development'
          : phaseKey.includes('peak')
            ? 'Race-Specific Bike'
            : phaseKey.includes('recovery')
              ? 'Aerobic Recovery Ride'
              : 'Strength Endurance Bike',

session_class:
  isRaceWeek || isTaper
    ? 'easy'
    : isRaceSpecific || phaseKey.includes('peak')
      ? 'race_specific'
      : phaseKey.includes('recovery')
        ? 'easy'
        : phaseKey.includes('build')
          ? 'intensity'
          : 'endurance',

priority: 1,
duration_min: bikeQualityMinutes,
targets: {},

prescription: {
focus:
  isRaceWeek
    ? 'Short race-week activation with controlled race-effort touches'
    : isTaper
      ? 'Maintain race-specific sharpness while reducing fatigue'
      : isRaceSpecific
        ? 'Sustained race-power development'
        : phaseKey.includes('build')
          ? 'Threshold development'
          : phaseKey.includes('peak')
            ? 'Race-specific bike intensity'
            : phaseKey.includes('recovery')
              ? 'Aerobic recovery riding'
              : 'Strength endurance development',
        warmup: [
          {
duration_min: bikeWarmupMinutes,
            target: 'Easy aerobic',
          },
        ],
        main_set: [
          {
reps: bikeIntervalReps,
duration_min: bikeIntervalMinutes,
recovery_min: bikeRecoveryMinutes,
ftp_percent:
  isTaper || isRaceWeek
    ? '80–85%'
    : phaseKey.includes('peak')
      ? '85–92%'
      : phaseKey.includes('recovery')
        ? '60–70%'
        : phaseKey.includes('build')
          ? '95–100%'
          : '80–90%',

target:
  isTaper || isRaceWeek
    ? 'Controlled race effort'
    : phaseKey.includes('peak')
      ? 'Race-specific'
      : phaseKey.includes('recovery')
        ? 'Easy aerobic'
        : phaseKey.includes('build')
          ? 'Threshold'
          : 'Strength endurance',
          },
        ],
        cooldown: [
          {
duration_min: bikeCooldownMinutes,
            target: 'Easy',
          },
        ],
      },
azurWorkout: {
  sport: 'bike',

title:
  isRaceSpecific
    ? 'Race-Specific Bike'
    : phaseKey.includes('build')
      ? 'Threshold Development'
      : phaseKey.includes('peak')
        ? 'Race-Specific Bike'
        : phaseKey.includes('recovery')
          ? 'Aerobic Recovery Ride'
          : 'Strength Endurance Bike',

  durationMin: bikeQualityMinutes,

 sessionClass:
  isRaceSpecific || phaseKey.includes('peak')
    ? 'race_specific'
    : phaseKey.includes('recovery')
      ? 'easy'
      : phaseKey.includes('build')
        ? 'intensity'
        : 'endurance',

purpose:
  isRaceSpecific
    ? 'Develop sustained race-power durability'
    : phaseKey.includes('build')
      ? 'Develop sustainable threshold power'
      : phaseKey.includes('peak')
        ? 'Develop race-specific bike durability'
        : phaseKey.includes('recovery')
          ? 'Maintain aerobic movement with low training cost'
          : 'Build muscular endurance and aerobic strength',

rationale:
  isTaper
    ? 'Maintain race-specific sharpness while reducing fatigue and preserving freshness for race day.'
    : isRaceSpecific
      ? 'Develop sustained race-power durability and controlled long-course intensity.'
      : phaseKey.includes('build')
        ? 'Develop sustainable threshold power and raise aerobic cycling capacity.'
        : phaseKey.includes('peak')
          ? 'Rehearse race-specific power while maintaining controlled fatigue.'
          : phaseKey.includes('recovery')
            ? 'Maintain aerobic movement while reducing overall training stress.'
            : 'Build muscular endurance and aerobic strength before progressing toward threshold work.',
  steps: [
    {
      type: 'warmup',
      durationMin: bikeWarmupMinutes,
      targetType: 'ftp',
      targetLow: 55,
      targetHigh: 65,
      targetText: 'Easy aerobic',
    },

    {
      type: 'repeat',
      reps: bikeIntervalReps,

      work: {
        type: 'work',
        durationMin: bikeIntervalMinutes,
        targetType: 'ftp',

        targetLow:
          phaseKey.includes('peak')
            ? 85
            : phaseKey.includes('recovery')
              ? 60
              : phaseKey.includes('build')
                ? 95
                : 80,

        targetHigh:
          phaseKey.includes('peak')
            ? 92
            : phaseKey.includes('recovery')
              ? 70
              : phaseKey.includes('build')
                ? 100
                : 90,

        targetText:
          phaseKey.includes('peak')
            ? 'Race-specific'
            : phaseKey.includes('recovery')
              ? 'Easy aerobic'
              : phaseKey.includes('build')
                ? 'Threshold'
                : 'Strength endurance',
      },

      recovery: {
        type: 'recovery',
        durationMin: bikeRecoveryMinutes,
        targetType: 'ftp',
        targetLow: 45,
        targetHigh: 60,
        targetText: 'Easy recovery',
      },
    },

    {
      type: 'cooldown',
      durationMin: bikeCooldownMinutes,
      targetType: 'ftp',
      targetLow: 50,
      targetHigh: 60,
      targetText: 'Easy',
    },
  ],
},
rationale:
  isTaper
    ? 'Maintain race-specific sharpness while reducing fatigue and preserving freshness for race day.'
    : isRaceSpecific
      ? 'Develop sustained race-power durability and controlled long-course intensity.'
      : phaseKey.includes('build')
        ? 'Develop sustainable threshold power and raise aerobic cycling capacity.'
        : phaseKey.includes('peak')
          ? 'Rehearse race-specific power while maintaining controlled fatigue.'
          : phaseKey.includes('recovery')
            ? 'Maintain aerobic movement while reducing overall training stress.'
            : 'Build muscular endurance and aerobic strength before progressing toward threshold work.',
      terrain: 'Indoor or flat road',
      status: 'planned',
      locked: false,
      version: 1,
      is_active_version: true,
    },

 ...(shouldIncludeEasyRun
  ? [
      {
        athlete_id: athlete.id,
        season_week_id: seasonWeek.id,
        planned_date: addDays(2),
        sport: 'run',
      title: 'Easy Aerobic Run',
      session_class: 'easy',
      priority: 2,
     duration_min: easyRunMinutes,
      targets: {},
      prescription: {
        focus: 'Aerobic durability',
        main_set: [
          {
            duration_min: easyRunMinutes,
            target: 'Easy aerobic',
            rpe: '3–4',
          },
        ],
      },
      rationale:
        'Build aerobic durability without excessive fatigue.',
      terrain: 'Flat',
      status: 'planned',
      locked: false,
      version: 1,
 is_active_version: true,
      },
    ]
  : []),

...(shouldIncludeSecondSwim
  ? [
      {
        athlete_id: athlete.id,
        season_week_id: seasonWeek.id,
        planned_date: addDays(4),
        sport: 'swim',
        title: 'Aerobic Endurance Swim',
        session_class: 'endurance',
        priority: 2,
        duration_min: swim2Minutes,
        targets: {},
        prescription: {
          focus: 'Aerobic swim endurance',
          warmup: [
            {
distance_m: swim2WarmupDistance,
              target: 'Easy',
            },
          ],
          main_set: [
            {
reps: swim2MainReps,
distance_m: 200,
              target: 'Aerobic',
              recovery_sec: 15,
            },
          ],
          cooldown: [
            {
distance_m: swim2CooldownDistance,
              target: 'Easy',
            },
          ],
        },
        rationale:
          'Build sustainable aerobic swim volume.',
        terrain: 'Pool',
        status: 'planned',
        locked: false,
        version: 1,
        is_active_version: true,
      },
]
: []),
    {
      athlete_id: athlete.id,
      season_week_id: seasonWeek.id,
      planned_date: addDays(5),
      sport: 'bike',
title:
  isRaceWeek
    ? 'Race Eve Bike Activation'
    : isRaceSpecific
      ? 'Race-Specific Long Ride'
      : phaseKey.includes('peak')
        ? 'Race-Specific Long Ride'
        : phaseKey.includes('recovery')
          ? 'Reduced Aerobic Ride'
          : 'Long Aerobic Ride',

session_class:
  isRaceWeek
    ? 'easy'
    : isRaceSpecific || phaseKey.includes('peak')
      ? 'race_specific'
      : phaseKey.includes('recovery')
        ? 'easy'
        : 'endurance',
      priority: 1,
duration_min: longRideMinutes,
      targets: {},
prescription: {
focus:
  isRaceWeek
    ? 'Race-eve activation with short controlled race-effort touches'
    : isRaceSpecific
      ? 'Sustained race-power endurance and long-course durability'
      : phaseKey.includes('peak')
        ? 'Race-specific endurance'
        : phaseKey.includes('build')
          ? 'Aerobic endurance with race-specific work'
          : phaseKey.includes('recovery')
            ? 'Reduced aerobic endurance'
            : 'Aerobic endurance',

  warmup: [
    {
      duration_min: longRideWarmupMinutes,
      target: '55–65% FTP',
      rpe: '2–3',
    },
  ],

  main_set: [
    {
      duration_min: longRideSteadyMinutes,
      target:
        phaseKey.includes('recovery')
          ? '60–70% FTP'
          : '65–75% FTP',
      rpe: '4–5',
    },

    ...(longRideSpecificMinutes > 0
      ? [
          {
            duration_min: longRideSpecificMinutes,
            target:
              phaseKey.includes('peak')
                ? '75–85% FTP'
                : '70–80% FTP',
            rpe:
              phaseKey.includes('peak')
                ? '6–7'
                : '5–6',
          },
        ]
      : []),
  ],

  cooldown: [
    {
      duration_min: longRideCooldownMinutes,
      target: '<65% FTP',
      rpe: '2–3',
    },
  ],
},
rationale:
  isRaceWeek
    ? 'Keep the legs responsive with a short race-eve activation while avoiding unnecessary fatigue.'
    : isRaceSpecific
      ? 'Build sustained race-power durability while maintaining aerobic control across a long-course ride.'
      : 'Develop long-course aerobic durability.',
      terrain: 'Road',
      status: 'planned',
      locked: false,
      version: 1,
      is_active_version: true,
    },

    {
      athlete_id: athlete.id,
      season_week_id: seasonWeek.id,
      planned_date: addDays(6),
      sport: 'run',
title:
  isRaceWeek
    ? primaryRace.name || 'A Race'
    : isRaceSpecific || phaseKey.includes('peak')
      ? 'Race-Specific Long Run'
      : phaseKey.includes('recovery')
        ? 'Reduced Aerobic Run'
        : 'Long Aerobic Run',

session_class:
  isRaceWeek
    ? 'race'
    : isRaceSpecific || phaseKey.includes('peak')
      ? 'race_specific'
      : phaseKey.includes('recovery')
        ? 'easy'
        : 'endurance',
      priority: 1,
duration_min: isRaceWeek ? 0 : longRunMinutes,
      targets: {},
prescription: {
focus:
  isRaceWeek
    ? 'A-race execution: race plan, pacing, nutrition and discipline'
    : isRaceSpecific || phaseKey.includes('peak')
      ? 'Race-specific endurance'
      : phaseKey.includes('build')
        ? 'Aerobic endurance with race-specific work'
        : phaseKey.includes('recovery')
          ? 'Reduced aerobic endurance'
          : 'Aerobic endurance',

warmup: isRaceWeek
  ? []
  : [
      {
        duration_min: longRunWarmupMinutes,
        target: 'Easy aerobic',
        rpe: '2–3',
      },
    ],

main_set: isRaceWeek
  ? []
  : [
      {
        duration_min: longRunSteadyMinutes,
        target:
          phaseKey.includes('recovery')
            ? 'Easy recovery'
            : 'Easy aerobic',
        rpe: '4–5',
      },

      ...(longRunSpecificMinutes > 0
        ? [
            {
              duration_min: longRunSpecificMinutes,
              target:
                phaseKey.includes('peak')
                  ? 'Race-specific aerobic'
                  : 'Steady / race-specific aerobic',
              rpe:
                phaseKey.includes('peak')
                  ? '6–7'
                  : '5–6',
            },
          ]
        : []),
    ],

cooldown: isRaceWeek
  ? []
  : [
      {
        duration_min: longRunCooldownMinutes,
        target: 'Easy recovery',
        rpe: '2–3',
    },
  ],
},
rationale:
  isRaceWeek
    ? 'Execute your A-race plan with disciplined pacing, nutrition and decision-making from start to finish.'
    : 'Build durable run endurance at controlled intensity.',
      terrain: 'Mixed',
      status: 'planned',
      locked: false,
      version: 1,
      is_active_version: true,
    },
  ];
const calculateAzurWorkoutDuration = (
  steps: AzurWorkoutStep[],
): number =>
  steps.reduce((total, step) => {
    if (step.type === 'repeat') {
      const workMinutes =
        calculateAzurWorkoutDuration([step.work]);

      const recoveryMinutes =
        step.recovery
          ? calculateAzurWorkoutDuration([
              step.recovery,
            ])
          : 0;

      return (
        total +
        step.reps * workMinutes +
        Math.max(0, step.reps - 1) *
          recoveryMinutes
      );
    }

    return total + (step.durationMin ?? 0);
  }, 0);

const canonicalBikeSession = generatedSessions.find(
  (session: any) =>
    session.sport === 'bike' &&
    session.azurWorkout,
);

if (canonicalBikeSession?.azurWorkout) {
  const structuredMinutes =
    calculateAzurWorkoutDuration(
      canonicalBikeSession.azurWorkout.steps,
    );

  console.log('AZUR WORKOUT VALIDATION', {
    title: canonicalBikeSession.azurWorkout.title,
    plannedMinutes:
      canonicalBikeSession.azurWorkout.durationMin,
    structuredMinutes,
    valid:
      structuredMinutes ===
      canonicalBikeSession.azurWorkout.durationMin,
  });

  if (
    structuredMinutes !==
    canonicalBikeSession.azurWorkout.durationMin
  ) {
    console.warn(
      'Azur workout duration mismatch',
      canonicalBikeSession.azurWorkout,
    );
  }
}
const generatedTotalMinutes =
  generatedSessions.reduce(
    (total, session) =>
      total + session.duration_min,
    0,
  );

console.log('AZUR PLAN VALIDATION', {
  phase,
  targetHours,
  plannedHours,
  recommendedSessionCount,
  actualSessionCount: generatedSessions.length,
  plannedMinutes: targetMinutes,
  generatedMinutes: generatedTotalMinutes,
  differenceMinutes:
    targetMinutes - generatedTotalMinutes,
  longestRecentRideMinutes,
  longestRecentRunMinutes,
  longRideMinutes,
  longRunMinutes,
  recentSwimFrequency,
  recentBikeFrequency,
  recentRunFrequency,
});

console.table(
  generatedSessions.map((session) => ({
    day: session.planned_date,
    sport: session.sport,
    session: session.title,
    duration: session.duration_min,
  })),
);
    // Preview mode must exit before any database insertion.
if (previewOnly) {
  setPlanPreview(generatedSessions);
setPlanPreviewInsights({
  phase,
  targetHours,
  plannedHours,
  recommendedSessionCount,
  historySource:
    hasSufficientHistory
      ? 'recorded'
      : 'confirmed',
  trainingPriorityRationale:
    trainingPriority.rationale,
  resolvedPriority:
    trainingPriority.resolvedPriority,
  objectivePriority:
    trainingPriority.objectivePriority,
  priorityConflict:
    trainingPriority.conflict,
  priorityConfidence: trainingPriority.objectiveConfidence,
  reviewItem:
    trainingPriority.conflict &&
    trainingPriority.objectiveConfidence === 'clear'
      ? {
          status: 'pending',
          reason: 'priority_conflict',
          currentPriority: trainingPriority.resolvedPriority,
          suggestedPriority: trainingPriority.objectivePriority,
          rationale: trainingPriority.rationale,
        }
      : null,
});  
  console.log(
    'AZUR PLAN PREVIEW — nothing saved',
    generatedSessions,
  );

  return;
}

const sessionsToSave = generatedSessions.map(
  ({ azurWorkout, ...session }: any) => ({
    ...session,
    prescription: azurWorkout?.steps?.length
      ? { ...(session.prescription ?? {}), azurWorkout }
      : session.prescription,
  }),
);

const { error: insertError } = await supabase
  .from('planned_session')
  .insert(sessionsToSave);

if (insertError) {
  if (insertError.code === '23505') {
    console.warn(
      'Azur week generation skipped: matching active sessions already exist.',
    );
    return;
  }

  console.error(
    'Unable to generate training week:',
    insertError,
  );

  return;
}

window.alert('Azur week generated successfully');

await loadPlannedSessions(user.id);
}
  function keepOriginalNextSession() {
  setNextSessionDecision('kept');
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
);
  const currentWeekPlannedSessions = calendarWeekSessions.filter(
  (session) =>
    session.status === 'planned' ||
    session.status === 'edited',
);

const needsCurrentWeekPlan =
  currentWeekPlannedSessions.length === 0;  
useEffect(() => {

  if (!authReady || !isAuthenticated) {
    return;
  }
void loadGarminConnection();
  if (!needsCurrentWeekPlan) {
    return;
  }

  generateCurrentWeekPlan();
}, [
  authReady,
  isAuthenticated,
  needsCurrentWeekPlan,
]);
  const [showBaselineForm, setShowBaselineForm] =
  useState(false);
const [planPreview, setPlanPreview] =
  useState<any[] | null>(null);
  const [previewWeekOffset, setPreviewWeekOffset] =
  useState(0);
  useEffect(() => {
  if (!planPreview) return;

  void generateCurrentWeekPlan(true);
}, [previewWeekOffset]);
  const [showMacrocyclePreview, setShowMacrocyclePreview] =
  useState(false);
const [chatMessage, setChatMessage] = useState('');

const [chatMessages, setChatMessages] = useState<
  Array<{
    id: number;
    role: 'user' | 'assistant';
    text: string;
  }>
>([
  {
    id: 1,
    role: 'assistant',
    text:
      'Hi. I can help with your training, recovery, pacing, race preparation and your current Azur plan.',
  },
]);
  const [expandedPreviewSession, setExpandedPreviewSession] =
  useState<number | null>(null);
const [planPreviewInsights, setPlanPreviewInsights] =
  useState<{
    phase: string;
    targetHours: number;
    plannedHours: number;
    recommendedSessionCount: number;
    historySource: 'confirmed' | 'recorded';
    trainingPriorityRationale: string;
    resolvedPriority: string;
    objectivePriority: string;
    priorityConflict: boolean;
    priorityConfidence: 'clear' | 'close' | 'limited_data' | 'none';
    reviewItem: {
      status: 'pending';
      reason: 'priority_conflict';
      currentPriority: string;
      suggestedPriority: string;
      rationale: string;
    } | null;
  } | null>(null);
const [reviewSubmitting, setReviewSubmitting] = useState(false);
const [reviewSubmissionMessage, setReviewSubmissionMessage] = useState('');
const [reviewSubmittedKey, setReviewSubmittedKey] = useState<string | null>(null);

async function submitPriorityReview() {
  const item = planPreviewInsights?.reviewItem;
  if (!item || reviewSubmitting) return;
  const key = `${item.currentPriority}:${item.suggestedPriority}`;
  if (reviewSubmittedKey === key) return;
  setReviewSubmitting(true);
  setReviewSubmissionMessage('');
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('Please sign in to submit a review.');
    const { data: athlete, error: athleteError } = await supabase
      .from('athlete_profile').select('id').eq('user_id', user.id).single();
    if (athleteError || !athlete) throw new Error('Unable to identify your athlete profile.');
    const { data: existing, error: lookupError } = await supabase
      .from('training_priority_review').select('id')
      .eq('athlete_id', athlete.id).eq('status', 'pending').limit(1);
    if (lookupError) throw lookupError;
    if (existing?.length) {
      setReviewSubmittedKey(key);
      setReviewSubmissionMessage('An existing pending review is already recorded for this athlete.');
      return;
    }
    const { error: insertError } = await supabase
      .from('training_priority_review').insert({
        athlete_id: athlete.id,
        reason: item.reason,
        current_priority: item.currentPriority,
        suggested_priority: item.suggestedPriority,
        rationale: item.rationale,
        confidence: 'clear',
      });
    if (insertError) throw insertError;
    setReviewSubmittedKey(key);
    setReviewSubmissionMessage('Review request saved. Your existing training priority is unchanged.');
  } catch (error) {
    setReviewSubmissionMessage(
      error instanceof Error ? error.message : 'Review request could not be saved.',
    );
  } finally {
    setReviewSubmitting(false);
  }
}
const previewTotalMinutes =
  (planPreview ?? []).reduce(
    (total, session) =>
      total + session.duration_min,
    0,
  );

const previewSportMinutes = {
  swim: (planPreview ?? [])
    .filter((session) => session.sport === 'swim')
    .reduce((total, session) => total + session.duration_min, 0),

  bike: (planPreview ?? [])
    .filter((session) => session.sport === 'bike')
    .reduce((total, session) => total + session.duration_min, 0),

  run: (planPreview ?? [])
    .filter((session) => session.sport === 'run')
    .reduce((total, session) => total + session.duration_min, 0),
};
const [athleteBaseline, setAthleteBaseline] =
  useState({
    weeklyHours: '',
    maxWeeklyHours: '',
    sessionsPerWeek: '',
    swimsPerWeek: '',
    longestRideMinutes: '',
    longestRunMinutes: '',
    strongestSport: '',
    developmentSport: '',
  });
const macrocycleWithHours = useMemo(() => {
  const baselineHours =
    Number(athleteBaseline.weeklyHours) || 8;

  const maxWeeklyHours =
    Number(athleteBaseline.maxWeeklyHours) ||
    baselineHours;

  return macrocycle.map((week, index) => {
    const progress =
      macrocycle.length > 1
        ? index / (macrocycle.length - 1)
        : 0;

    let targetHours =
      baselineHours +
      (maxWeeklyHours - baselineHours) * progress;

    if (week.phase === 'Foundation') {
      targetHours = baselineHours * 0.9;
    }

    if (week.phase === 'Peak') {
      targetHours = maxWeeklyHours;
    }

    if (week.phase === 'Taper') {
      targetHours =
        week.weeksToRace === 2
          ? maxWeeklyHours * 0.75
          : maxWeeklyHours * 0.5;
    }

    if (week.phase === 'Race') {
      targetHours = maxWeeklyHours * 0.35;
    }

    const isRecoveryWeek =
      index > 0 &&
      index % 4 === 3 &&
      ['Base', 'Build', 'Race Specific'].includes(
        week.phase,
      );

    if (isRecoveryWeek) {
      targetHours *= 0.8;
    }

    targetHours =
      Math.round(targetHours * 2) / 2;

    return {
      ...week,
      targetHours,
      isRecoveryWeek,
    };
  });
}, [
  macrocycle,
  athleteBaseline.weeklyHours,
  athleteBaseline.maxWeeklyHours,
]);
  async function saveSeasonRoadmap() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    window.alert('Please sign in before saving your season.');
    return;
  }

  const { data: athlete, error: athleteError } =
    await supabase
      .from('athlete_profile')
      .select('id')
      .eq('user_id', user.id)
      .single();

  if (athleteError || !athlete) {
    window.alert('Unable to find your athlete profile.');
    return;
  }

  if (!primaryRace.id) {
    window.alert('Unable to identify your A race.');
    return;
  }

  const seasonWeeks = macrocycleWithHours.map((week) => ({
    athlete_id: athlete.id,
    week_start: week.weekStart,
    phase: week.isRecoveryWeek
      ? `${week.phase} Recovery`
      : week.phase,
    race_focus_id: primaryRace.id,
    target_hours: week.targetHours,
    benchmark_week: false,
    locked: false,
  }));

  const { error } = await supabase
    .from('season_week')
    .upsert(seasonWeeks, {
      onConflict: 'athlete_id,week_start',
    });

if (error) {
  console.error('Unable to save season roadmap:', error);

  window.alert(
    `Unable to save your season roadmap.\n\n${error.message}`,
  );

  return;
}

  window.alert(
    `${seasonWeeks.length} season weeks saved successfully.`,
  );
}
  async function loadTrainingBaseline() {
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
      'Unable to load athlete profile:',
      athleteError,
    );
    return;
  }

  const { data, error } = await supabase
    .from('athlete_training_baseline')
.select(
  'weekly_hours, max_weekly_hours, sessions_per_week, swims_per_week, longest_ride_minutes, longest_run_minutes, strongest_sport, development_sport',
)
    .eq('athlete_id', athlete.id)
    .maybeSingle();

  if (error) {
    console.error(
      'Unable to load training baseline:',
      error,
    );
    return;
  }

  if (!data) return;

setAthleteBaseline({
  weeklyHours: String(data.weekly_hours),
  maxWeeklyHours: String(
    data.max_weekly_hours ?? data.weekly_hours,
  ),
  sessionsPerWeek: String(data.sessions_per_week),
  swimsPerWeek: String(data.swims_per_week),
  longestRideMinutes: String(data.longest_ride_minutes),
  longestRunMinutes: String(data.longest_run_minutes),
  strongestSport: data.strongest_sport ?? '',
developmentSport: data.development_sport ?? '',
});
}
  useEffect(() => {
  if (!authReady || !isAuthenticated) {
    return;
  }

  void loadTrainingBaseline();
}, [authReady, isAuthenticated]);
  async function saveTrainingBaseline() {
  const weeklyHours = Number(athleteBaseline.weeklyHours);
    const maxWeeklyHours =
  Number(athleteBaseline.maxWeeklyHours);
  const sessions = Number(athleteBaseline.sessionsPerWeek);
  const swims = Number(athleteBaseline.swimsPerWeek);
  const longestRide = Number(athleteBaseline.longestRideMinutes);
  const longestRun = Number(athleteBaseline.longestRunMinutes);

  if (
    !athleteBaseline.weeklyHours ||
    !athleteBaseline.sessionsPerWeek ||
    athleteBaseline.swimsPerWeek === '' ||
    athleteBaseline.longestRideMinutes === '' ||
    athleteBaseline.longestRunMinutes === '' ||
    weeklyHours <= 0 ||
    weeklyHours > 40 ||
    !athleteBaseline.maxWeeklyHours ||
maxWeeklyHours < weeklyHours ||
maxWeeklyHours > 40 ||
    !Number.isInteger(sessions) ||
    sessions < 1 ||
    sessions > 21 ||
    !Number.isInteger(swims) ||
    swims < 0 ||
    swims > sessions ||
    !Number.isInteger(longestRide) ||
    longestRide < 0 ||
    !Number.isInteger(longestRun) ||
    longestRun < 0
  ) {
    window.alert(
  'Please enter valid values. Maximum weekly hours must be at least your current weekly hours.',
);
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    window.alert('Please sign in before saving.');
    return;
  }

  const { data: athlete, error: athleteError } =
    await supabase
      .from('athlete_profile')
      .select('id')
      .eq('user_id', user.id)
      .single();

  if (athleteError || !athlete) {
    window.alert('Unable to find your athlete profile.');
    return;
  }

  const { error } = await supabase
    .from('athlete_training_baseline')
    .upsert(
      {
        athlete_id: athlete.id,
        weekly_hours: weeklyHours,
        max_weekly_hours: maxWeeklyHours,
        sessions_per_week: sessions,
        swims_per_week: swims,
longest_ride_minutes: longestRide,
longest_run_minutes: longestRun,
strongest_sport: athleteBaseline.strongestSport || null,
development_sport: athleteBaseline.developmentSport || null,
confirmed_at: new Date().toISOString(),
      },
      { onConflict: 'athlete_id' },
    );

  if (error) {
    console.error('Unable to save training baseline:', error);
    window.alert('Unable to save your baseline. Please try again.');
    return;
  }

  window.alert('Training baseline saved successfully.');
}
 const formatMainSetDetail = (
  item: any,
  sport: string,
) => {
  const parts: string[] = [];

  const reps = Number(item?.reps ?? 1);

  if (item?.duration_min) {
    parts.push(
      reps > 1
        ? `${reps} × ${item.duration_min} min`
        : `${item.duration_min} min`,
    );
  } else if (item?.distance_m) {
    parts.push(
      reps > 1
        ? `${reps} × ${item.distance_m} m`
        : `${item.distance_m} m`,
    );
  }

  if (sport === 'bike') {
    if (item?.ftp_percent) {
      parts.push(`${item.ftp_percent} FTP`);
    }

    if (item?.target) {
      parts.push(item.target);
    }
  }

  if (sport === 'run') {
    if (item?.target) {
      parts.push(item.target);
    }

    if (item?.rpe) {
      parts.push(`RPE ${item.rpe}`);
    }
  }

  if (sport === 'swim') {
    if (item?.target) {
      parts.push(item.target);
    }

    if (item?.pace) {
      parts.push(item.pace);
    }
  }

  if (item?.recovery_min) {
    parts.push(`${item.recovery_min} min recovery`);
  } else if (item?.recovery_sec) {
    parts.push(`${item.recovery_sec}s recovery`);
  }

return parts.join(' · ');
};

function SessionVisual({
  session,
}: {
  session: any;
}) {
  const prescription = session?.prescription ?? {};

  const blocks: {
    label: string;
    value: number;
    intensity: number;
  }[] = [];
const structureParts: string[] = [];

(prescription.warmup ?? []).forEach((item: any) => {
  if (item?.duration_min) {
    structureParts.push(`WU ${item.duration_min}'`);
  } else if (item?.distance_m) {
    structureParts.push(`WU ${item.distance_m}m`);
  }
});

(prescription.main_set ?? []).forEach((item: any) => {
  const reps = Number(item?.reps ?? 1);

  if (item?.duration_min) {
    structureParts.push(
      reps > 1
        ? `${reps} × ${item.duration_min}'`
        : `${item.duration_min}' steady`,
    );
  } else if (item?.distance_m) {
    structureParts.push(
      reps > 1
        ? `${reps} × ${item.distance_m}m`
        : `${item.distance_m}m`,
    );
  }

  if (item?.recovery_min) {
    structureParts.push(`REC ${item.recovery_min}'`);
  } else if (item?.recovery_sec) {
    structureParts.push(`REC ${item.recovery_sec}"`);
  }
});

(prescription.cooldown ?? []).forEach((item: any) => {
  if (item?.duration_min) {
    structureParts.push(`CD ${item.duration_min}'`);
  } else if (item?.distance_m) {
    structureParts.push(`CD ${item.distance_m}m`);
  }
});
    const addBlock = (
    label: string,
    item: any,
    intensity: number,
  ) => {
    const value =
      Number(item?.duration_min ?? 0) ||
      Number(item?.distance_m ?? 0) / 100;

    if (value > 0) {
      blocks.push({
        label,
        value,
        intensity,
      });
    }
  };

  (prescription.warmup ?? []).forEach(
    (item: any) =>
      addBlock('Warm-up', item, 0.35),
  );

(prescription.main_set ?? []).forEach(
  (item: any) => {
    const reps = Number(item?.reps ?? 1);

    const isSteadyEndurance =
      reps === 1 &&
      !item?.recovery_min &&
      !item?.recovery_sec &&
      (
        session.session_class === 'easy' ||
        session.session_class === 'endurance'
      );

    if (isSteadyEndurance) {
      const totalValue =
        Number(item?.duration_min ?? 0) ||
        Number(item?.distance_m ?? 0) / 100;

      const visualBlocks = 6;

      for (let i = 0; i < visualBlocks; i += 1) {
        blocks.push({
          label: 'Steady',
          value: totalValue / visualBlocks,
          intensity:
            i === 0 || i === visualBlocks - 1
              ? 0.48
              : i === 2 || i === 3
                ? 0.62
                : 0.56,
        });
      }

      return;
    }

    for (let i = 0; i < reps; i += 1) {
      addBlock(
        'Work',
        item,
        session.session_class === 'intensity' ||
        session.session_class === 'race_specific'
          ? 0.9
          : 0.6,
      );

      if (
        item?.recovery_min ||
        item?.recovery_sec
      ) {
        blocks.push({
          label: 'Recovery',
          value:
            Number(item.recovery_min ?? 0) ||
            Number(item.recovery_sec ?? 0) / 60,
          intensity: 0.25,
        });
      }
    }
  },
);

  (prescription.cooldown ?? []).forEach(
    (item: any) =>
      addBlock('Cooldown', item, 0.3),
  );

  if (blocks.length === 0) {
    return null;
  }

  const totalValue = blocks.reduce(
    (total, block) => total + block.value,
    0,
  );

return (
  <>
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: '3px',
        height: '72px',
        marginTop: '16px',
        marginBottom: '8px',
      }}
    >
      {blocks.map((block, index) => (
        <div
          key={`${block.label}-${index}`}
          title={block.label}
          style={{
            flexGrow: block.value / totalValue,
            flexBasis: 0,
            minWidth: '4px',
            height: `${Math.max(
              20,
              block.intensity * 100,
            )}%`,
            borderRadius: '4px 4px 2px 2px',
            background:
  session.sport === 'bike'
    ? block.intensity >= 0.8
      ? '#F4B43C'
      : block.intensity >= 0.5
        ? '#E8C46A'
        : '#F4E4B5'
    : session.sport === 'run'
      ? block.intensity >= 0.8
        ? '#35A96B'
        : block.intensity >= 0.5
          ? '#63BE86'
          : '#B8E0C8'
      : block.intensity >= 0.8
        ? '#208FD0'
        : block.intensity >= 0.5
          ? '#49A6DF'
          : '#B7D8ED',
          }}
        />
      ))}
    </div>
{structureParts.length > 0 && (
  <div
    style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
      marginTop: '10px',
    }}
  >
    {structureParts.map((part, index) => (
      <span
        key={`${part}-${index}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '5px 8px',
          borderRadius: '999px',
       background:
  session.sport === 'bike'
    ? '#FFF7E2'
    : session.sport === 'run'
      ? '#EEF8F1'
      : '#EEF7FC',

color:
  session.sport === 'bike'
    ? '#9A6A00'
    : session.sport === 'run'
      ? '#2E7D4F'
      : '#1673AE',
          fontSize: '11px',
          fontWeight: 700,
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
        }}
      >
        {part}
      </span>
    ))}
  </div>
)}
  </>
);
}
  const getAzurChatReply = (question: string) => {
  const text = question.toLowerCase();

  const todayKey = new Date().toISOString().slice(0, 10);

  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowKey = tomorrowDate.toISOString().slice(0, 10);

  const sessionDate = (session: any) =>
    session.plannedDate ??
    session.planned_date ??
    '';

  const sessionDuration = (session: any) =>
    session.durationMin ??
    session.duration_min ??
    session.duration_minutes ??
    0;

  const todaySession = weekSessions.find(
    (session: any) =>
      sessionDate(session) === todayKey,
  );

  const tomorrowSession = weekSessions.find(
    (session: any) =>
      sessionDate(session) === tomorrowKey,
  );

  const saturdayRide = weekSessions.find(
    (session: any) => {
      const dateValue = sessionDate(session);

      if (!dateValue || session.sport !== 'bike') {
        return false;
      }

      const date = new Date(`${dateValue}T12:00:00`);

      return date.getDay() === 6;
    },
  );

  if (
    text.includes('today') &&
    (
      text.includes('change') ||
      text.includes('changed') ||
      text.includes('session')
    )
  ) {
    if (!todaySession) {
      return (
        'There is no structured session scheduled for today. ' +
        'That may be intentional recovery within your current training week.'
      );
    }

    return (
      `Today you have ${todaySession.title} for ` +
      `${sessionDuration(todaySession)} minutes. ` +
      `${todaySession.rationale ?? ''} ` +
      (
        recoveryReadiness
          ? recoveryReadiness.implication === 'proceed_as_planned'
            ? 'Your current recovery signals support completing it as planned.'
            : recoveryReadiness.implication === 'hold_or_trim_cost'
              ? 'Your recovery data suggests keeping the session controlled and being prepared to trim the workload.'
              : 'Your recovery data currently supports reducing training stress.'
          : 'I do not yet have enough recovery data to recommend changing it.'
      )
    ).trim();
  }

  if (
    text.includes('fuel') ||
    text.includes('nutrition')
  ) {
    if (!saturdayRide) {
      return (
        'I cannot currently see a Saturday bike session in your plan. ' +
        'Once one is scheduled I can give you session-specific fuelling guidance.'
      );
    }

    const minutes = sessionDuration(saturdayRide);

    const carbs =
      minutes >= 150
        ? '70–90g of carbohydrate per hour'
        : minutes >= 90
          ? '50–70g of carbohydrate per hour'
          : '30–50g of carbohydrate per hour';

    return (
      `Your Saturday ride is ${minutes} minutes. ` +
      `A practical starting point would be ${carbs}, ` +
      'around 500–750ml of fluid per hour, and electrolytes adjusted for conditions. ' +
      'For longer race-specific rides, this is also a good opportunity to practise your planned race nutrition.'
    );
  }

  if (
    text.includes('move') ||
    text.includes('reschedule')
  ) {
    if (!tomorrowSession) {
      return (
        'There is no structured session scheduled for tomorrow, so there is nothing that currently needs moving.'
      );
    }

    return (
      `Tomorrow is currently ${tomorrowSession.title} for ` +
      `${sessionDuration(tomorrowSession)} minutes. ` +
      'Moving one session can be reasonable, but Azur should also protect the spacing between harder sessions and your long training. ' +
      'For now I can explain the impact; next we can let this chat actually propose and apply a safe reschedule.'
    );
  }

  if (
    text.includes('training load') ||
    text.includes('fitness') ||
    text.includes('fatigue') ||
    text.includes('form')
  ) {
    return (
      `Your current training load shows fitness ${
        trainingLoad.fitness ?? '—'
      }, fatigue ${
        trainingLoad.fatigue ?? '—'
      } and form ${
        trainingLoad.form ?? '—'
      }. ` +
      'Azur uses these together rather than treating one number in isolation: fitness reflects longer-term load, fatigue reflects shorter-term load, and form shows the balance between them.'
    );
  }

  return (
    `I can see your current Azur plan${
      primaryRace?.name
        ? ` and your target race, ${primaryRace.name}`
        : ''
    }. ` +
    'Ask me about a specific session, your weekly plan, recovery, training load, pacing, fuelling or race preparation and I can use that context in my answer.'
  );
};
function HomeView() {
const homeWeek = weekSessions.filter(session => {
  const now = new Date(todayKey + 'T12:00:00');
  const day = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  return session.plannedDate >= key(monday) && session.plannedDate <= key(sunday);
});
const homeMinutes = (sport: 'swim'|'bike'|'run') => homeWeek.filter(s=>s.sport===sport).reduce((sum,s)=>sum+(Number(s.durationMin)||0),0);
const homeCount = (sport: 'swim'|'bike'|'run') => homeWeek.filter(s=>s.sport===sport).length;
const homeCompleted = (sport: 'swim'|'bike'|'run') => homeWeek.filter(s=>s.sport===sport && s.status==='completed').length;
const homeDateLabel = new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
const homeCompletedTotal=homeWeek.filter(s=>s.status==='completed').length;
const homePlannedTotal=homeWeek.length;
const todaySessions=weekSessions.filter(s=>s.plannedDate===todayKey);
const homeTodayLabel=todaySessions.length?String(todaySessions.length)+' scheduled session'+(todaySessions.length===1?'':'s'):'No workout scheduled';
const homeProgressPercent=homePlannedTotal?Math.round(homeCompletedTotal/homePlannedTotal*100):0;

const homeRaceDays = primaryRace.raceDate ? Math.max(0,Math.ceil((new Date(primaryRace.raceDate+'T12:00:00').getTime()-Date.now())/86400000)) : null;
const homeMinutesLabel = (mins:number) => mins >= 60 ? `${Math.floor(mins/60)}h ${String(mins%60).padStart(2,'0')}m` : `${mins}m`;
const todaySession = weekSessions.find(
  (session: any) =>
    session.plannedDate === todayKey,
);

  return (
      <>
<section
  className="mobile-home-hero"
  style={{
    marginBottom: '14px',
  }}
>
  <div
    className="race-hero-card"
    style={{
      minHeight: '210px',
      padding: '22px 20px',
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      borderRadius: '20px',
      border: '1px solid rgba(68, 151, 205, 0.32)',
      boxShadow: '0 16px 32px rgba(1, 9, 20, 0.24)',
     backgroundImage:
  "linear-gradient(180deg, rgba(7,21,36,0.72) 0%, rgba(7,21,36,0.32) 32%, rgba(7,21,36,0.92) 82%, #071524 100%), url('/race-images/roth.jpg')",
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }}
  >
    <button
      type="button"
      onClick={() => setActiveNav('Profile')}
      style={{
        position: 'absolute',
        top: '16px',
right: '16px',
        width: '58px',
height: '58px',
        padding: 0,
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.95)',
        background: '#0A3556',
        boxShadow: '0 0 0 2px rgba(32,143,208,0.85)',
        overflow: 'hidden',
        cursor: 'pointer',
      }}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={`${athleteName} profile`}
          style={{
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  objectPosition: 'center',
  display: 'block',
  background: '#071524',
}}
        />
      ) : (
        <User
          size={20}
          color="#FFFFFF"
        />
      )}
    </button>

    <div
      style={{
        position: 'relative',
        zIndex: 1,
      }}
    >
      <div
        style={{
          marginBottom: '5px',
          color: 'rgba(255,255,255,0.72)',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
        }}
      >
        YOUR A RACE
      </div>

      <h1
        style={{
          margin: 0,
          color: '#FFFFFF',
          fontSize: '30px',
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: '-0.025em',
        }}
      >
        {primaryRace.name || 'Primary Race'}
      </h1>

      <div
        style={{
          marginTop: '8px',
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '7px',
          color: 'rgba(255,255,255,0.86)',
          fontSize: '14px',
          fontWeight: 500,
        }}
      >
        <span>
        {currentMacrocycleWeek?.phase || 'Training phase not set'}
        </span>

        <span style={{ opacity: 0.4 }}>
          •
        </span>

        <span>
          {homeRaceDays == null ? 'Race date not set' : homeRaceDays === 0 ? 'Race day' : `${homeRaceDays} days to race day`}
        </span>
        <span style={{ opacity: 0.7 }}>
  • {homeRaceDays == null ? 'Set your race date in Profile' : `${Math.ceil(homeRaceDays/7)} weeks to race`}
</span>
      </div>
    </div>
  </div>
</section>

<section className="azur-athlete-today-summary"><div><span>TODAY'S TRAINING</span><strong>{homeTodayLabel}</strong><small>{todaySessions.length ? String(todaySessions.filter(s=>s.status==='completed').length)+' recorded complete today' : 'No sessions on the calendar today.'}</small></div><button type="button" onClick={()=>setActiveNav('Calendar')}>View calendar →</button></section>
<section className="azur-athlete-week-progress"><div><strong>This week</strong><span>{homeCompletedTotal} of {homePlannedTotal} recorded complete</span></div><div role="progressbar" aria-label="Recorded session completion" aria-valuenow={homeCompletedTotal} aria-valuemin={0} aria-valuemax={homePlannedTotal||1}><span style={{width:String(homeProgressPercent)+'%'}}/></div><small>Completion is based on recorded status, not training quality.</small></section>
{todaySession && (
  <section
    style={{
      marginBottom: '14px',
     padding: '16px',
      background: 'linear-gradient(145deg, #10283F 0%, #071827 100%)',
      border: '1px solid rgba(68, 151, 205, 0.30)',
      boxShadow: '0 16px 32px rgba(1, 9, 20, 0.25)',
      color: '#F6FBFF',
      borderRadius: '20px',
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '14px',
      }}
    >
      <span
        style={{
          color: '#91BCD8',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        Today&apos;s Session
      </span>

      <span
        style={{
          padding: '5px 9px',
          borderRadius: '20px',
          background: '#EEF8F1',
          color: '#2F8A57',
          fontSize: '11px',
          fontWeight: 700,
        }}
      >
        {todaySession.status==='completed'?'Completed':todaySession.status==='planned'?'Planned':'Updated'}
      </span>
    </div>

    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <div
        style={{
          width: '42px',
          height: '42px',
          flexShrink: 0,
          borderRadius: '50%',
          background:
            todaySession.sport === 'bike'
              ? '#FFF4D8'
              : todaySession.sport === 'run'
                ? '#EAF7EF'
                : '#EAF5FC',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '18px',
        }}
      >
        {todaySession.sport === 'bike'
          ? '🚴'
          : todaySession.sport === 'run'
            ? '🏃'
            : '🏊'}
      </div>

      <div>
        <div
          style={{
            color: '#FFFFFF',
            fontSize: '18px',
            fontWeight: 700,
            lineHeight: 1.25,
          }}
        >
          {todaySession.title}
        </div>

        <div
          style={{
            marginTop: '4px',
            color: '#1673AE',
            fontSize: '13px',
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
      {todaySession.sport} ·{' '}
{todaySession.duration_min ??
  todaySession.durationMin ??
  todaySession.duration_minutes ??
  0}{' '}
min
        </div>
      </div>
    </div>

<div
  style={{
    marginTop: '14px',
    height: '42px',
    display: 'flex',
    alignItems: 'flex-end',
    gap: '4px',
  }}
>
  {[42, 58, 72, 54, 80, 64, 48, 70, 56, 38].map(
    (height, index) => (
      <div
        key={index}
        style={{
          flex: 1,
          height: `${height}%`,
          minHeight: '10px',
          borderRadius: '4px 4px 2px 2px',
          background:
            todaySession.sport === 'bike'
              ? index > 2 && index < 7
                ? '#F4B43C'
                : '#F4E4B5'
              : todaySession.sport === 'run'
                ? index > 2 && index < 7
                  ? '#35A96B'
                  : '#B8E0C8'
                : index > 2 && index < 7
                  ? '#208FD0'
                  : '#B7D8ED',
        }}
      />
    ),
  )}
</div>

    <button
      type="button"
      onClick={() => {setSelectedId(todaySession.id);setSessionDetailOpen(true);}}
      style={{
       width: 'auto',
        minWidth: '140px',
     marginTop: '12px',
padding: '11px 16px',
        border: 'none',
        borderRadius: '10px',
        background: '#168DCE',
        color: '#FFFFFF',
        fontSize: '14px',
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      Open session details →
    </button>
  </section>
)}
<section className="azur-premium-home" aria-label="AZUR athlete home">
  
  <div className="azur-home-section-heading"><span>YOUR TRAINING WEEK</span><button type="button" onClick={()=>setActiveNav('Calendar')}>Calendar →</button></div>
  <div className="azur-home-sports">
    {(['swim','bike','run'] as const).map(sport=><div className={`azur-home-sport ${sport}`} key={sport}>
      <span className="azur-sport-symbol">{sport==='swim'?'≈':sport==='bike'?'◉':'↗'}</span>
      <span className="azur-home-sport-name">{sport[0].toUpperCase()+sport.slice(1)}</span>
      <strong>{homeCompleted(sport)} / {homeCount(sport)}</strong>
      <small>{homeMinutesLabel(homeMinutes(sport))} planned</small>
      <div className="azur-home-progress"><span style={{width:homeCount(sport)?`${Math.min(100,100*homeCompleted(sport)/homeCount(sport))}%`:'0%'}} /></div>
    </div>)}
  </div>
  <div className="azur-home-load">
    <div className="azur-home-section-heading"><span>FITNESS · FATIGUE · FORM</span><span>Recorded training data</span></div>
    <div className="azur-home-load-grid">
      {([{label:'Fitness',value:trainingLoad.fitness},{label:'Fatigue',value:trainingLoad.fatigue},{label:'Form',value:trainingLoad.form}] as const).map(metric=><div key={metric.label}><small>{metric.label}</small><strong>{typeof metric.value==='number'&&Number.isFinite(metric.value)?Math.round(metric.value):'—'}</strong></div>)}
    </div>
    {trainingLoadHistory.length >= 42 && trainingLoad.eligibleActivities >= 8 ? (() => {
      const points = trainingLoadHistory.slice(-loadRangeDays);
      const values = points.flatMap(p => [p.fitness, p.fatigue, p.form]);
      const min = Math.min(0, ...values);
      const max = Math.max(1, ...values);
      const y = (n:number) => 108 - (n-min)/Math.max(1,max-min)*94;
      const selected = points.find(p => p.date === selectedLoadDate) ?? points[points.length-1];
      return <div className="azur-load-chart">
        <div className="azur-load-range" role="group" aria-label="Training load chart date range">
          {([42,90,180] as const).map(days => <button type="button" key={days} aria-pressed={loadRangeDays===days} onClick={()=>{setLoadRangeDays(days);setSelectedLoadDate(null);}}>{days===42?'6W':days===90?'3M':'6M'}</button>)}
        </div>
        <svg viewBox="0 0 340 124" preserveAspectRatio="none" role="img" aria-label="Fitness, fatigue and form history, select a day using buttons below">
          {[0,0.5,1].map((fraction,i)=><line key={i} x1="5" x2="335" y1={12+fraction*96} y2={12+fraction*96} stroke="#28475e" strokeDasharray="3 5" />)}
          {([{key:'fitness',color:'#24b9f2'},{key:'fatigue',color:'#f5c544'},{key:'form',color:'#62d9a3'}] as const).map(s=><polyline key={s.key} fill="none" stroke={s.color} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" points={points.map((p,i)=>`${5+i*330/Math.max(1,points.length-1)},${y(p[s.key])}`).join(' ')} />)}
          {selected && <line x1={5+Math.max(0,points.findIndex(p=>p.date===selected.date))*330/Math.max(1,points.length-1)} x2={5+Math.max(0,points.findIndex(p=>p.date===selected.date))*330/Math.max(1,points.length-1)} y1="8" y2="110" stroke="#e9f7ff" strokeDasharray="3 3" opacity=".6"/>}
        </svg>
        <input className="azur-load-scrubber" type="range" min={0} max={Math.max(0,points.length-1)} value={Math.max(0,points.findIndex(p=>p.date===selected?.date))} onChange={event=>setSelectedLoadDate(points[Number(event.target.value)]?.date ?? null)} aria-label="Select training load date" />
        {selected && <div className="azur-load-details"><strong>{new Date(selected.date+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</strong><span>Fitness {Math.round(selected.fitness)}</span><span>Fatigue {Math.round(selected.fatigue)}</span><span>Form {Math.round(selected.form)}</span></div>}
        <div className="azur-load-chart-legend"><span>● Fitness</span><span>● Fatigue</span><span>● Form</span></div>
        <small>{points.length} days of recorded estimates · fitness reflects longer-term load, fatigue shorter-term load; form is their difference before today's stress update.</small>
      </div>;
    })() : <p className="azur-load-history-empty">Training-load trends become available after at least 42 days of history and 8 eligible activities with calculated stress.</p>}
    <p>{trainingLoad.eligibleActivities>0 ? `Based on ${trainingLoad.eligibleActivities} eligible recorded activities. These indicators are not a medical readiness assessment.` : 'Connect and record eligible workouts to build your training-load history.'}</p>
  </div>
</section>

<div className="azur-home-tools"
  style={{
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: '12px',
    margin: '14px 0 18px',
    padding: '16px',
    background: 'linear-gradient(145deg, #10283F 0%, #071827 100%)',
    border: '1px solid rgba(68, 151, 205, 0.30)',
    boxShadow: '0 12px 24px rgba(1, 9, 20, 0.18)',
    borderRadius: '20px',
  }}
>
  <div>
    <div
      style={{
        color: '#F6FBFF',
        fontSize: '15px',
        fontWeight: 700,
      }}
    >
      Training Tools
    </div>

    <div
      style={{
        marginTop: '2px',
        color: '#91BCD8',
        fontSize: '12px',
      }}
    >
      Review your adaptive plan or update your baseline.
    </div>
  </div>

  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: '8px',
      width: '100%',
    }}
  >
    <button
      type="button"
      onClick={() => {
  if (planPreview) {
    setPlanPreview(null);
    setPlanPreviewInsights(null);
    setExpandedPreviewSession(null);
  } else {
    void generateCurrentWeekPlan(true);
  }
}}
      style={{
        padding: '11px 8px',
        borderRadius: '12px',
        border: '1px solid rgba(80, 155, 202, 0.30)',
        background: '#16344D',
        color: '#F6FBFF',
        fontSize: '12px',
        fontWeight: 700,
        minWidth: 0,
        cursor: 'pointer',
      }}
    >
      {planPreview ? 'Close' : 'Preview'}
    </button>
    <button
  type="button"
  onClick={() =>
    setShowMacrocyclePreview((current) => !current)
  }
  style={{
    padding: '11px 8px',
    borderRadius: '12px',
    border: '1px solid rgba(80, 155, 202, 0.30)',
    background: showMacrocyclePreview
      ? '#22516F'
      : '#16344D',
    color: '#F6FBFF',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
  }}
>
  {showMacrocyclePreview ? 'Close Season' : 'Season'}
</button>
<button
  type="button"
  onClick={() => {
    if (!garminConnected) {
      void connectGarmin();
    }
  }}
  style={{
    padding: '11px 8px',
    borderRadius: '12px',
    border: '1px solid rgba(80, 155, 202, 0.30)',
    background: garminConnected ? '#EEF7F1' : '#FFFFFF',
    color: garminConnected ? '#2E6B45' : '#17324D',
    fontSize: '12px',
    fontWeight: 700,
    cursor: garminConnected ? 'default' : 'pointer',
  }}
>
  {garminConnected ? 'Garmin linked ✓' : 'Connect Garmin'}
</button>
{garminConnected && <p className="azur-garmin-import-disclosure">Garmin account linked. Zwift and other third-party rides may not be forwarded by Garmin; import their original FIT file separately.</p>}
<button
  type="button"
  onClick={() => { void connectIntervals(); }}
  style={{
    padding: '11px 8px',
    borderRadius: '12px',
    border: '1px solid rgba(80, 155, 202, 0.45)',
    background: '#16344D',
    color: '#F6FBFF',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
  }}
>
  Connect Intervals.icu
</button>
    <button
      type="button"
      onClick={() =>
        setShowBaselineForm((current) => !current)
      }
      style={{
        padding: '11px 8px',
        borderRadius: '12px',
        border: 'none',
        background: '#168DCE',
        color: '#FFFFFF',
        fontSize: '12px',
        fontWeight: 700,
        minWidth: 0,
        cursor: 'pointer',
      }}
    >
      {showBaselineForm ? 'Close' : 'Baseline'}
    </button>
  </div>
</div>
{showMacrocyclePreview && (
  <div
    style={{
      marginBottom: '18px',
      padding: '16px',
      background: '#FFFFFF',
      border: '1px solid #DCE5EE',
      borderRadius: '14px',
    }}
  >
   <div className="azur-home-tools-actions"
  style={{
    marginBottom: '14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
  }}
>
  <div>
    <div
      style={{
        color: '#17324D',
        fontSize: '14px',
        fontWeight: 800,
      }}
    >
      Season Roadmap
    </div>

    <div
      style={{
        marginTop: '4px',
        color: '#718394',
        fontSize: '12px',
      }}
    >
      {primaryRace.name} · {macrocycle.length} weeks
    </div>
  </div>

  <button
    type="button"
    onClick={() => void saveSeasonRoadmap()}
    style={{
      padding: '8px 12px',
      borderRadius: '8px',
      border: 'none',
      background: '#0A3556',
      color: '#FFFFFF',
      fontSize: '12px',
      fontWeight: 700,
      cursor: 'pointer',
      flexShrink: 0,
    }}
  >
    Save Season
  </button>
</div>

    <div
      style={{
        display: 'grid',
        gap: '8px',
      }}
    >
      {macrocycleWithHours.map((week) => (
        <div
          key={week.weekStart}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 12px',
            borderRadius: '10px',
            background: '#F7FAFC',
            border: '1px solid #E3EAF0',
          }}
        >
          <div>
            <div
              style={{
                color: '#17324D',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >
              {week.weekStart}
            </div>

            <div
              style={{
                marginTop: '2px',
                color: '#718394',
                fontSize: '11px',
              }}
            >
              {week.weeksToRace} weeks to race · {week.targetHours}h target
            </div>
          </div>

          <div
            style={{
              padding: '5px 8px',
              borderRadius: '20px',
              background: '#EAF4FD',
              color: '#1877C9',
              fontSize: '11px',
              fontWeight: 800,
            }}
          >
           {week.isRecoveryWeek
  ? `${week.phase} · Recovery`
  : week.phase}
          </div>
        </div>
      ))}
    </div>
  </div>
)}
{showBaselineForm && (
  <div
    className="azur-baseline-form"
    style={{
      padding: '20px',
      marginBottom: '20px',
      background: '#FFFFFF',
      border: '1px solid #DCE5EE',
      borderRadius: '12px',
    }}
  >
  <style>{`
  .azur-baseline-form {
  height: auto !important;
  min-height: 0 !important;
}

.azur-baseline-form h3 {
  display: block !important;
  color: #17324D !important;
  font-size: 22px !important;
  font-weight: 700 !important;
  line-height: 1.3 !important;
  margin: 0 0 12px !important;
  height: auto !important;
}

.azur-baseline-form p {
  display: block !important;
  color: #52677B !important;
  font-size: 15px !important;
  line-height: 1.5 !important;
  margin: 0 !important;
  height: auto !important;
}
  .azur-baseline-form .azur-baseline-fields {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px;
    margin-top: 24px;
    align-items: start;
  }

  .azur-baseline-form .azur-baseline-fields > label {
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 10px !important;
    width: 100%;
    min-width: 0;
    height: auto !important;
    color: #17324D !important;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.5;
  }

  .azur-baseline-form .azur-baseline-fields input,
.azur-baseline-form .azur-baseline-fields select {
    display: block !important;
    width: 100% !important;
    min-width: 0;
    height: 48px !important;
    box-sizing: border-box;
    padding: 12px 14px;
    border: 1px solid #CBD8E5;
    border-radius: 8px;
    background: #FFFFFF !important;
    color: #17324D !important;
    font-size: 16px;
  }

  @media (max-width: 650px) {
    .azur-baseline-form .azur-baseline-fields {
      grid-template-columns: minmax(0, 1fr);
      gap: 20px;
    }
  }
`}</style>
    <h3>Your Training Baseline</h3>

    <p>
      Tell Azur about your current training so we can
      build a realistic starting plan.
    </p>
<div className="azur-baseline-fields">
  <label>
      Current weekly training hours
      <input
        type="number"
        min="0"
        step="0.5"
        value={athleteBaseline.weeklyHours}
        onChange={(e) =>
          setAthleteBaseline((current) => ({
            ...current,
            weeklyHours: e.target.value,
          }))
        }
        placeholder="e.g. 8"
      />
    </label>
<label>
  Maximum weekly training hours
  <input
    type="number"
    min="0"
    step="0.5"
    value={athleteBaseline.maxWeeklyHours}
    onChange={(e) =>
      setAthleteBaseline((current) => ({
        ...current,
        maxWeeklyHours: e.target.value,
      }))
    }
    placeholder="e.g. 14"
  />
</label>
    <label>
      Current sessions per week
      <input
        type="number"
        min="0"
        max="21"
        value={athleteBaseline.sessionsPerWeek}
        onChange={(e) =>
          setAthleteBaseline((current) => ({
            ...current,
            sessionsPerWeek: e.target.value,
          }))
        }
        placeholder="e.g. 6"
      />
    </label>
    <label>
  Current swims per week
  <input
    type="number"
    min="0"
    max="7"
    value={athleteBaseline.swimsPerWeek}
    onChange={(e) =>
      setAthleteBaseline((current) => ({
        ...current,
        swimsPerWeek: e.target.value,
      }))
    }
    placeholder="e.g. 2"
  />
</label>

<label>
  Longest recent ride (minutes)
  <input
    type="number"
    min="0"
    value={athleteBaseline.longestRideMinutes}
    onChange={(e) =>
      setAthleteBaseline((current) => ({
        ...current,
        longestRideMinutes: e.target.value,
      }))
    }
    placeholder="e.g. 150"
  />
</label>

<label>
  Longest recent run (minutes)
  <input
    type="number"
    min="0"
    value={athleteBaseline.longestRunMinutes}
    onChange={(e) =>
      setAthleteBaseline((current) => ({
        ...current,
        longestRunMinutes: e.target.value,
      }))
    }
    placeholder="e.g. 90"
  />
</label>
<label>
  Strongest discipline
  <select
    value={athleteBaseline.strongestSport}
    onChange={(e) =>
      setAthleteBaseline((current) => ({
        ...current,
        strongestSport: e.target.value,
      }))
    }
  >
    <option value="">Select</option>
    <option value="swim">Swim</option>
    <option value="bike">Bike</option>
    <option value="run">Run</option>
    <option value="balanced">Balanced</option>
  </select>
</label>

<label>
  Development priority
  <select
    value={athleteBaseline.developmentSport}
    onChange={(e) =>
      setAthleteBaseline((current) => ({
        ...current,
        developmentSport: e.target.value,
      }))
    }
  >
    <option value="">Select</option>
    <option value="swim">Swim</option>
    <option value="bike">Bike</option>
    <option value="run">Run</option>
    <option value="balanced">Balanced</option>
  </select>
</label>
  </div>
    <button
  type="button"
onClick={() => void saveTrainingBaseline()}
  style={{
    marginTop: '24px',
    width: '100%',
    padding: '14px 20px',
    borderRadius: '10px',
    border: 'none',
    background: '#153E63',
    color: '#FFFFFF',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
  }}
>
  Save Training Baseline
</button>
  </div>
)}
        {planPreview && (
  <section
    style={{
      background: '#FFFFFF',
      border: '1px solid #DCE5EE',
      borderRadius: '12px',
      padding: '24px',
      marginBottom: '24px',
    }}
  >
<div
  style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px',
  }}
>
  <h3
    style={{
      color: '#17324D',
      margin: 0,
    }}
  >
    Your Proposed Training Week
  </h3>

  <div
    style={{
      display: 'flex',
      gap: '8px',
    }}
  >
    <button
      type="button"
      onClick={() =>
        setPreviewWeekOffset((current) =>
          Math.max(0, current - 1),
        )
      }
      disabled={previewWeekOffset === 0}
      style={{
        padding: '7px 10px',
        borderRadius: '8px',
        border: '1px solid #CBD8E5',
        background: '#FFFFFF',
        color:
          previewWeekOffset === 0
            ? '#A8B5C1'
            : '#17324D',
        fontSize: '12px',
        fontWeight: 700,
        cursor:
          previewWeekOffset === 0
            ? 'default'
            : 'pointer',
      }}
    >
      ← Previous
    </button>

    <button
      type="button"
      onClick={() =>
        setPreviewWeekOffset((current) => current + 1)
      }
      style={{
        padding: '7px 10px',
        borderRadius: '8px',
        border: '1px solid #CBD8E5',
        background: '#FFFFFF',
        color: '#17324D',
        fontSize: '12px',
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      Next →
    </button>
  </div>
</div>

<div
  style={{
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '10px',
    marginBottom: '8px',
  }}
>
  <span
    style={{
      padding: '5px 9px',
      borderRadius: '20px',
      background: '#EAF4FD',
      color: '#1877C9',
      fontSize: '11px',
      fontWeight: 800,
    }}
  >
    {planPreviewInsights?.phase || 'Base'}
  </span>

  <span
    style={{
      color: '#718394',
      fontSize: '12px',
    }}
  >
    Week +{previewWeekOffset}
  </span>
</div>

<p style={{ color: '#52677B' }}>
  Based on your current training and the upcoming
  phase of your training plan.
</p>
<div
  style={{
    background: '#F0F6FB',
    borderRadius: '12px',
    padding: '20px',
    margin: '20px 0',
    color: '#17324D',
  }}
>
  <div
    style={{
      fontSize: '14px',
      fontWeight: 600,
      marginBottom: '8px',
    }}
  >
    TOTAL WEEKLY TRAINING
  </div>

  <div
    style={{
      fontSize: '32px',
      fontWeight: 800,
      marginBottom: '20px',
    }}
  >
    {(previewTotalMinutes / 60).toFixed(1)} hours
  </div>

  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gap: '12px',
      fontSize: '13px',
    }}
  >
    {(['swim', 'bike', 'run'] as const).map((sport) => (
      <div key={sport}>
        <div style={{ fontWeight: 700 }}>
          {sport.toUpperCase()}
        </div>

        <div style={{ marginTop: '6px' }}>
          {Math.floor(previewSportMinutes[sport] / 60)}h{' '}
          {previewSportMinutes[sport] % 60}m
        </div>
      </div>
    ))}
  </div>
</div>
    {planPreviewInsights && (
  <div
    style={{
      padding: '20px',
      marginBottom: '24px',
      borderLeft: '4px solid #1673AE',
      background: '#F5F9FC',
      borderRadius: '10px',
    }}
  >
    <h4 style={{
      color: '#17324D',
      marginTop: 0,
    }}>
      Why Azur Selected This Plan
    </h4>

    <p style={{ color: '#52677B', lineHeight: 1.6 }}>
Your confirmed training baseline is{' '}
<strong>
  {Number(athleteBaseline.weeklyHours).toFixed(1)}
  {' '}hours per week
</strong>.
{' '}This proposed week is{' '}
<strong>
  {(previewTotalMinutes / 60).toFixed(1)} hours
</strong>
{' '}against a roadmap target of{' '}
<strong>
  {planPreviewInsights.targetHours} hours
</strong>.
    </p>

    <p style={{ color: '#52677B', lineHeight: 1.6 }}>
      Azur has proposed{' '}
      <strong>
        {planPreviewInsights.recommendedSessionCount}
        {' '}sessions
      </strong>
      {' '}during your{' '}
      <strong>{planPreviewInsights.phase}</strong>
      {' '}phase, using your{' '}
      {planPreviewInsights.historySource === 'confirmed'
        ? 'athlete-confirmed training baseline'
        : 'recent recorded training history'}.
    </p>
<p
  style={{
    color: '#52677B',
    lineHeight: 1.6,
  }}
>
<strong>Training priority: </strong>
{planPreviewInsights.trainingPriorityRationale}
</p>
 {planPreviewInsights.reviewItem && (
   <div style={{
     border: '1px solid #E5C48F',
     background: '#FFFAF0',
     borderRadius: '10px',
     padding: '14px',
     marginBottom: '12px',
     color: '#795114',
   }}>
     <strong>Coach review candidate — Pending</strong>
     <p style={{ marginBottom: '8px', lineHeight: 1.6 }}>
       Current athlete/coach priority: {planPreviewInsights.reviewItem.currentPriority}.
       {' '}Objective suggestion: {planPreviewInsights.reviewItem.suggestedPriority}.
     </p>
     <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.5 }}>
       Review requests are saved for future coach assessment.
       No training priority is changed by submission.
     </p>
     <div style={{ marginTop: '12px' }}>
       <button
         type="button"
         disabled={reviewSubmitting || reviewSubmittedKey === `${planPreviewInsights.reviewItem.currentPriority}:${planPreviewInsights.reviewItem.suggestedPriority}`}
         onClick={() => { void submitPriorityReview(); }}
       >
         {reviewSubmitting ? 'Submitting…' : reviewSubmittedKey === `${planPreviewInsights.reviewItem.currentPriority}:${planPreviewInsights.reviewItem.suggestedPriority}` ? 'Review recorded' : 'Submit for coach review'}
       </button>
       {reviewSubmissionMessage && <p role="status" style={{ marginTop: '8px', fontSize: '12px' }}>{reviewSubmissionMessage}</p>}
     </div>
   </div>
 )}
 {planPreviewInsights.priorityConflict && planPreviewInsights.priorityConfidence === 'clear' && (
   <p style={{ color: '#9A5D09', lineHeight: 1.6, fontWeight: 600 }}>
     Coach review recommended: a clear objective development priority
     conflicts with the selected athlete/coach priority. The selected
     priority is retained; no automatic override has been made.
   </p>
 )}
 {planPreviewInsights.priorityConfidence === 'close' && (
   <p style={{ color: '#52677B', lineHeight: 1.6 }}>
     Development gaps are closely matched. AZUR is not declaring one
     discipline the greater objective limiter.
   </p>
 )}
 {planPreviewInsights.priorityConfidence === 'limited_data' && (
   <p style={{ color: '#52677B', lineHeight: 1.6 }}>
     The objective assessment needs more valid race-gap data
     before competing development needs can be ranked.
   </p>
 )}
    <p style={{
      color: '#52677B',
      lineHeight: 1.6,
      marginBottom: 0,
    }}>
      This is a starting proposal. Future progression
      will be informed by completed training, recovery
      and your upcoming race requirements.
    </p>
  </div>
)}
    <div style={{ display: 'grid', gap: '12px' }}>
     {planPreview.map((session, index) => {
  const detailAccent =
    session.sport === 'bike'
      ? '#B77B00'
      : session.sport === 'run'
        ? '#2F8A57'
        : '#1673AE';

  return (
        <div
          key={index}
          style={{
            padding: '16px',
            border: '1px solid #DCE5EE',
            borderRadius: '10px',
          }}
        >
<div
  style={{
    fontSize: '13px',
    color: '#52677B',
  }}
>
  {new Date(
    `${session.planned_date}T12:00:00`,
  ).toLocaleDateString('en-GB', {
    weekday: 'long',
  })}
</div>
          <strong style={{ color: '#17324D' }}>
            {session.title}
          </strong>

     <div
  style={{
    display: 'block',
    marginTop: '10px',
    marginBottom: '12px',
    color: '#1673AE',
    fontSize: '15px',
    fontWeight: 700,
    lineHeight: 1.5,
    height: 'auto',
    visibility: 'visible',
  }}
>
{session.session_class === 'race'
  ? 'A RACE'
  : `${session.sport.toUpperCase()} · ${session.duration_min} MIN`}
</div>
<SessionVisual session={session} />   
          <button
  type="button"
  onClick={() =>
    setExpandedPreviewSession((current) =>
      current === index ? null : index,
    )
  }
  style={{
    marginTop: '12px',
    padding: 0,
    border: 'none',
    background: 'transparent',
    color: '#1673AE',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
  }}
>
  {expandedPreviewSession === index
    ? 'Hide session details'
    : 'View full session'}
</button>
          {expandedPreviewSession === index && (
  <div
    style={{
      marginTop: '14px',
      padding: '16px',
      borderRadius: '10px',
      background: '#F8FBFD',
      border: '1px solid #E2EBF2',
      color: '#17324D',
    }}
  >
    <div
      style={{
        fontSize: '12px',
        fontWeight: 800,
        letterSpacing: '0.04em',
        color: '#6B7F91',
        marginBottom: '10px',
      }}
    >
      SESSION DETAILS
    </div>

    <div
      style={{
        display: 'grid',
        gap: '10px',
        fontSize: '13px',
        lineHeight: 1.5,
      }}
    >
      {(session.prescription?.warmup ?? []).length > 0 && (
  <div>
    <strong>Warm-up</strong>

    {(session.prescription?.warmup ?? []).map(
      (item: any, itemIndex: number) => (
        <div key={`warmup-${itemIndex}`}>
          {item.duration_min
            ? `${item.duration_min} min`
            : item.distance_m
              ? `${item.distance_m} m`
              : 'Warm-up'}

          {item.target && (
            <>
              {' · '}
              {item.target}
            </>
          )}

          {item.rpe && (
            <>
              {' · RPE '}
              {item.rpe}
            </>
          )}
        </div>
      ),
    )}
  </div>
)}
      {session.prescription?.focus && (
        <div>
          <strong>Focus:</strong>{' '}
          {session.prescription.focus}
        </div>
      )}

{(session.prescription?.main_set ?? []).map(
  (item: any, itemIndex: number) => (
    <div key={itemIndex}>
      <strong>Main set:</strong>{' '}
      {formatMainSetDetail(item, session.sport)}
    </div>
  ),
)}
      {(session.prescription?.cooldown ?? []).length > 0 && (
  <div>
    <strong>Cooldown</strong>

    {(session.prescription?.cooldown ?? []).map(
      (item: any, itemIndex: number) => (
        <div key={`cooldown-${itemIndex}`}>
          {item.duration_min
            ? `${item.duration_min} min`
            : item.distance_m
              ? `${item.distance_m} m`
              : 'Cooldown'}

          {item.target && (
            <>
              {' · '}
              {item.target}
            </>
          )}

          {item.rpe && (
            <>
              {' · RPE '}
              {item.rpe}
            </>
          )}
        </div>
      ),
    )}
  </div>
)}
    </div>
  </div>
)}
          <p
            style={{
              color: '#52677B',
              marginBottom: 0,
            }}
          >
            {session.rationale}
          </p>
        </div>
     );
})}
    </div>
<button
  type="button"
  onClick={() => void generateCurrentWeekPlan(false)}
  disabled={previewWeekOffset > 0}
  style={{
    marginTop: '20px',
    width: '100%',
    padding: '14px 18px',
    borderRadius: '10px',
    border: 'none',
   background:
  previewWeekOffset > 0 ? '#D7E0E8' : '#0A3556',
color:
  previewWeekOffset > 0 ? '#7E8D9A' : '#FFFFFF',
    fontSize: '15px',
    fontWeight: 800,
   cursor:
  previewWeekOffset > 0 ? 'not-allowed' : 'pointer',
  }}
>
  {previewWeekOffset > 0
  ? 'Future Week Preview'
  : 'Use This Plan'}
</button>    
    <p style={{ marginTop: '20px', color: '#52677B' }}>
      Preview only — your existing training plan
      remains unchanged.
    </p>
  </section>
)}
<section
  style={{
    marginBottom: '14px',
    padding: '14px 16px',
    background: 'linear-gradient(145deg, #102B43, #071C30)',
    border: '1px solid rgba(72,153,201,0.32)',
    borderRadius: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  }}
>
  <div
    style={{
      width: '42px',
      height: '42px',
      flexShrink: 0,
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background:
        recoveryReadiness?.color === 'green'
          ? '#EAF7EF'
          : recoveryReadiness?.color === 'amber'
            ? '#FFF6DF'
            : recoveryReadiness?.color === 'red'
              ? '#FDECEC'
              : '#1A3951',
    }}
  >
    <div
      style={{
        width: '12px',
        height: '12px',
        borderRadius: '50%',
        background:
          recoveryReadiness?.color === 'green'
            ? '#35A96B'
            : recoveryReadiness?.color === 'amber'
              ? '#E7A528'
              : recoveryReadiness?.color === 'red'
                ? '#D85A5A'
                : '#A8B5C1',
      }}
    />
  </div>

  <div style={{ flex: 1 }}>
    <div
      style={{
        color: '#79C9F4',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}
    >
      Daily Readiness
    </div>

    <div
      style={{
        marginTop: '3px',
        color: '#F6FBFF',
        fontSize: '15px',
        fontWeight: 700,
      }}
    >
      {recoveryReadiness
        ? recoveryReadiness.color === 'green'
          ? 'Good to go'
          : recoveryReadiness.color === 'amber'
            ? 'Proceed with care'
            : 'Recovery priority'
        : 'Readiness unavailable'}
    </div>

    <div
      style={{
        marginTop: '2px',
        color: '#A9C6D9',
        fontSize: '13px',
        lineHeight: 1.4,
      }}
    >
      {recoveryReadiness
        ? recoveryReadiness.implication === 'proceed_as_planned'
          ? 'Recovery supports your planned training today.'
          : recoveryReadiness.implication === 'hold_or_trim_cost'
            ? 'Consider slightly reducing training load today.'
            : 'Reduce training stress and prioritise recovery.'
        : 'Add recovery data to generate today’s guidance.'}
    </div>
  </div>

  <button
    type="button"
    onClick={() => setActiveNav('Recovery')}
    style={{
      padding: 0,
      border: 'none',
      background: 'transparent',
      color: '#1673AE',
      fontSize: '20px',
      cursor: 'pointer',
    }}
  >
    ›
  </button>
</section>
        
       <section
  style={{
    marginBottom: '16px',
    padding: '18px',
    background: 'linear-gradient(145deg,#102B43,#071C30)',
    border: '1px solid rgba(72,153,201,0.32)',
    borderRadius: '20px',
  }}
>
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      marginBottom: '12px',
    }}
  >
    <span
      style={{
        color: '#58C3F6',
        fontSize: '11px',
        fontWeight: 800,
        letterSpacing: '0.09em',
        textTransform: 'uppercase',
      }}
    >
      Azur Coach Insight
    </span>

    <span
      style={{
        padding: '4px 8px',
        borderRadius: '20px',
        background: '#EAF7EF',
        color: '#2F8A57',
        fontSize: '10px',
        fontWeight: 800,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      }}
    >
      Coaching focus
    </span>
  </div>

  <h3
    style={{
      margin: 0,
      color: '#F6FBFF',
      fontSize: '19px',
      fontWeight: 700,
    }}
  >
    Why today matters
  </h3>

  <p
    style={{
      margin: '8px 0 14px',
      color: '#AAC7D9',
      fontSize: '14px',
      lineHeight: 1.55,
    }}
  >
    {todaySession
      ? todaySession.rationale ||
        `Today's ${sportName(
          todaySession.sport,
        ).toLowerCase()} session supports your current training focus.`
      : 'Today is a recovery day. Recovery supports adaptation from recent training.'}
  </p>

  <div
    style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '10px',
      marginBottom: '14px',
    }}
  >
    <div
      style={{
        padding: '10px 12px',
        borderRadius: '10px',
        background: '#14344E',
        border: '1px solid #28516C',
      }}
    >
      <div
        style={{
          color: '#82B5D0',
          fontSize: '10px',
          fontWeight: 800,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
        }}
      >
        Focus
      </div>

      <div
        style={{
          marginTop: '4px',
          color: '#F6FBFF',
          fontSize: '14px',
          fontWeight: 700,
          textTransform: 'capitalize',
        }}
      >
        {todaySession
          ? todaySession.sessionClass
          : 'Recovery'}
      </div>
    </div>

    <div
      style={{
        padding: '10px 12px',
        borderRadius: '10px',
        background: '#14344E',
        border: '1px solid #28516C',
      }}
    >
      <div
        style={{
          color: '#82B5D0',
          fontSize: '10px',
          fontWeight: 800,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
        }}
      >
        Long-term benefit
      </div>

      <div
        style={{
          marginTop: '4px',
          color: '#F6FBFF',
          fontSize: '14px',
          fontWeight: 700,
        }}
      >
        {todaySession
          ? todaySession.sport === 'bike'
            ? 'Bike durability'
            : todaySession.sport === 'run'
              ? 'Run durability'
              : todaySession.sport === 'swim'
                ? 'Swim efficiency'
                : 'Training adaptation'
          : 'Recovery and adaptation'}
      </div>
    </div>
  </div>

  <button
    type="button"
    onClick={() => setActiveNav('Weekly Review')}
    style={{
      padding: 0,
      border: 'none',
      background: 'transparent',
      color: '#58C3F6',
      fontSize: '13px',
      fontWeight: 700,
      cursor: 'pointer',
    }}
  >
    View coaching rationale →
  </button>
</section>
      </>
    );
  }

  function calendarMoveSpacingWarnings(session: Session, targetDate: string): string[] {
    const date = new Date(`${targetDate}T12:00:00`);
    const adjacent = [-1, 1].flatMap((offset) => {
      const next = new Date(date);
      next.setDate(next.getDate() + offset);
      const key = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
      return weekSessions.filter((item) =>
        item.id !== session.id && item.plannedDate === key &&
        !['missed', 'cancelled'].includes(item.status));
    });
    const quality = (item: Session) => ['intensity', 'race_specific'].includes(item.sessionClass);
    const warnings: string[] = [];
    if (quality(session) && adjacent.some(quality)) {
      warnings.push('This creates back-to-back quality training days.');
    }
    if (session.durationMin >= 120 && adjacent.some((item) => quality(item) && item.sport === 'run')) {
      warnings.push('A long session will sit beside a demanding run.');
    }
    return warnings;
  }

  function calendarMoveAlternatives(session: Session) {
    return calendarWeekDates
      .filter((day) => day.dateKey !== session.plannedDate)
      .map((day) => {
        const existing = weekSessions.filter((item) =>
          item.id !== session.id && item.plannedDate === day.dateKey &&
          !['missed', 'cancelled'].includes(item.status));
        const hard = ['intensity', 'race_specific'].includes(session.sessionClass);
        const clashes = hard && existing.some((item) => ['intensity', 'race_specific'].includes(item.sessionClass));
        const warnings = calendarMoveSpacingWarnings(session, day.dateKey);
        const plannedMinutes = existing.reduce((sum, item) => sum + item.durationMin, 0);
        // This is a planned-duration projection, not TSS, CTL, ATL or predicted recovery.
        const projectedDayMinutes = plannedMinutes + session.durationMin;
        const stressInputs = [...existing, session].map((item) =>
          estimatePlannedStress({ sport: item.sport, prescription: item.prescription }));
        const projectedBikeStress = stressInputs.every((result) => result.status === 'estimated')
          ? Math.round(stressInputs.reduce((sum, result) => sum + (result.status === 'estimated' ? result.points : 0), 0))
          : null;
        const rollingDays = calendarWeekDates.filter((date) => date.dateKey <= day.dateKey && date.dateKey >= calendarWeekDates[0].dateKey);
        const projectedWeekToDateMinutes = rollingDays.reduce((sum, date) => {
          const activities = weekSessions.filter((item) =>
            item.id !== session.id && item.plannedDate === date.dateKey &&
            !['missed', 'cancelled'].includes(item.status));
          return sum + activities.reduce((minutes, item) => minutes + item.durationMin, 0);
        }, 0) + session.durationMin;
        return {
          dateKey: day.dateKey,
          label: `${day.dayLabel} ${day.dayNumber}`,
          available: !clashes && warnings.length === 0,
          plannedMinutes,
          projectedDayMinutes,
          projectedBikeStress,
          projectedWeekToDateMinutes,
          reason: clashes ? 'Quality session already scheduled' : warnings.join(' ') || `${Math.round(plannedMinutes)} min already planned`,
        };
      })
      .filter((candidate) => candidate.available)
      .sort((a, b) => a.plannedMinutes - b.plannedMinutes || a.dateKey.localeCompare(b.dateKey))
      .slice(0, 3);
  }

  async function saveCalendarMove() {
    const session = weekSessions.find((item) => item.id === movingSessionId);
    if (!session || !moveTargetDate || moveSaving) return;
    if (session.locked || !['planned', 'edited'].includes(session.status)) {
      setMoveMessage('Locked or completed sessions cannot be rescheduled.');
      return;
    }
    if (moveTargetDate === session.plannedDate) {
      setMoveMessage('Choose a different training day.');
      return;
    }
    if (calendarWeekDates.every((day) => day.dateKey !== moveTargetDate)) {
      setMoveMessage('For now, choose a day within this displayed week.');
      return;
    }
    const sameDay = weekSessions.filter((item) => item.id !== session.id && item.plannedDate === moveTargetDate && !['cancelled', 'missed'].includes(item.status));
    if (sameDay.some((item) => item.sessionClass === 'intensity' || item.sessionClass === 'race_specific') && ['intensity', 'race_specific'].includes(session.sessionClass)) {
      setMoveMessage('Another quality session is already planned on this day. Move not saved.');
      return;
    }
    const spacingWarnings = calendarMoveSpacingWarnings(session, moveTargetDate);
    if (spacingWarnings.length > 0) {
      setMoveMessage(`Training-spacing review: ${spacingWarnings.join(' ')} Choose another day or discuss the change with your coach. Move not saved.`);
      return;
    }
    setMoveSaving(true);
    setMoveMessage('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in to reschedule a workout.');
      const { data: athlete, error: athleteError } = await supabase.from('athlete_profile').select('id').eq('user_id', user.id).single();
      if (athleteError || !athlete) throw new Error('Athlete profile unavailable.');
      const { data, error } = await supabase.from('planned_session')
        .update({ planned_date: moveTargetDate, status: 'edited' })
        .eq('id', session.id).eq('athlete_id', athlete.id)
        .eq('planned_date', session.plannedDate)
        .eq('locked', false).in('status', ['planned', 'edited'])
        .select('id');
      if (error) throw error;
      if (data?.length !== 1) throw new Error('Session changed since loading. Refresh and try again.');
      await loadPlannedSessions(user.id);
      setMovingSessionId(null);
      setMoveMessage('Session rescheduled. Review recovery spacing before training.');
    } catch (error) {
      setMoveMessage(error instanceof Error ? error.message : 'Unable to reschedule.');
    } finally {
      setMoveSaving(false);
    }
  }

  function CalendarView() {
    const completedCount = calendarWeekSessions.filter(
      (session) => session.status === 'completed',
    ).length;
    const focusedDay = calendarFocusedDate === 'all' ? null : (calendarWeekDates.find(d => d.dateKey === calendarFocusedDate) ?? calendarWeekDates.find(d => d.dateKey === todayKey) ?? calendarWeekDates[0]);
    const plannedCount = calendarWeekSessions.filter(
      (session) => session.status === 'planned' || session.status === 'edited',
    ).length;
    return (
      <div className="calendar-layout">
        <div>
<details className="calendar-stress-disclosure">
  <summary><span><strong>Planned training load</strong><small>Sport-specific estimates · view analysis</small></span><span aria-hidden="true">⌄</span></summary>
  <MultisportPlannedStress
    sessions={calendarWeekSessions}
    runThreshold={athleteProfile.runThreshold}
    swimCss={athleteProfile.swimThreshold}
  />
</details>
{movingSessionId && (
  <section className="calendar-move-panel" aria-label="Reschedule workout">
    <strong>Reschedule {weekSessions.find((item) => item.id === movingSessionId)?.title}</strong>
    <p>Choose another day this week. Quality-session clashes are blocked; check your recovery plan before committing.</p>
    {(() => {
      const session = weekSessions.find((item) => item.id === movingSessionId);
      if (!session) return null;
      const suggestions = calendarMoveAlternatives(session);
      return (
        <div className="calendar-move-suggestions">
          <span>Suggested days · ranked by planned session spacing and duration</span>
          <div className="calendar-move-load-context">
            <strong>Current training-load context</strong>
            {trainingLoad.form != null && trainingLoad.fatigue != null ? (
              <p>Form (TSB): {trainingLoad.form} · Fatigue (ATL): {trainingLoad.fatigue}. These are current load estimates, not forecasts for the suggested days.</p>
            ) : (
              <p>Training-load history is insufficient for a reliable current form/fatigue estimate. Suggestions use the planned schedule only.</p>
            )}
            <small>Suggested dates show projected scheduled minutes after the move. Current training load is context only; this is not a TSS or day-specific recovery forecast. High-intensity conflicts remain blocked.</small>
          </div>
          {suggestions.length === 0 ? <small>No conflict-free alternatives in this week.</small> : (
            <div>
              {suggestions.map((day) => (
                <button type="button" key={day.dateKey} onClick={() => { setMoveTargetDate(day.dateKey); setMoveMessage(''); }}>
                  {day.label} · {Math.round(day.projectedDayMinutes)} min projected that day · {Math.round(day.projectedWeekToDateMinutes)} min week-to-date · {day.projectedBikeStress != null ? `${day.projectedBikeStress} estimated bike-stress proxy` : 'Stress unavailable (incomplete or mixed-sport targets)'}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    })()}
    <div className="calendar-move-actions">
      <select aria-label="New workout day" value={moveTargetDate} onChange={(event) => {setMoveTargetDate(event.target.value); setMoveMessage('');}}>
        <option value="">Choose day</option>
        {calendarWeekDates.map((day) => <option key={day.dateKey} value={day.dateKey}>{day.dayLabel} {day.dayNumber}</option>)}
      </select>
      <button type="button" disabled={!moveTargetDate || moveSaving} onClick={() => void saveCalendarMove()}>{moveSaving ? 'Saving…' : 'Confirm move'}</button>
      <button type="button" onClick={() => setMovingSessionId(null)}>Cancel</button>
    </div>
  </section>
)}
{moveMessage && <p role="status" className="calendar-move-message">{moveMessage}</p>}
<section className="panel calendar-toolbar calendar-week-strip"><div className="azur-calendar-quickbar"><strong>YOUR TRAINING WEEK</strong><button type="button" onClick={()=>{setCalendarWeekOffset(0);setCalendarFocusedDate(todayKey)}}>Today</button><button type="button" onClick={()=>setCalendarFocusedDate('all')}>Full week</button></div>
  <div className="calendar-strip-top">
    <button
      type="button"
      onClick={() =>
        { setCalendarFocusedDate(null); setCalendarWeekOffset((current) => current - 1); }
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
        { setCalendarFocusedDate(null); setCalendarWeekOffset((current) => current + 1); }
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
        <button
          type="button"
          key={day.dateKey}
          aria-pressed={focusedDay?.dateKey === day.dateKey}
          aria-label={`View workouts for ${day.dayLabel} ${day.dayNumber}`}
          onClick={() => setCalendarFocusedDate(day.dateKey)}
          className={`calendar-strip-day ${day.dateKey === todayKey ? 'today' : ''} ${focusedDay?.dateKey === day.dateKey ? 'focused' : ''}`}
        >
          <span>{day.dayLabel.slice(0, 1)}</span>

          <strong>{day.dayNumber}</strong>

          <div className="calendar-strip-dots" aria-label={sessionsForDate.length ? `${sessionsForDate.filter((session) => session.status === 'completed').length} of ${sessionsForDate.length} sessions completed` : 'Rest day'}>
            {sessionsForDate.length === 0 ? (
              <span className="calendar-rest-indicator" title="Rest day">—</span>
            ) : sessionsForDate.slice(0, 3).map((session) => (
              <i
                key={session.id}
                className={`${session.sport} ${session.status === 'completed' ? 'done' : session.status === 'edited' ? 'adjusted' : ''}`}
                title={`${sportName(session.sport)}: ${session.status === 'completed' ? 'Completed' : session.status === 'edited' ? 'Adjusted' : 'Planned'}`}
              />
            ))}
          </div>
        </button>
      );
    })}
  </div>

  <div className="calendar-strip-footer">
    <small>
      {calendarWeekSessions.length} sessions · {completedCount} completed · {plannedCount} planned ·{' '}
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

<div className="calendar-focus-toolbar">
  <div><strong>{focusedDay ? focusedDay.date.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'}) : 'Full training week'}</strong><small>{focusedDay ? 'Tap another date to view its sessions' : 'All seven training days'}</small></div>
  <button type="button" onClick={() => setCalendarFocusedDate(focusedDay ? 'all' : null)}>{focusedDay ? 'Full week' : 'Focus day'}</button>
</div>
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
      const calendarDay = calendarWeekDates.find(
  (calendarDate) => calendarDate.dayLabel === day,
);

const dayCompletedActivities = completedActivityFeed.filter(
  (activity) => {
    if (!calendarDay) return false;

    if (activity.planned_session_id) {
      return false;
    }

    const activityDate = new Date(activity.start_time);

    return (
      activityDate.getFullYear() === calendarDay.date.getFullYear() &&
      activityDate.getMonth() === calendarDay.date.getMonth() &&
      activityDate.getDate() === calendarDay.date.getDate()
    );
  },
);
      return (
<div
  className={`calendar-day ${
    daySessions.length === 0 ? 'empty-day' : ''
  } ${focusedDay && focusedDay.dayLabel !== day ? 'mobile-unfocused' : ''}`}
  key={day}
>
    <div
      className={`calendar-day-head ${
        calendarDay?.dateKey === todayKey
          ? 'today'
          : ''
      }`}
    >
      <div>
        <span>{day}</span>

        <strong>
          {calendarDay?.date.toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
            }) ?? ''}
        </strong>
      </div>

{calendarDay?.dateKey === todayKey && <small>TODAY</small>}
</div>

                  <div className="day-stack">
                    {daySessions.map((session) => (
                      <div className="calendar-session-wrapper">
                      {!session.locked && (session.status === 'planned' || session.status === 'edited') && (
                        <button className="calendar-reschedule-button" type="button" onClick={() => {setMovingSessionId(session.id); setMoveTargetDate(session.plannedDate); setMoveMessage('');}}>Move session</button>
                      )}
                      <button
                        key={session.id}
className={`calendar-session ${
  session.accent
} ${
  session.status === 'completed'
    ? 'completed'
    : session.status === 'edited'
      ? 'edited'
      : 'planned'
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
  <span>
    {session.status === 'completed'
      ? 'Completed'
      : session.status === 'edited'
        ? 'Adjusted'
        : session.status === 'planned'
          ? 'Planned'
          : session.status}
  </span>

  {session.status === 'completed' ? (
    <CheckCircle2 size={13} />
  ) : (
    session.locked && <Lock size={13} />
  )}
</div>
</div>

                        <strong>{session.title}</strong>
<CalendarIntensityProfile steps={(session.prescription as { azurWorkout?: { steps?: unknown } } | undefined)?.azurWorkout?.steps} />
<CalendarPrescriptionSteps prescription={session.prescription} />
<WorkoutTargetDetails prescription={session.prescription} ftpWatts={athleteProfile.ftp} compact />
<div className="calendar-session-purpose">
  {session.status === 'completed' && session.completedDurationSec != null ? (
    <div className="calendar-actual-comparison">
      <strong>Planned {formatDuration(session.durationMin)} · Actual {formatDuration(Math.round(session.completedDurationSec / 60))}</strong>
      <span>
        {session.durationMin > 0
          ? `${Math.round((session.completedDurationSec / 60 / session.durationMin) * 100)}% of prescribed time · `
          : ''}
        {Math.round(session.completedDurationSec / 60 - session.durationMin) >= 0 ? '+' : ''}
        {Math.round(session.completedDurationSec / 60 - session.durationMin)} min
      </span>
      {session.completedSource && (
        <small>Recorded via {session.completedSource === 'manual_fit' ? 'FIT upload' : session.completedSource === 'garmin' ? 'Garmin' : session.completedSource}</small>
      )}
    </div>
  ) : (
    <span>{session.rationale || `${session.sessionClass.replace(/_/g, ' ')} session · ${formatDuration(session.durationMin)} planned`}</span>
  )}
</div>
<span className="calendar-move-hint" aria-hidden="true">View session details ›</span>
<div className="calendar-session-meta">
  <span>
    {session.status === 'completed' &&
    session.completedDurationSec
      ? `Actual ${formatDuration(
          Math.round(session.completedDurationSec / 60),
        )}`
      : formatDuration(session.durationMin)}
  </span>

  <span>
    {session.status === 'completed' &&
    session.completedMatchConfidence != null
      ? `${Math.round(
          session.completedMatchConfidence,
        )}% match`
      : `Priority ${session.priority}`}
  </span>
</div>

<span className="calendar-session-target">
  {session.status === 'completed' &&
  session.completedSource === 'garmin'
    ? `Garmin · Planned ${formatDuration(
        session.durationMin,
      )}`
    : Object.values(session.targets)[0]?.toString()}
</span>
                      </button>
                      </div>
                    ))}
                    {dayCompletedActivities.map((activity) => {
  const activityIndex = completedActivityFeed.indexOf(activity);

  return (
    <button
      key={`${activity.source}-${activity.start_time}`}
      className={`calendar-session completed ${activity.sport}`}
      onClick={() => {
        setSelectedStravaActivity(activityIndex);
      }}
    >
      <div className="calendar-session-top">
        <span>{sportName(activity.sport)}</span>

        <div className="calendar-session-status">
          <span>Completed</span>
          <CheckCircle2 size={13} />
        </div>
      </div>

      <strong>
        {activity.name || activity.title || `Unplanned ${sportName(activity.sport)}`}
      </strong>

      <div className="calendar-session-meta">
        <span>
          {Math.round(activity.duration_sec / 60)} min
        </span>

        <span>
          {(Number(activity.distance_m ?? 0) / 1000).toFixed(2)} km
        </span>
      </div>

      <span className="calendar-session-target">
        {activity.processed_metrics?.averageHeartRate
          ? `${activity.processed_metrics.averageHeartRate} bpm avg`
          : 'Garmin activity'}
      </span>
    </button>
  );
})}
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
          <div className={`azur-v2-session-hero azur-v2-sport-${selected.sport}`}>
            <div className="azur-v2-hero-label">AZUR / SESSION DETAIL</div>
            <div className="azur-v2-hero-sport">{sportName(selected.sport)} · {selected.status === "completed" ? "Completed" : "Planned"}</div>
          </div>
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

          {(() => {
            const check = auditAthleteInstructions(selected.prescription);
            if (check.complete) return null;
            return <div className="session-prescription-warning" role="note">
              <strong>Prescription needs coach clarification</strong>
              <span>{check.blockCount === 0 ? 'Structured work intervals have not been supplied.' : check.gaps.length + ' instruction gap(s): ' + check.gaps.slice(0,3).map(g => g.section.replace('_',' ') + ' block ' + g.block + ' missing ' + g.missing.replaceAll('_',' ')).join('; ') + (check.gaps.length > 3 ? '…' : '')}</span>
              <small>Do not infer missing targets or rest periods. Ask your coach before completing an unclear session.</small>
            </div>;
          })()}
          <PremiumWorkoutTabs prescription={selected.prescription} rationale={selected.rationale} ftpWatts={athleteProfile.ftp} plannedMinutes={selected.durationMin} completedMinutes={selected.completedDurationSec == null ? null : Math.round(selected.completedDurationSec/60)} completedSource={selected.completedSource} />
          <details className="azur-workout-modal-summary azur-v2-workout-breakdown">
            <summary>Workout structure <span>View intensity profile and prescribed targets</span></summary>
            <div className="azur-v2-workout-breakdown-body">
              <WorkoutTargetDetails prescription={selected.prescription} ftpWatts={athleteProfile.ftp} />
            </div>
          </details>
          <div className="editor-grid">
          <details className="session-prescription-disclosure">
            <summary><span><strong>Full workout prescription</strong><small>Warm-up · Main set · Cool-down · Fueling</small></span><span aria-hidden="true">⌄</span></summary>
            <div className="session-prescription-sections">
            {selected.prescription?.focus && (
 <div className="wide session-block">
    <span className="eyebrow">FOCUS</span>
    <strong>{selected.prescription.focus}</strong>
  </div>
)}
{Array.isArray(selected.prescription?.warmup) && selected.prescription.warmup.length > 0 && (
  <div className="wide session-block">
    <span className="eyebrow">WARM-UP</span>
    {selected.prescription.warmup.map((block: any, index: number) => (
      <div key={index} className="session-block-item azur-prescription-step">
        <strong>{block.reps ? `${block.reps} × ` : ''}{block.distance_m ? `${block.distance_m} m` : block.duration_min ? `${block.duration_min} min` : block.duration_sec ? `${block.duration_sec} sec` : 'Training block'}</strong>
        {block.discipline && <small>{String(block.discipline).toUpperCase()}</small>}
        {(block.target || block.pace || block.ftp_percent || block.rpe || block.cadence) ? (
          <div className="azur-prescription-targets">
            {block.target && <div><span>Effort / target</span><strong>{block.target}</strong></div>}
            {block.pace && <div><span>Pace</span><strong>{block.pace}</strong></div>}
            {block.ftp_percent && <div><span>Power</span><strong>{block.ftp_percent} FTP</strong></div>}
            {block.rpe && <div><span>RPE</span><strong>{block.rpe}</strong></div>}
            {block.cadence && <div><span>Cadence</span><strong>{block.cadence}</strong></div>}
          </div>
        ) : <small className="azur-prescription-missing">No intensity target recorded — ask your coach for the intended effort.</small>}
        {(block.recovery_sec || block.recovery_min || block.rest_sec || block.rest_min) && (
          <div className="azur-prescription-rest"><span>Recovery between efforts</span><strong>{block.recovery_sec ?? block.rest_sec ? `${block.recovery_sec ?? block.rest_sec} sec` : `${block.recovery_min ?? block.rest_min} min`}</strong></div>
        )}
        {block.notes && <small className="azur-prescription-note">{block.notes}</small>}
      </div>
    ))}
  </div>
)}
{Array.isArray(selected.prescription?.main_set) && selected.prescription.main_set.length > 0 && (
  <div className="wide session-block">
    <span className="eyebrow">MAIN SET</span>
    {selected.prescription.main_set.map((block: any, index: number) => (
      <div key={index} className="session-block-item azur-prescription-step">
        <strong>{block.reps ? `${block.reps} × ` : ''}{block.distance_m ? `${block.distance_m} m` : block.duration_min ? `${block.duration_min} min` : block.duration_sec ? `${block.duration_sec} sec` : 'Training block'}</strong>
        {block.discipline && <small>{String(block.discipline).toUpperCase()}</small>}
        {(block.target || block.pace || block.ftp_percent || block.rpe || block.cadence) ? (
          <div className="azur-prescription-targets">
            {block.target && <div><span>Effort / target</span><strong>{block.target}</strong></div>}
            {block.pace && <div><span>Pace</span><strong>{block.pace}</strong></div>}
            {block.ftp_percent && <div><span>Power</span><strong>{block.ftp_percent} FTP</strong></div>}
            {block.rpe && <div><span>RPE</span><strong>{block.rpe}</strong></div>}
            {block.cadence && <div><span>Cadence</span><strong>{block.cadence}</strong></div>}
          </div>
        ) : <small className="azur-prescription-missing">No intensity target recorded — ask your coach for the intended effort.</small>}
        {(block.recovery_sec || block.recovery_min || block.rest_sec || block.rest_min) && (
          <div className="azur-prescription-rest"><span>Recovery between efforts</span><strong>{block.recovery_sec ?? block.rest_sec ? `${block.recovery_sec ?? block.rest_sec} sec` : `${block.recovery_min ?? block.rest_min} min`}</strong></div>
        )}
        {block.notes && <small className="azur-prescription-note">{block.notes}</small>}
      </div>
    ))}
  </div>
)}
{Array.isArray(selected.prescription?.cooldown) && selected.prescription.cooldown.length > 0 && (
  <div className="wide session-block">
    <span className="eyebrow">COOL-DOWN</span>
    {selected.prescription.cooldown.map((block: any, index: number) => (
      <div key={index} className="session-block-item azur-prescription-step">
        <strong>{block.reps ? `${block.reps} × ` : ''}{block.distance_m ? `${block.distance_m} m` : block.duration_min ? `${block.duration_min} min` : block.duration_sec ? `${block.duration_sec} sec` : 'Training block'}</strong>
        {block.discipline && <small>{String(block.discipline).toUpperCase()}</small>}
        {(block.target || block.pace || block.ftp_percent || block.rpe || block.cadence) ? (
          <div className="azur-prescription-targets">
            {block.target && <div><span>Effort / target</span><strong>{block.target}</strong></div>}
            {block.pace && <div><span>Pace</span><strong>{block.pace}</strong></div>}
            {block.ftp_percent && <div><span>Power</span><strong>{block.ftp_percent} FTP</strong></div>}
            {block.rpe && <div><span>RPE</span><strong>{block.rpe}</strong></div>}
            {block.cadence && <div><span>Cadence</span><strong>{block.cadence}</strong></div>}
          </div>
        ) : <small className="azur-prescription-missing">No intensity target recorded — ask your coach for the intended effort.</small>}
        {(block.recovery_sec || block.recovery_min || block.rest_sec || block.rest_min) && (
          <div className="azur-prescription-rest"><span>Recovery between efforts</span><strong>{block.recovery_sec ?? block.rest_sec ? `${block.recovery_sec ?? block.rest_sec} sec` : `${block.recovery_min ?? block.rest_min} min`}</strong></div>
        )}
        {block.notes && <small className="azur-prescription-note">{block.notes}</small>}
      </div>
    ))}
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

</div>
          </details>

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
          <strong>Completed activity{selected.completedSource === 'garmin' ? ' · Garmin' : selected.completedSource === 'manual_fit' ? ' · FIT upload' : ''}</strong>
          <small>Planned {formatDuration(selected.durationMin)} · Actual {formatDuration(Math.round(selected.completedDurationSec / 60))} · {selected.durationMin > 0 ? Math.round(selected.completedDurationSec / 60 / selected.durationMin * 100) + '% duration adherence' : 'Duration recorded'}</small>
        </div>

        <span className="completed-check">✓</span>
      </div>
                    {selected.completedRoute && selected.completedRoute.length > 1 && (
  <RouteMap points={selected.completedRoute} />
)}
      {selected.completedSeries && selected.completedSeries.length > 1 && (
  <HeartRateChart points={selected.completedSeries} />
)}
      {selected.completedSeries && selected.completedSeries.length > 1 && (
  <PaceChart points={selected.completedSeries} />
)}
      {selected.completedSeries && selected.completedSeries.length > 1 && (() => {
  const hrDrift = calculateHrDrift(selected.completedSeries);
      const completionPercent =
  selected.durationMin > 0
    ? Math.round(
        (selected.completedDurationSec / 60 / selected.durationMin) * 100,
      )
    : null;
      const completionLabel =
  completionPercent == null
    ? null
    : completionPercent >= 95
      ? 'Session completed'
      : completionPercent >= 75
        ? 'Most of session completed'
        : completionPercent >= 40
          ? 'Partial session completed'
          : 'Limited session completed';
const paceConsistency =
  calculatePaceConsistency(selected.completedSeries);  if (hrDrift == null) {
    return null;
  }
const driftLabel =
  hrDrift < -2
    ? 'Efficiency improved'
    : hrDrift <= 3
      ? 'Stable aerobic response'
      : hrDrift <= 5
        ? 'Mild cardiovascular drift'
        : 'Noticeable cardiovascular drift'; 
      const paceLabel =
  paceConsistency == null
    ? null
    : paceConsistency <= 3
      ? 'very steady pacing'
      : paceConsistency <= 6
        ? 'consistent pacing'
        : 'more variable pacing';

const sessionVerdict =
  `${driftLabel}. ${
    paceLabel ? `${paceLabel}. ` : ''
  }${
    completionPercent != null
      ? `${completionPercent}% of the planned session was completed.`
      : ''
  }`;
      return (
    <div className="activity-analysis-card">
      <div className="activity-analysis-heading">
        <span>AZUR ANALYSIS</span>
        <strong>HR DRIFT</strong>
      </div>

      <div className="activity-analysis-value">
        {hrDrift >= 0 ? '+' : ''}
        {hrDrift.toFixed(1)}%
      </div>
<div className="activity-analysis-label">
  {driftLabel}
</div>      
    {paceConsistency != null && (
  <div className="activity-analysis-secondary">
    <span>PACE CONSISTENCY</span>
    <strong>{paceConsistency.toFixed(1)}%</strong>
  </div>
)}
{completionPercent != null && (
  <div className="activity-analysis-secondary">
    <div>
      <span>SESSION COMPLETION</span>
      <small>{completionLabel}</small>
    </div>
    <strong>{completionPercent}%</strong>
  </div>
)}
<div className="activity-analysis-copy">
  <strong>SESSION VERDICT</strong>
  <span>{sessionVerdict}</span>
</div>
    </div>
  );
})()}
 {selected?.completedDurationSec && selected.completedSource === 'manual' && (
   <section className="azur-manual-training-insights" aria-label="AZUR training insights">
     <span className="eyebrow">AZUR TRAINING INSIGHTS</span>
     <h4>What your recorded session tells us</h4>
     <div className="azur-manual-insight-metrics">
       <div><small>Planned</small><strong>{selected.durationMin} min</strong></div>
       <div><small>Recorded</small><strong>{Math.round(selected.completedDurationSec/60)} min</strong></div>
       <div><small>Distance reported</small><strong>{selected.completedDistanceM == null ? 'Not recorded' : `${(selected.completedDistanceM/1000).toFixed(2)} km`}</strong></div>
       <div><small>Reported RPE</small><strong>{selected.completedRpe ?? 'Not recorded'}</strong></div>
     </div>
     {selected.sport === 'bike' && selected.completedDistanceM != null && selected.completedDurationSec > 0 && (selected.completedDistanceM / 1000) / (selected.completedDurationSec / 3600) > 80 && (
       <p className="azur-insight-data-warning" role="status"><strong>CHECK REPORTED DATA</strong> The distance and duration imply an unusually high average cycling speed. Please review the entries. AZUR will not interpret these values as verified performance or recommend a training change from them.</p>
     )}
     <p className="azur-insight-observation"><strong>01 · OBSERVATION</strong> {matchCompletionPercent===null?'Completion duration unavailable.':matchCompletionPercent>=100?'The recorded duration met or exceeded the planned duration.':'The recorded duration was shorter than planned.'} This does not verify that prescribed intensity or technique targets were achieved.</p>
     <p className="azur-insight-interpretation"><strong>02 · INTERPRETATION</strong> Duration and RPE are athlete-reported; power, pace and heart rate were not measured by this entry.</p>
     <p className="azur-insight-decision"><strong>03 · COACHING DECISION</strong> No change to upcoming training is proposed from this manual record alone. Your coach can review it alongside other training and recovery evidence.</p>
   </section>
 )}
 {selected?.completedDurationSec && nextPlannedSession?.prescription?.azur_adaptation?.status==='accepted' && (
   <div className="azur-existing-plan-change">
     <strong>Existing plan adjustment</strong>
     <p>{nextPlannedSession.title} was adjusted previously ({nextPlannedSession.prescription.azur_adaptation.original_duration_min} → {nextPlannedSession.prescription.azur_adaptation.recommended_duration_min} min). This change was not generated by the workout you're viewing. No new adjustment has been applied.</p>
   </div>
 )}
 {nextSessionRecommendation && nextPlannedSession && (
  <div className="next-session-recommendation">
    <div className="next-session-recommendation-top">
      <span>ADAPTIVE COACHING</span>
      <strong>{nextSessionRecommendation.action}</strong>
    </div>

    <h4>{nextSessionRecommendation.title}</h4>

    <p className="next-session-reason">
      {nextSessionRecommendation.reason}
    </p>

    <div className="next-session-target">
      <span>NEXT SESSION</span>
      <strong>{nextPlannedSession.title}</strong>
      <small>
        {nextPlannedSession.dayLabel} ·{' '}
        {formatDuration(nextPlannedSession.durationMin)}
      </small>
    </div>

<div className="next-session-adjustment">
  <span>
    {nextPlannedSession.prescription?.azur_adaptation?.status === 'accepted'
      ? 'APPLIED ADJUSTMENT'
      : 'PROPOSED ADJUSTMENT'}
  </span>

  <strong>
    {nextPlannedSession.prescription?.azur_adaptation?.status === 'accepted'
      ? `${nextPlannedSession.prescription.azur_adaptation.original_duration_min} min → ${nextPlannedSession.prescription.azur_adaptation.recommended_duration_min} min`
      : nextSessionRecommendation.adjustment}
  </strong>
</div>

  {nextPlannedSession.prescription?.azur_adaptation?.status === 'accepted' ? (
  <div className="next-session-decision">
    ADJUSTMENT APPLIED ·{' '}
    {nextPlannedSession.prescription.azur_adaptation.original_duration_min} min →{' '}
    {nextPlannedSession.prescription.azur_adaptation.recommended_duration_min} min
  </div>
) : (
  <>
   <div className="next-session-actions">
  {nextSessionRecommendation.action === 'CONFIRM' ? (
    <button
      type="button"
      onClick={confirmActivityMatch}
    >
      CONFIRM ACTIVITY MATCH
    </button>
  ) : (
    <>
      <button
        type="button"
        onClick={acceptNextSessionAdjustment}
        disabled={isSavingAdjustment}
      >
        {isSavingAdjustment ? 'SAVING...' : 'ACCEPT ADJUSTMENT'}
      </button>

      <button
        type="button"
        className="secondary"
        onClick={keepOriginalNextSession}
      >
        KEEP ORIGINAL
      </button>
    </>
  )}
</div>

    {nextSessionDecision && (
      <div className="next-session-decision">
        {nextSessionDecision === 'accepted'
          ? 'Adjustment accepted. The next session has been updated in your plan.'
          : 'Original session kept. No change has been made to your plan.'}
      </div>
    )}
  </>
)}
  </div>
)}

{selected.completedSource !== 'manual' && <div className="completed-session-metrics">
  <div>
    <span>PLANNED</span>
    <strong>
      {formatDuration(selected.durationMin)}
    </strong>
  </div>

<div>
  <span>COMPLETED</span>
  <strong>
    {formatCompletedDuration(
      selected.completedDurationSec,
    )}
  </strong>
</div>

  <div>
    <span>MATCH STATUS</span>
    <strong>
     {confirmedMatchSessionId === selected.id
  ? 'Confirmed match'
  : selected.durationMin > 0
    ? Math.round(
        (selected.completedDurationSec / 60 / selected.durationMin) * 100,
      ) >= 85
      ? 'Matched'
      : Math.round(
          (selected.completedDurationSec / 60 / selected.durationMin) * 100,
        ) >= 50
        ? 'Partial match'
        : 'Possible match'
    : 'Matched'}
    </strong>
  </div>
</div>}
      {selected.completedMetrics && (
        <details className="completed-activity-details azur-collapsible-detail">
          <summary className="completed-activity-title">
            <span>ACTIVITY DATA</span>

            {selected.completedMetrics.isTest && (
              <span className="test-data-badge">TEST DATA</span>
            )}
          </summary>

          <div className="completed-activity-grid">
            <div>
              <span>DISTANCE</span>
              <strong>
{selected.completedDistanceM != null
  ? formatCompletedDistance(
      selected.completedDistanceM,
    )
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
  <span>
    {selected.sport === 'run'
      ? 'AVG PACE'
      : 'NORMALIZED POWER'}
  </span>

  <strong>
    {selected.sport === 'run'
      ? selected.completedMetrics.averagePaceSecPerKm
        ? `${Math.floor(
            selected.completedMetrics.averagePaceSecPerKm / 60,
          )}:${String(
            Math.round(
              selected.completedMetrics.averagePaceSecPerKm % 60,
            ),
          ).padStart(2, '0')}/km`
        : '—'
      : selected.completedMetrics.normalizedPower
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
  <span>
    {selected.sport === 'run'
      ? 'BEST PACE'
      : 'TRAINING LOAD'}
  </span>

  <strong>
    {selected.sport === 'run'
      ? selected.completedMetrics.bestPaceSecPerKm
        ? `${Math.floor(
            selected.completedMetrics.bestPaceSecPerKm / 60,
          )}:${String(
            Math.round(
              selected.completedMetrics.bestPaceSecPerKm % 60,
            ),
          ).padStart(2, '0')}/km`
        : '—'
      : selected.completedMetrics.trainingLoad ?? '—'}
  </strong>
</div>
<div>
  <span>
    {selected.sport === 'run'
      ? 'AVG SPEED'
      : 'CALORIES'}
  </span>

  <strong>
    {selected.sport === 'run'
      ? selected.completedMetrics.averageSpeedKmh
        ? `${selected.completedMetrics.averageSpeedKmh.toFixed(1)} km/h`
        : '—'
      : selected.completedMetrics.calories
        ? `${selected.completedMetrics.calories} kcal`
        : '—'}
  </strong>
</div>

<div>
  <span>
    {selected.sport === 'run'
      ? 'MAX SPEED'
      : 'SOURCE'}
  </span>

  <strong>
    {selected.sport === 'run'
      ? selected.completedMetrics.maxSpeedKmh
        ? `${selected.completedMetrics.maxSpeedKmh.toFixed(1)} km/h`
        : '—'
      : selected.completedSource
        ? selected.completedSource
            .replaceAll('_', ' ')
            .toUpperCase()
        : '—'}
  </strong>
</div>
          </div>
        </details>
      )}
    </div>
  )}
{selectedExecution && selected.completedSource !== 'manual' && (
  <div className="wide session-block session-analysis-card">
    <span className="eyebrow">AZUR SESSION ANALYSIS</span>

<div className="session-analysis-row">
  <div>
    <span>DURATION COMPLETION</span>
    <strong>
      {matchCompletionPercent != null
        ? `${matchCompletionPercent}%`
        : '—'}
    </strong>
  </div>

  <p>
    {matchCompletionPercent == null
      ? 'Completed duration is not available.'
      : matchCompletionPercent >= 105
        ? 'Recorded duration exceeded the plan. This alone does not confirm the intended intensity or training stimulus.'
        : matchCompletionPercent >= 95
          ? selected.completedSource === 'manual' ? 'Reported duration was within 5% of the plan; prescribed intensity and training stimulus remain unverified.' : 'Planned training time was completed. Review measured intensity before confirming the intended training stimulus.'
          : matchCompletionPercent >= 85
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
      {selected.prescription?.focus ||
        Object.values(selected.targets)[0]?.toString() ||
        'Session-specific training focus'}
    </strong>
  </div>
</div>

<div className="wide session-block">
  <span className="eyebrow">WHY THIS MATTERS</span>

  <div className="session-block-item">
    <div>{selected.rationale}</div>
  </div>
</div>
{(selected.status!=='completed'||editableManualId)&&<details className="wide session-block azur-manual-completion azur-collapsible-detail" open={!editableManualId}><summary className="azur-edit-summary">{editableManualId?'Edit recorded workout':'Record workout completion'}<span>{editableManualId?'Change duration, distance or effort':'Enter actual workout details'}</span></summary><p>For training without a connected device. Save your actual session details; an existing imported activity cannot be overwritten.</p><div className="azur-manual-fields"><label>Actual duration (minutes)<input type="number" min="1" max="1440" step="0.5" value={manualDuration} onChange={e=>setManualDuration(e.target.value)} placeholder="e.g. 55"/></label><label>Distance (km, optional)<input type="number" min="0" max="1000" step="0.01" value={manualDistance} onChange={e=>setManualDistance(e.target.value)} placeholder="e.g. 10.2"/></label></div><label className="azur-manual-rpe">Session effort (RPE 1–10)<input type="number" min="1" max="10" step="1" value={sessionFeedback.rpe} onChange={e=>setSessionFeedback(previous=>({...previous,rpe:e.target.value}))} placeholder="e.g. 4" /></label><small>Add optional notes in Athlete Feedback below. You can save a completion without leaving this section.</small>{selected.plannedDate>todayKey&&<p className="azur-manual-date-note">Scheduled for {new Date(selected.plannedDate+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}. Future sessions can only be marked complete within one day of the scheduled date.</p>}<button type="button" className="primary-button" disabled={manualSaving} onClick={()=>void handleManualCompletion()}>{manualSaving?'Saving…':editableManualId?'Save manual changes':'Mark workout complete'}</button>{manualMessage&&<p role="status">{manualMessage}</p>}</details>}
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
        placeholder="Effort, fatigue, discomfort or changes from the plan…"
      />
    </label>
  </div>
</div>

          </div>

<button
  type="button"
  className="primary-button"
  onClick={()=>void handleSessionFeedbackSave()}
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
{selectedStravaActivity !== null &&
  completedActivityFeed[selectedStravaActivity] && (
    <div
      className="session-detail-overlay"
      onClick={() => setSelectedStravaActivity(null)}
    >
      <aside
        className="editor-panel session-detail-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="session-detail-close"
          type="button"
          onClick={() => setSelectedStravaActivity(null)}
        >
          ×
        </button>

        <span className="eyebrow">COMPLETED ACTIVITY</span>

        <h2>
          {sportName(
            completedActivityFeed[selectedStravaActivity].sport,
          )}
        </h2>

<p>
  {new Date(
    completedActivityFeed[selectedStravaActivity].start_time,
  ).toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}
</p>

<RouteMap
  points={
    completedActivityFeed[selectedStravaActivity].raw_payload?.route ?? []
  }
/>

<div className="completed-activity-grid">
  <div>
    <span>DURATION</span>
    <strong>
      {Math.round(
        completedActivityFeed[selectedStravaActivity].duration_sec / 60,
      )}{' '}
      min
    </strong>
  </div>

  <div>
    <span>DISTANCE</span>
    <strong>
      {(
        Number(
          completedActivityFeed[selectedStravaActivity].distance_m ?? 0,
        ) / 1000
      ).toFixed(2)}{' '}
      km
    </strong>
  </div>

  <div>
    <span>AVG HR</span>
    <strong>
      {completedActivityFeed[selectedStravaActivity].processed_metrics
        ?.averageHeartRate ?? '—'}
    </strong>
  </div>

  <div>
    <span>MAX HR</span>
    <strong>
      {completedActivityFeed[selectedStravaActivity].processed_metrics
        ?.maxHeartRate ?? '—'}
    </strong>
  </div>

  <div>
    <span>SOURCE</span>
    <strong>
      {completedActivityFeed[selectedStravaActivity].source === 'manual_fit'
        ? 'Garmin FIT'
        : completedActivityFeed[selectedStravaActivity].source}
    </strong>
  </div>

</div>
      </aside>
    </div>
  )}
      </div>
    );
  }

  function PerformanceView() {
    const ranges = [{days:28,label:'4w'},{days:84,label:'12w'},{days:180,label:'6m'},{days:365,label:'1y'}] as const;
    const today = new Date(); const startDate = new Date(today.getTime()-(performanceRangeDays-1)*86400000);
    const weekStart = (date:Date) => {const d=new Date(date);d.setHours(12,0,0,0);d.setDate(d.getDate()-(d.getDay()+6)%7);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
    const weeks = new Map<string,{key:string;swim:number;bike:number;run:number;distanceKm:number;manual:number;device:number;count:number}>();
    // Use each completed activity once; the activity feed is the canonical persisted source,
    // not planned session totals or device stress estimates.
    completedActivityFeed.forEach((activity:any)=>{
      if (!activity?.start_time || !Number.isFinite(Number(activity.duration_sec)) || Number(activity.duration_sec)<=0) return;
      const date=new Date(activity.start_time);if(Number.isNaN(date.getTime())||date<startDate||date>today)return;
      const key=weekStart(date);const sport=activity.sport as 'swim'|'bike'|'run';
      if(!['swim','bike','run'].includes(sport))return;
      const row=weeks.get(key)??{key,swim:0,bike:0,run:0,distanceKm:0,manual:0,device:0,count:0};
      row[sport]+=Number(activity.duration_sec)/60;row.distanceKm+=Math.max(0,Number(activity.distance_m)||0)/1000;
      if(activity.source==='manual')row.manual++;else row.device++;
      row.count++;weeks.set(key,row);
    });
    const historicalWeeks=Array.from(weeks.values()).sort((a,b)=>a.key.localeCompare(b.key));
    const selectedWeek=historicalWeeks.find(w=>w.key===performanceWeekKey)??historicalWeeks[historicalWeeks.length-1]??null;
    const sports=(['swim','bike','run'] as const).map(sport=>({sport,minutes:selectedWeek?.[sport]??0}));
    const totalMinutes=sports.reduce((sum,item)=>sum+item.minutes,0);
    const maxWeek=Math.max(1,...historicalWeeks.map(w=>w.swim+w.bike+w.run));
    const loadHistory=trainingLoadHistory.slice(-performanceRangeDays);
    const sufficientHistory=trainingLoadHistory.length>=42&&trainingLoad.eligibleActivities>=8&&loadHistory.length>1;
    const values=loadHistory.flatMap(p=>[p.fitness,p.fatigue]);const lower=Math.min(0,...values),upper=Math.max(1,...values);
    const graphY=(v:number)=>112-(v-lower)/Math.max(1,upper-lower)*96;
    const series=(key:'fitness'|'fatigue')=>loadHistory.map((p,i)=>`${8+i*324/Math.max(1,loadHistory.length-1)},${graphY(p[key])}`).join(' ');
    const formatWeek=(key:string)=>new Date(key+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
    return <div className="azur-v2-performance">
      <header className="azur-v2-performance-header"><span>AZUR</span><h2>Performance</h2><p>Your training, clearly understood.</p></header>
      <div className="azur-v2-performance-ranges" role="group" aria-label="Performance date range">{ranges.map(r=><button type="button" key={r.days} aria-pressed={performanceRangeDays===r.days} onClick={()=>{setPerformanceRangeDays(r.days);setPerformanceWeekKey(null);}}>{r.label}</button>)}</div>
      <section className="azur-v2-performance-card" aria-label="Fitness and fatigue"><h3>Fitness &amp; Fatigue</h3><div className="azur-v2-performance-legend"><span>● Fitness</span><span>● Fatigue</span></div>
      {sufficientHistory?<svg viewBox="0 0 340 128" preserveAspectRatio="none" role="img" aria-label="Estimated fitness and fatigue from eligible recorded activities">{[20,65,110].map(y=><line key={y} x1="8" x2="332" y1={y} y2={y} stroke="#2a3c53" strokeDasharray="3 5"/>)}<polyline fill="none" stroke="#329dff" strokeWidth="3" strokeLinejoin="round" points={series('fitness')}/><polyline fill="none" stroke="#f3bd43" strokeWidth="3" strokeLinejoin="round" points={series('fatigue')}/></svg>:<div className="azur-v2-performance-empty">Trends need 42 days of history and eight eligible activities with calculated stress.</div>}
      <small>Estimated training-load indicators, not verified physiological fitness or medical readiness.</small></section>
      <section className="azur-v2-performance-card"><h3>Training Volume</h3><p className="azur-v2-performance-subtitle">Completed activity duration by week · {performanceRangeDays} days</p>
      {historicalWeeks.length?<div className="azur-v2-weekly-chart" role="group" aria-label="Select a completed training week">{historicalWeeks.map(week=><button type="button" key={week.key} aria-pressed={selectedWeek?.key===week.key} onClick={()=>setPerformanceWeekKey(week.key)} aria-label={`Week of ${formatWeek(week.key)}: ${Math.round(week.swim+week.bike+week.run)} minutes`}><span style={{height:`${Math.max(4,(week.swim+week.bike+week.run)/maxWeek*100)}%`}}/><small>{formatWeek(week.key)}</small></button>)}</div>:<div className="azur-v2-performance-empty">No recorded completed activities in this period.</div>}
      {selectedWeek&&<><div className="azur-v2-performance-volume"><strong>{Math.round(totalMinutes)} <small>min</small></strong><span>Week of {formatWeek(selectedWeek.key)}</span></div><div className="azur-v2-performance-bars">{sports.map(item=><div key={item.sport}><span>{item.sport}</span><div><i style={{width:totalMinutes>0?`${item.minutes/totalMinutes*100}%`:'0%'}}/></div><strong>{Math.round(item.minutes)}m</strong></div>)}</div><p className="azur-v2-performance-subtitle">{selectedWeek.distanceKm.toFixed(1)} km reported/recorded distance · {selectedWeek.count} activities</p></>}
      </section>
      <section className="azur-v2-performance-card"><h3>Discipline Breakdown</h3><p className="azur-v2-performance-subtitle">{selectedWeek?`Week of ${formatWeek(selectedWeek.key)}`:'Select a recorded training week'}</p><div className="azur-v2-discipline-breakdown"><div className="azur-v2-discipline-ring" style={{background:totalMinutes>0?`conic-gradient(#28b7e8 0% ${sports[0].minutes/totalMinutes*100}%,#f0bb42 ${sports[0].minutes/totalMinutes*100}% ${(sports[0].minutes+sports[1].minutes)/totalMinutes*100}%,#f28e61 ${(sports[0].minutes+sports[1].minutes)/totalMinutes*100}% 100%)`:undefined}}><span><strong>{Math.round(totalMinutes)}</strong> min</span></div><div className="azur-v2-discipline-list">{sports.map(item=><div className={`azur-v2-discipline-${item.sport}`} key={item.sport}><span>{item.sport}</span><strong>{totalMinutes?Math.round(item.minutes/totalMinutes*100):0}%</strong></div>)}</div></div>
      {selectedWeek&&<p className="azur-v2-evidence-note">Evidence: {selectedWeek.device} device/imported and {selectedWeek.manual} athlete-reported activities. Duration is a recorded observation, not verification of intensity or training stress.</p>}</section>
    </div>;
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
  {raceGoalDemand.swimPaceLabel
    ? `Goal demand · ${raceGoalDemand.swimPaceLabel}/100m`
    : 'Controlled start and efficient rhythm.'}
</small>
              <small>
  {athleteRaceGap.swim.label}
</small>
              <small>
  {athleteRaceGap.swim.explanation}
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
  {raceGoalDemand.bikeAverageKphLabel
    ? `Goal demand · ${raceGoalDemand.bikeAverageKphLabel} km/h average`
    : athleteProfile.ftp
      ? `Target power guidance will be based on your current FTP of ${athleteProfile.ftp} W.`
      : 'Add a current FTP to generate race-specific bike power guidance.'}
</small>
              <small>
  {athleteRaceGap.bike.label}
</small>
<small>
  {athleteRaceGap.bike.explanation}
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
  {raceGoalDemand.runPaceLabel
    ? `Goal demand · ${raceGoalDemand.runPaceLabel}/km`
    : 'Durability and late-race control.'}
</small>
<small>
  {athleteRaceGap.run.label}
</small>
<small>
  {athleteRaceGap.run.explanation}
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
      <section className="panel" aria-label="More tools and connected services">
        <div className="section-heading">
          <div>
            <span className="eyebrow">MORE</span>
            <h3>Tools & connections</h3>
          </div>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() => setActiveNav('Data Sources')}
          style={{width:'100%',textAlign:'left',padding:'14px 16px',borderRadius:'12px'}}
        >
          Data Sources · Intervals.icu activity preview →
        </button>
        <p className="panel-note">View connected services and inspect cycling activities without importing them.</p>
      </section>
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
        : completedActivityFeed[selectedStravaActivity].sport === 'swim'
          ? (() => {
              const activity =
                completedActivityFeed[selectedStravaActivity];

              const distanceM =
                Number(activity.distance_m ?? 0);

              if (!distanceM || !activity.duration_sec) return '—';

              const paceSecPer100m =
                activity.duration_sec / (distanceM / 100);

              const minutes = Math.floor(paceSecPer100m / 60);
              const seconds = Math.round(paceSecPer100m % 60);

              return `${minutes}:${String(seconds).padStart(2, '0')}/100m`;
            })()
          : '—'}
  </strong>

  <span>
    {completedActivityFeed[selectedStravaActivity].sport === 'bike'
      ? 'Avg Power'
      : completedActivityFeed[selectedStravaActivity].sport === 'run'
        ? 'Avg Pace'
        : completedActivityFeed[selectedStravaActivity].sport === 'swim'
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
const routePoints = (parsed.records ?? [])
  .filter(
    (record: any) =>
      record.position_lat != null &&
      record.position_long != null,
  )
  .map((record: any) => ({
    lat: Number(record.position_lat),
    lng: Number(record.position_long),
  }));

const sampleRecord = parsed.records?.find(
  (record: any) =>
    Object.keys(record).some((key) =>
      key.toLowerCase().includes('position'),
    ),
);

const samplePositionKeys = sampleRecord
  ? Object.keys(sampleRecord)
      .filter((key) =>
        key.toLowerCase().includes('position'),
      )
      .join(', ')
  : 'none';

const routeSampleStep = Math.max(
  1,
  Math.ceil(routePoints.length / 250),
);

const compactRoute = routePoints.filter(
  (_point: any, index: number) =>
    index % routeSampleStep === 0 ||
    index === routePoints.length - 1,
);
    const rawRecords = parsed.records ?? [];

const chartSampleStep = Math.max(
  1,
  Math.ceil(rawRecords.length / 300),
);

const firstRecordTime =
  rawRecords.find((record: any) => record.timestamp)?.timestamp ?? null;

const compactSeries = rawRecords
  .filter(
    (record: any, index: number) =>
      index % chartSampleStep === 0 ||
      index === rawRecords.length - 1,
  )
  .map((record: any) => {
    const timestamp = record.timestamp
      ? new Date(record.timestamp).getTime()
      : null;

    const elapsedSec =
      timestamp && firstRecordTime
        ? Math.max(
            0,
            Math.round(
              (timestamp - new Date(firstRecordTime).getTime()) / 1000,
            ),
          )
        : null;

    return {
      elapsedSec,
      heartRate:
        record.heart_rate != null
          ? Number(record.heart_rate)
          : null,
      speedKmh:
        record.speed != null
          ? Number(record.speed)
          : record.enhanced_speed != null
            ? Number(record.enhanced_speed)
            : null,
      altitudeM:
        record.altitude != null
          ? Number(record.altitude)
          : record.enhanced_altitude != null
            ? Number(record.enhanced_altitude)
            : null,
    };
  })
  .filter(
    (point: any) =>
      point.elapsedSec != null &&
      (
        point.heartRate != null ||
        point.speedKmh != null ||
        point.altitudeM != null
      ),
  );
    const durationSec = Number(
  firstSession?.total_timer_time ??
  firstSession?.total_elapsed_time ??
  0,
);

const distanceKm = Number(
  firstSession?.total_distance ?? 0,
);
const averagePaceSecPerKm =
  distanceKm > 0 && durationSec > 0
    ? durationSec / distanceKm
    : null;

const averageSpeedKmh =
  firstSession?.avg_speed != null
    ? Number(firstSession.avg_speed)
    : distanceKm > 0 && durationSec > 0
      ? distanceKm / (durationSec / 3600)
      : null;

const maxSpeedKmh =
  firstSession?.max_speed != null
    ? Number(firstSession.max_speed)
    : null;

const bestPaceSecPerKm =
  maxSpeedKmh && maxSpeedKmh > 0
    ? 3600 / maxSpeedKmh
    : null;
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
  indoor_cycling: 'bike',
  indoorcycling: 'bike',
  indoor_bike: 'bike',
  virtual_ride: 'bike',
  virtualride: 'bike',
  virtual_cycling: 'bike',
  indoorcyclingactivity: 'bike',
  indoor_cycle: 'bike',
  spinning: 'bike',
  trainer: 'bike',
  swimming: 'swim',
  swim: 'swim',
};

const mappedSport =
  sportMap[String(firstSession?.sport ?? '').toLowerCase().replace(/[\s-]+/g, '_')];
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
const activityDateKey = new Date(startTime)
  .toISOString()
  .slice(0, 10);
    const { data: matchingSessions, error: matchingSessionError } =
  await supabase
    .from('planned_session')
    .select('id, planned_date, sport')
    .eq('athlete_id', athlete.id)
    .eq('planned_date', activityDateKey)
    .eq('sport', mappedSport)
    .eq('is_active_version', true)
    .limit(2);

if (matchingSessionError) {
  console.error(
    'Unable to match completed activity to planned session:',
    matchingSessionError,
  );
}

// A same-day sport match is safe only when exactly one active session exists.
// Multiple candidates are left unlinked for deliberate athlete confirmation.
const matchedPlannedSessionId =
  matchingSessionError || matchingSessions?.length !== 1
    ? null
    : matchingSessions[0].id;
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
      planned_session_id: matchedPlannedSessionId,
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
  averagePaceSecPerKm,
  bestPaceSecPerKm,
  averageSpeedKmh,
  maxSpeedKmh,
},

raw_payload: {
  file_name: fitFile.name,
  session: firstSession,
  route: compactRoute,
  series: compactSeries,
},
    },
{
  onConflict: 'source,source_activity_id',
},
  );

if (insertError) {
  throw insertError;
}
setImportStatus(
  [
   `Activity imported successfully`,
routePoints.length
  ? `${routePoints.length} GPS points`
  : `No GPS route found · position fields: ${samplePositionKeys}`,
    `${compactSeries.length} chart points`,
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
  const [intervalsPreview, setIntervalsPreview] = useState<{
    activities?: Array<{sourceId:string|number;name?:string;start?:string;type?:string;durationSec?:number;distanceMeters?:number;averageWatts?:number;normalizedWatts?:number;alreadyImported?:boolean;possibleCrossPlatformDuplicate?:boolean;reviewRequired?:boolean;status?:string;reason?:string;sessionCandidates?:Array<{id:string;title?:string}>;safeToAutoImport?:boolean}>;
    error?:string;
  } | null>(null);
  const [intervalsLoading, setIntervalsLoading] = useState(false);
  async function previewIntervals() {
    setIntervalsLoading(true);
    setIntervalsPreview(null);
    try {
      const {data:{session}} = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please sign in again.');
      const response = await fetch('/api/intervals/activity-preview?days=7', {
        headers: {Authorization: `Bearer ${session.access_token}`},
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? 'Unable to retrieve activities');
      setIntervalsPreview({activities: data.activities ?? []});
    } catch (error) {
      setIntervalsPreview({error: error instanceof Error ? error.message : 'Preview failed'});
    } finally {
      setIntervalsLoading(false);
    }
  }
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
                <small>Zwift activity connection · read-only validation</small>
              </div>
              <button type="button" className="primary-button" disabled={intervalsLoading} onClick={() => void previewIntervals()}>
                {intervalsLoading ? 'Checking…' : 'Preview rides'}
              </button>
            </div>
            {intervalsPreview && (
              <div className="azur-intervals-preview" aria-live="polite">
                <strong>Intervals.icu activity preview — no import performed</strong>
                {intervalsPreview.error && <p role="alert">{intervalsPreview.error}</p>}
                {intervalsPreview.activities && intervalsPreview.activities.length === 0 && <p>No cycling activities returned for the last seven days.</p>}
                {intervalsPreview.activities?.map(activity => (
                  <article className="azur-intervals-preview-ride" key={String(activity.sourceId)}>
                    <strong>{activity.name || 'Cycling activity'}</strong>
                    <span>{activity.start || 'Unknown start'} · {activity.type || 'Ride'}</span>
                    <span>{activity.durationSec != null ? `${Math.round(activity.durationSec / 60)} min` : 'Duration unavailable'} · {activity.distanceMeters != null ? `${(activity.distanceMeters / 1000).toFixed(2)} km` : 'Distance unavailable'} · {activity.averageWatts != null ? `${activity.averageWatts} W avg` : 'Average power unavailable'}{activity.normalizedWatts != null ? ` · ${activity.normalizedWatts} W normalised` : ''}</span>
                    <small>{activity.status === 'candidate_match' ? 'Possible planned-session match — review required' : activity.status === 'already_imported' ? 'Already imported' : activity.status === 'possible_duplicate' ? 'Potential duplicate — review required' : activity.status === 'ambiguous_session' ? 'Multiple planned sessions — review required' : activity.status === 'unmatched_activity' ? 'Unmatched activity — review required' : 'Requires review'}{activity.reason ? ` · ${activity.reason}` : ''}</small>
                    {activity.sessionCandidates && activity.sessionCandidates.length > 0 && (
                      <div className="azur-intervals-review-candidates">
                        <span>Scheduled ride candidates ({activity.sessionCandidates.length}):</span>
                        {activity.sessionCandidates.map(candidate => <small key={candidate.id}>{candidate.title || 'Planned bike workout'}</small>)}
                      </div>
                    )}
                    <span className="azur-intervals-review-note">Review only · No completed workout or training load will be changed.</span>
                  </article>
                ))}
              </div>
            )}
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
async function handleRegister(event: React.FormEvent) {
  event.preventDefault();
  if (password.length < 12) { setAuthError('Use a password of at least 12 characters.'); return; }
  setAuthLoading(true); setAuthError(''); setRegistrationNotice('');
  const {data,error}=await supabase.auth.signUp({email:email.trim().toLowerCase(),password,options:{emailRedirectTo:window.location.origin+'/onboarding'}});
  if(error) setAuthError(error.message);
  else { setPassword(''); setRegistrationNotice(data.session ? 'Account created. Coach assignment and training-plan activation remain separate.' : 'Check your email to confirm your account, then sign in. Coach assignment follows separately.'); }
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
  async function handleManualCompletion() {
    if(!selected?.id || manualSaving)return;
    if(selected.status==='completed' && (!editableManualId || selected.completedSource!=='manual')){setManualMessage('Only a linked manual completion can be edited. Imported device activities remain protected.');return;}
    const latestAllowed=new Date();latestAllowed.setDate(latestAllowed.getDate()+1);
    const latestKey=[latestAllowed.getFullYear(),String(latestAllowed.getMonth()+1).padStart(2,'0'),String(latestAllowed.getDate()).padStart(2,'0')].join('-');
    if(!editableManualId && selected.plannedDate>latestKey){setManualMessage('This session is scheduled for a future date. You can record completion on the scheduled day or within the permitted early-completion window.');return;}
    const duration=Number(manualDuration),distance=manualDistance.trim()===''?null:Number(manualDistance);
    const rpe=Number(sessionFeedback.rpe);
    if(!Number.isFinite(duration)||duration<=0||duration>1440||!Number.isInteger(duration*60)||!Number.isInteger(rpe)||rpe<1||rpe>10|| (distance!==null&&(!Number.isFinite(distance)||distance<0||distance>1000))){setManualMessage('Enter actual duration, RPE 1–10 and an optional valid distance.');return;}
    setManualSaving(true);setManualMessage('');
    try{
      const {error}=await supabase.rpc(editableManualId?'athlete_edit_manual_completion':'athlete_record_manual_completion',{p_session_id:selected.id,p_duration_min:duration,p_distance_km:distance,p_rpe:rpe,p_notes:sessionFeedback.notes.trim()||null});
      if(error)throw error;
      setWeekSessions(previous=>previous.map(session=>session.id===selected.id?{...session,status:'completed' as const,completedDurationSec:Math.round(duration*60),completedDistanceM:distance===null?undefined:distance*1000,completedRpe:rpe,completedSource:'manual'}:session));
      setManualMessage(editableManualId?'Manual activity changes saved.':'Workout completed and saved to your calendar.');
      if(!editableManualId){setManualDuration('');setManualDistance('');}
      const {data:{user}}=await supabase.auth.getUser();
      if(user){try{await loadPlannedSessions(user.id);}catch(refreshError){console.warn('Calendar refresh after successful completion failed',refreshError);}}
    }catch(e){const message=e&&typeof e==='object'&&'message' in e?String(e.message):'Unable to save manual completion';setManualMessage(message);}
    finally{setManualSaving(false);}
  }
  async function handleSessionFeedbackSave() {
  const feedbackRpe=sessionFeedback.rpe.trim();
  if(feedbackRpe && (!Number.isInteger(Number(feedbackRpe))||Number(feedbackRpe)<1||Number(feedbackRpe)>10)){setSessionFeedbackMessage('Enter an RPE between 1 and 10.');return;}
  setSessionFeedbackSaving(true);
  setSessionFeedbackMessage('');

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    setSessionFeedbackSaving(false);
    setSessionFeedbackMessage('Please sign in again to save feedback.');
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
    setSessionFeedbackMessage(error.message || 'Unable to save feedback.');
    return;
  }

  setSessionFeedbackSaving(false);
  setSessionFeedbackMessage('Feedback saved.');
}
  if (window.location.pathname === '/privacy') {
  return <PrivacyPolicy />;
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
        <form className="login-card" onSubmit={registrationMode && betaRegistrationEnabled ? handleRegister : handleLogin}>
          <img
            src="/brand/azur-logo.png"
            alt="Azur Triathlon Coaching"
            className="login-logo"
          />

          <span className="eyebrow">{registrationMode && betaRegistrationEnabled ? 'AZUR BETA REGISTRATION' : 'ATHLETE LOGIN'}</span>

          <h2>{registrationMode ? 'Join AZUR' : 'Welcome to Azur'}</h2>

          <p>
            {registrationMode ? 'Create an athlete account. Registration does not automatically assign a coach, connect Garmin or activate a training plan.' : 'Sign in to access your training, performance and recovery data.'}
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
            {authLoading ? (registrationMode ? 'Creating account...' : 'Signing in...') : registrationMode ? 'Create athlete account' : 'Sign in'}
          </button>
        {betaRegistrationEnabled && <button type="button" className="azur-auth-switch" onClick={() => {setRegistrationMode(v=>!v);setAuthError('');setRegistrationNotice('');setPassword('');}}>{registrationMode ? 'Already registered? Sign in' : 'New to AZUR? Create an athlete account'}</button>}
          {registrationNotice && <p className="azur-registration-notice" role="status">{registrationNotice}</p>}
        </form>
        {betaRegistrationEnabled && registrationMode && <AthleteOnboardingDraft/>}
      </div>
    );
  }

  if (window.location.pathname === '/onboarding') {
    return <div className="login-screen"><div><AthleteOnboardingDraft /><CoachInvitations mode="athlete" /></div></div>;
  }

  return (
  <>
    <div className="app-shell">
      <style>{`
  .mobile-bottom-nav {
    display: none !important;
  }

  @media (max-width: 900px) {
    .sidebar {
      display: none !important;
    }

    .mobile-bottom-nav {
      display: flex !important;
    }

    .app-shell {
      display: block !important;
      width: 100% !important;
    }

    .app-shell > main {
      width: 100% !important;
      margin-left: 0 !important;
      padding-bottom: 110px !important;
    }
  }
`}</style>
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

      <main
  style={
    activeNav === 'Home'
      ? {
          paddingTop: 0,
        }
      : undefined
  }
>
        <header
  className="topbar"
style={
  activeNav === 'Home' || activeNav === 'Chat'
    ? {
        display: 'none',
      }
    : undefined
}
>
         {activeNav !== 'Home' && activeNav !== 'Chat' && (
  <div>
    <span className="eyebrow">
      {activeNav === 'Strava Feed'
        ? 'INTEGRATIONS'
        : 'WEEK 1 · BASE 1'}
    </span>

    <h2>{activeNav}</h2>

    <p>
      {activeNav === 'Strava Feed'
        ? 'Recent activities and sync status'
        : 'Aerobic consistency + durability'}
    </p>
  </div>
)}

<div
  className="topbar-actions"
  style={
    activeNav === 'Home'
      ? {
          width: '100%',
          justifyContent: 'flex-end',
          marginLeft: 'auto',
        }
      : undefined
  }
>
  {activeNav === 'Home' && HomeView()}
  
{activeNav !== 'Home' && activeNav !== 'Chat' && (
  <div className="race-countdown">
    <span className="eyebrow">
      DAYS TO{' '}
      {primaryRace.name
        ? primaryRace.name.toUpperCase()
        : 'A RACE'}
    </span>

    <strong>{daysToRace}</strong>
  </div>
)}

  <div
  className="account-menu"
  style={
    activeNav === 'Home'
      ? { display: 'none' }
      : undefined
  }
>
 <button
  className="account-button"
  onClick={() => setAccountOpen((current) => !current)}
  style={
    activeNav === 'Home'
      ? {
          padding: 0,
          width: '44px',
          height: '44px',
          minWidth: '44px',
          borderRadius: '50%',
          background: 'transparent',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }
      : undefined
  }
>
<div
  className="account-avatar"
  style={
    activeNav === 'Home'
      ? {
          width: '44px',
          height: '44px',
          minWidth: '44px',
          borderRadius: '50%',
          overflow: 'hidden',
          border: '2px solid #FFFFFF',
          boxShadow: '0 0 0 2px #208FD0',
        }
      : undefined
  }
>
  {avatarUrl ? (
    <img
      src={avatarUrl}
      alt={`${athleteName} profile`}
    />
  ) : (
    <User size={20} />
  )}
</div>

     <div
  className="account-copy"
  style={
    activeNav === 'Home'
      ? { display: 'none' }
      : undefined
  }
>
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
{activeNav === 'Home' && isCoachAccount && (
  <div style={{
    display: 'flex',
    gap: 8,
    padding: '12px 18px',
    background: '#071524',
    alignItems: 'center',
  }} aria-label="AZUR account mode">
    {(['athlete', 'coach'] as const).map((mode) => (
      <button
        key={mode}
        type="button"
        onClick={() => setHomeMode(mode)}
        aria-pressed={homeMode === mode}
        style={{
          flex: 1,
          padding: '11px 14px',
          borderRadius: 12,
          border: homeMode === mode ? '1px solid #258FD0' : '1px solid #274258',
          background: homeMode === mode ? '#123B5C' : '#0C2035',
          color: '#FFFFFF',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        {mode === 'athlete' ? 'Athlete Mode' : 'Coach Mode'}
      </button>
    ))}
  </div>
)}
{activeNav === 'Home' && isCoachAccount && homeMode === 'coach' && <div className="azur-coach-v2">
  <div className="azur-coach-hero"><div><span>AZUR / COACH WORKSPACE</span><h2>Coach Dashboard</h2><p>Athletes, reviews and coaching decisions in one place.</p></div></div>
  <nav className="azur-coach-tabs" aria-label="Coach workspace">
    <button type="button" aria-pressed={coachWorkspace==='overview'} onClick={()=>setCoachWorkspace('overview')}>Overview</button>
    <button type="button" aria-pressed={coachWorkspace==='monitoring'} onClick={()=>setCoachWorkspace('monitoring')}>Monitoring</button>
    <button type="button" aria-pressed={coachWorkspace==='library'} onClick={()=>setCoachWorkspace('library')}>Session library</button>
    <button type="button" aria-pressed={coachWorkspace==='invitations'} onClick={()=>setCoachWorkspace('invitations')}>Invitations</button>
  </nav>
  {coachWorkspace==='overview'&&<>
    <div className="azur-coach-kpis"><div><small>COACH WORKSPACE</small><strong>Squad overview</strong><span>Connected athletes and training priorities</span></div><button type="button" onClick={()=>setCoachWorkspace('invitations')}>+ Invite athlete</button></div>
    <CoachAthleteRoster onSelect={setCoachSelectedAthlete} selectedAthleteId={coachSelectedAthlete?.id ?? null}/>
    {coachSelectedAthlete&&<CoachAthletePerformance athlete={coachSelectedAthlete}/>}
    <div className="azur-coach-shortcuts">
      <button type="button" onClick={()=>setCoachWorkspace('monitoring')}>Training monitoring <span>View signals →</span></button>
      <button type="button" onClick={()=>setCoachWorkspace('library')}>Cycling session review <span>Open library →</span></button>
      <button type="button" onClick={()=>setCoachWorkspace('invitations')}>Invite athletes <span>Manage invites →</span></button>
    </div>
  </>}
  {coachWorkspace==='monitoring'&&<CoachAttentionInbox onSelect={(a)=>{setCoachSelectedAthlete(a);setCoachWorkspace('overview')}}/>}
  {coachWorkspace==='invitations'&&<CoachInvitations mode="coach"/>}
  {coachWorkspace==='library'&&<CoachCyclingLibraryReview ftpWatts={coachSelectedAthlete?.ftp_w ?? null} athleteName={coachSelectedAthlete?.display_name ?? null} athleteWeeklyHours={coachSelectedAthlete?.normal_weekly_hours ?? null} athleteId={coachSelectedAthlete?.id ?? null}/>}
</div>}
{activeNav === 'Home' && (!isCoachAccount || homeMode === 'athlete') && HomeView()}
{activeNav === 'Chat' && (
  <section
    style={{
      minHeight: 'calc(100vh - 90px)',
      padding: 0,
      paddingBottom: '88px',
      background: '#F5F8FB',
    }}
  >
    <div
      style={{
        padding: '18px 18px 16px',
        background: '#071524',
        color: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
     <div
  style={{
    width: '42px',
    height: '42px',
    borderRadius: '50%',
    overflow: 'hidden',
    background: '#FFFFFF',
    border: '1px solid rgba(255,255,255,0.18)',
    flexShrink: 0,
  }}
>
  <img
    src="/brand/azur-logo.png"
    alt="Azur"
    style={{
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      display: 'block',
    }}
  />
</div>

      <div>
        <div
          style={{
            fontSize: '17px',
            fontWeight: 700,
          }}
        >
          Ask Azur
        </div>

        <div
          style={{
            marginTop: '2px',
            fontSize: '11px',
            color: '#5FD08A',
            fontWeight: 700,
          }}
        >
          ● Online
        </div>
      </div>
    </div>

    <div
      style={{
        padding: '18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {chatMessages.map((message) => (
        <div
          key={message.id}
          style={{
            display: 'flex',
            justifyContent:
              message.role === 'user'
                ? 'flex-end'
                : 'flex-start',
          }}
        >
          <div
            style={{
              maxWidth: '82%',
              padding: '11px 13px',
              borderRadius:
                message.role === 'user'
                  ? '16px 16px 4px 16px'
                  : '16px 16px 16px 4px',
              background:
                message.role === 'user'
                  ? '#0A3556'
                  : '#FFFFFF',
              color:
                message.role === 'user'
                  ? '#FFFFFF'
                  : '#17324D',
              border:
                message.role === 'user'
                  ? 'none'
                  : '1px solid #E2EAF0',
              fontSize: '14px',
              lineHeight: 1.5,
            }}
          >
            {message.text}
          </div>
        </div>
      ))}

      {chatMessages.length === 1 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            marginTop: '4px',
          }}
        >
          {[
            "Why has today's session changed?",
            "How should I fuel Saturday's ride?",
            "Can I move tomorrow's run?",
            'Explain my training load',
          ].map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => setChatMessage(question)}
              style={{
                padding: '8px 10px',
                borderRadius: '18px',
                border: '1px solid #CFE0EC',
                background: '#FFFFFF',
                color: '#1673AE',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {question}
            </button>
          ))}
        </div>
      )}
    </div>

    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: '72px',
        padding: '10px 12px',
        background: 'rgba(255,255,255,0.96)',
        borderTop: '1px solid #E1E8EF',
        backdropFilter: 'blur(14px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          maxWidth: '900px',
          margin: '0 auto',
        }}
      >
        <input
          value={chatMessage}
          onChange={(event) =>
            setChatMessage(event.target.value)
          }
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              chatMessage.trim()
            ) {
              const message = chatMessage.trim();

              setChatMessages((current) => [
                ...current,
                {
                  id: Date.now(),
                  role: 'user',
                  text: message,
                },
                {
                  id: Date.now() + 1,
                  role: 'assistant',
                  text:
                  getAzurChatReply(message)
                },
              ]);

              setChatMessage('');
            }
          }}
          placeholder="Ask Azur..."
          style={{
            flex: 1,
            height: '44px',
            padding: '0 14px',
            borderRadius: '22px',
            border: '1px solid #D8E3EB',
            background: '#F7FAFC',
            color: '#17324D',
            fontSize: '14px',
            outline: 'none',
          }}
        />

        <button
          type="button"
          onClick={() => {
            const message = chatMessage.trim();

            if (!message) {
              return;
            }

            setChatMessages((current) => [
              ...current,
              {
                id: Date.now(),
                role: 'user',
                text: message,
              },
              {
                id: Date.now() + 1,
                role: 'assistant',
                text:
                  getAzurChatReply(message)
              },
            ]);

            setChatMessage('');
          }}
          style={{
            width: '44px',
            height: '44px',
            flexShrink: 0,
            borderRadius: '50%',
            border: 'none',
            background: '#1673AE',
            color: '#FFFFFF',
            fontSize: '18px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          ↑
        </button>
      </div>
    </div>
  </section>
)}
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

    <nav
      className="mobile-bottom-nav"
  style={{
  position: 'fixed',
left: 0,
right: 0,
width: '100%',
margin: 0,
transform: 'none',
    boxSizing: 'border-box',
left: 0,
right: 0,
bottom: 0,
padding: '5px 8px calc(5px + env(safe-area-inset-bottom))',
background: 'rgba(12,27,45,0.97)',
border: '1px solid rgba(91,143,185,0.26)',
borderRadius: '18px 18px 0 0',
boxShadow: '0 -10px 30px rgba(0, 4, 13, 0.38)',
backdropFilter: 'blur(18px)',
  }}
>
  {mobileNavigation.map(([Icon, label]) => {
    const targetNav =
      label === 'More'
        ? 'Profile'
        : label;

    const isActive =
      activeNav === targetNav ||
      (label === 'More' &&
        !['Home', 'Calendar', 'Chat', 'Performance'].includes(
          activeNav,
        ));

    return (
      <button
        key={label}
        type="button"
        onClick={() => setActiveNav(targetNav)}
      style={{
  flex: 1,
  minWidth: 0,
  padding: '5px 7px',
  border: 'none',
  borderRadius: '12px',

  background: isActive
    ? 'rgba(30, 107, 155, 0.27)'
    : 'transparent',

  boxShadow: isActive
    ? 'inset 0 0 0 1px rgba(58,173,229,0.34)'
    : 'none',

  color: isActive
    ? '#81D3FF'
    : '#A3B8CD',

  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  cursor: 'pointer',
}}
      >
        <Icon size={19} />

        <span
          style={{
            fontSize: '10px',
            fontWeight: isActive ? 700 : 600,
          }}
        >
          {label}
        </span>
      </button>
    );
  })}
</nav>
  </>
);
}
