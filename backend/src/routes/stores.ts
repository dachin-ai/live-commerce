import express from 'express'
import { dbRun, dbGet, dbAll, logAudit } from '../db'
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth'
import { userCanAccessStore } from '../utils/storeAccess'
import crypto from 'crypto'

const router = express.Router()

// 获取所有商店（支持搜索、分页、精简）- 普通用户只能看到自己的商店，管理员可以看到所有
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { search, page: pageStr, limit: limitStr, light: lightStr, region: regionFilter, platform: platformFilter } = req.query
    const userId = req.user!.userId
    const role = req.user!.role
    const canSeeAllStores = role === 'admin' || role === 'manager'

    const page = Math.max(1, parseInt(String(pageStr || 1), 10))
    const limit = Math.min(100, Math.max(1, parseInt(String(limitStr || 50), 10)))
    const light = lightStr === '1' || lightStr === 'true'
    const offset = (page - 1) * limit

    const baseCols = light
      ? 's.id, s.name, s.nameTh, s.platform, s.status, s.currency, s.currencySymbol, s.region, s.userId, s.createdAt'
      : 's.*'
    let query = `SELECT ${baseCols}, u.name as userName FROM stores s LEFT JOIN users u ON s.userId = u.id`
    const params: any[] = []
    let countQuery = 'SELECT COUNT(*) as total FROM stores s'
    const countParams: any[] = []

    // 普通用户/运营：归属店 + 被授权可见的店；管理员与经理可看全部
    const whereClause: string[] = []
    if (!canSeeAllStores) {
      whereClause.push('(s.userId = ? OR s.id IN (SELECT storeId FROM user_store_access WHERE userId = ?))')
      params.push(userId, userId)
      countParams.push(userId, userId)
    }
    if (search && typeof search === 'string') {
      whereClause.push('(s.name LIKE ? OR s.nameTh LIKE ? OR s.description LIKE ?)')
      const searchPattern = `%${search}%`
      params.push(searchPattern, searchPattern, searchPattern)
      countParams.push(searchPattern, searchPattern, searchPattern)
    }
    const regionVal = typeof regionFilter === 'string' ? regionFilter.trim() : Array.isArray(regionFilter) ? String(regionFilter[0] || '').trim() : ''
    const platformVal = typeof platformFilter === 'string' ? platformFilter.trim() : Array.isArray(platformFilter) ? String(platformFilter[0] || '').trim() : ''
    if (regionVal) {
      whereClause.push('s.region = ?')
      params.push(regionVal)
      countParams.push(regionVal)
    }
    if (platformVal) {
      whereClause.push('s.platform = ?')
      params.push(platformVal)
      countParams.push(platformVal)
    }
    const whereSql = whereClause.length ? ' WHERE ' + whereClause.join(' AND ') : ''
    query += whereSql
    countQuery += whereSql

    query += ' ORDER BY s.createdAt DESC'
    query += ` LIMIT ? OFFSET ?`
    params.push(limit, offset)

    const stores = await dbAll(query, params)
    const [{ total }] = await dbAll(countQuery, countParams) as { total: number }[]

    // 非精简模式：一次性获取当前页店铺的分类
    if (!light && stores.length > 0) {
      const storeIds = stores.map((s: { id: string }) => s.id)
      const placeholders = storeIds.map(() => '?').join(',')
      const categoryRows = await dbAll(
        `SELECT sc.storeId, c.id, c.name, c.nameTh, c.level, c.parentId, c.sortOrder
         FROM store_categories sc
         INNER JOIN categories c ON c.id = sc.categoryId
         WHERE sc.storeId IN (${placeholders})`,
        storeIds
      )
      const byStore = new Map<string, Record<string, unknown>[]>()
      for (const row of categoryRows as { storeId: string }[]) {
        const { storeId, ...cat } = row
        if (!byStore.has(storeId)) byStore.set(storeId, [])
        byStore.get(storeId)!.push(cat)
      }
      for (const store of stores as { id: string; categories?: unknown[] }[]) {
        store.categories = byStore.get(store.id) || []
      }
    }

    res.json({
      items: stores,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    })
  } catch (error) {
    console.error('获取商店列表失败:', error)
    res.status(500).json({ error: '获取商店列表失败' })
  }
})

