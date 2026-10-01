import { useEffect, useMemo, useRef, useState } from 'react';
import FitParser from 'fit-file-parser';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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

type Session = PlannedSession & {
  dayLabel: string;
  accent: string;

  completedDurationSec?: number;
  completedDistanceM?: number;
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
const [nextSessionDecision, setNextSessionDecision] =
  useState<'accepted' | 'kept' | null>(null);const [sessionFeedbackSaving, setSessionFeedbackSaving] = useState(false);
  const [isSavingAdjustment, setIsSavingAdjustment] =
  useState(false);
  const [confirmedMatchSessionId, setConfirmedMatchSessionId] =
  useState<string | null>(null);
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
  'id, planned_session_id, sport, start_time, duration_sec, distance_m, source, processed_metrics, raw_payload, match_confidence'
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
if (
  nextPlannedSession.prescription?.azur_adaptation?.status === 'accepted'
) {
  return {
    action:
      nextPlannedSession.prescription.azur_adaptation.action ?? 'KEEP',
    title: 'Adjustment already applied',
    recommendedDurationMin:
      nextPlannedSession.prescription.azur_adaptation.recommended_duration_min ??
      nextPlannedSession.durationMin,
    adjustment:
      `${nextPlannedSession.prescription.azur_adaptation.original_duration_min} min → ${nextPlannedSession.prescription.azur_adaptation.recommended_duration_min} min`,
    reason:
      'Azur has already applied an accepted adjustment to this session, so no further change is being recommended.',
  };
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
    monday.getDate() - daysFromMonday,
  );

  const toDateKey = (date: Date) =>
    `${date.getFullYear()}-${String(
      date.getMonth() + 1,
    ).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`;

  const weekStart = toDateKey(monday);
const { data: seasonWeek, error: seasonWeekError } =
  await supabase
    .from('season_week')
    .select('id, phase, target_hours')
    .eq('athlete_id', athlete.id)
    .eq('week_start', weekStart)
    .single();

if (seasonWeekError || !seasonWeek) {

  return;
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
    'weekly_hours, sessions_per_week, swims_per_week, longest_ride_minutes, longest_run_minutes',
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

const recommendedSessionCount =
  recentTotalFrequency > 0
    ? Math.min(
        6,
        Math.max(
          3,
          Math.ceil(recentTotalFrequency + 0.5),
        ),
      )
    : 6;
const phase =
  String(seasonWeek.phase ?? 'Base 1');

const phaseKey = phase.toLowerCase();
const shouldIncludeEasyRun =
  recommendedSessionCount >= 5;
    const shouldIncludeSecondSwim =
  !phaseKey.includes('recovery') &&
  recommendedSessionCount >= 6 &&
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
  Math.min(
    targetHours,
    safeProgressionHours,
  );

const targetMinutes =
  Math.round(plannedHours * 60);

const phaseConfig =
  phaseKey.includes('build')
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
    const activeWeightTotal =
  phaseConfig.swim1Weight +
  phaseConfig.bikeQualityWeight +
  (shouldIncludeEasyRun
  ? phaseConfig.easyRunWeight
  : 0) +
  (shouldIncludeSecondSwim
    ? phaseConfig.swim2Weight
    : 0) +
  phaseConfig.longRideWeight +
  phaseConfig.longRunWeight;

const adjustedWeight = (weight: number) =>
  weight / activeWeightTotal;
const swim1Minutes =
  Math.round(
    targetMinutes *
      adjustedWeight(phaseConfig.swim1Weight),
  );

const bikeQualityMinutes =
  Math.round(
    targetMinutes *
      adjustedWeight(phaseConfig.bikeQualityWeight),
  );

const easyRunMinutes =
  shouldIncludeEasyRun
    ? Math.round(
        targetMinutes *
          adjustedWeight(phaseConfig.easyRunWeight),
      )
    : 0;

const swim2Minutes =
  shouldIncludeSecondSwim
    ? Math.round(
        targetMinutes *
          adjustedWeight(phaseConfig.swim2Weight),
      )
    : 0;

const plannedLongRideMinutes =
  Math.round(
    targetMinutes *
      adjustedWeight(phaseConfig.longRideWeight),
  );

const longRideMinutes =
  longestRecentRideMinutes > 0
    ? Math.min(
        plannedLongRideMinutes,
        Math.round(longestRecentRideMinutes * 1.12),
      )
    : plannedLongRideMinutes;

const plannedLongRunMinutes =
  Math.round(
    targetMinutes *
      adjustedWeight(phaseConfig.longRunWeight),
  );

const longRunMinutes =
  longestRecentRunMinutes > 0
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

const bikeIntervalReps = 4;
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
  phaseKey.includes('build') ||
  phaseKey.includes('peak')
    ? Math.round(longRideMainMinutes * 0.6)
    : longRideMainMinutes;

const longRideSpecificMinutes =
  phaseKey.includes('build') ||
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
  phaseKey.includes('build') ||
  phaseKey.includes('peak')
    ? Math.round(longRunMainMinutes * 0.7)
    : longRunMainMinutes;

const longRunSpecificMinutes =
  phaseKey.includes('build') ||
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
      title: 'Threshold Development',
      session_class: 'intensity',
      priority: 1,
duration_min: bikeQualityMinutes,
      targets: {},
      prescription: {
       focus:
  phaseKey.includes('build')
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
  phaseKey.includes('peak')
    ? '85–92%'
    : phaseKey.includes('recovery')
      ? '60–70%'
      : phaseKey.includes('build')
        ? '95–100%'
        : '80–90%',

target:
  phaseKey.includes('peak')
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
      rationale:
        'Develop sustainable threshold power.',
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
      title: 'Long Aerobic Ride',
      session_class: 'endurance',
      priority: 1,
duration_min: longRideMinutes,
      targets: {},
prescription: {
  focus:
    phaseKey.includes('peak')
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
        'Develop long-course aerobic durability.',
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
  phaseKey.includes('peak')
    ? 'Race-Specific Long Run'
    : phaseKey.includes('recovery')
      ? 'Reduced Aerobic Run'
      : 'Long Aerobic Run',

session_class:
  phaseKey.includes('peak')
    ? 'race_specific'
    : phaseKey.includes('recovery')
      ? 'easy'
      : 'endurance',
      priority: 1,
duration_min: longRunMinutes,
      targets: {},
      prescription: {
        focus: 'Aerobic endurance',
main_set: [
  {
    duration_min: longRunMinutes,
    target:
      phaseKey.includes('peak')
        ? 'Race-specific aerobic'
        : phaseKey.includes('recovery')
          ? 'Easy recovery'
          : 'Easy aerobic',
    rpe: '4–5',
  },
],
      },
      rationale:
        'Build durable run endurance at controlled intensity.',
      terrain: 'Mixed',
      status: 'planned',
      locked: false,
      version: 1,
      is_active_version: true,
    },
  ];
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
});  
  console.log(
    'AZUR PLAN PREVIEW — nothing saved',
    generatedSessions,
  );

  return;
}

