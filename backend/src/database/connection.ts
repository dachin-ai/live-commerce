/**
 * 数据库连接层 — PostgreSQL / SQLite 自动切换
 *
 * 检测逻辑：
 *   若 PG_HOST 或 DATABASE_URL 环境变量存在 → 使用 PostgreSQL (pg.Pool)
 *   否则 → 使用 SQLite (better-sqlite3)，数据文件保存在 data/local.db
 *
 * 所有其他模块应从此文件 import dbGet / dbAll / dbRun / dbTransaction，
 * 而非直接操作底层实例。
 *
 * 兼容性说明：
 *   为保持与原有代码兼容，dbRun / dbGet / dbAll 接受 `?` 占位符，
 *   PostgreSQL 模式下自动转换为 `$1, $2, ...` 格式。
 *   SQLite 模式下原样使用 `?`。
 *
 * SQL 方言转换（sqlCompat）：
 *   在 SQLite 模式下自动将 PostgreSQL 特有语法转换为 SQLite 兼容语法：
 *   - NOW() → datetime('now')
 *   - ALTER TABLE x ADD COLUMN IF NOT EXISTS → ALTER TABLE x ADD COLUMN (try/catch)
 *   - information_schema 查询需在调用方分支处理（见 db.ts）
 */

import path from 'path'
import fs from 'fs'

// ==================== 后端类型检测 ====================

const USE_POSTGRES = !!(process.env.PG_HOST || process.env.DATABASE_URL)

/** 运行时判断当前使用的数据库后端 */
export function isPostgres(): boolean {
  return USE_POSTGRES
}

// ==================== PostgreSQL 后端 ====================

let pgPool: import('pg').Pool | null = null
let pgTxStorage: import('async_hooks').AsyncLocalStorage<import('pg').PoolClient> | null = null

function getPgPool(): import('pg').Pool {
  if (!pgPool) {
    const { Pool } = require('pg') as typeof import('pg')
    const { AsyncLocalStorage } = require('async_hooks') as typeof import('async_hooks')
    pgTxStorage = new AsyncLocalStorage()
    pgPool = new Pool({
      host: process.env.PG_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || '5432', 10),
      database: process.env.PG_DATABASE || 'live_commerce',
      user: process.env.PG_USER || 'lvbcsym',
      password: process.env.PG_PASSWORD || 'lvbcsym2026',
      max: 20,
      idleTimeoutMillis: 30000,
    })
    pgPool.on('error', (err) => {
      console.error('PostgreSQL 连接池异常:', err)
    })
    console.log(`📂 PostgreSQL: ${process.env.PG_HOST || 'localhost'}:${process.env.PG_PORT || '5432'}/${process.env.PG_DATABASE || 'live_commerce'}`)
  }
  return pgPool
}

function getPgQueryable(): import('pg').Pool | import('pg').PoolClient {
  return pgTxStorage?.getStore() ?? getPgPool()
}

/** 将 `?` 占位符转为 PostgreSQL 的 `$1, $2, ...` */
function convertToPostgres(sql: string): string {
  if (/\$\d+/.test(sql)) return sql
  let i = 0
  return sql.replace(/\?/g, () => `$${++i}`)
}

/**
 * PostgreSQL 列名映射：lowercase → 原始 camelCase
 *
 * PostgreSQL 将未加引号的标识符统一存为小写，但前端/后端代码全部
 * 按 camelCase 访问属性。此映射在 dbGet / dbAll 返回结果时自动转换，
 * 避免全量修改 SQL 或前端代码。
 *
 * 仅包含需要转换的列（纯小写列如 id/name/level 无需映射）。
 */
