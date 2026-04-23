import initSqlJs, { Database } from 'sql.js';
import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';
import { Session, Budget, User, TokenBreakdown } from '../types/index';

export const sessionEvents = new EventEmitter();

const USE_POSTGRES = !!process.env.DATABASE_URL;

// ── PostgreSQL setup ──────────────────────────────────────────────────────────

let pgPool: Pool | null = null;

// ── SQLite setup ──────────────────────────────────────────────────────────────

let sqliteDb: Database | null = null;
let sqliteDbPath: string | null = null;

function getDbPath(): string {
  const dataDir = path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.tokenlens');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, 'sessions.db');
}

function persist(): void {
  if (!sqliteDb || !sqliteDbPath) return;
  fs.writeFileSync(sqliteDbPath, sqliteDb.export());
}

// ── initDb ────────────────────────────────────────────────────────────────────

export async function initDb(): Promise<void> {
  if (USE_POSTGRES) {
    if (pgPool) return;
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await initPgSchema();
  } else {
    if (sqliteDb) return;
    const SQL = await initSqlJs();
    sqliteDbPath = getDbPath();
    if (fs.existsSync(sqliteDbPath)) {
      const buf = fs.readFileSync(sqliteDbPath);
      sqliteDb = new SQL.Database(buf);
    } else {
      sqliteDb = new SQL.Database();
    }
    initSqliteSchema();
  }
}

// ── Schema ────────────────────────────────────────────────────────────────────

async function initPgSchema(): Promise<void> {
  await pgPool!.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      "timestamp" BIGINT NOT NULL,
      breakdown_json TEXT NOT NULL,
      waste_json TEXT NOT NULL,
      suggestions_json TEXT NOT NULL,
      cost DOUBLE PRECISION NOT NULL,
      editor TEXT DEFAULT 'other'
    );

    CREATE TABLE IF NOT EXISTS budget (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      session_limit INTEGER,
      daily_limit INTEGER,
      alert_threshold DOUBLE PRECISION NOT NULL DEFAULT 0.8
    );

    CREATE TABLE IF NOT EXISTS rate_limits (
      user_id TEXT NOT NULL,
      window_start BIGINT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, window_start)
    );

    INSERT INTO budget (id, session_limit, daily_limit, alert_threshold)
    VALUES (1, NULL, NULL, 0.8)
    ON CONFLICT (id) DO NOTHING;
  `);
}

function initSqliteSchema(): void {
  if (!sqliteDb) throw new Error('SQLite not initialised');
  sqliteDb.exec(`
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

// ── PostgreSQL helpers ────────────────────────────────────────────────────────

async function pgQueryOne(sql: string, params: (string | number | null)[] = []): Promise<Record<string, unknown> | null> {
  const { rows } = await pgPool!.query(sql, params);
  return rows[0] ?? null;
}

async function pgQueryAll(sql: string, params: (string | number | null)[] = []): Promise<Record<string, unknown>[]> {
  const { rows } = await pgPool!.query(sql, params);
  return rows;
}

async function pgRun(sql: string, params: (string | number | null)[] = []): Promise<void> {
  await pgPool!.query(sql, params);
}

// ── SQLite helpers ────────────────────────────────────────────────────────────

function sqliteQueryOne(sql: string, params: (string | number | null)[] = []): Record<string, unknown> | null {
  if (!sqliteDb) throw new Error('SQLite not initialised');
  const stmt = sqliteDb.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row as Record<string, unknown>;
  }
  stmt.free();
  return null;
}

function sqliteQueryAll(sql: string, params: (string | number | null)[] = []): Record<string, unknown>[] {
  if (!sqliteDb) throw new Error('SQLite not initialised');
  const stmt = sqliteDb.prepare(sql);
  stmt.bind(params);
  const rows: Record<string, unknown>[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as Record<string, unknown>);
  }
  stmt.free();
  return rows;
}

