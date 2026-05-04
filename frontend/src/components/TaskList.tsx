import { useTranslation } from 'react-i18next'
import { useTasks, useUpdateTask, translateTasksForLocale, TRANSLATE_QUOTA_MESSAGE } from '../services/tasks'
import { generateTasks, getScriptLLMConfig, getLlmDiagnostic, type GenerateTasksMetadata } from '../services/ai'
import { useStore } from '../contexts/StoreContext'
import { useLanguage } from '../contexts/LanguageContext'
import { useGenerateTasks } from '../contexts/GenerateTasksContext'
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  ListTodo,
  ExternalLink,
  Target,
  ListOrdered,
  BarChart2,
  Database,
  Sliders,
  ClipboardCheck,
  Briefcase,
} from 'lucide-react'
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useToast } from '../contexts/ToastContext'
import { Link } from 'react-router-dom'
import type { Task } from '../services/tasks'
import TaskWeekPickerPopover from './TaskWeekPickerPopover'
import { formatLocalYMD, getWeekMondayFromDate } from '../utils/calendarLocal'

/** aiFeature → 执行工具 ID 列表（用于快速跳转，含未接入功能的预留入口） */
const AI_FEATURE_TO_TOOLS: Record<string, string[]> = {
  event: ['speech', 'recommendations'],
  script: ['speech', 'screen-recording'],
  product_recommend: ['recommendations', 'stats', 'report', 'market-analysis'],
  time_recommend: ['stats'],
  engagement: ['speech'],
  pricing: ['recommendations', 'market-analysis'],
  schedule: ['stats', 'report'],
  marketing: ['market-analysis', 'speech'],
  content: ['speech', 'recommendations'],
  report: ['report'],
  crm: ['report', 'market-analysis'],
  brand: ['market-analysis', 'report'],
  supply_chain: ['market-analysis', 'report'],
  positioning: ['market-analysis', 'report'],
  comparison: ['compare', 'stats', 'report'],
  image_analysis: ['image-analysis', 'recommendations'],
  scene_scoring: ['screen-recording'],
}
/** 执行工具 ID → i18n key（展示名称由 useTranslation 提供，含未接入功能预留） */
const TOOL_I18N_KEYS: Record<string, string> = {
  speech: 'tools.speech',
  report: 'tools.report',
  'market-analysis': 'tools.marketAnalysis',
  recommendations: 'tools.recommendations',
  stats: 'tools.stats',
  compare: 'tools.compare',
  assistant: 'tools.assistant',
  'screen-recording': 'tools.screenRecording',
  'image-analysis': 'tools.imageAnalysis',
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
/** A 方案：与 Coze 内测一致，保留原始【工具】段落 */
function stripToolsSection(desc: string): string {
  return desc
}

function getTaskDisplayDescription(task: Task, locale: string): string | undefined {
  const key = locale || 'zh-CN'
  const i18n = parseTaskI18n(task.description_i18n)
  const desc = i18n[key] ?? task.description
  const raw = desc || undefined
  return raw ? stripToolsSection(raw) : undefined
}

/** Coze 五级结构 + 旧版【步骤】【预期】兼容 */
type TaskDescriptionSections = {
  target?: string
  dataSource?: string
  steps?: string
  params?: string
  validation?: string
  resources?: string
  expected?: string
  rest?: string
}

const DESCRIPTION_STRIP_RES: RegExp[] = [
  /【目标】[\s\S]*?(?=【|$)/g,
  /【数据来源】[\s\S]*?(?=【|$)/g,
  /【(?:执行步骤|操作步骤|步骤)】[\s\S]*?(?=【|$)/g,
  /【参数配置】[\s\S]*?(?=【|$)/g,
  /【验证方案】[\s\S]*?(?=【|$)/g,
  /【资源需求】[\s\S]*?(?=【|$)/g,
  /【(?:预期效果|预期)】[\s\S]*?(?=【|$)/g,
]

/** 解析描述中的【目标】【数据来源】【执行步骤】等段落，与 Coze 出参对齐 */
function parseDescriptionSections(desc: string): TaskDescriptionSections {
  if (!desc || typeof desc !== 'string') return {}
  const s = desc.trim()
  if (!s) return {}

  const result: TaskDescriptionSections = {}

  const mTarget = s.match(/【目标】([\s\S]*?)(?=【|$)/)
  if (mTarget) result.target = mTarget[1].trim()

  const mData = s.match(/【数据来源】([\s\S]*?)(?=【|$)/)
  if (mData) result.dataSource = mData[1].trim()

  const mSteps = s.match(/【(?:执行步骤|操作步骤|步骤)】([\s\S]*?)(?=【|$)/)
  if (mSteps) result.steps = mSteps[1].trim()

  const mParams = s.match(/【参数配置】([\s\S]*?)(?=【|$)/)
  if (mParams) result.params = mParams[1].trim()

  const mVal = s.match(/【验证方案】([\s\S]*?)(?=【|$)/)
  if (mVal) result.validation = mVal[1].trim()

  const mRes = s.match(/【资源需求】([\s\S]*?)(?=【|$)/)
  if (mRes) result.resources = mRes[1].trim()

  const mExp = s.match(/【(?:预期效果|预期)】([\s\S]*?)(?=【|$)/)
  if (mExp) result.expected = mExp[1].trim()

  const hasStructured = !!(
    result.target ||
    result.dataSource ||
    result.steps ||
    result.params ||
    result.validation ||
    result.resources ||
    result.expected
  )
  if (!hasStructured) {
    result.rest = s
  } else {
    let rest = s
    for (const re of DESCRIPTION_STRIP_RES) {
      rest = rest.replace(re, '')
    }
    rest = rest.replace(/\n{3,}/g, '\n\n').trim()
    if (rest) result.rest = rest
  }
  return result
}

function descriptionSectionsHaveContent(s: TaskDescriptionSections | null): boolean {
  if (!s) return false
  return !!(
    s.target ||
    s.dataSource ||
    s.steps ||
    s.params ||
    s.validation ||
    s.resources ||
    s.expected ||
    s.rest
  )
}

/** 待办正文：分块展示（与 parseDescriptionSections 字段一致） */
function TaskDescriptionSectionsView({ sections, t }: { sections: TaskDescriptionSections; t: (key: string) => string }) {
  if (!descriptionSectionsHaveContent(sections)) return null
  return (
    <div className="mt-2 text-sm">
      {sections.target && (
        <DescriptionSection icon={Target} label={t('tasks.sectionTarget')} content={sections.target} iconClassName="text-primary-600" />
      )}
      {sections.dataSource && (
        <DescriptionSection icon={Database} label={t('tasks.sectionDataSource')} content={sections.dataSource} iconClassName="text-cyan-600" />
      )}
      {sections.steps && (
        <DescriptionSection icon={ListOrdered} label={t('tasks.sectionSteps')} content={sections.steps} iconClassName="text-emerald-600" />
      )}
      {sections.params && (
        <DescriptionSection icon={Sliders} label={t('tasks.sectionParams')} content={sections.params} iconClassName="text-violet-600" />
      )}
      {sections.validation && (
        <DescriptionSection
          icon={ClipboardCheck}
          label={t('tasks.sectionValidation')}
          content={sections.validation}
          iconClassName="text-amber-600"
        />
      )}
      {sections.resources && (
        <DescriptionSection icon={Briefcase} label={t('tasks.sectionResources')} content={sections.resources} iconClassName="text-slate-600" />
      )}
      {sections.expected && (
        <DescriptionSection icon={BarChart2} label={t('tasks.sectionExpected')} content={sections.expected} iconClassName="text-orange-600" />
      )}
      {sections.rest && (
        <p className="text-slate-600 leading-relaxed whitespace-pre-line mt-3 pt-2 border-t border-slate-100">{sections.rest}</p>
      )}
    </div>
  )
}

/** 渲染单个带图标的段落 */
function DescriptionSection({
  icon: Icon,
  label,
  content,
  iconClassName,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  content: string
  iconClassName?: string
}) {
  if (!content) return null
  return (
    <div className="flex gap-3 mt-3 first:mt-0">
      <div className={`flex-shrink-0 mt-0.5 ${iconClassName || 'text-slate-500'}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-600 mb-1">{label}</p>
        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{content}</p>
      </div>
    </div>
  )
}

/** Coze 出参：预计周期、类型、责任人（与后端 tasks 表扩展字段对应） */
function TaskCozeMetaBadges({ task, t }: { task: Task; t: (key: string, options?: { defaultValue?: string }) => string }) {
  const est = task.estimatedDays != null && String(task.estimatedDays).trim()
  const cat = task.category != null && String(task.category).trim()
  const resp = task.responsible != null && String(task.responsible).trim()
  if (!est && !cat && !resp) return null
  const chip =
    'px-2 py-0.5 text-xs font-medium rounded-full shrink-0 border border-slate-200 bg-white text-slate-700'
  return (
    <>
      {est ? (
        <span className={chip} title={t('tasks.metaEstimatedDays')}>
          ⏱ {String(task.estimatedDays).trim()}
        </span>
      ) : null}
      {cat ? (
        <span
          className={`${chip} bg-indigo-50 text-indigo-800 border-indigo-100`}
          title={t('tasks.metaCategory')}
        >
          {t(`tasks.cozeCategory.${String(task.category).trim().toLowerCase()}`, {
            defaultValue: String(task.category).trim(),
          })}
        </span>
      ) : null}
      {resp ? (
        <span className={chip} title={t('tasks.metaResponsible')}>
          👥 {String(task.responsible).trim()}
        </span>
      ) : null}
    </>
  )
}

function getQuickJumpTools(task: Task): string[] {
  const feat = task.aiFeature
  if (feat && AI_FEATURE_TO_TOOLS[feat]) {
    return AI_FEATURE_TO_TOOLS[feat]
  }
  if (/节日|倒计时|备货|大促|情人节|圣诞|宋干|水灯/.test(task.title || '')) return ['speech', 'recommendations']
  if (/对比|同比|环比|店铺对比/.test(task.title || '')) return ['compare', 'stats', 'report']
  if (/定位|品牌|供应链|粉丝运营|客户/.test(task.title || '')) return ['market-analysis', 'report']
  if (/GMV|波动|选品|复盘|竞争力|竞品/.test(task.title || '')) return ['stats', 'report', 'recommendations', 'market-analysis']
  if (/转化率|话术|考核|评估|打分/.test(task.title || '')) return ['speech', 'screen-recording']
  if (/主图|图片分析|商品图|商品卡主图|直播场景/.test(task.title || '')) return ['image-analysis', 'recommendations']
  if (/直播场景|场景打分|场景布置|录屏|视频分析/.test(task.title || '')) return ['screen-recording']
  return []
}

type TaskFilter = 'all' | 'urgent' | 'normal'

export default function TaskList() {
  const { t } = useTranslation()
  const { locale } = useLanguage()
  const toast = useToast()
  const { selectedStore } = useStore()
  const [rangeHintByKey, setRangeHintByKey] = useState<Record<string, { dateFrom: string; dateTo: string; reason?: string }>>({})
  const getWeekStart = (d: Date) => formatLocalYMD(getWeekMondayFromDate(d))
  const formatRange = (weekStartStr: string) => {
    const start = new Date(`${weekStartStr}T00:00:00.000Z`)
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 6)
    const mmdd = (x: Date) => `${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`
    const y = (x: Date) => x.getUTCFullYear()
    if (y(start) !== y(end)) {
      return `${y(start)}-${mmdd(start)}～${y(end)}-${mmdd(end)}`
    }
    return `${mmdd(start)}～${mmdd(end)}`
  }
  const [tasksTimeScope, setTasksTimeScope] = useState<'week' | 'all'>('week')
  const [weekStart, setWeekStart] = useState<string>(() => getWeekStart(new Date()))
  const thisWeekMonday = getWeekStart(new Date())

  const { data: tasks = [], isLoading, refetch } = useTasks(
    selectedStore?.id,
    tasksTimeScope === 'week' ? { weekStart } : {}
  )
  const { data: scriptLlmConfig } = useQuery({
    queryKey: ['script-llm-config'],
    queryFn: getScriptLLMConfig,
    staleTime: 60_000,
  })
  const queryClient = useQueryClient()
  const updateTask = useUpdateTask()
  const { generatingStoreId, setGenerating } = useGenerateTasks()
  /** 当前店铺正在生成：使用全局状态，切换页面后返回仍能正确显示「生成中」 */
  const refreshing = generatingStoreId === selectedStore?.id
  const [translating, setTranslating] = useState(false)
  const translatingRef = useRef(false)
  const [filter, setFilter] = useState<TaskFilter>('all')
  const llmConfigured = scriptLlmConfig?.configured ?? null
  /** 与话术共用：须在允许用户列表且「智能生成待办」功能已开放；后端返回 hasAccessForTasks 时优先使用 */
  const canGenerateTasks = scriptLlmConfig?.hasAccessForTasks !== false && scriptLlmConfig?.hasAccess !== false
  const currentLocale = locale || 'zh-CN'

  const pendingTasks = tasks
    .filter((t) => t.status === 'pending')
    .sort((a, b) => (a.priority === 'urgent' && b.priority !== 'urgent' ? -1 : a.priority !== 'urgent' && b.priority === 'urgent' ? 1 : 0))
  const completedTasks = tasks
    .filter((t) => t.status === 'completed')
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')) // 最近完成的在前（沉底时视觉上靠上）
  const urgentTasks = pendingTasks.filter((t) => t.priority === 'urgent')
  const normalTasks = pendingTasks.filter((t) => t.priority !== 'urgent')
  const RULE_SOURCES = ['event', 'stage', 'anomaly', 'threshold']
  const llmCount = pendingTasks.filter((t) => t.source === 'llm_intelligent' || t.source === 'llm_anomaly').length
  const ruleCount = pendingTasks.filter((t) => t.source && RULE_SOURCES.includes(t.source)).length
  const needsTranslate =
    currentLocale !== 'zh-CN' &&
    tasks.length > 0 &&
    tasks.some((task) => {
      const titleOk = !!parseTaskI18n(task.title_i18n)[currentLocale]
      const descOk = !!parseTaskI18n(task.description_i18n)[currentLocale]
      return !(titleOk && descOk)
    })

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

  const lastAutoTranslateKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!needsTranslate) return
    if (!selectedStore?.id) return
    const key = `${selectedStore.id}:${currentLocale}`
    if (lastAutoTranslateKeyRef.current === key) return
    lastAutoTranslateKeyRef.current = key
    handleTranslateToCurrentLanguage()
  }, [currentLocale, needsTranslate, selectedStore?.id, handleTranslateToCurrentLanguage])

  const { data: llmDiagnostic } = useQuery({
    queryKey: ['llm-diagnostic'],
    queryFn: getLlmDiagnostic,
    staleTime: 30_000,
    enabled: llmCount === 0 && pendingTasks.length > 0,
  })

  /** 待办列表：紧急/普通仅展示未完成；全部 = 未完成 + 已完成（沉底） */
  const filteredTasks = 
    filter === 'urgent' ? urgentTasks :
    filter === 'normal' ? normalTasks :
    [...pendingTasks, ...completedTasks]

  /** 缓存描述解析结果，避免每次渲染对所有任务重跑正则（任务列表或语言变化才重算） */
  const parsedSectionsMap = useMemo(() => {
    const map: Record<string, ReturnType<typeof parseDescriptionSections> | null> = {}
    for (const task of [...pendingTasks, ...completedTasks]) {
      const desc = getTaskDisplayDescription(task, currentLocale)
      map[task.id] = desc ? parseDescriptionSections(desc) : null
    }
    return map
  }, [pendingTasks, completedTasks, currentLocale])

  const handleRefresh = async () => {
    if (!selectedStore) {
      toast.warning(t('tasks.selectStoreFirst'))
      return
    }
    setGenerating(selectedStore.id)
    try {
      const reqWeekStart = tasksTimeScope === 'week' ? weekStart : thisWeekMonday
      // 生成阶段统一用中文，生成后再用 Google Translate 翻译到当前界面语言（对齐旧行为）
      const res = await generateTasks({
        storeId: selectedStore.id,
        locale: 'zh-CN',
        weekStart: reqWeekStart,
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
      const rangeReason = typeof meta?.statsDateRangeReason === 'string' ? meta.statsDateRangeReason : undefined
      if (rangeUsed?.dateFrom && rangeUsed?.dateTo) {
        const k = `${selectedStore.id}:${reqWeekStart}`
        setRangeHintByKey((prev) => ({ ...prev, [k]: { dateFrom: rangeUsed.dateFrom, dateTo: rangeUsed.dateTo, reason: rangeReason } }))
      }
      if (llmStatusMessage && meta?.llmStatus !== 'used') {
        const msg = rangeUsed
          ? `${llmStatusMessage}${rangeReason ? `（${rangeReason}）` : ''} 本次数据区间：${rangeUsed.dateFrom}～${rangeUsed.dateTo}`
          : llmStatusMessage
        toast.info(msg)
      }
      if (total === 0) {
        if (skipped > 0 && generated > 0) {
          toast.info(t('tasks.generateDuplicateAll', { generated }))
        } else if (!llmStatusMessage) {
          toast.info(t('tasks.generateNoNewHint'))
        }
      } else {
        toast.success(t('tasks.generateSuccessBreakdown', { total, llm: llmCount, rule: ruleCount }))
      }
      // 生成完成后：若界面不是中文，自动触发翻译（旧逻辑）
      if (currentLocale !== 'zh-CN') {
        handleTranslateToCurrentLanguage()
      }
    } catch (error) {
      console.error('生成任务失败:', error)
      let errorMsg: string | undefined
      if (error && typeof error === 'object' && 'response' in error) {
        const res = (error as { response?: { status?: number; data?: { error?: string; detail?: string; message?: string; code?: string } } }).response
        errorMsg = res?.data?.error || res?.data?.detail || res?.data?.message
        // 403：优先展示后端返回的文案（用户权限、功能未开放等），便于用户按提示操作
        if (res?.status === 403) {
          const fallback =
            res?.data?.code === 'GENERATE_TASKS_FEATURE_DISABLED'
              ? t('tasks.generate403FeatureDisabled')
              : t('tasks.generate403NoUserPermission')
          toast.warning(errorMsg || fallback)
          return
        }
      }
      if (!errorMsg && error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
        errorMsg = (error as { message?: string }).message
      }
      toast.error(errorMsg || t('tasks.generateFailedGeneric'))
    } finally {
      setGenerating(null)
    }
  }

  return (
    <div className="w-full bg-white rounded-xl shadow-lg border border-slate-200">
      {/* 标题栏 - 始终显示（使用柔和灰蓝，避免高饱和橙红） */}
      <div 
        className="bg-gradient-to-r from-slate-600 to-slate-700 px-6 py-4"
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
                {selectedStore?.id && tasksTimeScope === 'week' && (() => {
                  const k = `${selectedStore.id}:${weekStart}`
                  const r = rangeHintByKey[k]
                  if (!r) return null
                  return (
                    <span className="text-white/85 text-xs">
                      {t('tasks.dataRangeUsedHint', { defaultValue: '数据参考周期' })}：{r.dateFrom}～{r.dateTo}
                      {r.reason ? <span className="ml-2 text-white/75">（{r.reason}）</span> : null}
                    </span>
                  )
                })()}
                {completedTasks.length > 0 && (
                  <span className="text-white/80">{t('tasks.alreadyCompleted')} {completedTasks.length}</span>
                )}
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
              {translating && (
                <div className="mt-2 px-3 py-2 rounded-lg bg-amber-50/95 border border-amber-200 text-amber-800 text-xs flex items-center gap-2 w-fit">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('tasks.translatingLong')}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {tasksTimeScope === 'week' ? (
              <div className="flex items-center gap-2 flex-wrap">
                <TaskWeekPickerPopover
                  weekStart={weekStart}
                  maxWeekStart={thisWeekMonday}
                  locale={currentLocale}
                  summary={`${formatRange(weekStart)}${
                    weekStart === thisWeekMonday ? ` · ${t('dashboard.thisWeek')}` : ''
                  }`}
                  onWeekStartChange={(ws) => {
                    setTasksTimeScope('week')
                    setWeekStart(ws)
                  }}
                  onToday={() => setWeekStart(thisWeekMonday)}
                  onClear={() => setTasksTimeScope('all')}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setTasksTimeScope('all')
                  }}
                  className="text-xs font-medium px-2 py-1.5 rounded-lg border border-white/35 bg-white/10 hover:bg-white/20 text-white/95 whitespace-nowrap"
                >
                  {t('tasks.viewAllTime')}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-white/90">{t('tasks.viewingAllTime')}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setTasksTimeScope('week')
                    setWeekStart(getWeekStart(new Date()))
                  }}
                  className="text-xs font-medium px-2 py-1.5 rounded-lg border border-white/35 bg-white/15 hover:bg-white/25 text-white"
                >
                  {t('tasks.viewByWeek')}
                </button>
              </div>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (!canGenerateTasks) {
                  toast.warning(t('tasks.smartGenerateNoPermissionLlmConfig'))
                  return
                }
                handleRefresh()
              }}
              disabled={refreshing}
              title={
                !canGenerateTasks
                  ? t('tasks.smartGenerateAskAdminShort')
                  : refreshing
                    ? t('tasks.generatingTitle')
                    : undefined
              }
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
                  {translating ? t('tasks.translating') : t('tasks.translateToCurrent')}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 内容区 - 始终展开 */}
      <div className="p-6">
          {!canGenerateTasks && (
            <div className="mb-4 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <p className="font-medium">{t('tasks.smartGenerateNoAccessTitle')}</p>
              <p className="mt-1">{t('tasks.smartGenerateNoAccessSubtitle')}</p>
            </div>
          )}
          {/* 筛选标签 */}
          <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-200">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-slate-100 text-slate-700 border-2 border-slate-300'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t('dashboard.allTab', { count: pendingTasks.length })}
            </button>
            <button
              onClick={() => setFilter('urgent')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'urgent'
                  ? 'bg-rose-100 text-rose-700 border-2 border-rose-300'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t('dashboard.urgentTab', { count: urgentTasks.length })}
            </button>
            <button
              onClick={() => setFilter('normal')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'normal'
                  ? 'bg-primary-100 text-primary-700 border-2 border-primary-300'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t('dashboard.normalTab', { count: normalTasks.length })}
            </button>
          </div>

          {/* 任务列表：卡片按内容自适应高度，拓宽显示；全部时已完成沉底 */}
          <div className="space-y-4 max-h-[720px] overflow-y-auto">
            {isLoading ? (
              <div className="text-center py-12 text-slate-500">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-slate-400" />
                <p>{t('common.loading')}</p>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600 font-medium mb-2">
                  {filter === 'urgent' ? t('tasks.noUrgentTasks') : filter === 'normal' ? t('tasks.noNormalTasks') : t('tasks.noTasksYet')}
                </p>
                <p className="text-xs text-slate-400">
                  {t('tasks.taskListDescription')}
                </p>
              </div>
            ) : (
              <>
              {(filter === 'all' ? pendingTasks : filteredTasks).map((task) => {
                const sections = parsedSectionsMap[task.id] ?? null
                const isCompleted = task.status === 'completed'
                return (
                <div
                  key={task.id}
                  className={`flex items-start gap-4 p-5 rounded-xl border-2 transition-all hover:shadow-md w-full min-w-0 ${
                    isCompleted
                      ? 'bg-slate-50 border-slate-200 opacity-90'
                      : task.priority === 'urgent'
                        ? 'bg-rose-50 border-rose-200 hover:border-rose-300'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {isCompleted ? (
                    <div className="p-2 bg-emerald-100 rounded-lg shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    </div>
                  ) : task.priority === 'urgent' ? (
                    <div className="p-2 bg-rose-100 rounded-lg shrink-0">
                      <AlertCircle className="w-5 h-5 text-rose-600" />
                    </div>
                  ) : (
                    <div className="p-2 bg-slate-100 rounded-lg shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-slate-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <p className={`text-base font-semibold ${isCompleted ? 'line-through text-slate-500' : task.priority === 'urgent' ? 'text-rose-900' : 'text-slate-900'}`}>
                            {getTaskDisplayTitle(task, currentLocale)}
                          </p>
                          {isCompleted && (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full shrink-0">
                              ✓ {t('tasks.alreadyCompleted')}
                            </span>
                          )}
                          {task.storeName != null && String(task.storeName) && (
                            <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs font-medium rounded-full shrink-0">
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
                               task.aiFeature === 'image_analysis' ? `🖼️ ${t('tasks.aiFeatureImageAnalysis')}` :
                               task.aiFeature === 'scene_scoring' ? `📺 ${t('tasks.aiFeatureSceneScoring')}` :
                               task.aiFeature === 'event' ? `🎉 ${t('tasks.aiFeatureEvent')}` :
                               task.aiFeature === 'comparison' ? `📊 ${t('tasks.aiFeatureComparison')}` :
                               task.aiFeature === 'positioning' ? `🎯 ${t('tasks.aiFeaturePositioning')}` :
                               task.aiFeature === 'brand' ? `🏷️ ${t('tasks.aiFeatureBrand')}` :
                               task.aiFeature === 'supply_chain' ? `📦 ${t('tasks.aiFeatureSupplyChain')}` :
                               task.aiFeature === 'crm' ? `👥 ${t('tasks.aiFeatureCrm')}` :
                               `🛠️ ${t('tasks.aiFeatureTools')}`}
                            </span>
                          )}
                          <TaskCozeMetaBadges task={task} t={t} />
                        </div>
                        {sections && descriptionSectionsHaveContent(sections) && (
                          <TaskDescriptionSectionsView sections={sections} t={t} />
                        )}
                      </div>
                      {isCompleted ? (
                        <span className="px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 shrink-0">
                          ✓ {t('tasks.alreadyCompleted')}
                        </span>
                      ) : (
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
                      )}
                    </div>
                    {getQuickJumpTools(task).length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-slate-500 shrink-0">{t('tasks.quickJump')}</span>
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
              )
              })}
              {filter === 'all' && completedTasks.length > 0 && (
                <>
                  <div className="flex items-center gap-3 pt-2 pb-1">
                    <span className="text-sm font-medium text-slate-500 shrink-0">
                      {t('tasks.alreadyCompleted')} ({completedTasks.length})
                    </span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                  {completedTasks.map((task) => {
                    const sections = parsedSectionsMap[task.id] ?? null
                    return (
                      <div
                        key={task.id}
                        className="flex items-start gap-4 p-5 rounded-xl border-2 bg-slate-50 border-slate-200 opacity-90 w-full min-w-0"
                      >
                        <div className="p-2 bg-emerald-100 rounded-lg shrink-0">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <p className="text-base font-semibold line-through text-slate-500">
                                  {getTaskDisplayTitle(task, currentLocale)}
                                </p>
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full shrink-0">
                                  ✓ {t('tasks.alreadyCompleted')}
                                </span>
                                {task.storeName != null && String(task.storeName) && (
                                  <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs font-medium rounded-full shrink-0">
                                    {String(task.storeName)}
                                  </span>
                                )}
                                {task.createdByName != null && String(task.createdByName) && (
                                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-full shrink-0" title="创建该待办的账号">
                                    👤 {String(task.createdByName)}
                                  </span>
                                )}
                                <TaskCozeMetaBadges task={task} t={t} />
                              </div>
                              {sections && descriptionSectionsHaveContent(sections) && (
                                <TaskDescriptionSectionsView sections={sections} t={t} />
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await updateTask.mutateAsync({ id: task.id, status: 'pending' })
                                  await queryClient.invalidateQueries({ queryKey: ['tasks'] })
                                  await refetch()
                                  toast.success(t('tasks.taskRestored'))
                                } catch (e) {
                                  console.error('恢复待办失败', e)
                                  toast.error(t('tasks.operationFailed'))
                                }
                              }}
                              disabled={updateTask.isPending}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors shrink-0 disabled:opacity-50"
                              title={t('tasks.restore')}
                            >
                              ↩ {t('tasks.restore')}
                            </button>
                          </div>
                          {getQuickJumpTools(task).length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                              <span className="text-xs text-slate-500 shrink-0">{t('tasks.quickJump')}</span>
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
                    )
                  })}
                </>
              )}
              </>
            )}
          </div>

          {/* 底部提示：LLM 0 条时给出明确指引与后端诊断 */}
          <div className="mt-6 pt-4 border-t border-slate-200">
            {llmCount === 0 && pendingTasks.length > 0 ? (
              <div className="text-xs rounded-lg p-3 space-y-2">
                {llmDiagnostic ? (
                  <>
                    <p className={llmDiagnostic.configured ? 'text-slate-700' : 'text-amber-700 bg-amber-50 rounded p-2'}>
                      {llmDiagnostic.hint}
                    </p>
                    <p className="text-slate-500 text-center">
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
              <p className="text-xs text-slate-500 text-center">
                💡 {t('tasks.footerTip')}
              </p>
            )}
          </div>
      </div>
    </div>
  )
}
