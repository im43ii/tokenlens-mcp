import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';
import { Session, Budget, User, TokenBreakdown } from '../types/index';

export const sessionEvents = new EventEmitter();

function getDbPath(): string {
  const dataDir = path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.tokenlens');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, 'sessions.db');
}

let db: Database | null = null;
let dbPath: string | null = null;

function persist(): void {
  if (!db || !dbPath) return;
  fs.writeFileSync(dbPath, db.export());
}

export function getDb(): Database {
  if (db) return db;
  throw new Error('Database not initialised — call initDb() first');
}

export async function initDb(): Promise<void> {
  if (db) return;
  const SQL = await initSqlJs();
  dbPath = getDbPath();
  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }
  initSchema();
}

function initSchema(): void {
  const database = getDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      breakdown_json TEXT NOT NULL,
      waste_json TEXT NOT NULL,
      suggestions_json TEXT NOT NULL,
      cost REAL NOT NULL,
      editor TEXT DEFAULT 'other'
    );

    CREATE TABLE IF NOT EXISTS budget (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      session_limit INTEGER,
      daily_limit INTEGER,
      alert_threshold REAL NOT NULL DEFAULT 0.8
    );

    CREATE TABLE IF NOT EXISTS rate_limits (
      user_id TEXT NOT NULL,
      window_start INTEGER NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, window_start)
    );

    INSERT OR IGNORE INTO budget (id, session_limit, daily_limit, alert_threshold)
    VALUES (1, NULL, NULL, 0.8);
  `);
  persist();
}

// ── helpers ───────────────────────────────────────────────────────────────────

function queryOne(sql: string, params: (string | number | null)[] = []): Record<string, unknown> | null {
  const database = getDb();
  const stmt = database.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row as Record<string, unknown>;
  }
  stmt.free();
  return null;
}

function queryAll(sql: string, params: (string | number | null)[] = []): Record<string, unknown>[] {
  const database = getDb();
  const stmt = database.prepare(sql);
  stmt.bind(params);
  const rows: Record<string, unknown>[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as Record<string, unknown>);
  }
  stmt.free();
  return rows;
}

// ── User management ────────────────────────────────────────────────────────────

export function createUser(id: string, token: string, name: string): User {
  const database = getDb();
  const now = Date.now();
  database.run(
    'INSERT INTO users (id, token, name, created_at, is_active) VALUES (?, ?, ?, ?, 1)',
    [id, token, name, now]
  );
  persist();
  return { id, token, name, createdAt: now, isActive: true };
}

export function getUserByToken(token: string): User | null {
  const row = queryOne('SELECT * FROM users WHERE token = ? AND is_active = 1', [token]);
  return row ? deserializeUser(row) : null;
}

export function getAllUsers(): User[] {
  return queryAll('SELECT * FROM users ORDER BY created_at DESC').map(deserializeUser);
}

function deserializeUser(row: Record<string, unknown>): User {
  return {
    id: row['id'] as string,
    token: row['token'] as string,
    name: row['name'] as string,
    createdAt: row['created_at'] as number,
    isActive: row['is_active'] === 1,
  };
}

// ── Rate limiting ──────────────────────────────────────────────────────────────

export function checkRateLimit(userId: string, maxRequests = 100, windowMs = 3600000): boolean {
  const database = getDb();
  const now = Date.now();
  const windowStart = now - (now % windowMs);

  const row = queryOne(
    'SELECT request_count FROM rate_limits WHERE user_id = ? AND window_start = ?',
    [userId, windowStart]
  );

  if (!row) {
    database.run(
      'INSERT INTO rate_limits (user_id, window_start, request_count) VALUES (?, ?, 1)',
      [userId, windowStart]
    );
    persist();
    return true;
  }

  if ((row['request_count'] as number) >= maxRequests) return false;

  database.run(
    'UPDATE rate_limits SET request_count = request_count + 1 WHERE user_id = ? AND window_start = ?',
    [userId, windowStart]
  );
  persist();
  return true;
}

// ── Session management ─────────────────────────────────────────────────────────

export function saveSession(session: Session): void {
  const database = getDb();
  database.run(
    `INSERT OR REPLACE INTO sessions
       (id, user_id, provider, model, timestamp, breakdown_json, waste_json, suggestions_json, cost, editor)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      session.id,
      session.userId,
      session.provider,
      session.model,
      session.timestamp,
      JSON.stringify(session.breakdown),
      JSON.stringify(session.waste),
      JSON.stringify(session.suggestions),
      session.cost,
      session.editor || 'other',
    ]
  );
  persist();
  sessionEvents.emit('new_session', session);
}

export function getSession(id: string, userId?: string): Session | null {
  const row = userId
    ? queryOne('SELECT * FROM sessions WHERE id = ? AND user_id = ?', [id, userId])
    : queryOne('SELECT * FROM sessions WHERE id = ?', [id]);
  return row ? deserializeSession(row) : null;
}

