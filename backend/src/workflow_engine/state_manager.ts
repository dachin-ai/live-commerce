import sqlite3 from 'sqlite3'
import path from 'path'
import fs from 'fs'

const INT32_MAX = 2147483647
const INT32_MIN = -2147483648

/** Clamp number to int32 safe range to avoid serialization errors */
export function clampInt32(n: number): number {
  return Math.max(INT32_MIN, Math.min(INT32_MAX, Math.floor(n)))
}

let stateDb: sqlite3.Database | null = null

/** Project root: backend/src/workflow_engine -> ../../.. */
function getStateDbPath(): string {
  return path.join(__dirname, '../../../data/shared_state/state.db')
}

function getDatabase(): sqlite3.Database {
  if (!stateDb) {
    const dir = path.dirname(getStateDbPath())
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    stateDb = new sqlite3.Database(getStateDbPath(), (err) => {
      if (err) console.error('state.db 连接失败:', err)
    })
  }
  return stateDb
}

function run(sql: string, params: any[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    getDatabase().run(sql, params, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    getDatabase().get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row as T)
    })
  })
}

function all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    getDatabase().all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve((rows || []) as T[])
    })
  })
}

/** Initialize state.db schema: articles (dedup), cursors, checkpoints */
export async function initStateDatabase(): Promise<void> {
  await run(`
    CREATE TABLE IF NOT EXISTS articles (
      url TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  await run(`
    CREATE TABLE IF NOT EXISTS cursors (
      name TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  await run(`
    CREATE TABLE IF NOT EXISTS checkpoints (
      round_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payload TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (round_id, role_id)
    )
  `)
}

/** Dedup: check if url exists */
export async function dedupExists(url: string): Promise<boolean> {
  const row = await get<{ url: string }>('SELECT url FROM articles WHERE url = ?', [url])
  return !!row
}

/** Dedup: add url, return true if inserted, false if already exists */
export async function dedupAdd(url: string): Promise<boolean> {
  try {
    await run('INSERT INTO articles (url) VALUES (?)', [url])
    return true
  } catch (e: any) {
    if (e?.message?.includes('UNIQUE') || e?.code === 'SQLITE_CONSTRAINT') return false
    throw e
  }
}

/** Cursor: get value by name */
export async function getCursor(name: string): Promise<string> {
  const row = await get<{ value: string }>('SELECT value FROM cursors WHERE name = ?', [name])
  return row?.value ?? ''
}

/** Cursor: set value (value will be stringified if number; numeric values clamped to int32) */
export async function setCursor(name: string, value: string | number): Promise<void> {
  const str = typeof value === 'number' ? String(clampInt32(value)) : value
  const now = new Date().toISOString()
  await run(
    'INSERT INTO cursors (name, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET value = ?, updated_at = ?',
    [name, str, now, str, now]
  )
}

/** Checkpoint: get for round_id + role_id */
export async function getCheckpoint(roundId: string, roleId: string): Promise<{ status: string; payload: string | null } | undefined> {
  return get<{ status: string; payload: string | null }>(
    'SELECT status, payload FROM checkpoints WHERE round_id = ? AND role_id = ?',
    [roundId, roleId]
  )
}

/** Checkpoint: set status and optional payload */
export async function setCheckpoint(roundId: string, roleId: string, status: string, payload?: string): Promise<void> {
  const now = new Date().toISOString()
  await run(
    `INSERT INTO checkpoints (round_id, role_id, status, payload, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(round_id, role_id) DO UPDATE SET status = ?, payload = ?, updated_at = ?`,
    [roundId, roleId, status, payload ?? null, now, status, payload ?? null, now]
  )
}

/** List all rounds that have at least one checkpoint (for rounds list API) */
export async function listRoundIds(): Promise<string[]> {
  const rows = await all<{ round_id: string }>('SELECT DISTINCT round_id FROM checkpoints ORDER BY round_id DESC')
  return rows.map((r) => r.round_id)
}

/** Get all checkpoints for a round */
export async function getCheckpointsByRound(roundId: string): Promise<{ role_id: string; status: string; payload: string | null; updated_at: string }[]> {
  return all(
    'SELECT role_id, status, payload, updated_at FROM checkpoints WHERE round_id = ? ORDER BY updated_at',
    [roundId]
  )
}
