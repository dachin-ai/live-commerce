import { dbAll, dbGet, dbRun } from '../db'
import crypto from 'crypto'

export interface MaterialRow {
  id: string
  name: string
  type: string
  url: string
  storeId?: string | null
  userId?: string | null
  description?: string | null
  videoId?: string | null
  createdAt: string
}

export class MaterialRepository {
  async findAll(filters: { userId: string; isAdmin: boolean; storeId?: string; videoId?: string }): Promise<MaterialRow[]> {
    let query = `SELECT m.* FROM materials m LEFT JOIN stores s ON m.storeId = s.id WHERE 1=1`
    const params: unknown[] = []

    if (!filters.isAdmin) {
      query += ` AND (s.userId = ? OR m.userId = ?)`
      params.push(filters.userId, filters.userId)
    }
    if (filters.storeId) { query += ' AND m.storeId = ?'; params.push(filters.storeId) }
    if (filters.videoId) { query += ' AND m.videoId = ?'; params.push(filters.videoId) }

    query += ' ORDER BY m.createdAt DESC'
    return dbAll<MaterialRow>(query, params)
  }

  async findById(id: string): Promise<MaterialRow | null> {
    const row = await dbGet<MaterialRow>('SELECT * FROM materials WHERE id = ?', [id])
    return row || null
  }

  async create(data: Partial<MaterialRow>): Promise<MaterialRow> {
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    await dbRun(
      'INSERT INTO materials (id, name, type, url, storeId, description, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, data.name || '未命名素材', data.type || 'video', data.url, data.storeId || null, data.description || null, createdAt]
    )
    return (await this.findById(id))!
  }

  async update(id: string, updates: Partial<MaterialRow>): Promise<MaterialRow | null> {
    const fields = Object.keys(updates).map((k) => `${k} = ?`).join(', ')
    const values = Object.values(updates)
    await dbRun(`UPDATE materials SET ${fields} WHERE id = ?`, [...values, id])
    return this.findById(id)
  }

  async delete(id: string): Promise<void> {
    await dbRun('DELETE FROM materials WHERE id = ?', [id])
  }
}
