-- FitHer AI — single schema, runs identically on SQLite (local) and Cloudflare D1 (hosted).

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  display_name    TEXT NOT NULL,
  line_user_id    TEXT UNIQUE,
  goal            TEXT,
  days_per_week   INTEGER,
  session_minutes INTEGER,
  equipment_json  TEXT NOT NULL DEFAULT '[]',
  experience      TEXT,
  life_stage      TEXT,
  language        TEXT NOT NULL DEFAULT 'th',
  coach_tone      TEXT,              -- gentle | balanced | firm
  tone_note       TEXT,              -- her own words about how she wants to be coached
  motivation      TEXT,              -- why this matters to her, used to personalise
  target_weeks    INTEGER,           -- her own timeframe, e.g. 12 weeks
  target_event    TEXT,              -- what it is for, e.g. a wedding in December
  age             INTEGER,
  height_cm       REAL,
  weight_kg       REAL,
  injuries        TEXT,              -- past/ongoing areas to work around, her words
  sleep_hours     REAL,              -- drives how hard week 1 can be
  activity_level  TEXT,              -- sedentary | light | active
  train_time      TEXT,              -- morning | midday | evening — affects adherence
  dislikes        TEXT,              -- movements or styles she will not do
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  week_number  INTEGER NOT NULL,
  status       TEXT NOT NULL,              -- draft | active | superseded
  plan_json    TEXT NOT NULL,
  why_text_th  TEXT,
  why_text_en  TEXT,
  engine       TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plans_user_week ON plans(user_id, week_number);

CREATE TABLE IF NOT EXISTS checkins (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  week_number     INTEGER NOT NULL,
  completion_json TEXT NOT NULL DEFAULT '[]',
  rpe_avg         REAL,
  sleep_1to5      INTEGER,
  energy_1to5     INTEGER,
  notes           TEXT,
  flags_json      TEXT NOT NULL DEFAULT '[]',
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checkins_user_week ON checkins(user_id, week_number);

CREATE TABLE IF NOT EXISTS partners (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  area              TEXT NOT NULL,
  price_tier        INTEGER NOT NULL,
  beginner_friendly INTEGER NOT NULL DEFAULT 0,
  tags_json         TEXT NOT NULL DEFAULT '[]',
  lat               REAL,
  lng               REAL,
  note              TEXT,
  note_en           TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  type         TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, created_at);

CREATE TABLE IF NOT EXISTS usage (
  id            TEXT PRIMARY KEY,
  engine        TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_created ON usage(created_at);

-- Conversation state for the LINE onboarding / check-in flows (not in the
-- proposal's data model, but the webhook is stateless without it).
CREATE TABLE IF NOT EXISTS conversations (
  user_id    TEXT PRIMARY KEY,
  step       TEXT NOT NULL,
  draft_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);
