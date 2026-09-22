import { useEffect, useMemo, useState } from 'react';

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
} from 'lucide-react';

import type { PlannedSession, Sport } from '../domain/types';
import { supabase } from '../lib/supabase';



const navigation = [
  [Home, 'Home'],
  [CalendarDays, 'Calendar'],
  [TrendingUp, 'Performance'],
  [HeartPulse, 'Recovery'],
  [Medal, 'Races'],
  [Gauge, 'Benchmarks'],
  [Activity, 'Weekly Review'],
  [Database, 'Data Sources'],
] as const;

type Session = PlannedSession & {
  dayLabel: string;
  accent: string;

  completedDurationSec?: number;
  completedDistanceM?: number;

  completedMetrics?: {
    averagePower?: number;
    normalizedPower?: number;
    averageHeartRate?: number;
    maxHeartRate?: number;
    calories?: number;
    trainingLoad?: number;
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

function ProgressRow({
  label,
  value,
  text,
}: {
  label: string;
  value: number;
  text: string;
}) {
  return (
    <div className="progress-row">
      <div className="progress-copy">
        <strong>{label}</strong>
        <small>{text}</small>
      </div>

      <div className="progress-track">
        <span style={{ width: `${value}%` }} />
      </div>

      <b>{value}%</b>
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
  const [weekVersion, setWeekVersion] = useState(1);
const [sessionFeedback, setSessionFeedback] = useState({
  rpe: '',
  notes: '',
});

const [sessionFeedbackSaving, setSessionFeedbackSaving] = useState(false);
const [sessionFeedbackMessage, setSessionFeedbackMessage] = useState('');
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
  'planned_session_id, duration_sec, distance_m, processed_metrics',
)
      .eq('athlete_id', athlete.id)
      .not('planned_session_id', 'is', null);

  if (completedError) {
    console.error(
      'Unable to load completed activities:',
      completedError,
    );
  }

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

      <h2>{primaryRace.name || 'Challenge Roth'}</h2>

      <div className="race-hero-meta">
        <span>BASE PHASE</span>
        <span>{totalHours.toFixed(1)}h planned this week</span>
      </div>
    </div>
  </div>
</section>
        <section className="hero-grid">
          <div className="readiness-panel green">
            <span className="eyebrow light">DAILY READINESS</span>
            <strong>GREEN</strong>
            <p>Recovery signals are broadly stable.</p>
          </div>

          <Metric
            label="RACE READINESS"
            value="62%"
            hint="+2 points this week"
          />

          <Metric label="FITNESS" value="74" hint="Long-term load" />

          <Metric
            label="FORM"
            value="-8"
            hint="Productive, not fresh"
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
  Today’s threshold session builds sustainable bike power
  while improving your ability to hold it late in
  long-course racing.
</p>

          <div className="coach-insight-focus">
            <div>
              <span>FOCUS</span>
            <strong>Threshold power</strong>
            </div>

            <div>
              <span>LONG-TERM BENEFIT</span>
              <strong>Race-day durability</strong>
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
          <section className="panel calendar-toolbar">
            <div>
              <span className="eyebrow">ACTIVE WEEK</span>
              <h3>21–27 September 2026</h3>
              <small>
                Base 1 · Long-course foundation · Plan v
                {weekVersion}
              </small>
            </div>
          </section>

          <section className="panel calendar-grid">
            {days.map((day) => {
              const daySessions = weekSessions.filter(
                (session) => session.dayLabel === day,
              );

              return (
                <div className="calendar-day" key={day}>
                  <div className="calendar-day-head">
                    <span>{day}</span>
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

  setTimeout(() => {
    document
      .getElementById('session-editor')
      ?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
  }, 50);
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
            })}
          </section>
        </div>

        <aside
  id="session-editor"
  className="editor-panel"
>
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
          <span>EXECUTION</span>
          <strong>On target</strong>
        </div>
      </div>
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
    );
  }

  function PerformanceView() {
    return (
      <>
        <section className="hero-grid">
          <Metric
            label="FITNESS · CTL"
            value="74"
            hint="+3 over four weeks"
          />

          <Metric
            label="FATIGUE · ATL"
            value="82"
            hint="Elevated after current block"
          />

          <Metric
            label="FORM · TSB"
            value="-8"
            hint="Productive training range"
          />

          <Metric
            label="WEEKLY LOAD"
            value="612"
            hint="Inside Base 1 target range"
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
                value={68}
                text="Threshold strong · durability building"
              />

              <ProgressRow
                label="Run"
                value={59}
                text="Primary opportunity: late-run durability"
              />

              <ProgressRow
                label="Swim"
                value={64}
                text="Consistency improving"
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
                <strong>72%</strong>
                <span>Easy / endurance</span>
              </div>

              <div>
                <strong>18%</strong>
                <span>Threshold / quality</span>
              </div>

              <div>
                <strong>10%</strong>
                <span>Race specific</span>
              </div>
            </div>

            <p className="panel-note">
              The current block is intentionally aerobic dominant.
              Threshold is maintained while durability gradually
              increases.
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
          <div className="readiness-panel green">
            <span className="eyebrow light">
              TODAY'S READINESS
            </span>

            <strong>GREEN</strong>

            <p>
              Proceed with the planned training unless subjective feel
              changes.
            </p>
          </div>

          <Metric
            label="HRV"
            value="+4%"
            hint="vs 30-day baseline"
          />

          <Metric
            label="RESTING HR"
            value="-2 bpm"
            hint="vs baseline"
          />

          <Metric
            label="SLEEP"
            value="7h 42m"
            hint="+18m vs baseline"
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
                <CheckCircle2 size={18} />
                <div>
                  <strong>HRV stable</strong>
                  <small>
                    No multi-day suppression pattern.
                  </small>
                </div>
              </div>

              <div>
                <CheckCircle2 size={18} />
                <div>
                  <strong>Sleep adequate</strong>
                  <small>
                    Supports the current training block.
                  </small>
                </div>
              </div>

              <div>
                <AlertTriangle size={18} />
                <div>
                  <strong>Fatigue elevated</strong>
                  <small>
                    Expected following cumulative training.
                  </small>
                </div>
              </div>
            </div>
          </section>

          <section className="panel">
            <span className="eyebrow">
              RECOVERY WARNING
            </span>

            <h3>No active warning</h3>

            <p className="panel-note">
              Azur will strengthen warnings when poor recovery signals
              persist for multiple days or combine with unusually high
              RPE, training load or a reported niggle.
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
  {primaryRace.priority || 'A'} RACE ·{' '}
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

            <p>Primary full-distance target · Sub-9 hours</p>
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

          <h3>Roth race model</h3>

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
                Race-relevant range around 221–239 W.
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
              <strong>~10m</strong>
              <small>
                Efficient execution across T1 and T2.
              </small>
            </div>
          </div>
        </section>

        <div className="two-column">
          <section className="panel">
            <span className="eyebrow">PREP RACE</span>
            <h3>Ironman 70.3 Bolton</h3>

            <p className="panel-note">
              June 2027 · B race used to test pacing, race execution
              and durability.
            </p>
          </section>

          <section className="panel">
            <span className="eyebrow">
              POST-ROTH BUILD
            </span>

            <h3>Ironman Leeds</h3>

            <p className="panel-note">
              Recovery → Easy aerobic → Reintroduce intensity →
              Leeds-specific rebuild.
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
          label="COACH DECISION"
          value="CONTINUE"
          hint="Current recommendation"
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

        <h3>Continue the current load</h3>

        <p>
          <strong>Why:</strong> recovery markers are stable and
          current training stress remains appropriate for Base 1.
        </p>

        <p>
          <strong>Long-term benefit:</strong> consistent aerobic work
          now gives us more room to introduce race-specific stress
          later without forcing large jumps in load.
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

            <div className="source-row">
              <div>
                <strong>Strava</strong>
                <small>Secondary activity source</small>
              </div>

              <span className="source-state">Optional</span>

              <small>Not connected</small>
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
              WEEK 1 · BASE 1
            </span>

<h2>
  {activeNav === 'Home'
    ? `Good morning, ${athleteName}.`
    : activeNav}
</h2>

            <p>Aerobic consistency + durability</p>
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
      </main>
    </div>
  );
}
