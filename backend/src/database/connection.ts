/**
 * 数据库连接层 — PostgreSQL（via pg.Pool）
 *
 * 所有其他模块应从此文件 import dbGet / dbAll / dbRun / dbTransaction，
 * 而非直接操作 pg.Pool 实例。
 *
 * 兼容性说明：
 *   为保持与原有代码兼容，dbRun / dbGet / dbAll 接受 `?` 占位符，
 *   内部自动转换为 PostgreSQL 的 `$1, $2, ...` 格式。
 *   新代码亦可直接使用 `$N` 占位符。
 *
 * 事务隔离：
 *   dbTransaction 使用 AsyncLocalStorage 将事务级 PoolClient 传递给
 *   callback 内的所有 dbRun/dbGet/dbAll 调用，确保同一事务内的操作
 *   在同一连接上执行，BEGIN/COMMIT/ROLLBACK 真正生效。
 */

import { Pool, PoolClient } from 'pg'
import { AsyncLocalStorage } from 'async_hooks'

// 事务级 client 上下文：在 dbTransaction 内部自动使用此 client
const txStorage = new AsyncLocalStorage<PoolClient>()

let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.PG_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || '5432', 10),
      database: process.env.PG_DATABASE || 'live_commerce',
      user: process.env.PG_USER || 'lvbcsym',
      password: process.env.PG_PASSWORD || 'lvbcsym2026',
      max: 20,                   // 连接池最大连接数
      idleTimeoutMillis: 30000,  // 空闲连接 30 秒后释放
    })
    pool.on('error', (err) => {
      console.error('PostgreSQL 连接池异常:', err)
    })
    console.log(`📂 PostgreSQL: ${process.env.PG_HOST || 'localhost'}:${process.env.PG_PORT || '5432'}/${process.env.PG_DATABASE || 'live_commerce'}`)
  }
  return pool
}

/**
 * 获取当前应使用的查询执行器：
 *   - 若处于 dbTransaction 内部，返回事务级 PoolClient
 *   - 否则返回连接池 Pool
 */
function getQueryable(): Pool | PoolClient {
  return txStorage.getStore() ?? getPool()
}

/**
 * 将 `?` 占位符转为 PostgreSQL 的 `$1, $2, ...`
 * 已经使用 `$N` 格式的 SQL 不受影响。
 */
function convertPlaceholders(sql: string): string {
  if (/\$\d+/.test(sql)) return sql
  let i = 0
  return sql.replace(/\?/g, () => `$${++i}`)
}

// ==================== Promise 封装 ====================

export async function dbRun(sql: string, params: any[] = []): Promise<void> {
  const q = getQueryable()
  await q.query(convertPlaceholders(sql), params)
}

export async function dbGet<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  const q = getQueryable()
  const result = await q.query(convertPlaceholders(sql), params)
  return result.rows[0] as T | undefined
}

export async function dbAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const q = getQueryable()
  const result = await q.query(convertPlaceholders(sql), params)
  return result.rows as T[]
}

/**
 * 事务辅助函数 — 将 callback 内的所有操作封装为原子事务。
 * 通过 AsyncLocalStorage 将事务级 client 传递给 callback 内部的
 * dbRun/dbGet/dbAll，确保所有操作在同一连接/事务中执行。
 * 若 callback 抛出异常则自动 ROLLBACK，成功则 COMMIT。
 */
export async function dbTransaction<T>(callback: () => Promise<T>): Promise<T> {
  const p = getPool()
  const client: PoolClient = await p.connect()
  try {
    await client.query('BEGIN')
    const result = await txStorage.run(client, callback)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/**
 * 获取底层 Pool 实例（仅用于需要直接操作的场景）
 */
export function getDatabase(): Pool {
  return getPool()
}
