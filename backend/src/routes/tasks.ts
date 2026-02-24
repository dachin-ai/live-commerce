import express from 'express'
import { dbRun, dbGet, dbAll } from '../db'
import { authenticate, AuthRequest } from '../middleware/auth'
import { translateBatch, TranslateQuotaError, TRANSLATE_QUOTA_MESSAGE } from '../utils/translate'
import crypto from 'crypto'

const router = express.Router()

// 所有路由都需要认证
router.use(authenticate)

// 获取所有任务 - 普通用户只能看到自己的任务，管理员可以看到所有
router.get('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId
    const isAdmin = (req.user!.role === 'admin' || req.user!.role === 'manager')
    const { storeId } = req.query // 支持按店铺过滤

    // 修改查询以包含店铺名称
    let query = 'SELECT t.*, s.name as storeName FROM tasks t LEFT JOIN stores s ON t.storeId = s.id WHERE 1=1'
    const params: any[] = []

    // 普通用户只能看到自己的任务
    if (!isAdmin) {
      query += ' AND t.userId = ?'
      params.push(userId)
    }

    // 如果指定了店铺ID，只返回该店铺的任务
    if (storeId && typeof storeId === 'string') {
      query += ' AND t.storeId = ?'
      params.push(storeId)
    }

    query += ' ORDER BY t.createdAt DESC'

    const tasks = await dbAll(query, params)
    res.json(tasks)
  } catch (error) {
    console.error('获取任务失败:', error)
    res.status(500).json({ error: '获取任务失败' })
  }
})

/** 解析 JSON 多语言字段，无效则返回空对象 */
function parseI18n(raw: any): Record<string, string> {
  if (raw == null || raw === '') return {}
  if (typeof raw === 'object') return raw
  try {
    const o = JSON.parse(String(raw))
    return typeof o === 'object' && o !== null ? o : {}
  } catch {
    return {}
  }
}

/**
 * POST /api/tasks/translate-for-locale
 * Body: { storeId?: string, locale: string }
 * 将店铺下所有待办（有 storeId）或当前用户的待办翻译为 locale 并写入 title_i18n/description_i18n。
 * 修复：管理员查看他人店铺时，可翻译该店铺的所有待办（不限 userId）。
 */
router.post('/translate-for-locale', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId
    const isAdmin = (req.user!.role === 'admin' || req.user!.role === 'manager')
    const { storeId, locale } = req.body
    const targetLocale = typeof locale === 'string' ? locale.trim() || 'en-US' : 'en-US'
    console.log(`[翻译待办] userId=${userId}, isAdmin=${isAdmin}, storeId=${storeId || 'all'}, locale=${targetLocale}`)

    let query = 'SELECT id, title, description, title_i18n, description_i18n FROM tasks WHERE status = ?'
    const params: any[] = ['pending']
    
    if (storeId && typeof storeId === 'string') {
      // 有店铺 ID：查该店铺下的所有待办（管理员可翻译他人店铺的待办）
      query += ' AND storeId = ?'
      params.push(storeId)
    } else {
      // 无店铺 ID：仅查当前用户的待办
      query += ' AND userId = ?'
      params.push(userId)
    }
    const tasks = await dbAll<any>(query, params)
    console.log(`[翻译待办] 查询到 ${tasks.length} 条待办`)
    const sourceLang = 'zh-CN'
    const needTranslate = tasks.filter((t) => !parseI18n(t.title_i18n)[targetLocale])
    if (needTranslate.length === 0) {
      console.log('[翻译待办] 无需翻译，均已缓存')
      return res.json({ translated: 0, total: tasks.length })
    }
    const flatTexts: string[] = []
    for (const t of needTranslate) {
      flatTexts.push(t.title || '')
      flatTexts.push(t.description || '')
    }
    let titleDescResults: string[]
    try {
      titleDescResults = await translateBatch(flatTexts, targetLocale, sourceLang)
    } catch (err: any) {
      if (err instanceof TranslateQuotaError || err?.code === 'QUOTA_EXCEEDED') {
        console.log('[翻译待办] 触发限额')
        return res.json({ translated: 0, total: tasks.length, error: 'QUOTA_EXCEEDED', message: TRANSLATE_QUOTA_MESSAGE })
      }
      throw err
    }
    let translated = 0
    for (let i = 0; i < needTranslate.length; i++) {
      const task = needTranslate[i]
      const titleI18n = parseI18n(task.title_i18n)
      const descI18n = parseI18n(task.description_i18n)
      titleI18n[targetLocale] = titleDescResults[2 * i] ?? task.title ?? ''
      const desc = titleDescResults[2 * i + 1]
      if (desc) descI18n[targetLocale] = desc
      await dbRun(
        'UPDATE tasks SET title_i18n = ?, description_i18n = ?, updatedAt = ? WHERE id = ?',
        [JSON.stringify(titleI18n), JSON.stringify(descI18n), new Date().toISOString(), task.id]
      )
      translated++
    }
    console.log(`[翻译待办] 完成：translated=${translated}, total=${tasks.length}（批量请求 1 次）`)
    res.json({ translated, total: tasks.length })
  } catch (error: any) {
    if (error instanceof TranslateQuotaError || error?.code === 'QUOTA_EXCEEDED') {
      return res.json({ translated: 0, total: 0, error: 'QUOTA_EXCEEDED', message: TRANSLATE_QUOTA_MESSAGE })
    }
    console.error('翻译待办失败:', error)
    res.status(500).json({ error: '翻译失败，请稍后重试' })
  }
})