export function getRecentSessions(userId: string, limit = 10): Session[] {
  return queryAll(
    'SELECT * FROM sessions WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?',
    [userId, limit]
  ).map(deserializeSession);
}

export function getTotalStats(userId?: string): { totalSessions: number; totalTokens: number; totalCost: number } {
  const row = userId
    ? queryOne(
        `SELECT COUNT(*) as totalSessions,
                SUM(json_extract(breakdown_json, '$.total')) as totalTokens,
                SUM(cost) as totalCost
         FROM sessions WHERE user_id = ?`,
        [userId]
      )
    : queryOne(
        `SELECT COUNT(*) as totalSessions,
                SUM(json_extract(breakdown_json, '$.total')) as totalTokens,
                SUM(cost) as totalCost
         FROM sessions`
      );
  return {
    totalSessions: (row?.['totalSessions'] as number) || 0,
    totalTokens:   (row?.['totalTokens']   as number) || 0,
    totalCost:     (row?.['totalCost']     as number) || 0,
  };
}

export function getBudget(): Budget {
  const row = queryOne('SELECT * FROM budget WHERE id = 1');
  return {
    sessionLimit:   (row?.['session_limit']   as number | null) ?? null,
    dailyLimit:     (row?.['daily_limit']     as number | null) ?? null,
    alertThreshold: (row?.['alert_threshold'] as number)        ?? 0.8,
  };
}

export function setBudget(budget: Partial<Budget>): void {
  const database = getDb();
  if (budget.sessionLimit !== undefined) {
    database.run('UPDATE budget SET session_limit = ? WHERE id = 1', [budget.sessionLimit]);
  }
  if (budget.dailyLimit !== undefined) {
    database.run('UPDATE budget SET daily_limit = ? WHERE id = 1', [budget.dailyLimit]);
  }
  if (budget.alertThreshold !== undefined) {
    database.run('UPDATE budget SET alert_threshold = ? WHERE id = 1', [budget.alertThreshold]);
  }
  persist();
}

export function getAllRecentSessions(limit = 10): Session[] {
  return queryAll(
    'SELECT * FROM sessions ORDER BY timestamp DESC LIMIT ?',
    [limit]
  ).map(deserializeSession);
}

export function getAggregateBreakdown(): TokenBreakdown {
  const row = queryOne(`
    SELECT
      SUM(json_extract(breakdown_json,'$.system'))      AS system,
      SUM(json_extract(breakdown_json,'$.history'))     AS history,
      SUM(json_extract(breakdown_json,'$.tools'))       AS tools,
      SUM(json_extract(breakdown_json,'$.userMessage')) AS userMessage,
      SUM(json_extract(breakdown_json,'$.response'))    AS response,
      SUM(json_extract(breakdown_json,'$.total'))       AS total
    FROM sessions
  `);
  return {
    system:      (row?.['system']      as number) || 0,
    history:     (row?.['history']     as number) || 0,
    tools:       (row?.['tools']       as number) || 0,
    userMessage: (row?.['userMessage'] as number) || 0,
    response:    (row?.['response']    as number) || 0,
    total:       (row?.['total']       as number) || 0,
  };
}

export function getStatsByEditor(userId?: string): Record<string, { sessions: number; tokens: number; cost: number }> {
  const rows = userId
    ? queryAll(
        `SELECT editor, COUNT(*) as cnt,
                SUM(json_extract(breakdown_json,'$.total')) as tok,
                SUM(cost) as cost
         FROM sessions WHERE user_id = ? GROUP BY editor`,
        [userId]
      )
    : queryAll(
        `SELECT editor, COUNT(*) as cnt,
                SUM(json_extract(breakdown_json,'$.total')) as tok,
                SUM(cost) as cost
         FROM sessions GROUP BY editor`
      );
  const result: Record<string, { sessions: number; tokens: number; cost: number }> = {};
  for (const r of rows) {
    result[(r['editor'] as string) || 'other'] = {
      sessions: (r['cnt']  as number) || 0,
      tokens:   (r['tok']  as number) || 0,
      cost:     (r['cost'] as number) || 0,
    };
  }
  return result;
}

export function getSessionsInDateRange(userId: string | undefined, startMs: number, endMs: number): Session[] {
  return (userId
    ? queryAll(
        'SELECT * FROM sessions WHERE user_id = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC',
        [userId, startMs, endMs]
      )
    : queryAll(
        'SELECT * FROM sessions WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC',
        [startMs, endMs]
      )
  ).map(deserializeSession);
}

function deserializeSession(row: Record<string, unknown>): Session {
  return {
    id:          row['id']       as string,
    userId:      row['user_id']  as string,
    provider:    row['provider'] as string,
    model:       row['model']    as string,
    editor:      (row['editor']  as string) || 'other',
    timestamp:   row['timestamp'] as number,
    breakdown:   JSON.parse(row['breakdown_json']   as string),
    waste:       JSON.parse(row['waste_json']        as string),
    suggestions: JSON.parse(row['suggestions_json']  as string),
    cost:        row['cost'] as number,
  };
}
