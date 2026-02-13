import express from 'express'
import { dbRun, dbGet, dbAll, logAudit } from '../db'
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth'
import crypto from 'crypto'

const router = express.Router()

// 获取所有商店（支持搜索）- 普通用户只能看到自己的商店，管理员可以看到所有
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { search } = req.query
    const userId = req.user!.userId
    const isAdmin = req.user!.role === 'admin'

    let query = 'SELECT s.*, u.name as userName FROM stores s LEFT JOIN users u ON s.userId = u.id'
    const params: any[] = []

    // 普通用户只能看到自己的商店
    if (!isAdmin) {
      query += ' WHERE s.userId = ?'
      params.push(userId)
    }

    if (search && typeof search === 'string') {
      query += isAdmin ? ' WHERE' : ' AND'
      query += ' (s.name LIKE ? OR s.nameTh LIKE ? OR s.description LIKE ?)'
      const searchPattern = `%${search}%`
      params.push(searchPattern, searchPattern, searchPattern)
    }

    query += ' ORDER BY s.createdAt DESC'

    const stores = await dbAll(query, params)
    
    // 获取每个商店的分类
    for (const store of stores) {
      const categories = await dbAll(
        `SELECT c.* FROM categories c 
         INNER JOIN store_categories sc ON c.id = sc.categoryId 
         WHERE sc.storeId = ?`,
        [store.id]
      )
      store.categories = categories
    }

    res.json(stores)
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
    const isAdmin = req.user!.role === 'admin'

    let query = 'SELECT s.*, u.name as userName FROM stores s LEFT JOIN users u ON s.userId = u.id WHERE s.id = ?'
    const params: any[] = [id]

    // 普通用户只能查看自己的商店
    if (!isAdmin) {
      query += ' AND s.userId = ?'
      params.push(userId)
    }

    const store = await dbGet(query, params)
    
    if (!store) {
      return res.status(404).json({ error: '商店不存在或无权访问' })
    }
    
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
      userId, // 管理员可以指定，普通用户使用自己的ID
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
    const isAdmin = req.user!.role === 'admin'
    
    // 普通用户只能为自己创建商店，管理员可以指定userId
    const storeUserId = isAdmin && userId ? userId : currentUserId

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

// 更新商店 - 普通用户只能更新自己的商店
router.put('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { name, description, platform, status } = req.body
    const userId = req.user!.userId
    const isAdmin = req.user!.role === 'admin'

    let query = 'SELECT * FROM stores WHERE id = ?'
    const params: any[] = [id]

    if (!isAdmin) {
      query += ' AND userId = ?'
      params.push(userId)
    }

    const store = await dbGet(query, params)

    if (!store) {
      return res.status(404).json({ error: '商店不存在或无权访问' })
    }

    const updates: any = {}
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (platform !== undefined) updates.platform = platform
    if (status !== undefined) updates.status = status
    updates.updatedAt = new Date().toISOString()

    const updateFields = Object.keys(updates)
      .map((key) => `${key} = ?`)
      .join(', ')
    const updateValues = Object.values(updates)

    await dbRun(`UPDATE stores SET ${updateFields} WHERE id = ?`, [...updateValues, id])

    const updatedStore = await dbGet('SELECT * FROM stores WHERE id = ?', [id])
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

    let query = 'SELECT * FROM stores WHERE id = ?'
    const params: any[] = [id]

    if (!isAdmin) {
      query += ' AND userId = ?'
      params.push(userId)
    }

    const store = await dbGet(query, params)
    if (!store) {
      return res.status(404).json({ error: '商店不存在或无权访问' })
    }

    await dbRun('DELETE FROM stores WHERE id = ?', [id])
    res.json({ message: '商店已删除' })
  } catch (error) {
    console.error('删除商店失败:', error)
    res.status(500).json({ error: '删除商店失败' })
  }
})

export default router