// 获取单个商店 - 普通用户只能查看自己的商店
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const userId = req.user!.userId
    const canSeeAllStores = req.user!.role === 'admin' || req.user!.role === 'manager'

    const store = await dbGet('SELECT s.*, u.name as userName FROM stores s LEFT JOIN users u ON s.userId = u.id WHERE s.id = ?', [id])

    if (!store) {
      return res.status(404).json({ error: '商店不存在或无权访问' })
    }
    if (!canSeeAllStores) {
      const canAccess = await userCanAccessStore(userId, id, req.user!.role)
      if (!canAccess) {
        return res.status(404).json({ error: '商店不存在或无权访问' })
      }
    }

    const categories = await dbAll(
      `SELECT c.* FROM categories c INNER JOIN store_categories sc ON c.id = sc.categoryId WHERE sc.storeId = ?`,
      [id]
    )
    const accessRows = await dbAll<{ userId: string }>(
      'SELECT userId FROM user_store_access WHERE storeId = ?',
      [id]
    )
    ;(store as Record<string, unknown>).categories = categories
    ;(store as Record<string, unknown>).accessUserIds = accessRows.map((r) => r.userId)

    res.json(store)
  } catch (error) {
    console.error('获取商店失败:', error)
    res.status(500).json({ error: '获取商店失败' })
  }
})

