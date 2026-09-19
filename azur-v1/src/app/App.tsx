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
  Medal,
  RefreshCw,
  Save,
  TrendingUp,
  Unlock,
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
  const [decision, setDecision] = useState<
    'pending' | 'accepted' | 'rejected'
  >('pending');
async function loadAthleteProfile(userId: string) {
  const { data, error } = await supabase
    .from('athlete_profile')
    .select(
      'display_name, ftp_w, run_threshold_sec_per_km, swim_threshold_sec_per_100m, weight_kg, target_weight_kg'
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
  setAthleteProfile({
    ftp: data?.ftp_w ?? null,
    runThreshold: data?.run_threshold_sec_per_km ?? null,
    swimThreshold: data?.swim_threshold_sec_per_100m ?? null,
    weight: data?.weight_kg ?? null,
    targetWeight: data?.target_weight_kg ?? null,
  });
}
useEffect(() => {
supabase.auth.getSession().then(({ data }) => {
  setIsAuthenticated(!!data.session);

if (data.session?.user) {
  loadAthleteProfile(data.session.user.id);
  loadPrimaryRace(data.session.user.id);
}

  setAuthReady(true);
});

  const {
    data: { subscription },
  } supabase.auth.onAuthStateChange((_event, session) => {
  setIsAuthenticated(!!session);

if (session?.user) {
  loadAthleteProfile(session.user.id);
  loadPrimaryRace(session.user.id);
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

  const totalMinutes = useMemo(
    () =>
      weekSessions.reduce(
        (total, session) => total + session.durationMin,
        0,
      ),
    [weekSessions],
  );

  const totalHours = totalMinutes / 60;

  const daysToRoth = Math.max(
    0,
    Math.ceil(
      (new Date('2027-07-04').getTime() - new Date().getTime()) /
        86400000,
    ),
  );

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

  function HomeView() {
    return (
      <>
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

        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">CURRENT WEEK</span>
              <h3>{totalHours.toFixed(1)} hours planned</h3>
            </div>

            <span className="status-pill">
              Long-course foundation
            </span>
          </div>

          <div className="session-strip">
            {days.map((day) => {
              const daySessions = weekSessions.filter(
                (session) => session.dayLabel === day,
              );

              const duration = daySessions.reduce(
                (total, session) => total + session.durationMin,
                0,
              );

              return (
                <article
                  key={day}
                  className="session-card"
                  onClick={() => {
                    if (daySessions[0]) {
                      setSelectedId(daySessions[0].id);
                      setActiveNav('Calendar');
                    }
                  }}
                >
                  <span className="day">{day}</span>

                  <strong>
                    {daySessions.length
                      ? daySessions
                          .map((session) => session.title)
                          .join(' + ')
                      : 'Recovery'}
                  </strong>

                  <small>{formatDuration(duration)}</small>

                  {daySessions.length > 0 && (
                    <span className="priority">
                      {daySessions.some(
                        (session) => session.priority === 1,
                      )
                        ? 'P1'
                        : 'P2'}
                    </span>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <div className="two-column">
          <section className="panel">
            <span className="eyebrow">TOP 3 PRIORITIES</span>
            <h3>This week</h3>

            <div className="priority-list">
              <div>
                <span>01</span>
                <div>
                  <strong>Run durability</strong>
                  <small>
                    Current biggest long-course opportunity
                  </small>
                </div>
              </div>

              <div>
                <span>02</span>
                <div>
                  <strong>Bike durability</strong>
                  <small>
                    Extend stable output late in long rides
                  </small>
                </div>
              </div>

              <div>
                <span>03</span>
                <div>
                  <strong>Maintain threshold</strong>
                  <small>
                    Fitness is strong enough to preserve
                  </small>
                </div>
              </div>
            </div>
          </section>

          <section className="panel coach-decision">
            <span className="eyebrow">
              LATEST COACH DECISION
            </span>

            <h3>Continue as planned</h3>

            <p>
              Recovery is stable and current training stress remains
              appropriate for this phase.
            </p>

            <button onClick={() => setActiveNav('Weekly Review')}>
              View rationale
            </button>
          </section>
        </div>
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
                        onClick={() => setSelectedId(session.id)}
                      >
                        <div className="calendar-session-top">
                          <span>{sportName(session.sport)}</span>

                          {session.locked && <Lock size={13} />}
                        </div>

                        <strong>{session.title}</strong>

                        <small>
                          {formatDuration(session.durationMin)} · P
                          {session.priority}
                        </small>

                        <span>
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

        <aside className="editor-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">SESSION EDITOR</span>
              <h3>{selected.title}</h3>
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
            <label>
              <span>Duration</span>

              <input
                type="number"
                value={selected.durationMin}
                disabled={selected.locked}
                onChange={(event) =>
                  updateDuration(Number(event.target.value))
                }
              />
            </label>

            <label className="wide">
              <span>Primary target</span>

              <input
                value={
                  Object.values(selected.targets)[0]?.toString() ||
                  ''
                }
                disabled
              />
            </label>

            <label className="wide">
              <span>Why this matters</span>

              <textarea
                rows={5}
                value={selected.rationale || ''}
                disabled
              />
            </label>
          </div>

          <div className="version-note">
            <span className="eyebrow">VERSION</span>
            <strong>v{selected.version}</strong>
            <small>
              Original prescription remains preserved.
            </small>
          </div>

          <button className="primary-button">
            <Save size={17} />
            Save revision
          </button>
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
              A RACE · 4 JULY 2027
            </span>

            <h3>Challenge Roth</h3>

            <p>Primary full-distance target · Sub-9 hours</p>
          </div>

          <div className="race-total">
            <span>Target</span>
            <strong>&lt; 9:00</strong>
            <small>{daysToRoth} days remaining</small>
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
              <strong>1:00</strong>
              <small>
                Controlled start and efficient rhythm.
              </small>
            </div>

            <div>
              <span>Bike</span>
              <strong>4:30</strong>
              <small>
                Race-relevant range around 221–239 W.
              </small>
            </div>

            <div>
              <span>Run</span>
              <strong>2:55</strong>
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

          <strong>Challenge Roth</strong>

          <small>4 July 2027 · Sub-9</small>
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

          <div className="race-countdown">
            <span className="eyebrow">
              DAYS TO ROTH
            </span>

            <strong>{daysToRoth}</strong>
          </div>
        </header>

        {activeNav === 'Home' && <HomeView />}
        {activeNav === 'Calendar' && <CalendarView />}
        {activeNav === 'Performance' && <PerformanceView />}
        {activeNav === 'Recovery' && <RecoveryView />}
        {activeNav === 'Races' && <RacesView />}
        {activeNav === 'Benchmarks' && <BenchmarksView />}
        {activeNav === 'Weekly Review' && <WeeklyReviewView />}
        {activeNav === 'Data Sources' && <DataSourcesView />}
      </main>
    </div>
  );
}
