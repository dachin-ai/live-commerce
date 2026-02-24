import api from './api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface Task {
  id: string
  title: string
  /** 与后端一致：可选，空时列表不展示描述区 */
  description?: string
  /** 多语言缓存：由内置翻译按需填充，key 为 zh-CN、en-US、th-TH */
  title_i18n?: Record<string, string>
  description_i18n?: Record<string, string>
  priority: 'urgent' | 'normal'
  status: 'pending' | 'in-progress' | 'completed'
  createdAt: string
  storeId?: string | null
  /** 关联执行工具，用于待办卡片快速跳转 */
  aiFeature?: string | null
  /** 来源：llm_intelligent=LLM 智能，event/stage/anomaly/threshold=系统规则 */
  source?: string | null
  /** 列表接口 JOIN 返回的店铺名称（仅列表有） */
  storeName?: string | null
  /** 列表接口返回的分配角色（仅列表有） */
  assignedRole?: string | null
}

export const useTasks = (storeId?: string) => {
  return useQuery<Task[]>({
    queryKey: ['tasks', storeId],
    queryFn: async () => {
      const params = storeId ? { storeId } : {}
      const data = await api.get('/tasks', { params })
      return data as unknown as Task[]
    },
    retry: false,
    // 仅在有店铺时请求，实现不同商店间任务隔离（未选店铺时显示空）
    enabled: !!storeId,
  })
}

export const useCreateTask = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (task: Omit<Task, 'id' | 'createdAt'>) => {
      return await api.post('/tasks', task)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export const useUpdateTask = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Task> & { id: string }) => {
      return await api.put(`/tasks/${id}`, updates)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export const useDeleteTask = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      return await api.delete(`/tasks/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

/** 翻译接口超时：多条待办逐条调用外部 API，预留 2 分钟避免前端报错 */
const TRANSLATE_FOR_LOCALE_TIMEOUT_MS = 120000

/** 额度不足时展示的硬编码提示（与后端一致，不依赖 i18n） */
export const TRANSLATE_QUOTA_MESSAGE = '额度不足，请前往https://translate.google.com/'

/** 一键将当前店铺待办翻译为指定语言并写入缓存（POST /api/tasks/translate-for-locale），避免重复调用 LLM */
export async function translateTasksForLocale(
  storeId: string | undefined,
  locale: string
): Promise<{ translated: number; total: number; error?: 'QUOTA_EXCEEDED'; message?: string }> {
  try {
    const data = await api.post(
      '/tasks/translate-for-locale',
      { storeId, locale },
      { timeout: TRANSLATE_FOR_LOCALE_TIMEOUT_MS }
    )
    return data as unknown as { translated: number; total: number; error?: 'QUOTA_EXCEEDED'; message?: string }
  } catch (e: unknown) {
    const error = e as { code?: string; message?: string }
    const isTimeout = error.code === 'ECONNABORTED' || /timeout/i.test(String(error.message))
    if (isTimeout) {
      console.warn('[translateTasksForLocale] 请求超时，请稍后重试或减少待办数量')
    }
    throw e
  }
}

// 批量完成任务
export const useBatchCompleteTasks = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (taskIds: string[]) => {
      return await api.post('/tasks/batch/complete', { taskIds })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

// 批量删除任务
export const useBatchDeleteTasks = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (taskIds: string[]) => {
      return await api.post('/tasks/batch/delete', { taskIds })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

// 一键完成所有待办任务
export const useCompleteAllTasks = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (storeId?: string) => {
      return await api.post('/tasks/complete-all', { storeId: storeId || null })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}