const { error: insertError } = await supabase
  .from('planned_session')
  .insert(generatedSessions);

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
  const [planPreviewInsights, setPlanPreviewInsights] =
  useState<{
    phase: string;
    targetHours: number;
    plannedHours: number;
    recommendedSessionCount: number;
    historySource: 'confirmed' | 'recorded';
  } | null>(null);
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
    sessionsPerWeek: '',
    swimsPerWeek: '',
    longestRideMinutes: '',
    longestRunMinutes: '',
  });
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
      'weekly_hours, sessions_per_week, swims_per_week, longest_ride_minutes, longest_run_minutes',
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
    sessionsPerWeek: String(data.sessions_per_week),
    swimsPerWeek: String(data.swims_per_week),
    longestRideMinutes: String(data.longest_ride_minutes),
    longestRunMinutes: String(data.longest_run_minutes),
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
    window.alert('Please enter valid values in all five fields.');
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
        sessions_per_week: sessions,
        swims_per_week: swims,
        longest_ride_minutes: longestRide,
        longest_run_minutes: longestRun,
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
  function HomeView() {
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

<div style={{ margin: '16px 0' }}>
  <button
    type="button"
    onClick={() => void generateCurrentWeekPlan(true)}
    style={{
      padding: '12px 20px',
      borderRadius: '10px',
      background: '#153E63',
      color: '#FFFFFF',
      fontWeight: 600,
      cursor: 'pointer',
    }}
  >
    Preview Adaptive Training Plan
  </button>
  <div style={{ margin: '12px 0' }}>
  <button
    type="button"
    onClick={() =>
      setShowBaselineForm((current) => !current)
    }
    style={{
      padding: '12px 20px',
      borderRadius: '10px',
      background: '#FFFFFF',
      color: '#153E63',
      border: '1px solid #153E63',
      fontWeight: 600,
      cursor: 'pointer',
    }}
  >
    {showBaselineForm
      ? 'Close Training Baseline'
      : 'Set Training Baseline'}
  </button>
</div>
</div>
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

  .azur-baseline-form .azur-baseline-fields input {
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
    <h3 style={{ color: '#17324D', marginTop: 0 }}>
      Your Proposed Training Week
    </h3>

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
      Your current training baseline is{' '}
      <strong>
        {planPreviewInsights.plannedHours.toFixed(1)}
        {' '}hours per week
      </strong>.
      {' '}Your longer-term training target is{' '}
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
      {planPreview.map((session, index) => (
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
  {session.sport.toUpperCase()} ·{' '}
  {session.duration_min} MIN
</div>

          <p
            style={{
              color: '#52677B',
              marginBottom: 0,
            }}
          >
            {session.rationale}
          </p>
        </div>
      ))}
    </div>

    <p style={{ marginTop: '20px', color: '#52677B' }}>
      Preview only — your existing training plan
      remains unchanged.
    </p>
  </section>
)}
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
        {activity.source === 'manual_fit'
          ? 'Garmin FIT Activity'
          : 'Completed Activity'}
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
    .limit(1);

if (matchingSessionError) {
  console.error(
    'Unable to match completed activity to planned session:',
    matchingSessionError,
  );
}

const matchedPlannedSessionId =
  matchingSessions?.[0]?.id ?? null;
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

        {activeNav === 'Home' && HomeView()}
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