// 创建任务
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { title, description, priority = 'normal', status = 'pending', storeId } = req.body
    const userId = req.user!.userId

    if (!title) {
      return res.status(400).json({ error: '标题不能为空' })
    }

    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()

    await dbRun(
      'INSERT INTO tasks (id, title, description, priority, status, userId, storeId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, title, description || null, priority, status, userId, storeId || null, createdAt]
    )

    res.status(201).json({ id, title, description, priority, status, userId, storeId: storeId || null, createdAt })
  } catch (error) {
    console.error('创建任务失败:', error)
    res.status(500).json({ error: '创建任务失败' })
  }
})

// 更新任务
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { title, description, priority, status, storeId } = req.body
    const userId = req.user!.userId
    const isAdmin = (req.user!.role === 'admin' || req.user!.role === 'manager')

    let query = 'SELECT * FROM tasks WHERE id = ?'
    const params: any[] = [id]

    // 普通用户只能更新自己的任务
    if (!isAdmin) {
      query += ' AND userId = ?'
      params.push(userId)
    }

    const task = await dbGet(query, params)

    if (!task) {
      return res.status(404).json({ error: '任务不存在或无权访问' })
    }

    const updates: any = {}
    if (title !== undefined) updates.title = title
    if (description !== undefined) updates.description = description
    if (priority !== undefined) updates.priority = priority
    if (status !== undefined) updates.status = status
    if (storeId !== undefined) updates.storeId = storeId
    updates.updatedAt = new Date().toISOString()

    const updateFields = Object.keys(updates)
      .map((key) => `${key} = ?`)
      .join(', ')
    const updateValues = Object.values(updates)

    await dbRun(`UPDATE tasks SET ${updateFields} WHERE id = ?`, [...updateValues, id])

    const updatedTask = await dbGet('SELECT * FROM tasks WHERE id = ?', [id])
    res.json(updatedTask)
  } catch (error) {
    console.error('更新任务失败:', error)
    res.status(500).json({ error: '更新任务失败' })
  }
})

// 删除任务
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const userId = req.user!.userId
    const isAdmin = (req.user!.role === 'admin' || req.user!.role === 'manager')

    let query = 'SELECT * FROM tasks WHERE id = ?'
    const params: any[] = [id]

    // 普通用户只能删除自己的任务
    if (!isAdmin) {
      query += ' AND userId = ?'
      params.push(userId)
    }

    const task = await dbGet(query, params)
    if (!task) {
      return res.status(404).json({ error: '任务不存在或无权访问' })
    }

    await dbRun('DELETE FROM tasks WHERE id = ?', [id])
    res.json({ message: '任务已删除' })
  } catch (error) {
    console.error('删除任务失败:', error)
    res.status(500).json({ error: '删除任务失败' })
  }
})

