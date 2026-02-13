import express from 'express'
import { dbAll } from '../db'

const router = express.Router()

// 获取产品分类（多级分类）
router.get('/', async (req, res) => {
  try {
    const rawLevel = req.query.level
    const level = rawLevel != null ? String(rawLevel).trim() : ''
    const rawParentId = req.query.parentId
    const parentId = rawParentId != null ? String(rawParentId).trim() : ''

    let query = 'SELECT * FROM categories WHERE 1=1'
    const params: (string | number)[] = []

    if (level) {
      query += ' AND level = ?'
      params.push(level === '1' || level === '2' || level === '3' ? level : '1')
    }

    if (parentId) {
      const ids = parentId.split(',').map(s => s.trim()).filter(Boolean)
      if (ids.length === 1) {
        query += ' AND parentId = ?'
        params.push(ids[0])
      } else if (ids.length > 1) {
        query += ` AND parentId IN (${ids.map(() => '?').join(',')})`
        params.push(...ids)
      }
    } else if (level === '1') {
      query += ' AND parentId IS NULL'
    } else if (level === '2' || level === '3') {
      // 二/三级必须带 parentId，否则返回空
      query += ' AND 1=0'
    }

    query += ' ORDER BY sortOrder, name'

    const categories = await dbAll(query, params)
    res.json(categories)
  } catch (error) {
    console.error('获取分类失败:', error)
    res.status(500).json({ error: '获取分类失败' })
  }
})

export default router
