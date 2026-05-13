/**
 * ToolResultDisplay — 各工具类型的结果渲染容器
 * 根据 result.type 分发到对应的展示逻辑
 * 原 AIFeatures.tsx L1644-2212
 */

import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  X,
  Copy,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  Store,
} from 'lucide-react'
import { getCurrentUserRole } from '../../services/auth'
import { copyToClipboard } from '../../utils/clipboard'
import { translateLongTextForDisplay, generateTasks, type GenerateTasksMetadata } from '../../services/ai'
import { useUpdateTask, useBatchCompleteTasks, useCompleteAllTasks, type Task } from '../../services/tasks'
import { useToast } from '../../contexts/ToastContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { useQueryClient } from '@tanstack/react-query'
import { scriptErrorLooksLikeLlmConfigIssue } from '../../utils/scriptDraft'
import type { ToolResultData } from './types'

interface ToolResultDisplayProps {
  result: ToolResultData
  propToolId: string
  selectedStore: { id: string; name: string } | null
  streamingContent: string
  onClose: () => void
  setResultForTool: (toolId: string, value: ToolResultData | null) => void
  refetchTasks: () => Promise<{ data: Task[] | undefined }>
}

export default function ToolResultDisplay({
  result,
  propToolId,
  selectedStore,
  streamingContent,
  onClose,
  setResultForTool,
  refetchTasks,
}: ToolResultDisplayProps) {
  const { t } = useTranslation()
  const { locale } = useLanguage()
  const toast = useToast()
  const queryClient = useQueryClient()
  const updateTask = useUpdateTask()
  useBatchCompleteTasks()
  const completeAllTasks = useCompleteAllTasks()

  const [resultExpanded, setResultExpanded] = useState(false)
  const [resultFullScreen, setResultFullScreen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [completingAll, setCompletingAll] = useState(false)

  // Script-specific state
  const scriptData = result.type === 'script' ? (result.data as Record<string, unknown>) : null
  const scriptContent = scriptData && typeof scriptData.content === 'string' ? scriptData.content : ''

  // Translation state
  const [scriptTranslatedContent, setScriptTranslatedContent] = useState<string | null>(null)
  const [scriptTranslationLoading, setScriptTranslationLoading] = useState(false)
  const [scriptTranslationCacheKey, setScriptTranslationCacheKey] = useState<string>('')
  const scriptTranslationInFlight = useRef<string | null>(null)

  const scriptNeedsTranslation = scriptContent && locale !== 'zh-CN' && /[\u4e00-\u9fff]/.test(scriptContent) && !scriptData?.streaming
  const scriptTranslationKey = scriptNeedsTranslation ? `${scriptData?.id ?? `${scriptContent.length}-${scriptContent.slice(0, 80)}`}-${locale}` : ''

  // Reset expand state on propToolId change
  useEffect(() => {
    setResultExpanded(false)
    setResultFullScreen(false)
  }, [propToolId])

  // Auto-translation effect
  useEffect(() => {
    if (!scriptNeedsTranslation || !scriptTranslationKey) {
      setScriptTranslatedContent(null)
      setScriptTranslationCacheKey('')
      scriptTranslationInFlight.current = null
      return
    }
    if (scriptTranslationCacheKey === scriptTranslationKey && scriptTranslatedContent !== null) return
    if (scriptTranslationInFlight.current === scriptTranslationKey) return
    scriptTranslationInFlight.current = scriptTranslationKey
    setScriptTranslationCacheKey(scriptTranslationKey)
    setScriptTranslationLoading(true)
    setScriptTranslatedContent(null)
    const keyForThisRequest = scriptTranslationKey
    translateLongTextForDisplay(scriptContent, locale, 'zh-CN')
      .then((translated) => {
        if (scriptTranslationInFlight.current === keyForThisRequest) setScriptTranslatedContent(translated)
      })
      .catch((err: unknown) => {
        const error = err as { response?: { status?: number; data?: { error?: string } }; message?: string }
        if (scriptTranslationInFlight.current === keyForThisRequest) {
          setScriptTranslatedContent(null)
          setScriptTranslationCacheKey('')
        }
        const status = error.response?.status
        const msg =
          status === 404
            ? t('tools.translation404Hint', { fallback: 'Translation API not found (404).' })
            : error.response?.data?.error || error.message || t('tools.translationFailed')
        toast.error(typeof msg === 'string' && msg.length > 100 ? msg.slice(0, 100) + '…' : msg)
      })
      .finally(() => {
        setScriptTranslationLoading(false)
        if (scriptTranslationInFlight.current === keyForThisRequest) scriptTranslationInFlight.current = null
      })
  }, [scriptTranslationKey, scriptNeedsTranslation, scriptContent, locale, t])

  // ==================== 标题 ====================
  const resultTitle = (() => {
    if (result.type === 'script') return scriptData?.storeId ? t('tools.resultTitleScriptWithStore', { storeName: selectedStore?.name || t('tools.currentStore') }) : t('tools.resultTitleScript')
    if (result.type === 'report') return t('tools.resultTitleReport')
    if (result.type === 'analysis') return t('tools.resultTitleAnalysis')
    if (result.type === 'stats') return t('tools.resultTitleStats')
    if (result.type === 'research') return t('tools.resultTitleResearch')
    if (result.type === 'recommendations') return t('tools.resultTitleRecommendations')
    if (result.type === 'compare') return t('tools.resultTitleCompare')
    if (result.type === 'assistant') return t('tools.resultTitleAssistant')
    return ''
  })()

  return (
    <>
      <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-blue-900">{resultTitle}</h3>
          <div className="flex items-center gap-1">
            {result.type === 'script' && (typeof scriptData?.content === 'string' || Boolean(scriptData?.streaming)) && (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    const text = scriptData?.streaming
                      ? streamingContent
                      : scriptNeedsTranslation && scriptTranslatedContent
                        ? scriptTranslatedContent
                        : scriptData?.content
                    const ok = await copyToClipboard(String(text ?? ''))
                    if (ok) toast.success(t('tools.copyToClipboard'))
                    else toast.error(t('tools.copyFailed'))
                  }}
                  className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded"
                  title={t('tools.copyFullText')}
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setResultExpanded((e) => !e)}
                  className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded"
                  title={resultExpanded ? t('tools.collapse') : t('tools.expandFull')}
                >
                  {resultExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setResultFullScreen(true)}
                  className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded"
                  title={t('tools.fullScreenView')}
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded"
              title={t('tools.closeClearResult')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-gray-500 mb-2 border-b border-blue-100 pb-2 flex items-center justify-between">
          <span>
            {result.type === 'script' && (scriptData?.storeId || selectedStore)
              ? t('tools.scriptDisclaimerWithStore')
              : t('tools.scriptDisclaimerDefault')}
          </span>
          <span className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            {t('tools.saved')}
          </span>
        </p>

        {/* Body */}
        <div
          className={`text-sm text-gray-700 overflow-y-auto rounded border border-blue-100 bg-white ${result.type === 'script' && resultExpanded ? 'max-h-[70vh] min-h-[320px]' : 'max-h-[28rem]'}`}
          style={result.type === 'script' ? { minHeight: resultExpanded ? undefined : '12rem' } : undefined}
        >
          {/* Script Result */}
          {result.type === 'script' && (
            <div className="space-y-2">
              {Boolean(scriptData?.storeId && selectedStore && !scriptData?.streaming) && (
                <div className="flex items-center gap-2 px-2 py-1.5 bg-teal-50 rounded text-sm text-teal-800 border border-teal-200">
                  <Store className="w-4 h-4 shrink-0" />
                  <span>{t('tools.basedOnStore')}<strong>{String(selectedStore?.name ?? '')}</strong></span>
                </div>
              )}
              {Boolean(scriptData?.relevanceWarning) && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                  <p className="font-medium">⚠️ {t('tools.templateFallbackTitle')}</p>
                  <p className="mt-1">{String(scriptData?.relevanceWarning ?? '')}</p>
                </div>
              )}
              {scriptData?.dataSource === 'template' && Boolean(scriptData?.fallbackReason) && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm mb-2">
                  <p className="font-medium">⚠️ {t('tools.templateFallbackHint')}</p>
                  <p className="mt-1 text-sm">{String(scriptData?.fallbackReason ?? '')}</p>
                </div>
              )}
              {Boolean(scriptData?.translationSkipped) && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                  <p className="font-medium">🌐 {String(scriptData?.translationSkippedMessage ?? t('tools.scriptTranslationSkipped'))}</p>
                </div>
              )}
              {scriptNeedsTranslation && !scriptData?.streaming && !scriptTranslationLoading && !scriptTranslatedContent && (
                <div className="px-2 py-1.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      setScriptTranslationLoading(true)
                      try {
                        const translated = await translateLongTextForDisplay(scriptContent, locale, 'zh-CN')
                        setScriptTranslatedContent(translated)
                        setScriptTranslationCacheKey(scriptTranslationKey)
                      } catch (e: unknown) {
                        const error = e as { response?: { status?: number; data?: { error?: string } }; message?: string }
                        const status = error.response?.status
                        const msg =
                          status === 404
                            ? t('tools.translation404Hint', { fallback: 'Translation API not found.' })
                            : error.response?.data?.error || error.message || t('tools.translationFailed', { fallback: 'Translation failed.' })
                        toast.error(typeof msg === 'string' && msg.length > 100 ? msg.slice(0, 100) + '…' : msg)
                      } finally {
                        setScriptTranslationLoading(false)
                      }
                    }}
                    className="text-sm px-3 py-1.5 rounded-lg bg-blue-100 text-blue-800 hover:bg-blue-200 font-medium"
                  >
                    {locale === 'th-TH' ? t('tools.translateToThai') : t('tools.translateToEnglish')}
                  </button>
                </div>
              )}
              {scriptData?.error ? (
                <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                  <p className="font-semibold mb-2">{t('tools.cannotGenerateScript')}</p>
                  <p className="text-sm mb-3 text-amber-950 whitespace-pre-wrap">{String(scriptData.error)}</p>
                  {getCurrentUserRole() === 'admin' && scriptErrorLooksLikeLlmConfigIssue(String(scriptData.error)) ? (
                    <>
                      <p className="text-sm mb-2">您可以在管理员后台配置 LLM，配置后全体用户均可使用话术生成。</p>
                      <p className="text-sm mb-2">
                        请进入 <Link to="/admin/permissions?tab=llm" className="text-indigo-600 underline font-medium">权限配置</Link> 页面的「LLM 配置」标签，填写 API 地址与 API 密钥并保存。
                      </p>
                    </>
                  ) : null}
                  {getCurrentUserRole() !== 'admin' && scriptErrorLooksLikeLlmConfigIssue(String(scriptData.error)) ? (
                    <>
                      <p className="text-sm mb-2">话术生成需要管理员先配置 LLM。</p>
                      <p className="text-sm">请联系管理员在「管理员」-「LLM 配置」中完成配置后即可使用。</p>
                    </>
                  ) : null}
                </div>
              ) : (
                <>
                  {scriptNeedsTranslation && scriptTranslationLoading && (
                    <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded mb-2" role="status">
                      {t('tools.translatingLong')}
                    </p>
                  )}
                  <pre className="whitespace-pre-wrap leading-relaxed text-[15px] p-4 font-sans min-h-[8rem]" role="status" aria-live="polite">
                    {scriptData?.streaming
                      ? (streamingContent || t('tools.streamPlaceholder'))
                      : scriptNeedsTranslation
                        ? (scriptTranslatedContent ?? String(scriptData?.content ?? ''))
                        : String(scriptData?.content ?? '')}
                    {scriptData?.streaming && streamingContent ? (
                      <span className="inline-block w-2 h-4 ml-0.5 bg-indigo-500 animate-pulse" aria-hidden />
                    ) : null}
                  </pre>
                </>
              )}
            </div>
          )}

          {/* Report Result */}
          {result.type === 'report' && (
            <div>
              <p className="mb-2">{result.data.summary}</p>
              <div className="mt-2">
                <strong>洞察：</strong>
                <ul className="list-disc list-inside ml-2">
                  {result.data.insights?.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </div>
            </div>
          )}

          {/* Stats Result */}
          {result.type === 'stats' && (
            <div>
              <p className="mb-2 font-semibold">{result.data.summary}</p>
              <div className="mt-2 space-y-1">
                <p><strong>关键指标：</strong></p>
                <ul className="list-disc list-inside ml-2 space-y-1">
                  <li>总GMV: ¥{result.data.keyMetrics?.totalGMV?.toLocaleString()}</li>
                  <li>总订单数: {result.data.keyMetrics?.totalOrders?.toLocaleString()}</li>
                  <li>成交订单: {String(result.data.keyMetrics?.completedOrders ?? '')}</li>
                  <li>平均转化率: {String(result.data.keyMetrics?.averageConversionRate ?? '')}%</li>
                </ul>
              </div>
              <div className="mt-2">
                <strong>趋势：</strong>
                <ul className="list-disc list-inside ml-2">
                  {result.data.trends?.map((item: string, i: number) => <li key={i}>{item}</li>)}
                </ul>
              </div>
            </div>
          )}

          {/* Analysis Result */}
          {result.type === 'analysis' && (
            <div>
              <p className="mb-2">趋势分析：</p>
              <ul className="list-disc list-inside ml-2">
                {result.data.trends.map((t, i) => (
                  <li key={i}>{t.product}: {t.trend} ({t.change})</li>
                ))}
              </ul>
            </div>
          )}

          {/* Research Result */}
          {result.type === 'research' && (
            <div>
              <p className="mb-2 font-semibold">{result.data.summary}</p>
              <div className="mt-2">
                <strong>趋势：</strong>
                <ul className="list-disc list-inside ml-2">
                  {result.data.trends?.map((item: string, i: number) => <li key={i}>{item}</li>)}
                </ul>
              </div>
              <div className="mt-2">
                <strong>机会点：</strong>
                <ul className="list-disc list-inside ml-2">
                  {result.data.opportunities?.map((item: string, i: number) => <li key={i}>{item}</li>)}
                </ul>
              </div>
            </div>
          )}

          {/* Recommendations Result */}
          {result.type === 'recommendations' && (
            <div>
              {(result.data.items ?? []).map((item, i) => (
                <div key={i} className="mb-2 p-2 bg-white rounded">
                  <strong>{(item as { name?: string }).name}</strong>{' '}
                  {(item as { category?: string }).category && <>- {(item as { category?: string }).category}</>}
                  <br />
                  <span className="text-xs text-gray-600">{(item as { reason?: string }).reason}</span>
                </div>
              ))}
            </div>
          )}

          {/* Compare Result */}
          {result.type === 'compare' && (
            <div className="space-y-4">
              <div>
                <p className="font-medium text-gray-800 mb-2">综合对比</p>
                <ul className="list-disc list-inside ml-2">
                  {((() => {
                    const d = result.data as unknown as Record<string, unknown>
                    const comp = d?.comparison as { insights?: string[] } | undefined
                    const ins = (d?.insights ?? []) as string[]
                    return (comp?.insights ?? ins).map((item: string, i: number) => <li key={i}>{item}</li>)
                  })())}
                </ul>
                {((() => {
                  const d = result.data as unknown as Record<string, unknown>
                  const comp = d?.comparison as { insights?: string[] } | undefined
                  const ins = (d?.insights ?? []) as string[]
                  return !(comp?.insights?.length) && !ins.length
                })()) && (
                  <p className="text-sm text-gray-500">暂无综合对比数据（功能待接入）</p>
                )}
              </div>
              <div className="border-t border-gray-200 pt-4">
                <p className="font-medium text-gray-800 mb-2">时效对比</p>
                {((result.data as { efficiency?: { comparison?: unknown[] } }).efficiency?.comparison?.length ?? 0) > 0 ? (
                  <>
                    {(result.data as { efficiency?: { comparison?: unknown[] } }).efficiency?.comparison?.map((store, i) => {
                      const s = store as { storeName?: string; name?: string; score?: number; metrics?: { responseTime?: string; orderProcessingTime?: string; customerServiceTime?: string; deliveryTime?: string } }
                      return (
                        <div key={i} className="mb-3 p-2 bg-white rounded border border-gray-100">
                          <strong>{s.storeName ?? s.name}</strong>
                          {s.score != null && <span className="text-gray-600"> (评分: {s.score})</span>}
                          {s.metrics && (
                            <ul className="list-disc list-inside ml-2 mt-1 text-xs text-gray-600">
                              {s.metrics.responseTime != null && <li>响应时间: {s.metrics.responseTime}</li>}
                              {s.metrics.orderProcessingTime != null && <li>订单处理时间: {s.metrics.orderProcessingTime}</li>}
                              {s.metrics.customerServiceTime != null && <li>客服时间: {s.metrics.customerServiceTime}</li>}
                              {s.metrics.deliveryTime != null && <li>配送时间: {s.metrics.deliveryTime}</li>}
                            </ul>
                          )}
                        </div>
                      )
                    })}
                    {((result.data as { efficiency?: { recommendations?: string[] } }).efficiency?.recommendations?.length ?? 0) > 0 && (
                      <div className="mt-2">
                        <strong>建议：</strong>
                        <ul className="list-disc list-inside ml-2">
                          {(result.data as { efficiency?: { recommendations?: string[] } }).efficiency?.recommendations?.map((item, i) => <li key={i}>{item}</li>)}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-500">暂无时效对比数据（功能待接入）</p>
                )}
              </div>
            </div>
          )}

          {/* Assistant Result */}
          {result.type === 'assistant' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-gray-900">{result.data.message}</p>
                <button
                  onClick={async () => {
                    if (!selectedStore) { toast.warning(t('tasks.selectStoreFirst')); return }
                    setRefreshing(true)
                    try {
                      const res = await generateTasks({ storeId: selectedStore.id })
                      await queryClient.invalidateQueries({ queryKey: ['tasks'] })
                      await refetchTasks()
                      const updatedTasks = await refetchTasks()
                      const pendingTasks = (updatedTasks.data || []).filter((t) => t.status === 'pending')
                      const urgentTasks = pendingTasks.filter((t) => t.priority === 'urgent')
                      setResultForTool('assistant', { type: 'assistant', data: { message: `待办任务管理 (共 ${pendingTasks.length} 个)`, tasks: pendingTasks, urgentCount: urgentTasks.length, totalCount: pendingTasks.length } })
                      const total = res?.tasks?.length ?? 0
                      const meta: GenerateTasksMetadata = res?.metadata ?? {}
                      const skipped = meta.skippedDuplicateCount ?? 0
                      const generated = meta.generatedCount ?? 0
                      if (total === 0) {
                        if (skipped > 0 && generated > 0) toast.info(t('tasks.generateDuplicateAll', { generated }))
                        else toast.info(t('tasks.generateNoNewHint'))
                      } else {
                        toast.success(t('tasks.generateSuccessNewTasks', { count: total }))
                      }
                    } catch (error: unknown) {
                      const err = error as { response?: { data?: { error?: string; detail?: string } }; message?: string }
                      console.error('生成任务失败:', error)
                      const errorMsg = err.response?.data?.detail || err.response?.data?.error || err.message || t('tools.errorGenerateTasks')
                      toast.error(errorMsg)
                    } finally {
                      setRefreshing(false)
                    }
                  }}
                  disabled={refreshing}
                  title={refreshing ? t('tasks.generatingTitle') : undefined}
                  className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 shrink-0 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? t('tasks.generating') : t('dashboard.smartGenerate')}
                </button>
                <button
                  onClick={async () => {
                    if (!selectedStore) { toast.warning(t('tasks.selectStoreFirst')); return }
                    if (result.data.totalCount === 0) { toast.info(t('tools.noPendingTasksAssistant')); return }
                    setCompletingAll(true)
                    try {
                      await completeAllTasks.mutateAsync(selectedStore.id)
                      await queryClient.invalidateQueries({ queryKey: ['tasks'] })
                      const updatedTasks = await refetchTasks()
                      const pendingTasks = (updatedTasks.data || []).filter((t) => t.status === 'pending')
                      const urgentTasks = pendingTasks.filter((t) => t.priority === 'urgent')
                      setResultForTool('assistant', { type: 'assistant', data: { message: `待办任务管理 (共 ${pendingTasks.length} 个)`, tasks: pendingTasks, urgentCount: urgentTasks.length, totalCount: pendingTasks.length } })
                      toast.success(t('tools.allTasksCompletedAssistant'))
                    } catch (error: unknown) {
                      const err = error as { response?: { data?: { error?: string } }; message?: string }
                      console.error('一键完成失败:', error)
                      const errorMsg = err.response?.data?.error || err.message || t('tools.batchCompleteFailed')
                      toast.error(errorMsg)
                    } finally {
                      setCompletingAll(false)
                    }
                  }}
                  disabled={completingAll || result.data.totalCount === 0}
                  className="flex items-center gap-2 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className={`w-3 h-3 ${completingAll ? 'animate-spin' : ''}`} />
                  一键完成
                </button>
              </div>
              {result.data.urgentCount > 0 && (
                <div className="mb-3 p-2 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-xs text-red-700">
                    <AlertCircle className="w-3 h-3 inline mr-1" />
                    <strong>{result.data.urgentCount} 个紧急任务</strong>需要优先处理
                  </p>
                </div>
              )}
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {result.data.tasks && result.data.tasks.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">还没有待办任务</p>
                    <p className="text-xs text-gray-400 mt-1">点击"智能生成"创建任务</p>
                  </div>
                ) : (
                  result.data.tasks?.map((task) => (
                    <div
                      key={task.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-all hover:shadow-sm ${
                        task.priority === 'urgent' ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'
                      }`}
                    >
                      {task.priority === 'urgent' ? (
                        <div className="p-1.5 bg-red-100 rounded shrink-0 mt-0.5"><AlertCircle className="w-4 h-4 text-red-600" /></div>
                      ) : (
                        <div className="p-1.5 bg-gray-100 rounded shrink-0 mt-0.5"><CheckCircle2 className="w-4 h-4 text-gray-500" /></div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold mb-1 ${task.priority === 'urgent' ? 'text-red-900' : 'text-gray-900'}`}>{task.title}</p>
                        {task.description && <p className="text-xs text-gray-600 leading-relaxed">{task.description}</p>}
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            await updateTask.mutateAsync({ id: task.id, status: 'completed' })
                            await queryClient.invalidateQueries({ queryKey: ['tasks'] })
                            const updatedTasks = await refetchTasks()
                            const pendingTasks = (updatedTasks.data || []).filter((t) => t.status === 'pending')
                            const urgentTasks = pendingTasks.filter((t) => t.priority === 'urgent')
                            setResultForTool('assistant', { type: 'assistant', data: { message: `待办任务管理 (共 ${pendingTasks.length} 个)`, tasks: pendingTasks, urgentCount: urgentTasks.length, totalCount: pendingTasks.length } })
                            toast.success(t('tasks.taskCompleted'))
                          } catch (e) {
                            console.error('标记完成失败', e)
                            toast.error(t('tasks.operationFailed'))
                          }
                        }}
                        disabled={updateTask.isPending}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors shrink-0 ${
                          task.priority === 'urgent' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-indigo-500 text-white hover:bg-indigo-600'
                        } disabled:opacity-50`}
                      >
                        ✓
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-3 p-2 bg-indigo-50 rounded-lg border border-indigo-200">
                <p className="text-xs text-indigo-700">
                  💡 <strong>提示：</strong>所有任务都基于运营数据智能生成，包含详细的执行建议和量化预期效果
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full-screen script modal */}
      {result.type === 'script' && typeof scriptData?.content === 'string' && resultFullScreen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setResultFullScreen(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-gray-900">{t('tools.resultTitleScriptFullScreen')}</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const copyText = scriptNeedsTranslation && scriptTranslatedContent ? scriptTranslatedContent : (scriptData?.content as string)
                    const ok = await copyToClipboard(copyText ?? '')
                    if (ok) toast.success(t('tools.copyToClipboard'))
                    else toast.error(t('tools.copyFailed'))
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
                >
                  <Copy className="w-4 h-4" />
                  {t('tools.copyShort')}
                </button>
                <button
                  type="button"
                  onClick={() => setResultFullScreen(false)}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                  title={t('tools.exitFullScreen')}
                >
                  <Minimize2 className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <pre className="whitespace-pre-wrap leading-relaxed text-[15px] font-sans text-gray-800">
                {scriptNeedsTranslation && scriptTranslatedContent ? scriptTranslatedContent : (scriptData?.content as string)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