function sqliteRun(sql: string, params: (string | number | null)[] = []): void {
  if (!sqliteDb) throw new Error('SQLite not initialised');
  sqliteDb.run(sql, params);
}

// ── User management ────────────────────────────────────────────────────────────

export async function createUser(id: string, token: string, name: string): Promise<User> {
  const now = Date.now();
  if (USE_POSTGRES) {
    await pgRun(
      'INSERT INTO users (id, token, name, created_at, is_active) VALUES ($1, $2, $3, $4, TRUE)',
      [id, token, name, now]
    );
  } else {
    sqliteRun(
      'INSERT INTO users (id, token, name, created_at, is_active) VALUES (?, ?, ?, ?, 1)',
      [id, token, name, now]
    );
    persist();
  }
  return { id, token, name, createdAt: now, isActive: true };
}

export async function getUserByToken(token: string): Promise<User | null> {
  if (USE_POSTGRES) {
    const row = await pgQueryOne('SELECT * FROM users WHERE token = $1 AND is_active = TRUE', [token]);
    return row ? deserializeUser(row) : null;
  } else {
    const row = sqliteQueryOne('SELECT * FROM users WHERE token = ? AND is_active = 1', [token]);
    return row ? deserializeUser(row) : null;
  }
}

export async function getAllUsers(): Promise<User[]> {
  if (USE_POSTGRES) {
    const rows = await pgQueryAll('SELECT * FROM users ORDER BY created_at DESC');
    return rows.map(deserializeUser);
  } else {
    return sqliteQueryAll('SELECT * FROM users ORDER BY created_at DESC').map(deserializeUser);
  }
}

function deserializeUser(row: Record<string, unknown>): User {
  return {
    id:        row['id']    as string,
    token:     row['token'] as string,
    name:      row['name']  as string,
    createdAt: Number(row['created_at']),
    isActive:  row['is_active'] === true || row['is_active'] === 1,
  };
}

// ── Rate limiting ──────────────────────────────────────────────────────────────

export async function checkRateLimit(userId: string, maxRequests = 100, windowMs = 3600000): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - (now % windowMs);

  if (USE_POSTGRES) {
    const row = await pgQueryOne(
      'SELECT request_count FROM rate_limits WHERE user_id = $1 AND window_start = $2',
      [userId, windowStart]
    );
    if (!row) {
      await pgRun(
        'INSERT INTO rate_limits (user_id, window_start, request_count) VALUES ($1, $2, 1)',
        [userId, windowStart]
      );
      return true;
    }
    if ((row['request_count'] as number) >= maxRequests) return false;
    await pgRun(
      'UPDATE rate_limits SET request_count = request_count + 1 WHERE user_id = $1 AND window_start = $2',
      [userId, windowStart]
    );
    return true;
  } else {
    const row = sqliteQueryOne(
      'SELECT request_count FROM rate_limits WHERE user_id = ? AND window_start = ?',
      [userId, windowStart]
    );
    if (!row) {
      sqliteRun(
        'INSERT INTO rate_limits (user_id, window_start, request_count) VALUES (?, ?, 1)',
        [userId, windowStart]
      );
      persist();
      return true;
    }
    if ((row['request_count'] as number) >= maxRequests) return false;
    sqliteRun(
      'UPDATE rate_limits SET request_count = request_count + 1 WHERE user_id = ? AND window_start = ?',
      [userId, windowStart]
    );
    persist();
    return true;
  }
}

// ── Session management ─────────────────────────────────────────────────────────

