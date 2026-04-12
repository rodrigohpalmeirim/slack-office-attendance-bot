import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";

const DB_PATH = process.env.DATABASE_PATH || "./data/attendance.db";

// Ensure the directory exists
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA foreign_keys = ON");

// --- Schema ---

db.run(`
  CREATE TABLE IF NOT EXISTS config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    default_ask_time TEXT NOT NULL DEFAULT '16:00',
    active_days TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
    admin_user_ids TEXT NOT NULL DEFAULT '[]',
    lunch_user_ids TEXT NOT NULL DEFAULT '[]'
  )
`);

// Migration: add lunch_user_ids if missing
try { db.run("ALTER TABLE config ADD COLUMN lunch_user_ids TEXT NOT NULL DEFAULT '[]'"); } catch {}

db.run("INSERT OR IGNORE INTO config (id) VALUES (1)");

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    slack_user_id TEXT PRIMARY KEY,
    is_target INTEGER NOT NULL DEFAULT 0,
    custom_ask_time TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    timezone TEXT,
    timezone_updated_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slack_user_id TEXT NOT NULL,
    target_date TEXT NOT NULL,
    response TEXT,
    message_ts TEXT,
    channel_id TEXT,
    asked_at TEXT NOT NULL DEFAULT (datetime('now')),
    responded_at TEXT,
    UNIQUE(slack_user_id, target_date),
    FOREIGN KEY (slack_user_id) REFERENCES users(slack_user_id)
  )
`);

db.run("CREATE INDEX IF NOT EXISTS idx_responses_target_date ON responses(target_date)");
db.run("CREATE INDEX IF NOT EXISTS idx_responses_user_date ON responses(slack_user_id, target_date)");

// Migrations: add columns if they don't exist
try { db.run("ALTER TABLE users ADD COLUMN active_days_override TEXT"); } catch {}
try { db.run("ALTER TABLE users ADD COLUMN lunch_enabled INTEGER NOT NULL DEFAULT 1"); } catch {}
try { db.run("ALTER TABLE users ADD COLUMN is_lunch_target INTEGER NOT NULL DEFAULT 0"); } catch {}
try { db.run("ALTER TABLE responses ADD COLUMN lunch_response TEXT"); } catch {}
// Sync: users who had opted out via enabled=0 should have is_target=0
db.run("UPDATE users SET is_target = 0 WHERE enabled = 0 AND is_target = 1");

// Stores the live summary message ts/channel per user per date so it can be updated in-place
db.run(`
  CREATE TABLE IF NOT EXISTS live_summaries (
    slack_user_id TEXT NOT NULL,
    target_date TEXT NOT NULL,
    message_ts TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(slack_user_id, target_date)
  )