// 创建商店 - 需要认证，普通用户只能为自己创建
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const {
      name,
      nameTh,
      description,
      platform = '抖音',
      userId, // 管理员可以指定主归属人，普通用户使用自己的ID
      userIds, // 可查看该店铺的用户ID列表（不含主归属人，多人可见）
      region,
      currency,
      currencySymbol,
      minPrice,
      maxPrice,
      targetAudience,
      brandPositioning,
      brandStrategy,
      categoryIds = [],
      status = 'active',
    } = req.body

    if (!name) {
      return res.status(400).json({ error: '商店名称不能为空' })
    }

    const currentUserId = req.user!.userId
    const role = req.user!.role
    const canAssignStore = role === 'admin' || role === 'manager'
    let storeUserId = canAssignStore && userId ? userId : currentUserId

    // 经理只能分配给运营(operator)或普通用户(user)；管理员可分配给任意角色
    if (canAssignStore && userId && role === 'manager') {
      const targetUser = await dbGet('SELECT role FROM users WHERE id = ?', [userId])
      if (!targetUser) {
        return res.status(400).json({ error: '目标用户不存在' })
      }
      if (targetUser.role !== 'operator' && targetUser.role !== 'user') {
        return res.status(403).json({ error: '经理只能将店铺分配给运营或普通用户' })
      }
    }

    const id = `store-${crypto.randomUUID()}`
    const createdAt = new Date().toISOString()

    await dbRun(
      `INSERT INTO stores (
        id, name, nameTh, description, platform, userId, region,
        currency, currencySymbol, minPrice, maxPrice,
        targetAudience, brandPositioning, brandStrategy, status, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        name,
        nameTh || null,
        description || null,
        platform,
        storeUserId,
        region || null,
        currency || 'CNY',
        currencySymbol || '¥',
        minPrice || null,
        maxPrice || null,
        targetAudience || null,
        brandPositioning || null,
        brandStrategy || null,
        status,
        createdAt,
        createdAt,
      ]
    )

    // 添加分类关联
    if (Array.isArray(categoryIds) && categoryIds.length > 0) {
      for (const categoryId of categoryIds) {
        const categoryLinkId = crypto.randomUUID()
        await dbRun(
          'INSERT INTO store_categories (id, storeId, categoryId, createdAt) VALUES (?, ?, ?, ?)',
          [categoryLinkId, id, categoryId, createdAt]
        )
      }
    }

    // 添加多人可见：userIds 中排除主归属人，写入 user_store_access
    if (canAssignStore && Array.isArray(userIds) && userIds.length > 0) {
      const toAdd = userIds.filter((uid: string) => uid && uid !== storeUserId)
      for (const uid of toAdd) {
        try {
          await dbRun(
            'INSERT OR IGNORE INTO user_store_access (id, userId, storeId, createdAt) VALUES (?, ?, ?, ?)',
            [crypto.randomUUID(), uid, id, createdAt]
          )
        } catch (_) {}
      }
    }

    const newStore = await dbGet('SELECT * FROM stores WHERE id = ?', [id])
    
    // 获取分类
    const categories = await dbAll(
      `SELECT c.* FROM categories c 
       INNER JOIN store_categories sc ON c.id = sc.categoryId 
       WHERE sc.storeId = ?`,
      [id]
    )
    newStore.categories = categories

    await logAudit({
      userId: storeUserId,
      action: 'create',
      entityType: 'store',
      entityId: id,
      details: JSON.stringify({ name, platform }),
    }).catch(() => {})

    res.status(201).json(newStore)
  } catch (error) {
    console.error('创建商店失败:', error)
    res.status(500).json({ error: '创建商店失败' })
  }
})

// 更新商店 - 普通用户只能更新自己的商店，支持全部店铺属性与分类
router.put('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const {
      name, nameTh, description, platform, status,
      region, currency, currencySymbol, minPrice, maxPrice,
      targetAudience, brandPositioning, brandStrategy,
      categoryIds, userId, userIds,
    } = req.body
    const currentUserId = req.user!.userId
    const role = req.user!.role
    const canManageAllStores = role === 'admin' || role === 'manager'
    const canAssignStore = role === 'admin' || role === 'manager'

    let store = await dbGet('SELECT * FROM stores WHERE id = ?', [id])
    if (!store) {
      return res.status(404).json({ error: '商店不存在或无权访问' })
    }
    if (!canManageAllStores) {
      const canAccess = await userCanAccessStore(currentUserId, id, role)
      if (!canAccess) {
        return res.status(404).json({ error: '商店不存在或无权访问' })
      }
    }

    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name
    if (nameTh !== undefined) updates.nameTh = nameTh
    if (description !== undefined) updates.description = description
    if (platform !== undefined) updates.platform = platform
    if (status !== undefined) updates.status = status
    if (region !== undefined) updates.region = region
    if (currency !== undefined) updates.currency = currency
    if (currencySymbol !== undefined) updates.currencySymbol = currencySymbol
    if (minPrice !== undefined) updates.minPrice = minPrice
    if (maxPrice !== undefined) updates.maxPrice = maxPrice
    if (targetAudience !== undefined) updates.targetAudience = targetAudience
    if (brandPositioning !== undefined) updates.brandPositioning = brandPositioning
    if (brandStrategy !== undefined) updates.brandStrategy = brandStrategy
    if (canAssignStore && userId !== undefined) {
      if (role === 'manager') {
        const targetUser = await dbGet('SELECT role FROM users WHERE id = ?', [userId])
        if (!targetUser) {
          return res.status(400).json({ error: '目标用户不存在' })
        }
        if (targetUser.role !== 'operator' && targetUser.role !== 'user') {
          return res.status(403).json({ error: '经理只能将店铺分配给运营或普通用户' })
        }
      }
      updates.userId = userId
    }
    updates.updatedAt = new Date().toISOString()

    const updateFields = Object.keys(updates).map((key) => `${key} = ?`).join(', ')
    const updateValues = Object.values(updates)
    await dbRun(`UPDATE stores SET ${updateFields} WHERE id = ?`, [...updateValues, id])

    // 更新分类关联
    if (Array.isArray(categoryIds)) {
      await dbRun('DELETE FROM store_categories WHERE storeId = ?', [id])
      const now = new Date().toISOString()
      for (const categoryId of categoryIds) {
        if (!categoryId) continue
        await dbRun(
          'INSERT INTO store_categories (id, storeId, categoryId, createdAt) VALUES (?, ?, ?, ?)',
          [crypto.randomUUID(), id, categoryId, now]
        )
      }
    }

    // 更新多人可见：仅管理员/经理可改；全量替换 user_store_access
    if (canAssignStore && Array.isArray(userIds)) {
      const newOwner = updates.userId as string | undefined
      const ownerId = newOwner ?? (store as { userId: string }).userId
      await dbRun('DELETE FROM user_store_access WHERE storeId = ?', [id])
      const toAdd = (userIds as string[]).filter((uid: string) => uid && uid !== ownerId)
      const now2 = new Date().toISOString()
      for (const uid of toAdd) {
        try {
          await dbRun(
            'INSERT OR IGNORE INTO user_store_access (id, userId, storeId, createdAt) VALUES (?, ?, ?, ?)',
            [crypto.randomUUID(), uid, id, now2]
          )
        } catch (_) {}
      }
    }

    const updatedStore = await dbGet('SELECT * FROM stores WHERE id = ?', [id])
    const categories = await dbAll(
      `SELECT c.* FROM categories c INNER JOIN store_categories sc ON c.id = sc.categoryId WHERE sc.storeId = ?`,
      [id]
    )
    updatedStore.categories = categories
    res.json(updatedStore)
  } catch (error) {
    console.error('更新商店失败:', error)
    res.status(500).json({ error: '更新商店失败' })
  }
})

// 删除商店 - 普通用户只能删除自己的商店
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const userId = req.user!.userId
    const isAdmin = req.user!.role === 'admin'

    const store = await dbGet('SELECT * FROM stores WHERE id = ?', [id])
    if (!store) {
      return res.status(404).json({ error: '商店不存在或无权访问' })
    }
    if (!isAdmin) {
      const canAccess = await userCanAccessStore(userId, id, req.user!.role)
      if (!canAccess) {
        return res.status(404).json({ error: '商店不存在或无权访问' })
      }
    }
    // 仅 admin 可删；operator/user 需为归属人或被授权，且是否允许删除看业务（当前仅 admin 可删，其他角色无删除入口）
    if (!isAdmin) {
      const ownerId = (store as { userId: string }).userId
      if (ownerId !== userId) {
        return res.status(403).json({ error: '只有管理员可删除店铺' })
      }
    }

    await dbRun('DELETE FROM user_store_access WHERE storeId = ?', [id])
    await dbRun('DELETE FROM stores WHERE id = ?', [id])
    res.json({ message: '商店已删除' })
  } catch (error) {
    console.error('删除商店失败:', error)
    res.status(500).json({ error: '删除商店失败' })
  }
})

export default router
