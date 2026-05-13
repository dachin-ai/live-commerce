import { TaskRepository, TaskRow } from '../repositories/TaskRepository';
import { translateBatch, TranslateQuotaError, TranslateServiceUnavailableError, TRANSLATE_QUOTA_MESSAGE } from '../utils/translate';
import crypto from 'crypto';
import { NotFoundError, AppError } from '../utils/errors';

// ==================== 并发信号量（限制翻译并发） ====================

const MAX_TRANSLATE_CONCURRENCY = 5
let _activeSem = 0
const _waitQueue: Array<() => void> = []

async function withTranslateSemaphore<T>(fn: () => Promise<T>): Promise<T> {
  if (_activeSem >= MAX_TRANSLATE_CONCURRENCY) {
    await new Promise<void>(resolve => _waitQueue.push(resolve))
  }
  _activeSem++
  try {
    return await fn()
  } finally {
    _activeSem--
    const next = _waitQueue.shift()
    if (next) next()
  }
}

export class TaskService {
  private repo = new TaskRepository();

  public canEditAnyTask(role: string): boolean {
    return role === 'admin' || role === 'manager';
  }

  public canSeeAllTasks(role: string): boolean {
    return role === 'admin' || role === 'manager' || role === 'viewer';
  }

  public parseI18n(raw: any): Record<string, string> {
    if (raw == null || raw === '') return {};
    if (typeof raw === 'object') return raw;
    try {
      const o = JSON.parse(String(raw));
      return typeof o === 'object' && o !== null ? o : {};
    } catch {
      return {};
    }
  }

  private SECTION_MARKERS = [
    { marker: '【目标】', key: 'SEC_TARGET' },
    { marker: '【数据来源】', key: 'SEC_DATA_SOURCE' },
    { marker: '【执行步骤】', key: 'SEC_STEPS' },
    { marker: '【操作步骤】', key: 'SEC_STEPS' },
    { marker: '【步骤】', key: 'SEC_STEPS' },
    { marker: '【参数配置】', key: 'SEC_PARAMS' },
    { marker: '【验证方案】', key: 'SEC_VALIDATION' },
    { marker: '【资源需求】', key: 'SEC_RESOURCES' },
    { marker: '【预期】', key: 'SEC_EXPECTED' },
    { marker: '【预期效果】', key: 'SEC_EXPECTED' },
  ];

  /**
   * 生成带 sessionId 前缀的占位符，防止并发翻译时跨请求串数据。
   * 返回 { protected, sessionId } 以便 restore 使用同一 sessionId。
   */
  public protectSectionMarkers(desc: string, sessionId?: string): string {
    const sid = sessionId || Math.random().toString(36).slice(2, 8);
    let s = String(desc ?? '');
    for (const { marker, key } of this.SECTION_MARKERS) {
      s = s.split(marker).join(`[[${sid}_${key}]]`);
    }
    return s;
  }

  public restoreSectionMarkers(desc: string, sessionId?: string): string {
    let s = String(desc ?? '');
    if (sessionId) {
      // 使用精确的 sessionId 恢复
      for (const { marker, key } of this.SECTION_MARKERS) {
        s = s.split(`[[${sessionId}_${key}]]`).join(marker);
      }
    } else {
      // 兼容旧 token 格式和新格式的正则恢复
      const keyToMarker: Record<string, string> = {};
      for (const { marker, key } of this.SECTION_MARKERS) {
        if (!keyToMarker[key]) keyToMarker[key] = marker;
      }
      for (const [key, marker] of Object.entries(keyToMarker)) {
        // 匹配 [[任意sessionId_KEY]] 和旧格式 [[KEY]]
        s = s.replace(new RegExp(`\\[\\[[a-z0-9]{0,8}_?${key}\\]\\]`, 'g'), marker);
      }
    }
    return s;
  }

