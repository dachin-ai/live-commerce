import { useTranslation } from 'react-i18next'
import { useTasks, useUpdateTask, translateTasksForLocale, TRANSLATE_QUOTA_MESSAGE } from '../services/tasks'
import { generateTasks, getScriptLLMConfig, getLlmDiagnostic, type GenerateTasksMetadata } from '../services/ai'
import { useStore } from '../contexts/StoreContext'
import { useLanguage } from '../contexts/LanguageContext'
import { CheckCircle2, Clock, AlertCircle, RefreshCw, ChevronDown, ChevronUp, ListTodo, ExternalLink } from 'lucide-react'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useToast } from '../contexts/ToastContext'
import { Link } from 'react-router-dom'
import type { Task } from '../services/tasks'

/** aiFeature → 执行工具 ID 列表（用于快速跳转） */
const AI_FEATURE_TO_TOOLS: Record<string, string[]> = {
  event: ['speech', 'recommendations'],
  script: ['speech'],
  product_recommend: ['recommendations', 'stats', 'report'],
  time_recommend: ['stats'],
  engagement: ['speech'],
  pricing: ['recommendations', 'market-analysis'],
  schedule: ['stats', 'report'],
  marketing: ['market-analysis', 'speech'],
  content: ['speech', 'recommendations'],
  report: ['report'],
  crm: ['report'],
  brand: ['market-analysis', 'report'],
  supply_chain: ['market-analysis', 'report'],
}
/** 执行工具 ID → i18n key（展示名称由 useTranslation 提供） */
const TOOL_I18N_KEYS: Record<string, string> = {
  speech: 'tools.speech',
  report: 'tools.report',
  'market-analysis': 'tools.marketAnalysis',
  recommendations: 'tools.recommendations',
  stats: 'tools.stats',
  compare: 'tools.compare',
  assistant: 'tools.assistant',
  'screen-recording': 'tools.screenRecording',
}

/** 解析可能为 JSON 字符串的 i18n 字段 */
function parseTaskI18n(raw: Task['title_i18n']): Record<string, string> {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try {
    const o = JSON.parse(String(raw))
    return typeof o === 'object' && o !== null ? o : {}
  } catch {
    return {}
  }
}

