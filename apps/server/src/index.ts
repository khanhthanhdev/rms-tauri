import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import type { auth as authInstance } from "@rms-local/auth";
import { file as bunFile, serve } from "bun";
import { Hono } from "hono";
import { cors } from "hono/cors";

interface ServerOptions {
  dbPath: string;
  host: string;
  port: number;
  setupToken?: string;
  webDist?: string;
}

const DEFAULT_SERVER_OPTIONS: ServerOptions = {
  dbPath: "./server.db",
  host: "0.0.0.0",
  port: 80,
};

type AuthHandler = typeof authInstance;

const ADMIN_ROLE = "ADMIN";
const LOCALHOST = "127.0.0.1";
const DEFAULT_CORS_ORIGIN = "http://localhost:5173";
const MIN_PASSWORD_LENGTH = 8;
const MIN_USERNAME_LENGTH = 3;
const SETUP_ALLOWED_ORIGINS = [
  "tauri://localhost",
  "https://tauri.localhost",
  "http://tauri.localhost",
] as const;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const EVENT_CODE_PATTERN = /^[A-Za-z0-9_-]+$/;
const EVENT_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS teams (
    number INTEGER NOT NULL PRIMARY KEY,
    advancement INTEGER NOT NULL,
    division INTEGER NOT NULL,
    inspire_eligible INTEGER NOT NULL,
    promote_eligible INTEGER NOT NULL,
    competing TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS form_rows (
    form_id TEXT NOT NULL,
    row INTEGER NOT NULL,
    type TEXT NOT NULL,
    column_count INTEGER NOT NULL,
    description TEXT NOT NULL,
    rule TEXT
  );

  CREATE TABLE IF NOT EXISTS form_items (
    form_id TEXT NOT NULL,
    row INTEGER NOT NULL,
    item_index INTEGER NOT NULL,
    label TEXT,
    type TEXT,
    automation_data TEXT,
    options TEXT
  );

  CREATE TABLE IF NOT EXISTS status (
    team INTEGER NOT NULL,
    stage TEXT NOT NULL,
    status INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS practice_match_schedule (
    start INTEGER NOT NULL,
    end INTEGER NOT NULL,
    type INTEGER NOT NULL,
    label TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS practice_blocks (
    start INTEGER NOT NULL,
    end INTEGER NOT NULL,
    type TEXT NOT NULL,
    cycle_time INTEGER NOT NULL,
    label TEXT
  );

  CREATE TABLE IF NOT EXISTS match_schedule (
    start INTEGER NOT NULL,
    end INTEGER NOT NULL,
    type INTEGER NOT NULL,
    label TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS blocks (
    start INTEGER NOT NULL,
    end INTEGER NOT NULL,
    type TEXT NOT NULL,
    cycle_time INTEGER NOT NULL,
    label TEXT
  );

  CREATE TABLE IF NOT EXISTS selections (
    id INTEGER NOT NULL PRIMARY KEY,
    op INTEGER NOT NULL,
    method INTEGER NOT NULL,
    team INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS alliances (
    rank INTEGER NOT NULL,
    team1 INTEGER NOT NULL,
    team2 INTEGER NOT NULL,
    team3 INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS practice (
    match INTEGER NOT NULL,
    red1 INTEGER NOT NULL,
    red1s INTEGER NOT NULL,
    red2 INTEGER NOT NULL,
    red2s INTEGER NOT NULL,
    blue1 INTEGER NOT NULL,
    blue1s INTEGER NOT NULL,
    blue2 INTEGER NOT NULL,
    blue2s INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS practice_data (
    match INTEGER NOT NULL,
    status INTEGER NOT NULL,
    randomization INTEGER NOT NULL,
    start INTEGER NOT NULL,
    schedule_start INTEGER NOT NULL,
    posted_time INTEGER NOT NULL,
    fms_match_id TEXT NOT NULL,
    fms_schedule_detail_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quals (
    match INTEGER NOT NULL,
    red1 INTEGER NOT NULL,
    red1s INTEGER NOT NULL,
    red2 INTEGER NOT NULL,
    red2s INTEGER NOT NULL,
    blue1 INTEGER NOT NULL,
    blue1s INTEGER NOT NULL,
    blue2 INTEGER NOT NULL,
    blue2s INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quals_data (
    match INTEGER NOT NULL,
    status INTEGER NOT NULL,
    randomization INTEGER NOT NULL,
    start INTEGER NOT NULL,
    schedule_start INTEGER NOT NULL,
    posted_time INTEGER NOT NULL,
    fms_match_id TEXT NOT NULL,
    fms_schedule_detail_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quals_results (
    match INTEGER NOT NULL PRIMARY KEY,
    red_score INTEGER NOT NULL,
    blue_score INTEGER NOT NULL,
    red_penalty_committed INTEGER NOT NULL,
    blue_penalty_committed INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quals_scores (
    match INTEGER NOT NULL,
    alliance INTEGER NOT NULL,
    card1 INTEGER NOT NULL,
    card2 INTEGER NOT NULL,
    dq1 INTEGER NOT NULL,
    dq2 INTEGER NOT NULL,
    noshow1 INTEGER NOT NULL,
    noshow2 INTEGER NOT NULL,
    major INTEGER NOT NULL,
    minor INTEGER NOT NULL,
    adjust INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quals_game_specific (
    match INTEGER NOT NULL,
    alliance INTEGER NOT NULL,
    auto_classified_artifacts INTEGER NOT NULL,
    auto_overflow_artifacts INTEGER NOT NULL,
    auto_classifier_state TEXT NOT NULL,
    robot1auto INTEGER NOT NULL,
    robot2auto INTEGER NOT NULL,
    teleop_classified_artifacts INTEGER NOT NULL,
    teleop_overflow_artifacts INTEGER NOT NULL,
    teleop_depot_artifacts INTEGER NOT NULL,
    teleop_classifier_state TEXT NOT NULL,
    robot1teleop INTEGER NOT NULL,
    robot2teleop INTEGER NOT NULL,
    violations TEXT NOT NULL,
    own_major INTEGER NOT NULL,
    own_minor INTEGER NOT NULL,
    other_major INTEGER NOT NULL,
    other_minor INTEGER NOT NULL,
    hr_major INTEGER NOT NULL,
    hr_minor INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS elims (
    match INTEGER NOT NULL,
    red INTEGER NOT NULL,
    blue INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS elims_data (
    match INTEGER NOT NULL,
    status INTEGER NOT NULL,
    randomization INTEGER NOT NULL,
    start INTEGER NOT NULL,
    posted_time INTEGER NOT NULL,
    fms_match_id TEXT NOT NULL,
    fms_schedule_detail_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS elims_results (
    match INTEGER NOT NULL,
    red_score INTEGER NOT NULL,
    blue_score INTEGER NOT NULL,
    red_penalty_committed INTEGER NOT NULL,
    blue_penalty_committed INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS elims_scores (
    match INTEGER NOT NULL,
    alliance INTEGER NOT NULL,
    card INTEGER NOT NULL,
    dq INTEGER NOT NULL,
    noshow1 INTEGER NOT NULL,
    noshow2 INTEGER NOT NULL,
    noshow3 INTEGER NOT NULL,
    major INTEGER NOT NULL,
    minor INTEGER NOT NULL,
    adjust INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS elims_game_specific (
    match INTEGER NOT NULL,
    alliance INTEGER NOT NULL,
    auto_classified_artifacts INTEGER NOT NULL,
    auto_overflow_artifacts INTEGER NOT NULL,
    auto_classifier_state TEXT NOT NULL,
    robot1auto INTEGER NOT NULL,
    robot2auto INTEGER NOT NULL,
    teleop_classified_artifacts INTEGER NOT NULL,
    teleop_overflow_artifacts INTEGER NOT NULL,
    teleop_depot_artifacts INTEGER NOT NULL,
    teleop_classifier_state TEXT NOT NULL,
    robot1teleop INTEGER NOT NULL,
    robot2teleop INTEGER NOT NULL,
    violations TEXT NOT NULL,
    own_major INTEGER NOT NULL,
    own_minor INTEGER NOT NULL,
    other_major INTEGER NOT NULL,
    other_minor INTEGER NOT NULL,
    hr_major INTEGER NOT NULL,
    hr_minor INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quals_commit_history (
    match INTEGER NOT NULL,
    ts INTEGER NOT NULL,
    start INTEGER NOT NULL,
    random INTEGER NOT NULL,
    type INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS elims_commit_history (
    match INTEGER NOT NULL,
    ts INTEGER NOT NULL,
    start INTEGER NOT NULL,
    random INTEGER NOT NULL,
    type INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quals_scores_history (
    match INTEGER NOT NULL,
    ts INTEGER NOT NULL,
    alliance INTEGER NOT NULL,
    card1 INTEGER NOT NULL,
    card2 INTEGER NOT NULL,
    dq1 INTEGER NOT NULL,
    dq2 INTEGER NOT NULL,
    noshow1 INTEGER NOT NULL,
    noshow2 INTEGER NOT NULL,
    major INTEGER NOT NULL,
    minor INTEGER NOT NULL,
    adjust INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quals_game_specific_history (
    match INTEGER NOT NULL,
    ts INTEGER NOT NULL,
    alliance INTEGER NOT NULL,
    auto_classified_artifacts INTEGER NOT NULL,
    auto_overflow_artifacts INTEGER NOT NULL,
    auto_classifier_state TEXT NOT NULL,
    robot1auto INTEGER NOT NULL,
    robot2auto INTEGER NOT NULL,
    teleop_classified_artifacts INTEGER NOT NULL,
    teleop_overflow_artifacts INTEGER NOT NULL,
    teleop_depot_artifacts INTEGER NOT NULL,
    teleop_classifier_state TEXT NOT NULL,
    robot1teleop INTEGER NOT NULL,
    robot2teleop INTEGER NOT NULL,
    violations TEXT NOT NULL,
    own_major INTEGER NOT NULL,
    own_minor INTEGER NOT NULL,
    other_major INTEGER NOT NULL,
    other_minor INTEGER NOT NULL,
    hr_major INTEGER NOT NULL,
    hr_minor INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS elims_scores_history (
    match INTEGER NOT NULL,
    ts INTEGER NOT NULL,
    alliance INTEGER NOT NULL,
    card INTEGER NOT NULL,
    dq INTEGER NOT NULL,
    noshow1 INTEGER NOT NULL,
    noshow2 INTEGER NOT NULL,
    noshow3 INTEGER NOT NULL,
    major INTEGER NOT NULL,
    minor INTEGER NOT NULL,
    adjust INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS elims_game_specific_history (
    match INTEGER NOT NULL,
    ts INTEGER NOT NULL,
    alliance INTEGER NOT NULL,
    auto_classified_artifacts INTEGER NOT NULL,
    auto_overflow_artifacts INTEGER NOT NULL,
    auto_classifier_state TEXT NOT NULL,
    robot1auto INTEGER NOT NULL,
    robot2auto INTEGER NOT NULL,
    teleop_classified_artifacts INTEGER NOT NULL,
    teleop_overflow_artifacts INTEGER NOT NULL,
    teleop_depot_artifacts INTEGER NOT NULL,
    teleop_classifier_state TEXT NOT NULL,
    robot1teleop INTEGER NOT NULL,
    robot2teleop INTEGER NOT NULL,
    violations TEXT NOT NULL,
    own_major INTEGER NOT NULL,
    own_minor INTEGER NOT NULL,
    other_major INTEGER NOT NULL,
    other_minor INTEGER NOT NULL,
    hr_major INTEGER NOT NULL,
    hr_minor INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS inspection_schedule_form (
    id INTEGER NOT NULL,
    str TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS inspection_schedule_items (
    id INTEGER NOT NULL,
    team INTEGER NOT NULL,
    name TEXT NOT NULL,
    station_number INTEGER NOT NULL,
    start_time INTEGER NOT NULL,
    total_time INTEGER NOT NULL,
    month INTEGER NOT NULL,
    day INTEGER NOT NULL,
    year INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sponsors (
    sponsor_id TEXT NOT NULL,
    name TEXT NOT NULL,
    title TEXT NOT NULL,
    position INTEGER NOT NULL,
    logo TEXT NOT NULL,
    level INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT NOT NULL PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS hr_meeting_notes (
    type TEXT NOT NULL,
    content TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS system_survey_samples (
    survey_type TEXT NOT NULL,
    sample_time INTEGER NOT NULL,
    sample_description TEXT NOT NULL,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS award (
    fms_award_id TEXT NOT NULL PRIMARY KEY,
    fms_season_id TEXT NOT NULL,
    award_id INTEGER NOT NULL,
    award_subtype_id INTEGER NOT NULL,
    tournament_type INTEGER NOT NULL,
    type INTEGER NOT NULL,
    culture_type INTEGER NOT NULL,
    description TEXT NOT NULL,
    default_quantity TEXT,
    sponsor_details TEXT,
    display_order_ui INTEGER NOT NULL,
    display_order_online INTEGER NOT NULL,
    cmp_qualifying INTEGER NOT NULL,
    allow_manual_entry INTEGER NOT NULL,
    created_on TEXT NOT NULL,
    created_by TEXT,
    modified_on TEXT NOT NULL,
    modified_by TEXT,
    script TEXT NOT NULL,
    can_edit INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS award_assignment (
    fms_award_id TEXT NOT NULL,
    fms_event_id TEXT NOT NULL,
    series INTEGER NOT NULL,
    fms_team_id TEXT,
    first_name TEXT,
    last_name TEXT,
    is_public INTEGER NOT NULL,
    created_on TEXT NOT NULL,
    created_by TEXT NOT NULL,
    modified_on TEXT,
    modified_by TEXT,
    comment TEXT
  );

  CREATE TABLE IF NOT EXISTS team_ranking (
    fms_event_id TEXT NOT NULL,
    fms_team_id TEXT NOT NULL,
    ranking INTEGER NOT NULL,
    rank_change INTEGER NOT NULL,
    wins INTEGER NOT NULL,
    losses INTEGER NOT NULL,
    ties INTEGER NOT NULL,
    qualifying_score TEXT NOT NULL,
    points_scored_total REAL NOT NULL,
    points_scored_average TEXT NOT NULL,
    points_scored_average_change INTEGER NOT NULL,
    matches_played INTEGER NOT NULL,
    matches_counted INTEGER NOT NULL,
    disqualified INTEGER NOT NULL,
    sort_order1 TEXT NOT NULL,
    sort_order2 TEXT NOT NULL,
    sort_order3 TEXT NOT NULL,
    sort_order4 TEXT NOT NULL,
    sort_order5 TEXT NOT NULL,
    sort_order6 TEXT NOT NULL,
    modified_on TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS team (
    fms_team_id TEXT NOT NULL,
    fms_season_id TEXT,
    fms_region_id TEXT,
    team_id INTEGER NOT NULL,
    team_number INTEGER NOT NULL,
    team_name_long TEXT,
    team_name_short TEXT NOT NULL,
    robot_name TEXT,
    city TEXT NOT NULL,
    state_prov TEXT NOT NULL,
    country TEXT NOT NULL,
    website TEXT,
    rookie_year INTEGER NOT NULL,
    was_added_from_ui INTEGER NOT NULL,
    cmp_prequalified INTEGER NOT NULL,
    school_name TEXT,
    demo_team INTEGER NOT NULL,
    paid INTEGER NOT NULL,
    fms_home_cmp_id TEXT,
    game_specifics TEXT,
    created_on TEXT NOT NULL,
    created_by TEXT NOT NULL,
    modified_on TEXT NOT NULL,
    modified_by TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS schedule_detail (
    fms_schedule_detail_id TEXT NOT NULL,
    fms_event_id TEXT NOT NULL,
    tournament_level INTEGER NOT NULL,
    match_number INTEGER NOT NULL,
    field_type INTEGER NOT NULL,
    description TEXT NOT NULL,
    start_time TEXT NOT NULL,
    field_configuration_details TEXT,
    created_on TEXT,
    created_by TEXT NOT NULL,
    modified_on TEXT,
    modified_by TEXT,
    row_version TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS schedule_station (
    fms_schedule_detail_id TEXT NOT NULL,
    alliance INTEGER NOT NULL,
    station INTEGER NOT NULL,
    fms_event_id TEXT NOT NULL,
    fms_team_id TEXT NOT NULL,
    is_surrogate INTEGER NOT NULL,
    created_on TEXT,
    created_by TEXT NOT NULL,
    modified_on TEXT,
    modified_by TEXT
  );

  CREATE TABLE IF NOT EXISTS match (
    fms_match_id TEXT NOT NULL,
    fms_schedule_detail_id TEXT NOT NULL,
    play_number INTEGER NOT NULL,
    field_type INTEGER NOT NULL,
    initial_pre_start_time TEXT,
    final_pre_start_time TEXT,
    pre_start_count INTEGER NOT NULL,
    auto_start_time TEXT NOT NULL,
    auto_end_time TEXT NOT NULL,
    teleop_start_time TEXT NOT NULL,
    teleop_end_time TEXT,
    ref_commit_time TEXT,
    score_keeper_commit_time TEXT NOT NULL,
    post_match_time TEXT,
    cancel_match_time TEXT,
    cycle_time TEXT,
    red_score INTEGER NOT NULL,
    blue_score INTEGER NOT NULL,
    red_penalty INTEGER NOT NULL,
    blue_penalty INTEGER NOT NULL,
    red_auto_score INTEGER NOT NULL,
    blue_auto_score INTEGER NOT NULL,
    score_details TEXT NOT NULL,
    head_ref_review INTEGER NOT NULL,
    video_url TEXT,
    created_on TEXT NOT NULL,
    created_by TEXT NOT NULL,
    modified_on TEXT NOT NULL,
    modified_by TEXT NOT NULL,
    fms_event_id TEXT,
    row_version TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS patches (
    patch_id TEXT NOT NULL,
    db_version INTEGER NOT NULL,
    patch TEXT NOT NULL,
    applied INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS advancement_points (
    team INTEGER NOT NULL,
    sort_tuple TEXT NOT NULL,
    private_points INTEGER NOT NULL
  );
`;
const CORE_SCHEMA_SQL = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    email_verified INTEGER NOT NULL DEFAULT 0,
    image TEXT,
    username TEXT UNIQUE,
    display_username TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
  );

  CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    updated_at INTEGER NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS session_userId_idx ON session (user_id);

  CREATE TABLE IF NOT EXISTS account (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    access_token TEXT,
    refresh_token TEXT,
    id_token TEXT,
    access_token_expires_at INTEGER,
    refresh_token_expires_at INTEGER,
    scope TEXT,
    password TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS account_userId_idx ON account (user_id);

  CREATE TABLE IF NOT EXISTS verification (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
  );
  CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification (identifier);

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS event (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type INTEGER NOT NULL DEFAULT 0,
    status INTEGER NOT NULL DEFAULT 0,
    finals INTEGER NOT NULL DEFAULT 0,
    divisions INTEGER NOT NULL DEFAULT 0,
    start INTEGER NOT NULL,
    end INTEGER NOT NULL,
    region TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
  );

  CREATE TABLE IF NOT EXISTS event_log (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    type TEXT NOT NULL,
    event_code TEXT,
    info TEXT,
    extra TEXT DEFAULT '[]'
  );
  CREATE INDEX IF NOT EXISTS event_log_event_code_idx ON event_log (event_code);
  CREATE INDEX IF NOT EXISTS event_log_type_idx ON event_log (type);

  CREATE TABLE IF NOT EXISTS user_role (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    event_code TEXT REFERENCES event(code) ON DELETE CASCADE,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
  );
  CREATE INDEX IF NOT EXISTS user_role_userId_idx ON user_role (user_id);
  CREATE INDEX IF NOT EXISTS user_role_eventCode_idx ON user_role (event_code);
  CREATE INDEX IF NOT EXISTS user_role_role_idx ON user_role (role);
`;

interface EventDetails {
  divisions: number;
  end: number;
  eventCode: string;
  finals: number;
  name: string;
  region: string;
  start: number;
  status: number;
  type: number;
}

interface AdminSetupPayload {
  name: string;
  password: string;
  username: string;
}

const resolveAllowedCorsOrigins = (): string[] => {
  const configuredOrigin = process.env.CORS_ORIGIN ?? DEFAULT_CORS_ORIGIN;

  return [configuredOrigin, ...SETUP_ALLOWED_ORIGINS];
};

const resolveCorsOrigin = (
  origin: string | undefined,
  allowedOrigins: string[]
): string => {
  const defaultOrigin = allowedOrigins[0] ?? DEFAULT_CORS_ORIGIN;

  if (!origin) {
    return defaultOrigin;
  }

  if (allowedOrigins.includes(origin)) {
    return origin;
  }

  return defaultOrigin;
};

const normalizeUsername = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const username = value.trim();
  if (username.length < MIN_USERNAME_LENGTH) {
    return null;
  }

  if (!USERNAME_PATTERN.test(username)) {
    return null;
  }

  return username;
};

const normalizeDisplayName = (
  value: unknown,
  fallbackUsername: string
): string => {
  if (typeof value !== "string") {
    return fallbackUsername;
  }

  const normalizedName = value.trim();
  return normalizedName.length > 0 ? normalizedName : fallbackUsername;
};

const normalizePassword = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  if (value.length < MIN_PASSWORD_LENGTH) {
    return null;
  }

  return value;
};

const parseAdminSetupPayload = (payload: unknown): AdminSetupPayload | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const data = payload as Record<string, unknown>;
  const username = normalizeUsername(data.username);
  const password = normalizePassword(data.password);
  if (!(username && password)) {
    return null;
  }

  return {
    username,
    password,
    name: normalizeDisplayName(data.name, username),
  };
};

const normalizeEventCode = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const eventCode = value.trim();
  if (!(eventCode && EVENT_CODE_PATTERN.test(eventCode))) {
    return null;
  }
  return eventCode;
};

const buildEventDetails = (
  data: Record<string, unknown>,
  eventCode: string
): EventDetails => {
  const now = Date.now();
  const name =
    typeof data.name === "string" && data.name.trim().length > 0
      ? data.name.trim()
      : eventCode;
  const start = typeof data.start === "number" ? data.start : now;
  const end = typeof data.end === "number" ? data.end : start;
  const region =
    typeof data.region === "string" && data.region.trim().length > 0
      ? data.region.trim()
      : "UNKNOWN";
  const type = typeof data.type === "number" ? data.type : 0;
  const status = typeof data.status === "number" ? data.status : 0;
  const finals = typeof data.finals === "number" ? data.finals : 0;
  const divisions = typeof data.divisions === "number" ? data.divisions : 0;

  return {
    eventCode,
    name,
    start,
    end,
    region,
    type,
    status,
    finals,
    divisions,
  };
};

const hasExistingEvent = (db: Database, eventCode: string): boolean => {
  const existingEvent = db
    .query("SELECT code FROM event WHERE code = ?1")
    .get(eventCode) as { code: string } | null;
  return Boolean(existingEvent);
};

const isAdminInitialized = (db: Database): boolean => {
  const existingAdmin = db
    .query("SELECT id FROM user_role WHERE role = ?1 LIMIT 1")
    .get(ADMIN_ROLE) as { id: string } | null;

  return Boolean(existingAdmin);
};

const hasGlobalAdminRole = (db: Database, userId: string): boolean => {
  const adminRole = db
    .query(
      "SELECT id FROM user_role WHERE user_id = ?1 AND role = ?2 AND event_code IS NULL LIMIT 1"
    )
    .get(userId, ADMIN_ROLE) as { id: string } | null;

  return Boolean(adminRole);
};

const insertAdminRole = (db: Database, userId: string): void => {
  const roleId = crypto.randomUUID();
  db.query(
    "INSERT INTO user_role (id, user_id, role, event_code) VALUES (?1, ?2, ?3, ?4)"
  ).run(roleId, userId, ADMIN_ROLE, null);
};

const insertAdminBootstrapLog = (
  db: Database,
  userId: string,
  username: string
): void => {
  const logId = crypto.randomUUID();
  db.query(
    "INSERT INTO event_log (id, timestamp, type, event_code, info, extra) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
  ).run(
    logId,
    Date.now(),
    "ADMIN_BOOTSTRAPPED",
    null,
    username,
    JSON.stringify({ role: ADMIN_ROLE, userId })
  );
};

const deleteUserById = (db: Database, userId: string): void => {
  db.query("DELETE FROM user WHERE id = ?1").run(userId);
};

const insertEvent = (db: Database, details: EventDetails): void => {
  const eventId = crypto.randomUUID();
  db.query(
    "INSERT INTO event (id, code, name, type, status, finals, divisions, start, end, region) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
  ).run(
    eventId,
    details.eventCode,
    details.name,
    details.type,
    details.status,
    details.finals,
    details.divisions,
    details.start,
    details.end,
    details.region
  );
};

const insertEventLog = (
  db: Database,
  details: EventDetails,
  eventDbPath: string
): void => {
  const logId = crypto.randomUUID();
  db.query(
    "INSERT INTO event_log (id, timestamp, type, event_code, info, extra) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
  ).run(
    logId,
    Date.now(),
    "EVENT_CREATED",
    details.eventCode,
    details.name,
    JSON.stringify({ dbPath: eventDbPath })
  );
};

const extractUserId = (value: unknown): string | null => {
  if (!(value && typeof value === "object")) {
    return null;
  }

  const user = (value as { user?: { id?: unknown } | null }).user;
  if (!(user && typeof user === "object")) {
    return null;
  }

  return typeof user.id === "string" ? user.id : null;
};

const resolveUserIdByEmail = (db: Database, email: string): string | null => {
  const user = db
    .query("SELECT id FROM user WHERE email = ?1 LIMIT 1")
    .get(email) as { id: string } | null;

  return user?.id ?? null;
};

const assignUsernameToUser = (
  db: Database,
  userId: string,
  username: string
): void => {
  db.query(
    "UPDATE user SET username = ?1, display_username = ?2 WHERE id = ?3"
  ).run(username, username, userId);
};

const resolveErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }

  return "Unknown error.";
};

const isConflictError = (error: unknown): boolean => {
  const message = resolveErrorMessage(error).toLowerCase();
  return (
    message.includes("unique constraint") ||
    message.includes("already exists") ||
    message.includes("already taken")
  );
};

const createAdminUser = async (
  auth: AuthHandler,
  db: Database,
  payload: AdminSetupPayload
): Promise<string> => {
  const email = `${payload.username}@local.rms`;
  const signUpResponse = await auth.api.signUpEmail({
    body: {
      email,
      name: payload.name,
      password: payload.password,
    },
  });

  const userId =
    extractUserId(signUpResponse) ?? resolveUserIdByEmail(db, email);
  if (!userId) {
    throw new Error("Failed to resolve created user ID from auth response.");
  }

  assignUsernameToUser(db, userId, payload.username);

  return userId;
};

const resolveSessionUserId = async (
  auth: AuthHandler,
  request: Request
): Promise<string | null> => {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    return extractUserId(session);
  } catch {
    return null;
  }
};

interface RequestFailure {
  details?: string;
  error: string;
  status: 400 | 401 | 403 | 409 | 500 | 503;
}

type RequestResult<TValue> = { failure: RequestFailure } | { value: TValue };

const failure = (
  status: 400 | 401 | 403 | 409 | 500 | 503,
  error: string,
  details?: string
): RequestResult<never> => ({
  failure: {
    status,
    error,
    details,
  },
});

const success = <TValue>(value: TValue): RequestResult<TValue> => ({
  value,
});

const validateSetupAdminRequest = (
  options: ServerOptions,
  db: Database,
  requestToken: string | undefined,
  payload: unknown
): RequestResult<AdminSetupPayload> => {
  if (!options.setupToken) {
    return failure(503, "Setup token is not configured.");
  }

  if (!requestToken || requestToken !== options.setupToken) {
    return failure(401, "Invalid setup token.");
  }

  if (isAdminInitialized(db)) {
    return failure(409, "Admin is already initialized.");
  }

  const adminPayload = parseAdminSetupPayload(payload);
  if (!adminPayload) {
    return failure(
      400,
      "Invalid payload. username and password are required with valid format."
    );
  }

  return success(adminPayload);
};

const bootstrapAdminUser = async (
  auth: AuthHandler,
  db: Database,
  adminPayload: AdminSetupPayload
): Promise<RequestResult<{ username: string }>> => {
  let userId: string;
  try {
    userId = await createAdminUser(auth, db, adminPayload);
  } catch (error) {
    const statusCode = isConflictError(error) ? 409 : 500;
    return failure(
      statusCode,
      statusCode === 409
        ? "Admin credentials already exist."
        : "Failed to create admin account.",
      resolveErrorMessage(error)
    );
  }

  try {
    insertAdminRole(db, userId);
    insertAdminBootstrapLog(db, userId, adminPayload.username);
  } catch (error) {
    try {
      deleteUserById(db, userId);
    } catch (cleanupError) {
      console.error(
        "[server] failed to rollback admin user after role assignment failure:",
        resolveErrorMessage(cleanupError)
      );
    }

    return failure(
      500,
      "Failed to assign ADMIN role.",
      resolveErrorMessage(error)
    );
  }

  return success({
    username: adminPayload.username,
  });
};

const authorizeAdminEventRequest = async (
  auth: AuthHandler,
  db: Database,
  request: Request
): Promise<RequestResult<null>> => {
  const sessionUserId = await resolveSessionUserId(auth, request);
  if (!sessionUserId) {
    return failure(401, "Authentication required.");
  }

  if (!hasGlobalAdminRole(db, sessionUserId)) {
    return failure(403, "Admin role required.");
  }

  return success(null);
};

const createEventArtifacts = (
  db: Database,
  eventDbDirectory: string,
  details: EventDetails
): RequestResult<{ eventDbPath: string }> => {
  let eventDbPath: string | null = null;

  try {
    eventDbPath = createEventDatabase(eventDbDirectory, details.eventCode);
    insertEvent(db, details);
    insertEventLog(db, details, eventDbPath);
  } catch (error) {
    if (eventDbPath) {
      removeEventDatabase(eventDbPath);
    }

    const statusCode = isConflictError(error) ? 409 : 500;
    return failure(
      statusCode,
      statusCode === 409
        ? "Event already exists."
        : "Failed to create event database.",
      resolveErrorMessage(error)
    );
  }

  if (!eventDbPath) {
    return failure(500, "Failed to create event database.");
  }

  return success({ eventDbPath });
};

const getArgValue = (key: string, fallback?: string): string | undefined => {
  const index = process.argv.indexOf(`--${key}`);
  if (index === -1) {
    return fallback;
  }
  return process.argv[index + 1] ?? fallback;
};

const parsePort = (rawPort: string | undefined): number => {
  const parsedPort = Number.parseInt(rawPort ?? "", 10);
  if (!Number.isFinite(parsedPort) || parsedPort <= 0 || parsedPort > 65_535) {
    return DEFAULT_SERVER_OPTIONS.port;
  }
  return parsedPort;
};

const parseServerOptions = (): ServerOptions => {
  const host =
    getArgValue("host", process.env.HOST) ?? DEFAULT_SERVER_OPTIONS.host;
  const port = parsePort(getArgValue("port", process.env.PORT));
  const dbPath =
    getArgValue("db-path", process.env.DB_PATH) ??
    DEFAULT_SERVER_OPTIONS.dbPath;
  const setupToken = getArgValue("setup-token", process.env.SETUP_TOKEN);
  const webDist = getArgValue("web-dist", process.env.WEB_DIST);

  return {
    host,
    port,
    dbPath,
    setupToken,
    webDist,
  };
};

const formatOrigin = (host: string, port: number): string => {
  if (port === 80) {
    return `http://${host}`;
  }

  return `http://${host}:${port}`;
};

const createDefaultAuthSecret = (seed: string): string => {
  return createHash("sha256").update(seed).digest("hex");
};

const ensureAuthEnvironment = (
  options: ServerOptions,
  resolvedDbPath: string
): void => {
  const originHost = options.host === "0.0.0.0" ? LOCALHOST : options.host;
  const defaultOrigin = formatOrigin(originHost, options.port);

  process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? defaultOrigin;
  process.env.BETTER_AUTH_URL =
    process.env.BETTER_AUTH_URL ?? `${defaultOrigin}/api/auth`;
  process.env.BETTER_AUTH_SECRET =
    process.env.BETTER_AUTH_SECRET ??
    createDefaultAuthSecret(`rms-local:${resolvedDbPath}`);
};

const ensureDatabasePath = (dbPath: string): void => {
  const directoryPath = path.dirname(path.resolve(dbPath));
  mkdirSync(directoryPath, { recursive: true });
};

const initializeCoreSchema = (db: Database): void => {
  db.exec(CORE_SCHEMA_SQL);
};

const getCounterOrDefault = (
  query: ReturnType<Database["query"]>,
  key: string
): number => {
  const row = query.get(key) as { value?: number } | null;
  return row?.value ?? 0;
};

const initDatabase = (dbPath: string) => {
  ensureDatabasePath(dbPath);
  const db = new Database(dbPath, { create: true });

  initializeCoreSchema(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    );
  `);

  db.query("INSERT OR IGNORE INTO app_state (key, value) VALUES (?1, ?2)").run(
    "counter",
    0
  );

  const readCounterQuery = db.query(
    "SELECT value FROM app_state WHERE key = ?1"
  );
  const incrementCounterQuery = db.query(
    "UPDATE app_state SET value = value + 1 WHERE key = ?1 RETURNING value"
  );

  return {
    db,
    getCounter: () => getCounterOrDefault(readCounterQuery, "counter"),
    incrementCounter: () =>
      getCounterOrDefault(incrementCounterQuery, "counter"),
  };
};

const createEventDatabase = (directory: string, eventCode: string): string => {
  const eventDbPath = path.join(directory, `${eventCode}.db`);
  if (existsSync(eventDbPath)) {
    throw new Error("Event database already exists.");
  }

  ensureDatabasePath(eventDbPath);
  const eventDb = new Database(eventDbPath, { create: true });
  try {
    eventDb.exec(EVENT_SCHEMA_SQL);
  } finally {
    eventDb.close();
  }
  return eventDbPath;
};

const removeEventDatabase = (eventDbPath: string): void => {
  if (!existsSync(eventDbPath)) {
    return;
  }

  unlinkSync(eventDbPath);
};

const normalizeRequestPath = (requestPath: string): string | null => {
  const normalizedPath = path.posix.normalize(requestPath);
  if (normalizedPath.includes("..")) {
    return null;
  }
  return normalizedPath === "/" ? "/index.html" : normalizedPath;
};

const serveStaticFile = async (
  webDist: string,
  requestPath: string
): Promise<Response | null> => {
  const normalizedPath = normalizeRequestPath(requestPath);
  if (!normalizedPath) {
    return null;
  }

  const absoluteWebDist = path.resolve(webDist);
  const absoluteFilePath = path.resolve(absoluteWebDist, `.${normalizedPath}`);
  if (!absoluteFilePath.startsWith(absoluteWebDist)) {
    return null;
  }

  const requestedFile = bunFile(absoluteFilePath);
  if (await requestedFile.exists()) {
    return new Response(requestedFile);
  }

  if (path.extname(normalizedPath).length > 0) {
    return null;
  }

  const indexFile = bunFile(path.join(absoluteWebDist, "index.html"));
  if (await indexFile.exists()) {
    return new Response(indexFile);
  }

  return null;
};

const createApp = (
  options: ServerOptions,
  dbHealthPath: string,
  getCounter: () => number,
  incrementCounter: () => number,
  auth: AuthHandler,
  db: Database,
  eventDbDirectory: string
) => {
  const app = new Hono();
  const allowedCorsOrigins = resolveAllowedCorsOrigins();

  app.use(
    "/api/*",
    cors({
      origin: (origin) => resolveCorsOrigin(origin, allowedCorsOrigins),
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "x-setup-token"],
      credentials: true,
    })
  );

  app.get("/api/setup/status", (c) => {
    return c.json({
      requiresAdminSetup: !isAdminInitialized(db),
    });
  });

  app.post("/api/setup/admin", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const requestValidation = validateSetupAdminRequest(
      options,
      db,
      c.req.header("x-setup-token"),
      payload
    );
    if ("failure" in requestValidation) {
      return c.json(
        {
          error: requestValidation.failure.error,
          details: requestValidation.failure.details,
        },
        requestValidation.failure.status
      );
    }

    const setupResult = await bootstrapAdminUser(
      auth,
      db,
      requestValidation.value
    );
    if ("failure" in setupResult) {
      return c.json(
        {
          error: setupResult.failure.error,
          details: setupResult.failure.details,
        },
        setupResult.failure.status
      );
    }

    return c.json(
      {
        role: ADMIN_ROLE,
        username: setupResult.value.username,
      },
      201
    );
  });

  app.on(["POST", "GET"], "/api/auth/**", (c) => auth.handler(c.req.raw));

  app.post("/api/events", async (c) => {
    const authorization = await authorizeAdminEventRequest(auth, db, c.req.raw);
    if ("failure" in authorization) {
      return c.json(
        { error: authorization.failure.error },
        authorization.failure.status
      );
    }

    const payload = await c.req.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return c.json({ error: "Invalid request body." }, 400);
    }

    const data = payload as Record<string, unknown>;
    const eventCode = normalizeEventCode(data.eventCode);
    if (!eventCode) {
      return c.json({ error: "eventCode is required." }, 400);
    }

    if (hasExistingEvent(db, eventCode)) {
      return c.json({ error: "Event already exists." }, 409);
    }

    const details = buildEventDetails(data, eventCode);
    const eventCreationResult = createEventArtifacts(
      db,
      eventDbDirectory,
      details
    );
    if ("failure" in eventCreationResult) {
      return c.json(
        {
          error: eventCreationResult.failure.error,
          details: eventCreationResult.failure.details,
        },
        eventCreationResult.failure.status
      );
    }

    return c.json({
      eventCode,
      eventDbPath: eventCreationResult.value.eventDbPath,
    });
  });

  app.get("/api/health", (c) => {
    return c.json({
      status: "ok",
      database: dbHealthPath,
      host: options.host,
      port: options.port,
      startedAt: new Date().toISOString(),
    });
  });

  app.get("/api/counter", (c) => {
    return c.json({
      value: getCounter(),
    });
  });

  app.post("/api/counter/increment", (c) => {
    return c.json({
      value: incrementCounter(),
    });
  });

  app.get("*", async (c) => {
    if (!options.webDist) {
      return c.text(
        "RMS server is running. Build the web app to serve UI.",
        200
      );
    }

    const response = await serveStaticFile(options.webDist, c.req.path);
    if (response) {
      return response;
    }

    return c.notFound();
  });

  return app;
};

const main = async (): Promise<void> => {
  const options = parseServerOptions();
  const resolvedDbPath = path.resolve(options.dbPath);
  process.env.DB_PATH = resolvedDbPath;
  process.env.DATABASE_URL = `file:${resolvedDbPath}`;
  ensureAuthEnvironment(options, resolvedDbPath);

  const { auth } = await import("@rms-local/auth");
  const { db, getCounter, incrementCounter } = initDatabase(resolvedDbPath);
  const app = createApp(
    options,
    resolvedDbPath,
    getCounter,
    incrementCounter,
    auth,
    db,
    path.dirname(resolvedDbPath)
  );

  const server = serve({
    fetch: app.fetch,
    hostname: options.host,
    port: options.port,
  });

  console.log(`[server] listening at http://${options.host}:${options.port}`);
  console.log(`[server] using db at ${resolvedDbPath}`);
  console.log("[server] core schema initialized");
  if (options.webDist) {
    console.log(
      `[server] serving web assets from ${path.resolve(options.webDist)}`
    );
  }

  const shutdown = (): void => {
    server.stop(true);
    db.close();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
};

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : error;
  console.error("[server] startup failed:", message);
  process.exit(1);
});