  async getTasks(userId: string, role: string, storeId?: string, weekStart?: string): Promise<TaskRow[]> {
    const canSeeAll = this.canSeeAllTasks(role);
    return await this.repo.findAllTasks({
      userId,
      canSeeAll,
      storeId,
      weekStart: weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart.trim()) ? weekStart.trim() : undefined,
    });
  }

  async translateTasksForLocale(userId: string, role: string, targetLocale: string, storeId?: string): Promise<{ translated: number; total: number; error?: string; message?: string }> {
    const isAdmin = role === 'admin' || role === 'manager';
    const filters = isAdmin && storeId ? { storeId, userId } : { userId };
    
    const tasks = await this.repo.findTasksForTranslation(filters);
    const needTranslate = tasks.filter((t) => {
      const titleOk = !!this.parseI18n(t.title_i18n)[targetLocale];
      const descOk = !!this.parseI18n(t.description_i18n)[targetLocale];
      return !(titleOk && descOk);
    });

    if (needTranslate.length === 0) {
      return { translated: 0, total: tasks.length };
    }

    // 每次翻译请求生成独立 sessionId，防止并发时占位符交叉污染
    const sessionId = Math.random().toString(36).slice(2, 8);
    const flatTexts: string[] = [];
    for (const t of needTranslate) {
      flatTexts.push(t.title || '');
      flatTexts.push(this.protectSectionMarkers(t.description || '', sessionId));
    }

    try {
      // 通过信号量限制并发翻译请求数
      const titleDescResults = await withTranslateSemaphore(() =>
        translateBatch(flatTexts, targetLocale, 'zh-CN')
      );
      let translated = 0;
      for (let i = 0; i < needTranslate.length; i++) {
        const task = needTranslate[i];
        const titleI18n = this.parseI18n(task.title_i18n);
        const descI18n = this.parseI18n(task.description_i18n);
        
        titleI18n[targetLocale] = titleDescResults[2 * i] ?? task.title ?? '';
        const desc = titleDescResults[2 * i + 1];
        if (desc) descI18n[targetLocale] = this.restoreSectionMarkers(desc, sessionId);
        
        await this.repo.updateTranslation(task.id, JSON.stringify(titleI18n), JSON.stringify(descI18n), new Date().toISOString());
        translated++;
      }
      return { translated, total: tasks.length };
    } catch (error: any) {
      if (error instanceof TranslateQuotaError || error?.code === 'QUOTA_EXCEEDED') {
        return { translated: 0, total: tasks.length, error: 'QUOTA_EXCEEDED', message: TRANSLATE_QUOTA_MESSAGE };
      }
      if (error instanceof TranslateServiceUnavailableError || error?.code === 'TRANSLATE_UNAVAILABLE') {
        throw new AppError(error?.message || '翻译服务不可用', 503, 'TRANSLATE_UNAVAILABLE');
      }
      throw new AppError('翻译失败，请稍后重试', 500, 'INTERNAL_ERROR', error);
    }
  }

  async createTask(userId: string, taskData: Partial<TaskRow>): Promise<TaskRow> {
    if (!taskData.title) {
      throw new AppError('标题不能为空', 400, 'BAD_REQUEST');
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const est = taskData.estimatedDays != null && String(taskData.estimatedDays).trim() ? String(taskData.estimatedDays).trim().slice(0, 64) : null;
    const cat = taskData.category != null && String(taskData.category).trim() ? String(taskData.category).trim().slice(0, 64) : null;
    const resp = taskData.responsible != null && String(taskData.responsible).trim() ? String(taskData.responsible).trim().slice(0, 128) : null;

    const taskToCreate = {
      id,
      title: taskData.title,
      description: taskData.description || undefined,
      priority: taskData.priority || 'normal',
      status: taskData.status || 'pending',
      userId,
      storeId: taskData.storeId,
      createdAt,
      estimatedDays: est || undefined,
      category: cat || undefined,
      responsible: resp || undefined
    };

    await this.repo.createTask(taskToCreate);
    const createdTask = await this.repo.findById(id);
    if (!createdTask) throw new AppError('Failed to retrieve created task', 500);
    return createdTask;
  }

  async updateTask(id: string, userId: string, role: string, updates: Partial<TaskRow>): Promise<TaskRow> {
    const task = await this.repo.findById(id);
    if (!task) {
      throw new NotFoundError('任务不存在或无权访问');
    }

    if (!this.canEditAnyTask(role) && task.userId !== userId) {
      throw new NotFoundError('任务不存在或无权访问');
    }

    const cleanUpdates: Partial<TaskRow> = { ...updates };
    if (cleanUpdates.estimatedDays != null) cleanUpdates.estimatedDays = String(cleanUpdates.estimatedDays).slice(0, 64);
    if (cleanUpdates.category != null) cleanUpdates.category = String(cleanUpdates.category).slice(0, 64);
    if (cleanUpdates.responsible != null) cleanUpdates.responsible = String(cleanUpdates.responsible).slice(0, 128);
    cleanUpdates.updatedAt = new Date().toISOString();

    await this.repo.updateTask(id, cleanUpdates);
    return (await this.repo.findById(id))!;
  }

  async deleteTask(id: string, userId: string, role: string): Promise<void> {
    const task = await this.repo.findById(id);
    if (!task || (!this.canEditAnyTask(role) && task.userId !== userId)) {
      throw new NotFoundError('任务不存在或无权访问');
    }
    await this.repo.deleteById(id);
  }

  async batchCompleteTasks(taskIds: string[], userId: string, role: string): Promise<{ successCount: number, failedCount: number, failedIds: string[] }> {
    let successCount = 0;
    const failedIds: string[] = [];

    for (const id of taskIds) {
      try {
        const task = await this.repo.findById(id);
        if (!task || (!this.canEditAnyTask(role) && task.userId !== userId)) {
          failedIds.push(id);
          continue;
        }
        await this.repo.updateTask(id, { status: 'completed' });
        successCount++;
      } catch (err) {
        failedIds.push(id);
      }
    }

    return { successCount, failedCount: failedIds.length, failedIds };
  }

  async batchDeleteTasks(taskIds: string[], userId: string, role: string): Promise<{ successCount: number, failedCount: number, failedIds: string[] }> {
    let successCount = 0;
    const failedIds: string[] = [];

    for (const id of taskIds) {
      try {
        const task = await this.repo.findById(id);
        if (!task || (!this.canEditAnyTask(role) && task.userId !== userId)) {
          failedIds.push(id);
          continue;
        }
        await this.repo.deleteById(id);
        successCount++;
      } catch (err) {
        failedIds.push(id);
      }
    }

    return { successCount, failedCount: failedIds.length, failedIds };
  }

  async completeAllPending(userId: string, storeId?: string): Promise<void> {
    const tasks = await this.getTasks(userId, 'user', storeId); // using 'user' so it only fetches user's tasks
    const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in-progress');
    
    for (const t of pendingTasks) {
       await this.repo.updateTask(t.id, { status: 'completed', updatedAt: new Date().toISOString() });
    }
  }
}