/** 按当前界面语言取待办标题/描述：优先使用内置翻译缓存，否则显示原文（生成时为 zh-CN） */
function getTaskDisplayTitle(task: Task, locale: string): string {
  const key = locale || 'zh-CN'
  const i18n = parseTaskI18n(task.title_i18n)
  return i18n[key] || task.title
}
/** 展示时去掉【工具】段落，工具信息仅通过快速跳转体现 */
function stripToolsSection(desc: string): string {
  if (!desc || !desc.includes('【工具】')) return desc
  return desc
    .replace(/\n*【工具】[^\n]*(?:\n(?!【)[^\n]*)*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function getTaskDisplayDescription(task: Task, locale: string): string | undefined {
  const key = locale || 'zh-CN'
  const i18n = parseTaskI18n(task.description_i18n)
  const desc = i18n[key] ?? task.description
  const raw = desc || undefined
  return raw ? stripToolsSection(raw) : undefined
}

function getQuickJumpTools(task: Task): string[] {
  const feat = task.aiFeature
  if (feat && AI_FEATURE_TO_TOOLS[feat]) {
    return AI_FEATURE_TO_TOOLS[feat]
  }
  if (/节日|倒计时|备货|大促|情人节|圣诞|宋干|水灯/.test(task.title || '')) return ['speech', 'recommendations']
  if (/GMV|波动|选品|复盘/.test(task.title || '')) return ['stats', 'report', 'recommendations']
  if (/转化率|话术/.test(task.title || '')) return ['speech']
  return []
}

type TaskFilter = 'all' | 'urgent' | 'normal'

export default function TaskList() {
  const { t } = useTranslation()
  const { locale } = useLanguage()
  const toast = useToast()
  const { selectedStore, stores } = useStore()
  const { data: tasks = [], isLoading, refetch } = useTasks(selectedStore?.id)
  /** 当前店铺无数据时，用该店铺的 stats 生成（任务仍归属当前店铺）。空字符串表示仅用当前店铺。 */
  const [useStatsFromStoreId, setUseStatsFromStoreId] = useState<string>('')
  const { data: scriptLlmConfig } = useQuery({
    queryKey: ['script-llm-config'],
    queryFn: getScriptLLMConfig,
    staleTime: 60_000,
  })
  const queryClient = useQueryClient()
  const updateTask = useUpdateTask()
  const [refreshing, setRefreshing] = useState(false)
  const [translating, setTranslating] = useState(false)
  const translatingRef = useRef(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const [filter, setFilter] = useState<TaskFilter>('all')
  const llmConfigured = scriptLlmConfig?.configured ?? null
  /** 与话术共用：管理员配置的「允许使用 LLM 的用户」；非管理员且未勾选时为 false */
  const canGenerateTasks = scriptLlmConfig?.hasAccess !== false
  const currentLocale = locale || 'zh-CN'

  const pendingTasks = tasks
    .filter((t) => t.status === 'pending')
    .sort((a, b) => (a.priority === 'urgent' && b.priority !== 'urgent' ? -1 : a.priority !== 'urgent' && b.priority === 'urgent' ? 1 : 0))
  const urgentTasks = pendingTasks.filter((t) => t.priority === 'urgent')
  const normalTasks = pendingTasks.filter((t) => t.priority !== 'urgent')
  const RULE_SOURCES = ['event', 'stage', 'anomaly', 'threshold']
  const llmCount = pendingTasks.filter((t) => t.source === 'llm_intelligent' || t.source === 'llm_anomaly').length
  const ruleCount = pendingTasks.filter((t) => t.source && RULE_SOURCES.includes(t.source)).length
  const needsTranslate = currentLocale !== 'zh-CN' && pendingTasks.length > 0 && pendingTasks.some((task) => !parseTaskI18n(task.title_i18n)[currentLocale])

  const handleTranslateToCurrentLanguage = useCallback(async () => {
    if (!selectedStore || !currentLocale || currentLocale === 'zh-CN') return
    if (translatingRef.current) return
    translatingRef.current = true
    setTranslating(true)
    try {
      const res = await translateTasksForLocale(selectedStore.id, currentLocale)
      if (res.error === 'QUOTA_EXCEEDED') {
        toast.warning(res.message || TRANSLATE_QUOTA_MESSAGE)
        return
      }
      await queryClient.invalidateQueries({ queryKey: ['tasks'] })
      await refetch()
      if (res.translated > 0) {
        toast.success(t('tasks.translateDone', { count: res.translated }))
      } else {
        toast.info(t('tasks.alreadyTranslated'))
      }
    } catch (e) {
      let isTimeout = false
      let errorMessage: string | undefined
      if (e && typeof e === 'object') {
        const errorWithCode = e as { code?: unknown; message?: unknown; response?: { data?: { error?: string } } }
        if (typeof errorWithCode.code === 'string' && errorWithCode.code === 'ECONNABORTED') {
          isTimeout = true
        }
        if (typeof errorWithCode.message === 'string' && /timeout/i.test(errorWithCode.message)) {
          isTimeout = true
        }
        errorMessage = errorWithCode.response?.data?.error || (typeof errorWithCode.message === 'string' ? errorWithCode.message : undefined)
      }
      const fallbackMessage = isTimeout ? t('tasks.translateTimeout') : t('tasks.translateFailed')
      toast.error(errorMessage || fallbackMessage)
    } finally {
      translatingRef.current = false
      setTranslating(false)
    }
  }, [selectedStore, currentLocale, queryClient, refetch, toast, t])

  const lastAutoTranslateLocaleRef = useRef<string | null>(null)
  useEffect(() => {
    console.log('[翻译待办 useEffect] 检查条件', { 
      needsTranslate, 
      hasStore: !!selectedStore?.id, 
      currentLocale, 
      lastAuto: lastAutoTranslateLocaleRef.current,
      pendingTasksCount: pendingTasks.length,
      sampleTask: pendingTasks[0] ? {
        title: pendingTasks[0].title.slice(0, 20),
        title_i18n: pendingTasks[0].title_i18n,
        hasCurrentLocale: !!parseTaskI18n(pendingTasks[0].title_i18n)[currentLocale]
      } : null
    })
    if (!needsTranslate) {
      console.log('[翻译待办 useEffect] needsTranslate=false，跳过')
      return
    }
    if (!selectedStore?.id) {
      console.log('[翻译待办 useEffect] 无店铺，跳过')
      return
    }
    if (lastAutoTranslateLocaleRef.current === currentLocale) {
      console.log('[翻译待办 useEffect] 已为此 locale 自动翻译过，跳过')
      return
    }
    console.log('[翻译待办 useEffect] ✅ 触发自动翻译 for locale:', currentLocale)
    lastAutoTranslateLocaleRef.current = currentLocale
    handleTranslateToCurrentLanguage()
  }, [currentLocale, needsTranslate, selectedStore?.id, handleTranslateToCurrentLanguage, pendingTasks])

  const { data: llmDiagnostic } = useQuery({
    queryKey: ['llm-diagnostic'],
    queryFn: getLlmDiagnostic,
    staleTime: 30_000,
    enabled: llmCount === 0 && pendingTasks.length > 0,
  })

  const filteredTasks = 
    filter === 'urgent' ? urgentTasks :
    filter === 'normal' ? normalTasks :
    pendingTasks

  const handleRefresh = async () => {
    if (!selectedStore) {
      toast.warning(t('tasks.selectStoreFirst'))
      return
    }
    setRefreshing(true)
    try {
      const res = await generateTasks({
        storeId: selectedStore.id,
        useStatsFromStoreId: useStatsFromStoreId || undefined,
        locale,
      })
      await queryClient.invalidateQueries({ queryKey: ['tasks'] })
      await refetch()
      const total = res?.tasks?.length ?? 0
      const meta: GenerateTasksMetadata = res?.metadata ?? {}
      const llmCount = meta.llmIntelligentCount ?? 0
      const ruleCount = meta.ruleCount ?? 0
      const skipped = meta.skippedDuplicateCount ?? 0
      const generated = meta.generatedCount ?? 0
      const llmStatusMessage = meta?.llmStatusMessage
      const rangeUsed = meta?.statsDateRangeUsed as { dateFrom: string; dateTo: string } | undefined
      if (llmStatusMessage && meta?.llmStatus !== 'used') {
        const msg = rangeUsed
          ? `${llmStatusMessage} 本次数据区间：${rangeUsed.dateFrom}～${rangeUsed.dateTo}`
          : llmStatusMessage
        toast.info(msg)
      }
      if (total === 0) {
        if (skipped > 0 && generated > 0) {
          toast.info(`本次生成了 ${generated} 条建议，均与当前待办重复，未添加新任务。可先完成或关闭部分待办后再试。`)
        } else if (!llmStatusMessage) {
          toast.info('已刷新，当前无新任务。若刚点过「智能生成」且列表里已有待办，多半是本次建议与已有重复，可先完成或关闭部分待办后再试。')
        }
      } else {
        toast.success(`成功生成 ${total} 个任务（LLM ${llmCount} 条，规则 ${ruleCount} 条）`)
      }
    } catch (error) {
      console.error('生成任务失败:', error)
      let errorMsg: string | undefined
      if (error && typeof error === 'object' && 'response' in error) {
        const res = (error as { response?: { status?: number; data?: { error?: string; detail?: string; message?: string; code?: string } } }).response
        errorMsg = res?.data?.error || res?.data?.detail || res?.data?.message
        // 403 且为权限类：优先展示后端文案，便于非管理员看到「请联系管理员勾选开通」
        if (res?.status === 403 && (res?.data?.code === 'GENERATE_TASKS_ACCESS_DENIED' || /权限|开通|勾选/.test(errorMsg || ''))) {
          toast.warning(errorMsg || '您暂无智能生成待办权限，请联系管理员在「管理员」-「LLM 配置」中为您勾选开通。')
          return
        }
      }
      if (!errorMsg && error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
        errorMsg = (error as { message?: string }).message
      }
      toast.error(errorMsg || '生成任务失败，请检查网络连接或登录状态')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200">
      {/* 标题栏 - 始终显示（使用柔和灰蓝，避免高饱和橙红） */}
      <div 
        className="bg-gradient-to-r from-slate-600 to-slate-700 px-6 py-4 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <ListTodo className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{t('dashboard.pendingTasks')}</h2>
              <div className="flex items-center gap-3 text-sm text-white/90 mt-1 flex-wrap">
                <span>{t('dashboard.totalTasks', { count: pendingTasks.length, urgent: urgentTasks.length })}</span>
                {(llmCount > 0 || ruleCount > 0) && (
                  <span className="text-white/95">
                    {t('tasks.llmRuleSummary', { llm: llmCount, rule: ruleCount })}
                  </span>
                )}
                {llmConfigured === false && (
                  <span className="text-white/80 text-xs" title={t('tasks.llmNotConfigured')}>
                    {t('tasks.llmNotConfigured')}
                  </span>
                )}
                {urgentTasks.length > 0 && (
                  <span className="bg-rose-500 text-white px-2 py-0.5 rounded-full text-xs font-semibold">
                    {t('tasks.urgentCount', { count: urgentTasks.length })}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {stores.length > 1 && (
              <select
                value={useStatsFromStoreId}
                onChange={(e) => setUseStatsFromStoreId(e.target.value)}
                className="text-sm rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-gray-700 focus:ring-2 focus:ring-slate-400"
                title={t('tasks.dataSourceSelectTitle')}
              >
                <option value="">{t('tasks.dataSourceCurrent')}</option>
                {stores
                  .filter((s) => s.id !== selectedStore?.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {t('tasks.noDataUseStore', { name: s.name || s.id })}
                    </option>
                  ))}
              </select>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (!canGenerateTasks) {
                  toast.warning('您暂无智能生成待办权限，请联系管理员在「管理员」-「LLM 配置」中为您勾选开通。')
                  return
                }
                handleRefresh()
              }}
              disabled={refreshing}
              title={!canGenerateTasks ? '您暂无智能生成待办权限，请联系管理员开通' : undefined}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="text-sm font-medium">{refreshing ? t('tasks.generating') : t('dashboard.smartGenerate')}</span>
            </button>
            {needsTranslate && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleTranslateToCurrentLanguage()
                }}
                disabled={translating}
                className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={translating ? t('tasks.translatePleaseWait') : t('tasks.translateToCurrent')}
              >
                <RefreshCw className={`w-4 h-4 ${translating ? 'animate-spin' : ''}`} />
                <span className="text-sm font-medium whitespace-nowrap">
                  {translating ? t('tasks.translatingLong') : t('tasks.translateToCurrent')}
                </span>
              </button>
            )}
            {isExpanded ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
          </div>
        </div>
      </div>

      {/* 内容区 - 可展开/收起 */}
      {isExpanded && (
        <div className="p-6">
          {!canGenerateTasks && (
            <div className="mb-4 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <p className="font-medium">您暂无智能生成待办权限</p>
              <p className="mt-1">请联系管理员在「管理员」-「LLM 配置」中为您勾选开通（与话术生成共用同一权限配置）。</p>
            </div>
          )}
          {/* 筛选标签 */}
          <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-200">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-slate-100 text-slate-700 border-2 border-slate-300'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t('dashboard.allTab', { count: pendingTasks.length })}
            </button>
            <button
              onClick={() => setFilter('urgent')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'urgent'
                  ? 'bg-rose-100 text-rose-700 border-2 border-rose-300'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t('dashboard.urgentTab', { count: urgentTasks.length })}
            </button>
            <button
              onClick={() => setFilter('normal')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'normal'
                  ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t('dashboard.normalTab', { count: normalTasks.length })}
            </button>
          </div>

          {/* 任务列表 */}
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {isLoading ? (
              <div className="text-center py-12 text-gray-500">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-slate-400" />
                <p>{t('common.loading')}</p>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 font-medium mb-2">
                  {filter === 'urgent' ? t('tasks.noUrgentTasks') : filter === 'normal' ? t('tasks.noNormalTasks') : t('tasks.noTasksYet')}
                </p>
                <p className="text-xs text-gray-400">
                  {t('tasks.taskListDescription')}
                </p>
              </div>
            ) : (
              filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className={`flex items-start gap-4 p-4 rounded-xl border-2 transition-all hover:shadow-md ${
                    task.priority === 'urgent'
                      ? 'bg-rose-50 border-rose-200 hover:border-rose-300'
                      : 'bg-white border-gray-200 hover:border-slate-300'
                  }`}
                >
                  {task.priority === 'urgent' ? (
                    <div className="p-2 bg-rose-100 rounded-lg shrink-0">
                      <AlertCircle className="w-5 h-5 text-rose-600" />
                    </div>
                  ) : (
                    <div className="p-2 bg-gray-100 rounded-lg shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-gray-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <p className={`text-base font-semibold ${
                            task.priority === 'urgent' ? 'text-rose-900' : 'text-gray-900'
                          }`}>
                            {getTaskDisplayTitle(task, currentLocale)}
                          </p>
                          {task.storeName != null && String(task.storeName) && (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full shrink-0">
                              {String(task.storeName)}
                            </span>
                          )}
                          {task.createdByName != null && String(task.createdByName) && (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-full shrink-0" title="创建该待办的账号">
                              👤 {String(task.createdByName)}
                            </span>
                          )}
                          {task.assignedRole != null && String(task.assignedRole) && (
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full shrink-0 ${
                              task.assignedRole === 'anchor' ? 'bg-purple-100 text-purple-700' :
                              task.assignedRole === 'operator' ? 'bg-green-100 text-green-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                              {task.assignedRole === 'anchor' ? `👤 ${t('tasks.assignedRoleAnchor')}` :
                               task.assignedRole === 'operator' ? `📊 ${t('tasks.assignedRoleOperator')}` : `🤝 ${t('tasks.assignedRoleBoth')}`}
                            </span>
                          )}
                          {'aiFeature' in task && task.aiFeature && (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-xs font-medium rounded-full shrink-0">
                              {task.aiFeature === 'script' ? `🎤 ${t('tasks.aiFeatureScript')}` :
                               task.aiFeature === 'product_recommend' ? `📦 ${t('tasks.aiFeatureProductRecommend')}` :
                               task.aiFeature === 'time_recommend' ? `⏰ ${t('tasks.aiFeatureTimeRecommend')}` :
                               task.aiFeature === 'engagement' ? `💬 ${t('tasks.aiFeatureEngagement')}` :
                               task.aiFeature === 'content' ? `📝 ${t('tasks.aiFeatureContent')}` :
                               task.aiFeature === 'stats' ? `📈 ${t('tasks.aiFeatureStats')}` :
                               task.aiFeature === 'report' ? `📋 ${t('tasks.aiFeatureReport')}` :
                               task.aiFeature === 'pricing' ? `💰 ${t('tasks.aiFeaturePricing')}` :
                               task.aiFeature === 'schedule' ? `📅 ${t('tasks.aiFeatureSchedule')}` :
                               task.aiFeature === 'marketing' ? `📣 ${t('tasks.aiFeatureMarketing')}` :
                               `🛠️ ${t('tasks.aiFeatureTools')}`}
                            </span>
                          )}
                        </div>
                        {getTaskDisplayDescription(task, currentLocale) && (
                          <p className="text-sm text-gray-600 leading-relaxed">
                            {getTaskDisplayDescription(task, currentLocale)}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            await updateTask.mutateAsync({ id: task.id, status: 'completed' })
                            await queryClient.invalidateQueries({ queryKey: ['tasks'] })
                            await refetch()
                            toast.success(t('tasks.taskCompleted'))
                          } catch (e) {
                            console.error('标记完成失败', e)
                            toast.error(t('tasks.operationFailed'))
                          }
                        }}
                        disabled={updateTask.isPending}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                          task.priority === 'urgent'
                            ? 'bg-rose-600 text-white hover:bg-rose-700'
                            : 'bg-slate-600 text-white hover:bg-slate-700'
                        } disabled:opacity-50`}
                      >
                        ✓ {t('tasks.complete')}
                      </button>
                    </div>
                    {getQuickJumpTools(task).length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-gray-500 shrink-0">{t('tasks.quickJump')}</span>
                        {getQuickJumpTools(task).map((toolId) => (
                          <Link
                            key={toolId}
                            to={`/tools/${toolId}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors"
                          >
                            {TOOL_I18N_KEYS[toolId] ? t(TOOL_I18N_KEYS[toolId]) : toolId}
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 底部提示：LLM 0 条时给出明确指引与后端诊断 */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            {llmCount === 0 && pendingTasks.length > 0 ? (
              <div className="text-xs rounded-lg p-3 space-y-2">
                {llmDiagnostic ? (
                  <>
                    <p className={llmDiagnostic.configured ? 'text-gray-700' : 'text-amber-700 bg-amber-50 rounded p-2'}>
                      {llmDiagnostic.hint}
                    </p>
                    <p className="text-gray-500 text-center">
                      前往 <Link to="/llm" className="font-medium text-orange-600 underline">LLM 调用方式</Link> 查看配置与调用方式；点击「智能生成」后请留意本次返回的提示。
                    </p>
                  </>
                ) : (
                  <p className="text-amber-700 bg-amber-50 rounded-lg p-3 text-center">
                    {t('tasks.ruleLlmHint')}
                    <Link to="/llm" className="mx-1 font-medium text-amber-800 underline">{t('sidebar.llmModes')}</Link>
                    {t('tasks.ruleLlmHintAfter')}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-500 text-center">
                💡 {t('tasks.footerTip')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