const PG_COL_MAP: Record<string, string> = {
  // ── 通用字段 ──
  createdat: 'createdAt', updatedat: 'updatedAt', deletedat: 'deletedAt',
  storeid: 'storeId', userid: 'userId', parentid: 'parentId',
  sessionid: 'sessionId', entityid: 'entityId', entitytype: 'entityType',
  categoryid: 'categoryId', productid: 'productId', importid: 'importId',
  campaignid: 'campaignId', videoid: 'videoId', shopid: 'shopId',
  statsid: 'statsId', creatorid: 'creatorId',
  sortorder: 'sortOrder', nameth: 'nameTh', filekey: 'fileKey',
  filename: 'fileName', filesize: 'fileSize', datatype: 'dataType',
  contenttype: 'contentType', linkurl: 'linkUrl', videourl: 'videoUrl',
  imageurls: 'imageUrls', ipaddress: 'ipAddress', iphash: 'ipHash',
  lastloginat: 'lastLoginAt', expiresat: 'expiresAt',
  readat: 'readAt', seenat: 'seenAt', replyat: 'replyAt',
  replycontent: 'replyContent', publishedat: 'publishedAt',
  importedat: 'importedAt', importedby: 'importedBy',
  recordcount: 'recordCount', assignedrole: 'assignedRole',
  currencysymbol: 'currencySymbol', targetvalue: 'targetValue',
  estimateddays: 'estimatedDays',

  // ── 店铺/商品 ──
  minprice: 'minPrice', maxprice: 'maxPrice', avgprice: 'avgPrice',
  brandpositioning: 'brandPositioning', brandstrategy: 'brandStrategy',
  targetaudience: 'targetAudience',
  productname: 'productName', productviews: 'productViews',
  productclicks: 'productClicks', productimpressions: 'productImpressions',
  creatorname: 'creatorName', campaignname: 'campaignName',

  // ── 统计/指标 ──
  activeviewers: 'activeViewers', peakviewers: 'peakViewers',
  totalviewers: 'totalViewers', totalorders: 'totalOrders',
  totalduration: 'totalDuration', totalinteractions: 'totalInteractions',
  totalrevenue: 'totalRevenue', totalgmv: 'totalGMV',
  completedorders: 'completedOrders', interactionrate: 'interactionRate',
  clickthroughrate: 'clickThroughRate', engagementrate: 'engagementRate',
  durationseconds: 'durationSeconds',
  averageconversionrate: 'averageConversionRate',
  averagedailyduration: 'averageDailyDuration',
  averagedurationperday: 'averageDurationPerDay',
  averagedurationperround: 'averageDurationPerRound',
  roundsperday: 'roundsPerDay',
  gmvperhour: 'gmvPerHour', gmvper1kshows: 'gmvPer1kShows',
  gmvper1kviews: 'gmvPer1kViews', revenueperviewer: 'revenuePerViewer',
  newfollowers: 'newFollowers', livefollows: 'liveFollows',
  livename: 'liveName', liveviews: 'liveViews',
  starttime: 'startTime', launchedtime: 'launchedTime',
  weekstart: 'weekStart', weektag: 'weekTag',
  datefrom: 'dateFrom', dateto: 'dateTo',
  isaigenerated: 'isAiGenerated', isactive: 'isActive',

  // ── 广告/电商 ──
  adtype: 'adType', advertisertype: 'advertiserType',
  attributedgmv: 'attributedGmv', directgmv: 'directGmv',
  contentgmv: 'contentGmv', netcost: 'netCost',
  grossrevenue: 'grossRevenue', grossrevenueshop: 'grossRevenueShop',
  orderspaid: 'ordersPaid', ordercvr: 'orderCvr',
  itemssold: 'itemsSold', unitssold: 'unitsSold',
  uniqueclicks: 'uniqueClicks', uniquecustomers: 'uniqueCustomers',
  addtocartusers: 'addToCartUsers', clicksaddtocart: 'clicksAddToCart',
  carttopaidrate: 'cartToPaidRate', clicktocartrate: 'clickToCartRate',
  clicktoorderrate: 'clickToOrderRate', clicktopaidrate: 'clickToPaidRate',
  viewtoclickrate: 'viewToClickRate', viewtopaidrate: 'viewToPaidRate',
  costperorder: 'costPerOrder', costperliveview: 'costPerLiveView',
  costper10sview: 'costPer10sView',
  skuorders: 'skuOrders', skuordersshop: 'skuOrdersShop',
  channeltype: 'channelType',

  // ── 视频 ──
  videoviews: 'videoViews', videofinishrate: 'videoFinishRate',
  videotoliveclicks: 'videoToLiveClicks', videotoliverate: 'videoToLiveRate',
  videoinfo: 'videoInfo', avgviewdurationsec: 'avgViewDurationSec',
  views10s: 'views10s',

  // ── AI/LLM ──
  aifeature: 'aiFeature', api_key: 'api_key',
}

/** 将 PostgreSQL 返回的小写 key 行转换为原始 camelCase */
function transformRow(row: any): any {
  if (!row || typeof row !== 'object') return row
  const out: any = {}
  for (const key of Object.keys(row)) {
    out[PG_COL_MAP[key] || key] = row[key]
  }
  return out
}

// ==================== SQLite 后端 ====================

let sqliteDb: import('better-sqlite3').Database | null = null