`);

// Seed initial admin IDs from env
const initialAdmins = process.env.INITIAL_ADMIN_IDS;
if (initialAdmins) {
  const adminIds = initialAdmins.split(",").map((id) => id.trim()).filter(Boolean);
  const current = db.query<{ admin_user_ids: string }, []>("SELECT admin_user_ids FROM config WHERE id = 1").get();
  if (current && current.admin_user_ids === "[]") {
    db.run("UPDATE config SET admin_user_ids = ? WHERE id = 1", [JSON.stringify(adminIds)]);
  }
}

// --- Types ---

export interface Config {
  default_ask_time: string;
  active_days: string; // JSON array
  admin_user_ids: string; // JSON array
  lunch_user_ids: string; // JSON array
}

export interface User {
  slack_user_id: string;
  is_target: number;
  custom_ask_time: string | null;
  enabled: number;
  timezone: string | null;
  timezone_updated_at: string | null;
  active_days_override: string | null; // JSON number[], null means all active days
  lunch_enabled: number; // deprecated, kept for migration
  is_lunch_target: number;
}

export interface Response {
  id: number;
  slack_user_id: string;
  target_date: string;
  response: string | null;
  message_ts: string | null;
  channel_id: string | null;
  asked_at: string;
  responded_at: string | null;
  lunch_response: string | null;
}

export interface LiveSummary {
  slack_user_id: string;
  target_date: string;
  message_ts: string;
  channel_id: string;
}

// --- Query Functions ---

export function getConfig(): Config {
  return db.query<Config, []>("SELECT default_ask_time, active_days, admin_user_ids, lunch_user_ids FROM config WHERE id = 1").get()!;
}

export function getLunchUserIds(): string[] {
  const config = getConfig();
  return JSON.parse(config.lunch_user_ids) as string[];
}

export function updateConfig(fields: Partial<Config>): void {
  const sets: string[] = [];
  const values: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    sets.push(`${key} = ?`);
    values.push(value as string);
  }
  if (sets.length > 0) {
    db.run(`UPDATE config SET ${sets.join(", ")} WHERE id = 1`, values);
  }
}

export function getUser(slackUserId: string): User | null {
  return db.query<User, [string]>("SELECT * FROM users WHERE slack_user_id = ?").get(slackUserId);
}

export function upsertUser(slackUserId: string, fields: Partial<Omit<User, "slack_user_id">>): void {
  const existing = getUser(slackUserId);
  if (existing) {
    const sets: string[] = ["updated_at = datetime('now')"];
    const values: (string | number | null)[] = [];
    for (const [key, value] of Object.entries(fields)) {
      sets.push(`${key} = ?`);
      values.push(value as string | number | null);
    }
    values.push(slackUserId);
    db.run(`UPDATE users SET ${sets.join(", ")} WHERE slack_user_id = ?`, values);
  } else {
    const columns = ["slack_user_id", ...Object.keys(fields)];
    const placeholders = columns.map(() => "?");
    const values = [slackUserId, ...Object.values(fields)] as (string | number | null)[];
    db.run(`INSERT INTO users (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`, values);
  }
}

export function getTargetUsers(): User[] {
  return db.query<User, []>("SELECT * FROM users WHERE is_target = 1").all();
}

export function getLunchTargetUsers(): User[] {
  return db.query<User, []>("SELECT * FROM users WHERE is_lunch_target = 1").all();
}

export function getLunchTargetUserIds(): string[] {
  return db.query<{ slack_user_id: string }, []>("SELECT slack_user_id FROM users WHERE is_lunch_target = 1").all().map((r) => r.slack_user_id);
}

export function setLunchTargetUsers(userIds: string[]): void {
  db.run("UPDATE users SET is_lunch_target = 0");
  for (const userId of userIds) {
    // Adding to lunch implicitly opts the user into attendance as well
    upsertUser(userId, { is_lunch_target: 1, is_target: 1 });
  }
}

/**
 * Returns enabled target users who should receive a notification on the given
 * ISO weekday (1=Monday…7=Sunday). Users with no override receive on all days.
 */
export function getTargetUsersForWeekday(weekday: number): User[] {
  return getTargetUsers().filter((u) => {
    if (!u.active_days_override) return true;
    return (JSON.parse(u.active_days_override) as number[]).includes(weekday);
  });
}

export function getTargetUserIds(): string[] {
  return db.query<{ slack_user_id: string }, []>("SELECT slack_user_id FROM users WHERE is_target = 1").all().map((r) => r.slack_user_id);
}

export function getResponseForUserDate(slackUserId: string, targetDate: string): Response | null {
  return db.query<Response, [string, string]>(
    "SELECT * FROM responses WHERE slack_user_id = ? AND target_date = ?"
  ).get(slackUserId, targetDate);
}

export function getResponsesForDate(targetDate: string): Response[] {
  return db.query<Response, [string]>("SELECT * FROM responses WHERE target_date = ?").all(targetDate);
}

export function upsertResponse(slackUserId: string, targetDate: string, fields: Partial<Omit<Response, "id" | "slack_user_id" | "target_date">>): void {
  const existing = getResponseForUserDate(slackUserId, targetDate);
  if (existing) {
    const sets: string[] = [];
    const values: (string | null)[] = [];
    for (const [key, value] of Object.entries(fields)) {
      sets.push(`${key} = ?`);
      values.push(value as string | null);
    }
    values.push(slackUserId, targetDate);
    db.run(`UPDATE responses SET ${sets.join(", ")} WHERE slack_user_id = ? AND target_date = ?`, values);
  } else {
    const columns = ["slack_user_id", "target_date", ...Object.keys(fields)];
    const placeholders = columns.map(() => "?");
    const values = [slackUserId, targetDate, ...Object.values(fields)] as (string | null)[];
    db.run(`INSERT INTO responses (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`, values);
  }
}

export function getAdminIds(): string[] {
  const config = getConfig();
  return JSON.parse(config.admin_user_ids) as string[];
}

export function isAdmin(slackUserId: string): boolean {
  return getAdminIds().includes(slackUserId);
}

export function getLiveSummariesForDate(targetDate: string): LiveSummary[] {
  return db.query<LiveSummary, [string]>(
    "SELECT * FROM live_summaries WHERE target_date = ?"
  ).all(targetDate);
}

export function upsertLiveSummary(slackUserId: string, targetDate: string, messageTs: string, channelId: string): void {
  db.run(
    "INSERT OR IGNORE INTO live_summaries (slack_user_id, target_date, message_ts, channel_id) VALUES (?, ?, ?, ?)",
    [slackUserId, targetDate, messageTs, channelId]
  );
}

export function setTargetUsers(userIds: string[]): void {
  // Users removed from attendance are also removed from lunch
  db.run("UPDATE users SET is_target = 0, is_lunch_target = 0, updated_at = datetime('now')");
  for (const userId of userIds) {
    upsertUser(userId, { is_target: 1 });
  }
}
