import { dbAll, dbGet, dbRun } from '../db'
import crypto from 'crypto'

export interface StoreRow {
  id: string
  name: string
  nameTh?: string
  description?: string
  platform: string
  userId: string
  region?: string
  currency?: string
  currencySymbol?: string
  minPrice?: number | null
  maxPrice?: number | null
  targetAudience?: string
  brandPositioning?: string
  brandStrategy?: string
  status?: string
  createdAt: string
  updatedAt?: string
  // joined
  userName?: string
  categories?: Record<string, unknown>[]
  accessUserIds?: string[]
}

export interface StoreListFilters {
  userId?: string
  canSeeAll: boolean
  search?: string
  region?: string
  platform?: string
  page: number
  limit: number
  light: boolean
}

export class StoreRepository {
  async findAll(filters: StoreListFilters): Promise<{ items: StoreRow[]; total: number }> {
    const { userId, canSeeAll, search, region, platform, page, limit, light } = filters
    const offset = (page - 1) * limit

    const baseCols = light
      ? 's.id, s.name, s.nameTh, s.platform, s.status, s.currency, s.currencySymbol, s.region, s.userId, s.createdAt'
      : 's.*'
    let query = `SELECT ${baseCols}, u.name as userName FROM stores s LEFT JOIN users u ON s.userId = u.id`
    let countQuery = 'SELECT COUNT(*) as total FROM stores s'
    const params: unknown[] = []
    const countParams: unknown[] = []
    const whereClause: string[] = []

    if (!canSeeAll && userId) {
      whereClause.push('(s.userId = ? OR s.id IN (SELECT storeId FROM user_store_access WHERE userId = ?))')
      params.push(userId, userId)
      countParams.push(userId, userId)
    }
    if (search) {
      whereClause.push('(s.name LIKE ? OR s.nameTh LIKE ? OR s.description LIKE ?)')
      const pat = `%${search}%`
      params.push(pat, pat, pat)
      countParams.push(pat, pat, pat)
    }
    if (region) {
      whereClause.push('s.region = ?')
      params.push(region)
      countParams.push(region)
    }
    if (platform) {
      whereClause.push('s.platform = ?')
      params.push(platform)
      countParams.push(platform)
    }

    const whereSql = whereClause.length ? ' WHERE ' + whereClause.join(' AND ') : ''
    query += whereSql + ' ORDER BY s.createdAt DESC LIMIT ? OFFSET ?'
    countQuery += whereSql
    params.push(limit, offset)

    const items = await dbAll<StoreRow>(query, params)
    const [{ total }] = (await dbAll<{ total: number }>(countQuery, countParams))

    if (!light && items.length > 0) {
      const storeIds = items.map((s) => s.id)
      const placeholders = storeIds.map(() => '?').join(',')
      const categoryRows = await dbAll<{ storeId: string } & Record<string, unknown>>(
        `SELECT sc.storeId, c.id, c.name, c.nameTh, c.level, c.parentId, c.sortOrder
         FROM store_categories sc
         INNER JOIN categories c ON c.id = sc.categoryId
         WHERE sc.storeId IN (${placeholders})`,
        storeIds
      )
      const byStore = new Map<string, Record<string, unknown>[]>()
      for (const row of categoryRows) {
        const { storeId, ...cat } = row
        if (!byStore.has(storeId)) byStore.set(storeId, [])
        byStore.get(storeId)!.push(cat)
      }
      for (const store of items) {
        store.categories = byStore.get(store.id) || []
      }
    }

    return { items, total }
  }

  async findById(id: string): Promise<StoreRow | null> {
    const store = await dbGet<StoreRow>(
      'SELECT s.*, u.name as userName FROM stores s LEFT JOIN users u ON s.userId = u.id WHERE s.id = ?',
      [id]
    )
    if (!store) return null

    const categories = await dbAll<Record<string, unknown>>(
      `SELECT c.* FROM categories c INNER JOIN store_categories sc ON c.id = sc.categoryId WHERE sc.storeId = ?`,
      [id]
    )
    const accessRows = await dbAll<{ userId: string }>(
      'SELECT userId FROM user_store_access WHERE storeId = ?',
      [id]
    )
    store.categories = categories
    store.accessUserIds = accessRows.map((r) => r.userId)
    return store
  }

  async createStore(data: Partial<StoreRow>): Promise<StoreRow> {
    const id = `store-${crypto.randomUUID()}`
    const now = new Date().toISOString()
    await dbRun(
      `INSERT INTO stores (id, name, nameTh, description, platform, userId, region, currency, currencySymbol,
        minPrice, maxPrice, targetAudience, brandPositioning, brandStrategy, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, data.name, data.nameTh || null, data.description || null,
        data.platform || '抖音', data.userId, data.region || null,
        data.currency || 'CNY', data.currencySymbol || '¥',
        data.minPrice || null, data.maxPrice || null,
        data.targetAudience || null, data.brandPositioning || null,
        data.brandStrategy || null, data.status || 'active', now, now,
      ]
    )
    return (await this.findById(id))!
  }

  async attachCategories(storeId: string, categoryIds: string[]): Promise<void> {
    const now = new Date().toISOString()
    for (const categoryId of categoryIds) {
      if (!categoryId) continue
      await dbRun(
        'INSERT INTO store_categories (id, storeId, categoryId, createdAt) VALUES (?, ?, ?, ?)',
        [crypto.randomUUID(), storeId, categoryId, now]
      )
    }
  }

  async replaceCategories(storeId: string, categoryIds: string[]): Promise<void> {
    await dbRun('DELETE FROM store_categories WHERE storeId = ?', [storeId])
    await this.attachCategories(storeId, categoryIds)
  }

  async addAccessUsers(storeId: string, userIds: string[], ownerId: string): Promise<void> {
    const now = new Date().toISOString()
    const toAdd = userIds.filter((uid) => uid && uid !== ownerId)
    for (const uid of toAdd) {
      await dbRun(
        'INSERT INTO user_store_access (id, userId, storeId, createdAt) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING',
        [crypto.randomUUID(), uid, storeId, now]
      ).catch(() => {})
    }
  }

  async replaceAccessUsers(storeId: string, userIds: string[], ownerId: string): Promise<void> {
    await dbRun('DELETE FROM user_store_access WHERE storeId = ?', [storeId])
    await this.addAccessUsers(storeId, userIds, ownerId)
  }

  async updateStore(id: string, updates: Record<string, unknown>): Promise<StoreRow> {
    updates.updatedAt = new Date().toISOString()
    const fields = Object.keys(updates).map((k) => `${k} = ?`).join(', ')
    const values = Object.values(updates)
    await dbRun(`UPDATE stores SET ${fields} WHERE id = ?`, [...values, id])
    return (await this.findById(id))!
  }

  async deleteStore(id: string): Promise<void> {
    await dbRun('DELETE FROM user_store_access WHERE storeId = ?', [id])
    await dbRun('DELETE FROM stores WHERE id = ?', [id])
  }

  async getUserById(userId: string): Promise<{ role: string } | null> {
    const row = await dbGet<{ role: string }>('SELECT role FROM users WHERE id = ?', [userId])
    return row || null
  }
}