export async function saveSession(session: Session): Promise<void> {
  if (USE_POSTGRES) {
    await pgRun(
      `INSERT INTO sessions
         (id, user_id, provider, model, "timestamp", breakdown_json, waste_json, suggestions_json, cost, editor)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         provider = EXCLUDED.provider,
         model = EXCLUDED.model,
         "timestamp" = EXCLUDED."timestamp",
         breakdown_json = EXCLUDED.breakdown_json,
         waste_json = EXCLUDED.waste_json,
         suggestions_json = EXCLUDED.suggestions_json,
         cost = EXCLUDED.cost,
         editor = EXCLUDED.editor`,
      [
        session.id, session.userId, session.provider, session.model, session.timestamp,
        JSON.stringify(session.breakdown), JSON.stringify(session.waste),
        JSON.stringify(session.suggestions), session.cost, session.editor || 'other',
      ]
    );
  } else {
    sqliteRun(
      `INSERT OR REPLACE INTO sessions
         (id, user_id, provider, model, timestamp, breakdown_json, waste_json, suggestions_json, cost, editor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id, session.userId, session.provider, session.model, session.timestamp,
        JSON.stringify(session.breakdown), JSON.stringify(session.waste),
        JSON.stringify(session.suggestions), session.cost, session.editor || 'other',
      ]
    );
    persist();
  }
  sessionEvents.emit('new_session', session);
}

export async function getSession(id: string, userId?: string): Promise<Session | null> {
  if (USE_POSTGRES) {
    const row = userId
      ? await pgQueryOne('SELECT * FROM sessions WHERE id = $1 AND user_id = $2', [id, userId])
      : await pgQueryOne('SELECT * FROM sessions WHERE id = $1', [id]);
    return row ? deserializeSession(row) : null;
  } else {
    const row = userId
      ? sqliteQueryOne('SELECT * FROM sessions WHERE id = ? AND user_id = ?', [id, userId])
      : sqliteQueryOne('SELECT * FROM sessions WHERE id = ?', [id]);
    return row ? deserializeSession(row) : null;
  }
}

export async function getRecentSessions(userId: string, limit = 10): Promise<Session[]> {
  if (USE_POSTGRES) {
    const rows = await pgQueryAll(
      'SELECT * FROM sessions WHERE user_id = $1 ORDER BY "timestamp" DESC LIMIT $2',
      [userId, limit]
    );
    return rows.map(deserializeSession);
  } else {
    return sqliteQueryAll(
      'SELECT * FROM sessions WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?',
      [userId, limit]
    ).map(deserializeSession);
  }
}

export async function getAllRecentSessions(limit = 10): Promise<Session[]> {
  if (USE_POSTGRES) {
    const rows = await pgQueryAll(
      'SELECT * FROM sessions ORDER BY "timestamp" DESC LIMIT $1',
      [limit]
    );
    return rows.map(deserializeSession);
  } else {
    return sqliteQueryAll(
      'SELECT * FROM sessions ORDER BY timestamp DESC LIMIT ?',
      [limit]
    ).map(deserializeSession);
  }
}

export async function getTotalStats(userId?: string): Promise<{ totalSessions: number; totalTokens: number; totalCost: number }> {
  if (USE_POSTGRES) {
    const row = userId
      ? await pgQueryOne(
          `SELECT COUNT(*)::int AS "totalSessions",
                  COALESCE(SUM((breakdown_json::json->>'total')::numeric), 0)::float8 AS "totalTokens",
                  COALESCE(SUM(cost), 0) AS "totalCost"
           FROM sessions WHERE user_id = $1`,
          [userId]
        )
      : await pgQueryOne(
          `SELECT COUNT(*)::int AS "totalSessions",
                  COALESCE(SUM((breakdown_json::json->>'total')::numeric), 0)::float8 AS "totalTokens",
                  COALESCE(SUM(cost), 0) AS "totalCost"
           FROM sessions`
        );
    return {
      totalSessions: (row?.['totalSessions'] as number) || 0,
      totalTokens:   (row?.['totalTokens']   as number) || 0,
      totalCost:     (row?.['totalCost']     as number) || 0,
    };
  } else {
    const row = userId
      ? sqliteQueryOne(
          `SELECT COUNT(*) as totalSessions,
                  SUM(json_extract(breakdown_json, '$.total')) as totalTokens,
                  SUM(cost) as totalCost
           FROM sessions WHERE user_id = ?`,
          [userId]
        )
      : sqliteQueryOne(
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
}

export async function getBudget(): Promise<Budget> {
  if (USE_POSTGRES) {
    const row = await pgQueryOne('SELECT * FROM budget WHERE id = 1');
    return {
      sessionLimit:   (row?.['session_limit']   as number | null) ?? null,
      dailyLimit:     (row?.['daily_limit']     as number | null) ?? null,
      alertThreshold: (row?.['alert_threshold'] as number)        ?? 0.8,
    };
  } else {
    const row = sqliteQueryOne('SELECT * FROM budget WHERE id = 1');
    return {
      sessionLimit:   (row?.['session_limit']   as number | null) ?? null,
      dailyLimit:     (row?.['daily_limit']     as number | null) ?? null,
      alertThreshold: (row?.['alert_threshold'] as number)        ?? 0.8,
    };
  }
}

export async function setBudget(budget: Partial<Budget>): Promise<void> {
  if (USE_POSTGRES) {
    if (budget.sessionLimit !== undefined) {
      await pgRun('UPDATE budget SET session_limit = $1 WHERE id = 1', [budget.sessionLimit]);
    }
    if (budget.dailyLimit !== undefined) {
      await pgRun('UPDATE budget SET daily_limit = $1 WHERE id = 1', [budget.dailyLimit]);
    }
    if (budget.alertThreshold !== undefined) {
      await pgRun('UPDATE budget SET alert_threshold = $1 WHERE id = 1', [budget.alertThreshold]);
    }
  } else {
    if (budget.sessionLimit !== undefined) {
      sqliteRun('UPDATE budget SET session_limit = ? WHERE id = 1', [budget.sessionLimit]);
    }
    if (budget.dailyLimit !== undefined) {
      sqliteRun('UPDATE budget SET daily_limit = ? WHERE id = 1', [budget.dailyLimit]);
    }
    if (budget.alertThreshold !== undefined) {
      sqliteRun('UPDATE budget SET alert_threshold = ? WHERE id = 1', [budget.alertThreshold]);
    }
    persist();
  }
}

export async function getAggregateBreakdown(userId?: string): Promise<TokenBreakdown> {
  if (USE_POSTGRES) {
    const row = userId
      ? await pgQueryOne(`
          SELECT
            COALESCE(SUM((breakdown_json::json->>'system')::numeric),      0)::float8 AS system,
            COALESCE(SUM((breakdown_json::json->>'history')::numeric),     0)::float8 AS history,
            COALESCE(SUM((breakdown_json::json->>'tools')::numeric),       0)::float8 AS tools,
            COALESCE(SUM((breakdown_json::json->>'userMessage')::numeric), 0)::float8 AS "userMessage",
            COALESCE(SUM((breakdown_json::json->>'response')::numeric),    0)::float8 AS response,
            COALESCE(SUM((breakdown_json::json->>'total')::numeric),       0)::float8 AS total
          FROM sessions WHERE user_id = $1
        `, [userId])
      : await pgQueryOne(`
          SELECT
            COALESCE(SUM((breakdown_json::json->>'system')::numeric),      0)::float8 AS system,
            COALESCE(SUM((breakdown_json::json->>'history')::numeric),     0)::float8 AS history,
            COALESCE(SUM((breakdown_json::json->>'tools')::numeric),       0)::float8 AS tools,
            COALESCE(SUM((breakdown_json::json->>'userMessage')::numeric), 0)::float8 AS "userMessage",
            COALESCE(SUM((breakdown_json::json->>'response')::numeric),    0)::float8 AS response,
            COALESCE(SUM((breakdown_json::json->>'total')::numeric),       0)::float8 AS total
          FROM sessions
        `);
    return {
      system:      (row?.['system']        as number) || 0,
      history:     (row?.['history']       as number) || 0,
      tools:       (row?.['tools']         as number) || 0,
      userMessage: (row?.['userMessage']   as number) || 0,
      response:    (row?.['response']      as number) || 0,
      total:       (row?.['total']         as number) || 0,
    };
  } else {
    const row = userId
      ? sqliteQueryOne(`
          SELECT
            SUM(json_extract(breakdown_json,'$.system'))      AS system,
            SUM(json_extract(breakdown_json,'$.history'))     AS history,
            SUM(json_extract(breakdown_json,'$.tools'))       AS tools,
            SUM(json_extract(breakdown_json,'$.userMessage')) AS userMessage,
            SUM(json_extract(breakdown_json,'$.response'))    AS response,
            SUM(json_extract(breakdown_json,'$.total'))       AS total
          FROM sessions WHERE user_id = ?
        `, [userId])
      : sqliteQueryOne(`
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
}

export async function getStatsByEditor(userId?: string): Promise<Record<string, { sessions: number; tokens: number; cost: number }>> {
  let rows: Record<string, unknown>[];

  if (USE_POSTGRES) {
    rows = userId
      ? await pgQueryAll(
          `SELECT editor, COUNT(*)::int AS cnt,
                  COALESCE(SUM((breakdown_json::json->>'total')::numeric), 0)::float8 AS tok,
                  COALESCE(SUM(cost), 0) AS cost
           FROM sessions WHERE user_id = $1 GROUP BY editor`,
          [userId]
        )
      : await pgQueryAll(
          `SELECT editor, COUNT(*)::int AS cnt,
                  COALESCE(SUM((breakdown_json::json->>'total')::numeric), 0)::float8 AS tok,
                  COALESCE(SUM(cost), 0) AS cost
           FROM sessions GROUP BY editor`
        );
  } else {
    rows = userId
      ? sqliteQueryAll(
          `SELECT editor, COUNT(*) as cnt,
                  SUM(json_extract(breakdown_json,'$.total')) as tok,
                  SUM(cost) as cost
           FROM sessions WHERE user_id = ? GROUP BY editor`,
          [userId]
        )
      : sqliteQueryAll(
          `SELECT editor, COUNT(*) as cnt,
                  SUM(json_extract(breakdown_json,'$.total')) as tok,
                  SUM(cost) as cost
           FROM sessions GROUP BY editor`
        );
  }

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

export async function getSessionsInDateRange(userId: string | undefined, startMs: number, endMs: number): Promise<Session[]> {
  if (USE_POSTGRES) {
    const rows = userId
      ? await pgQueryAll(
          'SELECT * FROM sessions WHERE user_id = $1 AND "timestamp" >= $2 AND "timestamp" <= $3 ORDER BY "timestamp" DESC',
          [userId, startMs, endMs]
        )
      : await pgQueryAll(
          'SELECT * FROM sessions WHERE "timestamp" >= $1 AND "timestamp" <= $2 ORDER BY "timestamp" DESC',
          [startMs, endMs]
        );
    return rows.map(deserializeSession);
  } else {
    return (userId
      ? sqliteQueryAll(
          'SELECT * FROM sessions WHERE user_id = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC',
          [userId, startMs, endMs]
        )
      : sqliteQueryAll(
          'SELECT * FROM sessions WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC',
          [startMs, endMs]
        )
    ).map(deserializeSession);
  }
}

function deserializeSession(row: Record<string, unknown>): Session {
  return {
    id:          row['id']        as string,
    userId:      row['user_id']   as string,
    provider:    row['provider']  as string,
    model:       row['model']     as string,
    editor:      (row['editor']   as string) || 'other',
    timestamp:   Number(row['timestamp']),
    breakdown:   JSON.parse(row['breakdown_json']   as string),
    waste:       JSON.parse(row['waste_json']        as string),
    suggestions: JSON.parse(row['suggestions_json']  as string),
    cost:        Number(row['cost']),
  };
}