// 批量完成任务
router.post('/batch/complete', async (req: AuthRequest, res) => {
  try {
    const { taskIds } = req.body // 任务ID数组
    const userId = req.user!.userId
    const isAdmin = (req.user!.role === 'admin' || req.user!.role === 'manager')

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ error: '任务ID列表不能为空' })
    }

    // 验证权限并批量更新
    let successCount = 0
    const failedIds: string[] = []

    for (const id of taskIds) {
      try {
        let query = 'SELECT * FROM tasks WHERE id = ?'
        const params: any[] = [id]

        // 普通用户只能操作自己的任务
        if (!isAdmin) {
          query += ' AND userId = ?'
          params.push(userId)
        }

        const task = await dbGet(query, params)
        if (!task) {
          failedIds.push(id)
          continue
        }

        await dbRun('UPDATE tasks SET status = ? WHERE id = ?', ['completed', id])
        successCount++
      } catch (err) {
        failedIds.push(id)
        console.error(`批量完成任务 ${id} 失败:`, err)
      }
    }

    res.json({
      message: `成功完成 ${successCount} 个任务`,
      successCount,
      failedCount: failedIds.length,
      failedIds,
    })
  } catch (error) {
    console.error('批量完成任务失败:', error)
    res.status(500).json({ error: '批量完成任务失败' })
  }
})

// 批量删除任务
router.post('/batch/delete', async (req: AuthRequest, res) => {
  try {
    const { taskIds } = req.body // 任务ID数组
    const userId = req.user!.userId
    const isAdmin = (req.user!.role === 'admin' || req.user!.role === 'manager')

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ error: '任务ID列表不能为空' })
    }

    // 验证权限并批量删除
    let successCount = 0
    const failedIds: string[] = []

    for (const id of taskIds) {
      try {
        let query = 'SELECT * FROM tasks WHERE id = ?'
        const params: any[] = [id]

        // 普通用户只能操作自己的任务
        if (!isAdmin) {
          query += ' AND userId = ?'
          params.push(userId)
        }

        const task = await dbGet(query, params)
        if (!task) {
          failedIds.push(id)
          continue
        }

        await dbRun('DELETE FROM tasks WHERE id = ?', [id])
        successCount++
      } catch (err) {
        failedIds.push(id)
        console.error(`批量删除任务 ${id} 失败:`, err)
      }
    }

    res.json({
      message: `成功删除 ${successCount} 个任务`,
      successCount,
      failedCount: failedIds.length,
      failedIds,
    })
  } catch (error) {
    console.error('批量删除任务失败:', error)
    res.status(500).json({ error: '批量删除任务失败' })
  }
})

// 一键完成所有待办任务
router.post('/complete-all', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId
    const { storeId } = req.body // 可选：仅完成特定店铺的任务

    let query = 'UPDATE tasks SET status = ? WHERE status = ? AND userId = ?'
    const params: any[] = ['completed', 'pending', userId]

    if (storeId) {
      query += ' AND storeId = ?'
      params.push(storeId)
    }

    await dbRun(query, params)

    // 获取更新数量
    let countQuery = 'SELECT COUNT(*) as count FROM tasks WHERE status = ? AND userId = ?'
    const countParams: any[] = ['completed', userId]
    if (storeId) {
      countQuery += ' AND storeId = ?'
      countParams.push(storeId)
    }
    const result = await dbGet<{ count: number }>(countQuery, countParams)

    res.json({
      message: '所有待办任务已完成',
      count: result?.count || 0,
    })
  } catch (error) {
    console.error('一键完成所有任务失败:', error)
    res.status(500).json({ error: '一键完成所有任务失败' })
  }
})

export default router
