-- Azur Triathlon Coaching v1
-- PostgreSQL-oriented schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE sport_type AS ENUM ('swim','bike','run');
CREATE TYPE race_priority AS ENUM ('A','B','C');
CREATE TYPE session_status AS ENUM ('planned','edited','completed','missed','cancelled');
CREATE TYPE plan_decision AS ENUM ('progress_load','hold_load','reduce_load','change_stimulus');
CREATE TYPE decision_outcome AS ENUM ('accepted','rejected','pending');
CREATE TYPE readiness_color AS ENUM ('green','amber','red');
CREATE TYPE transition_stage AS ENUM ('recovery','easy_aerobic','reintroduce_intensity','race_specific_rebuild');

CREATE TABLE athlete_profile (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_name text NOT NULL,
  ftp_w integer NOT NULL,
  run_threshold_sec_per_km integer NOT NULL,
  swim_threshold_sec_per_100m integer NOT NULL,
  weight_kg numeric(5,2) NOT NULL,
  target_weight_kg numeric(5,2),
  normal_weekly_hours numeric(4,1),
  peak_weekly_hours numeric(4,1),
  timezone text NOT NULL DEFAULT 'Europe/London',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE race (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id uuid NOT NULL REFERENCES athlete_profile(id) ON DELETE CASCADE,
  name text NOT NULL,
  race_date date NOT NULL,
  priority race_priority NOT NULL,
  distance_label text,
  location text,
  swim_distance_m integer,
  bike_distance_km numeric(6,2),
  run_distance_km numeric(6,2),
  course_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  weather_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_splits jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual_splits jsonb,
  result_summary jsonb,
  frozen_build boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE season_week (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id uuid NOT NULL REFERENCES athlete_profile(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  phase text NOT NULL,
  race_focus_id uuid REFERENCES race(id) ON DELETE SET NULL,
  target_hours numeric(4,1) NOT NULL,
  benchmark_week boolean NOT NULL DEFAULT false,
  locked boolean NOT NULL DEFAULT false,
  master_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, week_start)
);

CREATE TABLE planned_session (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_week_id uuid NOT NULL REFERENCES season_week(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES athlete_profile(id) ON DELETE CASCADE,
  planned_date date NOT NULL,
  sport sport_type NOT NULL,
  title text NOT NULL,
  session_class text NOT NULL,
  priority integer NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 3),
  duration_min integer NOT NULL,
  targets jsonb NOT NULL DEFAULT '{}'::jsonb,
  prescription jsonb NOT NULL DEFAULT '{}'::jsonb,
  rationale text,
  terrain text,
  status session_status NOT NULL DEFAULT 'planned',
  locked boolean NOT NULL DEFAULT false,
  parent_session_id uuid REFERENCES planned_session(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  is_active_version boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_planned_session_active ON planned_session(athlete_id, planned_date, is_active_version);

CREATE TABLE completed_activity (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id uuid NOT NULL REFERENCES athlete_profile(id) ON DELETE CASCADE,
  planned_session_id uuid REFERENCES planned_session(id) ON DELETE SET NULL,
  sport sport_type NOT NULL,
  source text NOT NULL,
  source_activity_id text,
  start_time timestamptz NOT NULL,
  duration_sec integer NOT NULL,
  distance_m numeric(12,2),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  match_confidence numeric(5,2),
  duplicate_group_key text,
  notes text,
  session_rpe numeric(3,1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_activity_id)
);

CREATE TABLE recovery_record (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id uuid NOT NULL REFERENCES athlete_profile(id) ON DELETE CASCADE,
  record_date date NOT NULL,
  hrv numeric(8,2),
  resting_hr numeric(6,2),
  sleep_minutes integer,
  hrv_vs_30d_pct numeric(6,2),
  rhr_vs_30d_pct numeric(6,2),
  sleep_vs_30d_pct numeric(6,2),
  prior_day_rpe numeric(3,1),
  load_fatigue_signal numeric(5,2),
  niggle_area text,
  niggle_severity integer CHECK (niggle_severity BETWEEN 0 AND 10),
  daily_readiness readiness_color,
  interpretation jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, record_date)
);

CREATE TABLE benchmark (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id uuid NOT NULL REFERENCES athlete_profile(id) ON DELETE CASCADE,
  benchmark_date date NOT NULL,
  sport sport_type,
  benchmark_type text NOT NULL,
  value numeric(12,4) NOT NULL,
  unit text NOT NULL,
  source_activity_id uuid REFERENCES completed_activity(id) ON DELETE SET NULL,
  detected_automatically boolean NOT NULL DEFAULT false,
  comparable_build_label text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE threshold_change (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id uuid NOT NULL REFERENCES athlete_profile(id) ON DELETE CASCADE,
  metric text NOT NULL,
  old_value numeric(12,4) NOT NULL,
  proposed_value numeric(12,4) NOT NULL,
  evidence jsonb NOT NULL,
  confidence numeric(5,2),
  outcome decision_outcome NOT NULL DEFAULT 'pending',
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE race_readiness_snapshot (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id uuid NOT NULL REFERENCES athlete_profile(id) ON DELETE CASCADE,
  race_id uuid NOT NULL REFERENCES race(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  bike_score numeric(5,2) NOT NULL,
  run_score numeric(5,2) NOT NULL,
  swim_score numeric(5,2) NOT NULL,
  raw_score numeric(5,2) NOT NULL,
  seasonal_ceiling numeric(5,2) NOT NULL,
  displayed_score numeric(5,2) NOT NULL,
  calculation jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (race_id, snapshot_date)
);

CREATE TABLE weekly_review (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id uuid NOT NULL REFERENCES athlete_profile(id) ON DELETE CASCADE,
  season_week_id uuid NOT NULL REFERENCES season_week(id) ON DELETE CASCADE,
  compliance_pct numeric(5,2),
  key_session_completion_pct numeric(5,2),
  response_label text,
  improving_area text,
  priority_area text,
  maintain_area text,
  coach_decision plan_decision,
  recommended_hours numeric(4,1),
  rationale text,
  long_term_benefit text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_week_id)
);

CREATE TABLE plan_decision_history (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id uuid NOT NULL REFERENCES athlete_profile(id) ON DELETE CASCADE,
  season_week_id uuid NOT NULL REFERENCES season_week(id) ON DELETE CASCADE,
  weekly_review_id uuid REFERENCES weekly_review(id) ON DELETE SET NULL,
  decision plan_decision NOT NULL,
  outcome decision_outcome NOT NULL,
  master_target_hours numeric(4,1),
  revised_target_hours numeric(4,1),
  reason text,
  changed_session_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE race_lesson (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  race_id uuid NOT NULL REFERENCES race(id) ON DELETE CASCADE,
  category text NOT NULL,
  lesson text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  repeated_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE transition_state (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id uuid NOT NULL REFERENCES athlete_profile(id) ON DELETE CASCADE,
  source_race_id uuid NOT NULL REFERENCES race(id) ON DELETE CASCADE,
  target_race_id uuid NOT NULL REFERENCES race(id) ON DELETE CASCADE,
  transition_date date NOT NULL,
  current_stage transition_stage NOT NULL,
  recommended_stage transition_stage,
  retained_fitness_pct numeric(5,2),
  recovery_score numeric(5,2),
  leeds_readiness_pct numeric(5,2),
  retain_plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  rebuild_plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  improve_plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome decision_outcome NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
