import { dbAll, dbRun, dbGet } from '../db';

export interface TaskRow {
  id: string;
  title: string;
  description?: string;
  title_i18n?: string;
  description_i18n?: string;
  priority: string;
  status: string;
  userId: string;
  storeId?: string;
  createdAt: string;
  updatedAt?: string;
  estimatedDays?: string;
  category?: string;
  responsible?: string;
  weekStart?: string;
  // joined fields
  storeName?: string;
  createdByName?: string;
}

export class TaskRepository {
  async findAllTasks(filters: { userId?: string; canSeeAll: boolean; storeId?: string; weekStart?: string }): Promise<TaskRow[]> {
    let query = 'SELECT t.*, s.name as storeName, u.name as createdByName FROM tasks t LEFT JOIN stores s ON t.storeId = s.id LEFT JOIN users u ON t.userId = u.id WHERE 1=1';
    const params: any[] = [];

    if (!filters.canSeeAll && filters.userId) {
      query += ' AND t.userId = ?';
      params.push(filters.userId);
    }

    if (filters.storeId) {
      query += ' AND t.storeId = ?';
      params.push(filters.storeId);
    }

    if (filters.weekStart) {
      const queryWithWeekStart = `${query} AND t.weekStart = ? ORDER BY t.createdAt DESC`;
      try {
        return await dbAll<TaskRow>(queryWithWeekStart, [...params, filters.weekStart]);
      } catch (e: any) {
        if (!String(e?.message ?? '').includes('no such column')) throw e;
        const startIso = `${filters.weekStart}T00:00:00.000Z`;
        const d = new Date(`${filters.weekStart}T00:00:00.000Z`);
        d.setUTCDate(d.getUTCDate() + 7);
        const endIso = d.toISOString();
        query += ' AND t.createdAt >= ? AND t.createdAt < ?';
        params.push(startIso, endIso);
      }
    }

    query += ' ORDER BY t.createdAt DESC';
    return await dbAll<TaskRow>(query, params);
  }

  async findTasksForTranslation(filters: { storeId?: string; userId: string }): Promise<TaskRow[]> {
    let query = "SELECT id, title, description, title_i18n, description_i18n FROM tasks WHERE status IN ('pending','in-progress','completed')";
    const params: any[] = [];

    if (filters.storeId) {
      query += ' AND storeId = ?';
      params.push(filters.storeId);
    } else {
      query += ' AND userId = ?';
      params.push(filters.userId);
    }
    
    return await dbAll<TaskRow>(query, params);
  }

  async updateTranslation(id: string, titleI18n: string, descI18n: string, updatedAt: string): Promise<void> {
    await dbRun(
      'UPDATE tasks SET title_i18n = ?, description_i18n = ?, updatedAt = ? WHERE id = ?',
      [titleI18n, descI18n, updatedAt, id]
    );
  }

  async createTask(task: Partial<TaskRow>): Promise<void> {
    try {
      await dbRun(
        'INSERT INTO tasks (id, title, description, priority, status, userId, storeId, createdAt, estimatedDays, category, responsible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          task.id, task.title, task.description || null, task.priority, task.status,
          task.userId, task.storeId || null, task.createdAt, task.estimatedDays || null,
          task.category || null, task.responsible || null
        ]
      );
    } catch (e: any) {
      if (String(e?.message ?? '').includes('no such column')) {
        await dbRun(
          'INSERT INTO tasks (id, title, description, priority, status, userId, storeId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [task.id, task.title, task.description || null, task.priority, task.status, task.userId, task.storeId || null, task.createdAt]
        );
      } else {
        throw e;
      }
    }
  }

  async findById(id: string): Promise<TaskRow | null> {
    const result = await dbGet<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id]);
    return result || null;
  }

  async updateTask(id: string, updates: Partial<TaskRow>): Promise<void> {
    const keys = Object.keys(updates);
    if (keys.length === 0) return;

    const setClauses = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => (updates as any)[k]);
    values.push(id);

    await dbRun(`UPDATE tasks SET ${setClauses} WHERE id = ?`, values);
  }

  async deleteById(id: string): Promise<void> {
    await dbRun('DELETE FROM tasks WHERE id = ?', [id]);
  }

  async batchComplete(storeId: string): Promise<void> {
    await dbRun("UPDATE tasks SET status = 'completed', updatedAt = ? WHERE storeId = ? AND status IN ('pending', 'in-progress')", [new Date().toISOString(), storeId]);
  }
}
