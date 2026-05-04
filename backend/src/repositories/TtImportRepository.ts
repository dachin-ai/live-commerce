import { dbRun, dbGet, dbAll, dbTransaction } from '../db'
import crypto from 'crypto'
import { TtDataType } from '../utils/excelParser'

export interface TtImportRow {
  id: string
  storeId: string
  dataType: TtDataType
  dateFrom: string | null
  dateTo: string | null
  fileName: string
  recordCount: number
  currency: string
  importedBy: string
  importedAt: string
}

const TABLE_MAP: Record<TtDataType, string> = {
  live_sessions: 'tt_live_sessions',
  ad_sessions: 'tt_ad_sessions',
  store_products: 'tt_store_products',
  product_details: 'tt_product_details',
  product_overview: 'tt_store_products', // expanded into per-channel store_products rows
  video_sessions: 'tt_video_sessions',
}

export class TtImportRepository {
  /** 查找同店铺+同类型+同日期区间的旧导入批次（覆盖逻辑用） */
  async findExisting(storeId: string, dataType: TtDataType, dateFrom: string | null, dateTo: string | null): Promise<TtImportRow | null> {
    const row = await dbGet<TtImportRow>(
      `SELECT * FROM tt_imports WHERE storeId = ? AND dataType = ? AND dateFrom = ? AND dateTo = ?`,
      [storeId, dataType, dateFrom ?? null, dateTo ?? null]
    )
    return row || null
  }

  /** 删除一个导入批次（ON DELETE CASCADE 会自动删除子表数据） */
  async deleteImport(importId: string): Promise<void> {
    await dbRun('DELETE FROM tt_imports WHERE id = ?', [importId])
  }

  /** 创建导入批次记录 */
  async createImport(params: {
    storeId: string
    dataType: TtDataType
    dateFrom: string | null
    dateTo: string | null
    fileName: string
    recordCount: number
    currency: string
    importedBy: string
  }): Promise<string> {
    const id = crypto.randomUUID()
    const importedAt = new Date().toISOString()
    await dbRun(
      `INSERT INTO tt_imports (id, storeId, dataType, dateFrom, dateTo, fileName, recordCount, currency, importedBy, importedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, params.storeId, params.dataType, params.dateFrom, params.dateTo,
       params.fileName, params.recordCount, params.currency, params.importedBy, importedAt]
    )
    return id
  }

  /** 批量插入数据行（事务 + 多值批次 INSERT，性能提升 ~100x，原子性保证） */
  async saveRows(
    dataType: TtDataType,
    importId: string,
    storeId: string,
    dateFrom: string | null,
    dateTo: string | null,
    currency: string,
    rows: Record<string, unknown>[]
  ): Promise<void> {
    if (rows.length === 0) return
    const table = TABLE_MAP[dataType]

    // 批量大小：每次最多 50 行，避免超出 SQLite SQLITE_LIMIT_VARIABLE_NUMBER (999)
    const BATCH_SIZE = 50

    await dbTransaction(async () => {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE)

        // 以第一行为准提取字段列表（同一导入批次字段一致）
        const rowFields = Object.keys(batch[0])
        const fields = ['id', 'importId', 'storeId', 'dateFrom', 'dateTo', 'currency', ...rowFields]
        const singlePlaceholder = `(${fields.map(() => '?').join(', ')})`
        const allPlaceholders = batch.map(() => singlePlaceholder).join(', ')
        const sql = `INSERT INTO ${table} (${fields.join(', ')}) VALUES ${allPlaceholders}`

        const allValues: unknown[] = []
        for (const row of batch) {
          allValues.push(
            crypto.randomUUID(),
            importId,
            storeId,
            dateFrom,
            dateTo,
            currency,
            ...Object.values(row)
          )
        }

        await dbRun(sql, allValues)
      }
    })
  }


  /** 列出某店铺下所有导入批次 */
  async listImports(storeId: string): Promise<TtImportRow[]> {
    return dbAll<TtImportRow>(
      `SELECT * FROM tt_imports WHERE storeId = ? ORDER BY importedAt DESC`,
      [storeId]
    )
  }

  /** 获取单个批次信息 */
  async getImport(importId: string): Promise<TtImportRow | null> {
    const row = await dbGet<TtImportRow>('SELECT * FROM tt_imports WHERE id = ?', [importId])
    return row || null
  }

  /** 获取某类型数据（用于分析查询） */
  async queryData(
    table: string,
    storeId: string,
    dateFrom?: string,
    dateTo?: string,
    limit = 1000
  ): Promise<Record<string, unknown>[]> {
    const conditions: string[] = ['storeId = ?']
    const params: unknown[] = [storeId]
    // OVERLAP: 批次日期与查询范围有交集即纳入（dateTo >= queryFrom AND dateFrom <= queryTo）
    if (dateFrom) { conditions.push('dateTo >= ?'); params.push(dateFrom) }
    if (dateTo) { conditions.push('dateFrom <= ?'); params.push(dateTo) }
    params.push(limit)
    return dbAll<Record<string, unknown>>(
      `SELECT * FROM ${table} WHERE ${conditions.join(' AND ')} ORDER BY dateFrom DESC LIMIT ?`,
      params
    )
  }
}