function getSqliteDb(): import('better-sqlite3').Database {
  if (!sqliteDb) {
    const Database = require('better-sqlite3') as typeof import('better-sqlite3')
    // 确保数据目录存在
    const dataDir = path.resolve(__dirname, '../../data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }
    const dbPath = path.join(dataDir, 'local.db')
    sqliteDb = new Database(dbPath)
    // 启用 WAL 模式提升并发性能
    sqliteDb.pragma('journal_mode = WAL')
    // 启用外键约束
    sqliteDb.pragma('foreign_keys = ON')
    console.log(`📂 SQLite: ${dbPath}`)
  }
  return sqliteDb
}

/**
 * 将 PostgreSQL 特有 SQL 语法转换为 SQLite 兼容语法
 * - NOW() → datetime('now')
 * - $1, $2, ... → ?
 * - DEFAULT NOW() → DEFAULT (datetime('now'))
 * - REAL → REAL (compatible)
 * - TEXT → TEXT (compatible)
 */
function convertToSqlite(sql: string): string {
  let result = sql
  // DEFAULT NOW() → DEFAULT (datetime('now'))
  result = result.replace(/DEFAULT\s+NOW\(\)/gi, "DEFAULT (datetime('now'))")
  // NOW() → datetime('now')  (standalone, not after DEFAULT)
  result = result.replace(/(?<!DEFAULT\s*\(?)NOW\(\)/gi, "datetime('now')")
  // $1, $2, ... → ?
  result = result.replace(/\$\d+/g, '?')
  // ALTER TABLE x ADD COLUMN IF NOT EXISTS → ALTER TABLE x ADD COLUMN
  // (SQLite doesn't support IF NOT EXISTS for ALTER; caller wraps in try/catch)
  result = result.replace(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/gi, 'ADD COLUMN')
  return result
}

// ==================== 统一 Promise API ====================

export async function dbRun(sql: string, params: any[] = []): Promise<void> {
  if (USE_POSTGRES) {
    const q = getPgQueryable()
    await q.query(convertToPostgres(sql), params)
  } else {
    const db = getSqliteDb()
    const sqliteSql = convertToSqlite(sql)
    try {
      db.prepare(sqliteSql).run(...params)
    } catch (err: any) {
      // Silently ignore "duplicate column" errors from ALTER TABLE ADD COLUMN
      if (/ALTER\s+TABLE/i.test(sqliteSql) && err?.message?.includes('duplicate column')) {
        return
      }
      throw err
    }
  }
}

export async function dbGet<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  if (USE_POSTGRES) {
    const q = getPgQueryable()
    const result = await q.query(convertToPostgres(sql), params)
    return transformRow(result.rows[0]) as T | undefined
  } else {
    const db = getSqliteDb()
    return db.prepare(convertToSqlite(sql)).get(...params) as T | undefined
  }
}

export async function dbAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  if (USE_POSTGRES) {
    const q = getPgQueryable()
    const result = await q.query(convertToPostgres(sql), params)
    return result.rows.map(transformRow) as T[]
  } else {
    const db = getSqliteDb()
    return db.prepare(convertToSqlite(sql)).all(...params) as T[]
  }
}

/**
 * 事务辅助函数 — 将 callback 内的所有操作封装为原子事务。
 * PostgreSQL: 通过 AsyncLocalStorage 将事务级 client 传递给 callback。
 * SQLite: 使用 better-sqlite3 的 transaction() 方法。
 */
export async function dbTransaction<T>(callback: () => Promise<T>): Promise<T> {
  if (USE_POSTGRES) {
    const p = getPgPool()
    const client = await p.connect()
    try {
      await client.query('BEGIN')
      const result = await pgTxStorage!.run(client, callback)
      await client.query('COMMIT')
      return result
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  } else {
    // SQLite: better-sqlite3 transactions are synchronous,
    // but our callback is async, so we use savepoint pattern
    const db = getSqliteDb()
    db.prepare('BEGIN').run()
    try {
      const result = await callback()
      db.prepare('COMMIT').run()
      return result
    } catch (err) {
      db.prepare('ROLLBACK').run()
      throw err
    }
  }
}

/**
 * 获取底层实例（仅用于需要直接操作的场景）
 * PostgreSQL 模式返回 Pool，SQLite 模式返回 Database
 */
export function getDatabase(): any {
  if (USE_POSTGRES) {
    return getPgPool()
  } else {
    return getSqliteDb()
  }
}

/**
 * 安全地执行 ALTER TABLE ADD COLUMN
 * SQLite 不支持 IF NOT EXISTS，统一用 try/catch
 */
export async function safeAddColumn(table: string, column: string, type: string): Promise<void> {
  try {
    await dbRun(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
  } catch (_) {
    // Column already exists — ignore
  }
}

/**
 * 获取表的列名列表（跨方言兼容）
 * PostgreSQL: information_schema.columns
 * SQLite: PRAGMA table_info
 */
export async function getTableColumns(table: string): Promise<string[]> {
  if (USE_POSTGRES) {
    const rows = await dbAll<{ name: string }>(
      `SELECT column_name AS name FROM information_schema.columns WHERE table_name = $1`,
      [table]
    )
    return rows.map(r => r.name)
  } else {
    const rows = await dbAll<{ name: string }>(
      `PRAGMA table_info(${table})`
    )
    return rows.map(r => r.name)
  }
}
