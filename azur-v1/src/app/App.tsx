import { useMemo, useState } from 'react';
import {
  Activity,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
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

const nav = [
  [Home, 'Home'],
  [CalendarDays, 'Calendar'],
  [TrendingUp, 'Performance'],
  [HeartPulse, 'Recovery'],
  [Medal, 'Races'],
  [Gauge, 'Benchmarks'],
  [Activity, 'Weekly Review'],
  [Database, 'Data Sources'],
] as const;

type SessionWithDay = PlannedSession & { dayLabel: string; accent: string };

type WeekState = {
  id: string;
  label: string;
  dateRange: string;
  phase: string;
  targetHours: number;
  raceFocus: string;
  locked: boolean;
  version: number;
  sessions: SessionWithDay[];
};

const baseSessions: SessionWithDay[] = [
  {
    id: 'mon-swim', seasonWeekId: 'w1', plannedDate: '2026-09-21', sport: 'swim', title: 'Aerobic Technique Swim',
    sessionClass: 'easy', priority: 2, durationMin: 45, targets: { rpe: '4–5' }, prescription: {}, rationale: 'Low-cost aerobic work and technique quality.', terrain: 'Pool', status: 'planned', locked: false, version: 1,
    dayLabel: 'MON', accent: 'swim'
  },
  {
    id: 'mon-run', seasonWeekId: 'w1', plannedDate: '2026-09-21', sport: 'run', title: 'Easy Aerobic Run',
    sessionClass: 'easy', priority: 3, durationMin: 40, targets: { pace: '4:15–4:40/km' }, prescription: {}, rationale: 'Adds frequency without compromising Tuesday.', terrain: 'Flat', status: 'planned', locked: false, version: 1,
    dayLabel: 'MON', accent: 'run'
  },
  {
    id: 'tue-bike', seasonWeekId: 'w1', plannedDate: '2026-09-22', sport: 'bike', title: 'Threshold Development',
    sessionClass: 'intensity', priority: 1, durationMin: 100, targets: { power: '4×10 min @ 299–315 W' }, prescription: {}, rationale: 'Raises power ceiling so full-distance power costs less physiologically.', terrain: 'Indoor / Road', status: 'planned', locked: true, version: 1,
    dayLabel: 'TUE', accent: 'bike'
  },
  {
    id: 'wed-run', seasonWeekId: 'w1', plannedDate: '2026-09-23', sport: 'run', title: 'Controlled Threshold Run',
    sessionClass: 'intensity', priority: 1, durationMin: 70, targets: { pace: '3×12 min @ 3:32–3:40/km' }, prescription: {}, rationale: 'Develops threshold strength while protecting long-course durability.', terrain: 'Flat / Rolling', status: 'planned', locked: false, version: 1,
    dayLabel: 'WED', accent: 'run'
  },
  {
    id: 'wed-swim', seasonWeekId: 'w1', plannedDate: '2026-09-23', sport: 'swim', title: 'Aerobic Swim',
    sessionClass: 'endurance', priority: 2, durationMin: 45, targets: { rpe: '5' }, prescription: {}, rationale: 'Adds aerobic volume without impact.', terrain: 'Pool', status: 'planned', locked: false, version: 1,
    dayLabel: 'WED', accent: 'swim'
  },
  {
    id: 'thu-bike', seasonWeekId: 'w1', plannedDate: '2026-09-24', sport: 'bike', title: 'Strength Endurance Bike',
    sessionClass: 'endurance', priority: 1, durationMin: 85, targets: { power: '3×15 min @ 258–277 W' }, prescription: {}, rationale: 'Builds sustainable torque without turning Thursday into another threshold day.', terrain: 'Road / Indoor', status: 'planned', locked: false, version: 1,
    dayLabel: 'THU', accent: 'bike'
  },
  {
    id: 'thu-run', seasonWeekId: 'w1', plannedDate: '2026-09-24', sport: 'run', title: 'Easy Off-Bike Run',
    sessionClass: 'easy', priority: 3, durationMin: 30, targets: { pace: '4:15–4:40/km' }, prescription: {}, rationale: 'Improves resilience with minimal training cost.', terrain: 'Flat', status: 'planned', locked: false, version: 1,
    dayLabel: 'THU', accent: 'run'
  },
  {
    id: 'fri-swim', seasonWeekId: 'w1', plannedDate: '2026-09-25', sport: 'swim', title: 'Endurance Swim',
    sessionClass: 'endurance', priority: 2, durationMin: 70, targets: { rpe: '5–6' }, prescription: {}, rationale: 'Builds low-cost endurance and pace consistency.', terrain: 'Pool', status: 'planned', locked: false, version: 1,
    dayLabel: 'FRI', accent: 'swim'
  },
  {
    id: 'sat-bike', seasonWeekId: 'w1', plannedDate: '2026-09-26', sport: 'bike', title: 'Long-Course Brick Bike',
    sessionClass: 'race_specific', priority: 1, durationMin: 180, targets: { power: 'Race-relevant blocks @ 221–239 W' }, prescription: {}, rationale: 'Develops late-bike durability and low-variability execution.', terrain: 'Rolling', status: 'planned', locked: true, version: 1,
    dayLabel: 'SAT', accent: 'bike'
  },
  {
    id: 'sat-run', seasonWeekId: 'w1', plannedDate: '2026-09-26', sport: 'run', title: 'Brick Run',
    sessionClass: 'race_specific', priority: 1, durationMin: 40, targets: { pace: 'Progressive aerobic' }, prescription: {}, rationale: 'Trains efficient running under bike fatigue.', terrain: 'Flat / Rolling', status: 'planned', locked: true, version: 1,
    dayLabel: 'SAT', accent: 'run'
  },
  {
    id: 'sun-run', seasonWeekId: 'w1', plannedDate: '2026-09-27', sport: 'run', title: 'Progressive Long Run',
    sessionClass: 'endurance', priority: 1, durationMin: 85, targets: { pace: 'Easy → steady' }, prescription: {}, rationale: 'Develops long-run durability without marathon-style intensity.', terrain: 'Rolling', status: 'planned', locked: false, version: 1,
    dayLabel: 'SUN', accent: 'run'
  },
];

const initialWeek: WeekState = {
  id: 'w1',
  label: 'Week 1',
  dateRange: '21–27 Sep 2026',
  phase: 'Base 1',
  targetHours: 13.2,
  raceFocus: 'Long-course foundation',
  locked: false,
  version: 1,
  sessions: baseSessions,
};

function minutesToLabel(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m ? `${m}m` : ''}`.trim() : `${m}m`;
}

function sportLabel(sport: Sport) {
  return sport.charAt(0).toUpperCase() + sport.slice(1);
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="metric-card">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

function SessionEditor({ session, onSave, onToggleLock }: {
  session: SessionWithDay;
  onSave: (next: SessionWithDay) => void;
  onToggleLock: () => void;
}) {
  const [draft, setDraft] = useState(session);

  return (
    <aside className="editor-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">SESSION EDITOR</span>
          <h3>{session.title}</h3>
        </div>
        <button className="icon-button" onClick={onToggleLock} title={session.locked ? 'Unlock session' : 'Lock session'}>
          {session.locked ? <Lock size={18} /> : <Unlock size={18} />}
        </button>
      </div>

      <div className="editor-grid">
        <label>
          <span>Title</span>
          <input value={draft.title} disabled={session.locked} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </label>
        <label>
          <span>Duration (min)</span>
          <input type="number" min={10} value={draft.durationMin} disabled={session.locked} onChange={(e) => setDraft({ ...draft, durationMin: Number(e.target.value) })} />
        </label>
        <label>
          <span>Priority</span>
          <select value={draft.priority} disabled={session.locked} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) as 1 | 2 | 3 })}>
            <option value={1}>Priority 1</option>
            <option value={2}>Priority 2</option>
            <option value={3}>Priority 3</option>
          </select>
        </label>
        <label>
          <span>Terrain</span>
          <input value={draft.terrain ?? ''} disabled={session.locked} onChange={(e) => setDraft({ ...draft, terrain: e.target.value })} />
        </label>
        <label className="wide">
          <span>Key target</span>
          <input value={Object.values(draft.targets)[0]?.toString() ?? ''} disabled={session.locked} onChange={(e) => setDraft({ ...draft, targets: { primary: e.target.value } })} />
        </label>
        <label className="wide">
          <span>Why this session matters</span>
          <textarea rows={4} value={draft.rationale ?? ''} disabled={session.locked} onChange={(e) => setDraft({ ...draft, rationale: e.target.value })} />
        </label>
      </div>

      <div className="editor-actions">
        <button className="primary-button" disabled={session.locked} onClick={() => onSave({ ...draft, status: draft.version > 1 ? 'edited' : draft.status })}>
          <Save size={17} /> Save revision
        </button>
        {session.locked && <small>This session is locked. Unlock it before editing.</small>}
      </div>

      <div className="version-note">
        <span className="eyebrow">VERSION HISTORY</span>
        <strong>v{session.version}</strong>
        <small>Original plan is preserved when an edit is saved.</small>
      </div>
    </aside>
  );
}

export function App() {
  const [activeNav, setActiveNav] = useState('Home');
  const [week, setWeek] = useState<WeekState>(initialWeek);
  const [selectedId, setSelectedId] = useState<string>('tue-bike');
  const [changeLog, setChangeLog] = useState<string[]>([]);

  const selected = week.sessions.find((s) => s.id === selectedId) ?? week.sessions[0];
  const totalMinutes = useMemo(() => week.sessions.reduce((sum, s) => sum + s.durationMin, 0), [week.sessions]);
  const totalHours = totalMinutes / 60;
  const days = ['MON','TUE','WED','THU','FRI','SAT','SUN'];

  function saveSession(next: SessionWithDay) {
    setWeek((prev) => ({
      ...prev,
      version: prev.version + 1,
      sessions: prev.sessions.map((s) => s.id === next.id ? { ...next, version: s.version + 1, parentSessionId: s.parentSessionId ?? s.id, status: 'edited' } : s),
    }));
    setChangeLog((prev) => [`${next.dayLabel}: ${next.title} saved as a new revision.`, ...prev].slice(0, 6));
  }

  function toggleSessionLock() {
    setWeek((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => s.id === selected.id ? { ...s, locked: !s.locked } : s),
    }));
  }

  function toggleWeekLock() {
    setWeek((prev) => ({ ...prev, locked: !prev.locked }));
  }

  function homeView() {
    return (
      <>
        <section className="hero-grid">
          <div className="readiness-panel green">
            <span className="eyebrow light">DAILY READINESS</span>
            <strong>GREEN</strong>
            <p>Recovery signals are broadly stable.</p>
          </div>
          <Metric label="RACE READINESS" value="62%" hint="+2 pts this week" />
          <Metric label="FITNESS" value="74" hint="Long-term load" />
          <Metric label="FORM" value="-8" hint="Productive, not fresh" />
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">CURRENT WEEK</span>
              <h3>{totalHours.toFixed(1)} hours planned</h3>
            </div>
            <span className="status-pill">{week.raceFocus}</span>
          </div>
          <div className="session-strip">
            {days.map((day) => {
              const daySessions = week.sessions.filter((s) => s.dayLabel === day);
              const duration = daySessions.reduce((sum, s) => sum + s.durationMin, 0);
              return (
                <article className="session-card" key={day} onClick={() => { setActiveNav('Calendar'); if (daySessions[0]) setSelectedId(daySessions[0].id); }}>
                  <span className="day">{day}</span>
                  <strong>{daySessions.map((s) => s.title).join(' + ')}</strong>
                  <small>{minutesToLabel(duration)}</small>
                  <span className="priority">{daySessions.some((s) => s.priority === 1) ? 'P1' : daySessions.some((s) => s.priority === 2) ? 'P2' : 'P3'}</span>
                </article>
              );
            })}
          </div>
        </section>

        <div className="two-column">
          <section className="panel">
            <div className="section-heading"><div><span className="eyebrow">COACHING PRIORITIES</span><h3>This week</h3></div></div>
            <div className="priority-list">
              <div><span>01</span><div><strong>Run durability</strong><small>Current weakest long-course marker</small></div></div>
              <div><span>02</span><div><strong>Bike durability</strong><small>Extend stable output late</small></div></div>
              <div><span>03</span><div><strong>Maintain threshold</strong><small>Strong enough to preserve</small></div></div>
            </div>
          </section>

          <section className="panel coach-decision">
            <div className="section-heading"><div><span className="eyebrow">LATEST COACH DECISION</span><h3>Continue as planned</h3></div><RefreshCw size={21} /></div>
            <p>Recovery is stable and execution remains productive. No change to this week's load is required.</p>
            <button onClick={() => setActiveNav('Weekly Review')}>View rationale</button>
          </section>
        </div>
      </>
    );
  }

  function calendarView() {
    return (
      <div className="calendar-layout">
        <div>
          <section className="calendar-toolbar panel">
            <div>
              <span className="eyebrow">ACTIVE WEEK</span>
              <h3>{week.label} · {week.dateRange}</h3>
              <small>{week.phase} · {week.raceFocus} · Plan v{week.version}</small>
            </div>
            <div className="toolbar-actions">
              <button className="icon-button"><ChevronLeft size={18} /></button>
              <button className="week-lock" onClick={toggleWeekLock}>{week.locked ? <Lock size={16} /> : <Unlock size={16} />}{week.locked ? ' Week locked' : ' Lock week'}</button>
              <button className="icon-button"><ChevronRight size={18} /></button>
            </div>
          </section>

          <section className="calendar-grid panel">
            {days.map((day) => {
              const sessions = week.sessions.filter((s) => s.dayLabel === day);
              const dayMinutes = sessions.reduce((sum, s) => sum + s.durationMin, 0);
              return (
                <div className="calendar-day" key={day}>
                  <div className="calendar-day-head"><span>{day}</span><small>{minutesToLabel(dayMinutes)}</small></div>
                  <div className="day-stack">
                    {sessions.map((session) => (
                      <button
                        key={session.id}
                        className={`calendar-session ${session.accent} ${selectedId === session.id ? 'selected' : ''}`}
                        onClick={() => setSelectedId(session.id)}
                      >
                        <div className="calendar-session-top">
                          <span>{sportLabel(session.sport)}</span>
                          {session.locked && <Lock size={13} />}
                        </div>
                        <strong>{session.title}</strong>
                        <small>{minutesToLabel(session.durationMin)} · P{session.priority}</small>
                        <span>{Object.values(session.targets)[0]?.toString()}</span>
                      </button>
                    ))}
                    {!sessions.length && <div className="empty-day">No session</div>}
                  </div>
                </div>
              );
            })}
          </section>

          <div className="calendar-summary-grid">
            <section className="panel">
              <span className="eyebrow">WEEKLY VOLUME</span>
              <h3>{totalHours.toFixed(1)} h currently scheduled</h3>
              <p>Master target: {week.targetHours.toFixed(1)} h. The working calendar can differ from the master plan, but the reference version remains preserved.</p>
            </section>
            <section className="panel">
              <span className="eyebrow">RECENT CHANGES</span>
              <div className="change-log">
                {changeLog.length ? changeLog.map((item) => <small key={item}>{item}</small>) : <small>No edits in this version yet.</small>}
              </div>
            </section>
          </div>
        </div>

        <SessionEditor session={selected} onSave={saveSession} onToggleLock={toggleSessionLock} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <img src="/brand/azur-logo.png" alt="Azur Triathlon Coaching" className="brand-logo" />
          <div><span className="brand-kicker">PERSONAL PERFORMANCE</span><h1>Azur</h1></div>
        </div>

        <nav>
          {nav.map(([Icon, label]) => (
            <button className={activeNav === label ? 'nav-item active' : 'nav-item'} key={label} onClick={() => setActiveNav(label)}>
              <Icon size={19} /><span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="eyebrow">PRIMARY TARGET</span>
          <strong>Challenge Roth</strong>
          <small>4 July 2027 · Sub-9</small>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div><span className="eyebrow">{week.label.toUpperCase()} · {week.phase.toUpperCase()}</span><h2>{activeNav === 'Home' ? 'Good morning, Jay.' : activeNav}</h2><p>{activeNav === 'Calendar' ? 'Plan, lock and revise the week without losing the original version.' : 'Aerobic consistency + durability'}</p></div>
          <div className="race-countdown"><span className="eyebrow">DAYS TO ROTH</span><strong>288</strong></div>
        </header>

        {activeNav === 'Home' && homeView()}
        {activeNav === 'Calendar' && calendarView()}
        {activeNav !== 'Home' && activeNav !== 'Calendar' && (
          <section className="panel placeholder-view">
            <img src="/brand/azur-logo.png" alt="Azur" />
            <span className="eyebrow">CONNECTED MODULE</span>
            <h3>{activeNav}</h3>
            <p>This navigation route is now part of the working shell. Its prototype logic will be connected to the shared state next.</p>
          </section>
        )}
      </main>
    </div>
  );
}
