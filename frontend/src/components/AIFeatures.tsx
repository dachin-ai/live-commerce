import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  FileText,
  BarChart3,
  TrendingUp,
  Package,
  Store,
  Sparkles,
  Upload,
  Video,
  Image,
  X,
  Download,
  RefreshCw,
  ChevronRight,
  ArrowLeft,
  BookOpen,
  Activity,
} from 'lucide-react'
import {
  generateScript,
  generateScriptStream,
  getScriptLLMConfig,
  generateReport,
  analyzeMarket,
  getRecommendations,
  compareStores,
  generateStats,
  compareStoreEfficiency,
  type ScriptType,
  type ScriptLanguage,
  type MarketAnalysisResult,
  type StoreComparisonResult,
  type StatsResult,
} from '../services/ai'
import { useMaterials, useCreateMaterial } from '../services/materials'
import { useVideos, useUploadVideo, useDeleteVideo } from '../services/videos'
import { useStores } from '../services/stores'
import { useStore } from '../contexts/StoreContext'
import { useLanguage } from '../contexts/LanguageContext'
import { useToast } from '../contexts/ToastContext'
import { useTasks, type Task } from '../services/tasks'

import { loadScriptFormDraft, saveScriptFormDraft, scriptLanguageFromLocale, parsePriceToNumber } from '../utils/scriptDraft'
import { useToolResults } from '../hooks/useToolResults'
import type { ToolResultData, BundleItem, BundleItemRole } from './ai/types'
import { SCRIPT_RESULT_STORAGE_KEY, BUNDLE_ITEMS_MAX } from './ai/types'
import UploadModal from './ai/UploadModal'
import ToolResultDisplay from './ai/ToolResultDisplay'
import GuideModal from './ai/GuideModal'
import ParseProductModal from './ai/ParseProductModal'
export default function AIFeatures({ toolId: propToolId }: { toolId?: string }) {
  const { t } = useTranslation()
  const { locale } = useLanguage()
  const toast = useToast()
  const { selectedStore } = useStore()
  const { data: storesData } = useStores()
  const stores = storesData?.items ?? []
  const { data: materials = [] } = useMaterials(selectedStore?.id)
  const { data: videos = [], refetch: refetchVideos } = useVideos(selectedStore?.id)
  const hasProcessingVideos = videos.some((v) => v.status === 'processing')
  const uploadVideo = useUploadVideo()
  const deleteVideo = useDeleteVideo()
  const { data: tasks = [], refetch: refetchTasks } = useTasks(selectedStore?.id)
  const createMaterial = useCreateMaterial()

  const [loading, setLoading] = useState<string | null>(null)


  const { setResultForTool, getResultForTool, clearAllResults, hasResults } = useToolResults()
  const result = getResultForTool(propToolId) as ToolResultData | null
  const [showUploadModal, setShowUploadModal] = useState(false)
  const isScriptTool = propToolId === 'script' || propToolId === 'speech'
  // 单品/组套切换（不写入草稿，避免破坏旧数据结构）
  const [productTypeTab, setProductTypeTab] = useState<'single' | 'bundle'>('single')
  const [coreFeatures, setCoreFeatures] = useState('')
  const [secondaryFeatures, setSecondaryFeatures] = useState('')
  const [afterSalesInfo, setAfterSalesInfo] = useState('')
  const [competitorLink, setCompetitorLink] = useState('')
  const [bundleName, setBundleName] = useState('')
  const [bundleTotalPrice, setBundleTotalPrice] = useState('')
  const [bundleFeaturesText, setBundleFeaturesText] = useState('')
  const [bundleItems, setBundleItems] = useState<BundleItem[]>([])
  const [bundleEditorOpen, setBundleEditorOpen] = useState(false)
  const [bundleEditingId, setBundleEditingId] = useState<string | null>(null)
  const bundleEditorRef = useRef<HTMLDivElement | null>(null)
  const [bundleDraft, setBundleDraft] = useState<Omit<BundleItem, 'id'> & { id?: string }>({ name: '', price: '', sku: '', features: '', quantity: 1, role: 'tool' })
  const bundleSingleBuySum = bundleItems.reduce((sum, it) => {
    const p = parsePriceToNumber(it.price)
    return sum + (p != null ? p * (it.quantity || 1) : 0)
  }, 0)
  const bundleTotalNum = parsePriceToNumber(bundleTotalPrice)
  const bundleDiscount = bundleTotalNum != null ? bundleSingleBuySum - bundleTotalNum : null
  const [scriptForm, setScriptForm] = useState<{
    productName: string
    productSku: string
    price: string
    features: string
    targetAudience: string
    country: string
    scriptType: ScriptType
    language: ScriptLanguage
    promoCopy: string
    priceLevel: string
    productRole: string
  }>({
    productName: '',
    productSku: '',
    price: '',
    features: '',
    targetAudience: '',
    country: '',
    scriptType: 'full-sales',
    language: 'zh-CN',
    promoCopy: '',
    priceLevel: '',
    productRole: '',
  })
  const [streamingContent, setStreamingContent] = useState('')
  const streamedLengthRef = useRef(0)
  const simulatingStreamRef = useRef(false)
  const [scriptHasAccess, setScriptHasAccess] = useState<boolean | null>(null)
  const [showGuideModal, setShowGuideModal] = useState(false)
  const [showParseModal, setShowParseModal] = useState(false)
  const scriptFormSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 清空当前选项卡内容，同时清空底部共用的营销、售后、竞品信息；但保留国家、话术类型选择 */
  const clearCurrentScriptTabFields = useCallback(() => {
    if (productTypeTab === 'single') {
      setScriptForm((prev) => ({
        ...prev,
        productName: '',
        productSku: '',
        price: '',
        features: '',
        targetAudience: '',
        promoCopy: '',
      }))
      setCoreFeatures('')
      setSecondaryFeatures('')
      setAfterSalesInfo('')
      setCompetitorLink('')
    } else {
      setBundleName('')
      setBundleTotalPrice('')
      setBundleFeaturesText('')
      setBundleItems([])
      setBundleEditorOpen(false)
      setBundleEditingId(null)
      setBundleDraft({ name: '', price: '', sku: '', features: '', quantity: 1, role: 'tool' })
      setScriptForm((prev) => ({ ...prev, promoCopy: '' }))
      setAfterSalesInfo('')
      setCompetitorLink('')
    }
    toast.success(t('tools.scriptFormClearedCurrentTab'))
  }, [productTypeTab, t, toast])
  useEffect(() => {
    if (!isScriptTool) return
    const draft = loadScriptFormDraft()
    if (draft.productTypeTab === 'single' || draft.productTypeTab === 'bundle') setProductTypeTab(draft.productTypeTab)
    if (typeof draft.coreFeatures === 'string') setCoreFeatures(draft.coreFeatures)
    if (typeof draft.secondaryFeatures === 'string') setSecondaryFeatures(draft.secondaryFeatures)
    if (typeof draft.afterSalesInfo === 'string') setAfterSalesInfo(draft.afterSalesInfo)
    if (typeof draft.competitorLink === 'string') setCompetitorLink(draft.competitorLink)
    if (typeof draft.bundleName === 'string') setBundleName(draft.bundleName)
    if (typeof draft.bundleTotalPrice === 'string') setBundleTotalPrice(draft.bundleTotalPrice)
    if (typeof draft.bundleFeaturesText === 'string') setBundleFeaturesText(draft.bundleFeaturesText)
    if (Array.isArray(draft.bundleItems)) setBundleItems(draft.bundleItems)
    setScriptForm((prev) => ({
      ...prev,
      ...draft,
    }))
  }, [propToolId])

  useEffect(() => {
    if (!isScriptTool) return
    if (scriptFormSaveTimeout.current) clearTimeout(scriptFormSaveTimeout.current)
    scriptFormSaveTimeout.current = setTimeout(() => {
      scriptFormSaveTimeout.current = null
      saveScriptFormDraft({
        ...scriptForm,
        productTypeTab,
        coreFeatures,
        secondaryFeatures,
        afterSalesInfo,
        competitorLink,
        bundleName,
        bundleTotalPrice,
        bundleFeaturesText,
        bundleItems,
      })
    }, 500)
    return () => {
      if (scriptFormSaveTimeout.current) clearTimeout(scriptFormSaveTimeout.current)
    }
  }, [isScriptTool, scriptForm, productTypeTab, coreFeatures, secondaryFeatures, afterSalesInfo, competitorLink, bundleName, bundleTotalPrice, bundleFeaturesText, bundleItems])
  // 不在进入话术页时自动恢复 sessionStorage 中的上次结果，避免「第一次点生成」秒出内容（实为旧缓存）、第二次才像调用 LLM；生成完成后仍会写入 sessionStorage
  useEffect(() => {
    if (!isScriptTool || !propToolId) return
    // 原逻辑：从 sessionStorage 恢复上次结果并 setResultsByTool，已关闭，确保首次点击「生成」一定发起请求
  }, [propToolId, isScriptTool])

  useEffect(() => {
    if (propToolId !== 'script' && propToolId !== 'speech') return
    getScriptLLMConfig()
      .then((r) => {
        if (r.hasAccess !== undefined) setScriptHasAccess(r.hasAccess)
        else setScriptHasAccess(r.configured ? true : null)
      })
      .catch(() => setScriptHasAccess(null))
  }, [propToolId])

  useEffect(() => {
    if (!bundleEditorOpen) return
    // 编辑区在列表底部；打开后自动滚动到可视区域，避免误以为“无法编辑”
    requestAnimationFrame(() => bundleEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [bundleEditorOpen, bundleEditingId])
  // 录屏分析：有分析中的视频时每 5 秒刷新状态
  useEffect(() => {
    if (propToolId !== 'screen-recording' || !hasProcessingVideos) return
    const timer = setInterval(refetchVideos, 5000)
    return () => clearInterval(timer)
  }, [propToolId, hasProcessingVideos, refetchVideos])

  const quickActions: Array<{
    id: string
    icon: typeof BarChart3
    label: string
    description?: string
    color: string
    inDevelopment?: boolean
    action: () => Promise<void>
  }> = [
    {
      id: 'report',
      icon: BarChart3,
      label: t('tools.report'),
      description: t('tools.reportDesc'),
      color: 'bg-green-100 text-green-600',
      inDevelopment: true,
      action: async () => {
        if (!selectedStore) {
          toast.warning(t('tasks.selectStoreFirst'))
          return
        }
        setLoading('report')
        try {
          const report = await generateReport({ storeId: selectedStore.id, period: 'week' })
          setResultForTool('report', { type: 'report', data: report })
        } catch (error: unknown) {
          const err = error as { response?: { data?: { error?: string } }; message?: string }
          console.error('生成报告失败:', error)
          const errorMsg = err.response?.data?.error || err.message || t('tools.errorReportFailed')
          toast.error(errorMsg)
        } finally {
          setLoading(null)
        }
      },
    },
    {
      id: 'market-analysis',
      icon: TrendingUp,
      label: t('tools.marketAnalysis'),
      description: t('tools.marketAnalysisDesc'),
      color: 'bg-purple-100 text-purple-600',
      inDevelopment: true,
      action: async () => {
        setLoading('market-analysis')
        try {
          const analysis = await analyzeMarket({ category: '全品类', timeframe: '7days' })
          setResultForTool('analysis', { type: 'analysis', data: analysis as MarketAnalysisResult & { trends: Array<{ product: string; trend: string; change: string }> } })
        } catch (error: unknown) {
          const err = error as { response?: { data?: { error?: string } }; message?: string }
          console.error('市场分析失败:', error)
          const errorMsg = err.response?.data?.error || err.message || t('tools.errorMarketFailed')
          toast.error(errorMsg)
        } finally {
          setLoading(null)
        }
      },
    },
    {
      id: 'recommendations',
      icon: Package,
      label: t('tools.recommendations'),
      description: t('tools.recommendationsDesc'),
      color: 'bg-orange-100 text-orange-600',
      inDevelopment: true,
      action: async () => {
        if (!selectedStore) {
          toast.warning(t('tasks.selectStoreFirst'))
          return
        }
        setLoading('recommendations')
        try {
          const recommendations = await getRecommendations({ storeId: selectedStore.id, count: 5 })
          setResultForTool('recommendations', { type: 'recommendations', data: recommendations })
        } catch (error: unknown) {
          const err = error as { response?: { data?: { error?: string } }; message?: string }
          console.error('商品推荐失败:', error)
          const errorMsg = err.response?.data?.error || err.message || t('tools.errorRecommendFailed')
          toast.error(errorMsg)
        } finally {
          setLoading(null)
        }
      },
    },
    {
      id: 'stats',
      icon: Activity,
      label: t('tools.stats'),
      description: t('tools.statsDesc'),
      color: 'bg-cyan-100 text-cyan-600',
      inDevelopment: true,
      action: async () => {
        if (!selectedStore) {
          toast.warning(t('tasks.selectStoreFirst'))
          return
        }
        setLoading('stats')
        try {
          const stats = await generateStats({ storeId: selectedStore.id, period: 'week' })
          setResultForTool('stats', { type: 'stats', data: stats as StatsResult & { summary?: string; keyMetrics?: Record<string, unknown>; trends?: string[] } })
        } catch (error: unknown) {
          const err = error as { response?: { data?: { error?: string } }; message?: string }
          console.error('数据统计失败:', error)
          const errorMsg = err.response?.data?.error || err.message || t('tools.errorStatsFailed')
          toast.error(errorMsg)
        } finally {
          setLoading(null)
        }
      },
    },
    {
      id: 'speech',
      icon: FileText,
      label: t('tools.speech'),
      description: t('tools.speechDesc'),
      color: 'bg-teal-100 text-teal-600',
      action: async () => {
        if (!selectedStore) {
          toast.warning(t('tools.selectStoreFirstForScript'))
          return
        }
        setLoading('speech')
        try {
          const script = await generateScript({ topic: '直播话术', duration: 30, storeId: selectedStore.id })
          setResultForTool('script', { type: 'script', data: { ...script, storeId: selectedStore.id } })
        } catch (error: unknown) {
          const err = error as { response?: { data?: { error?: string } }; message?: string }
          console.error('话术生成失败:', error)
          const errorMsg = err.response?.data?.error || err.message || t('tools.errorScriptFailed')
          toast.error(errorMsg)
        } finally {
          setLoading(null)
        }
      },
    },
    {
      id: 'screen-recording',
      icon: Video,
      label: t('tools.screenRecording'),
      description: t('tools.screenRecordingDesc'),
      color: 'bg-amber-100 text-amber-600',
      inDevelopment: false,
      action: async () => { /* 录屏分析为独立页，展示视频列表与分析结果 */ },
    },
    {
      id: 'image-analysis',
      icon: Image,
      label: t('tools.imageAnalysis'),
      description: t('tools.imageAnalysisDesc'),
      color: 'bg-sky-100 text-sky-600',
      inDevelopment: true,
      action: async () => {
        toast.warning(t('tools.functionPending'))
      },
    },
    {
      id: 'compare',
      icon: Store,
      label: t('tools.compare'),
      description: t('tools.compareDesc'),
      color: 'bg-pink-100 text-pink-600',
      inDevelopment: true,
      action: async () => {
        if (stores.length < 2) {
          toast.warning(t('tools.compareNeedTwoStores'))
          return
        }
        setLoading('compare')
        const storeIds = stores.slice(0, 2).map((s) => s.id)
        try {
          const [comparison, efficiency] = await Promise.all([
            compareStores({ storeIds }),
            compareStoreEfficiency({ storeIds }),
          ])
          setResultForTool('compare', {
            type: 'compare',
            data: { comparison, efficiency } as unknown as (StoreComparisonResult & { efficiency?: { comparison?: Array<Record<string, unknown>>; recommendations?: string[] }; insights?: string[] }),
          })
        } catch (error: unknown) {
          const err = error as { response?: { data?: { error?: string } }; message?: string }
          console.error('店铺对比失败:', error)
          const errorMsg = err.response?.data?.error || err.message || t('tools.errorCompareFailed')
          toast.error(errorMsg)
        } finally {
          setLoading(null)
        }
      },
    },
    {
      id: 'assistant',
      icon: Sparkles,
      label: t('tools.assistant'),
      description: t('tools.assistantDesc'),
      color: 'bg-indigo-100 text-indigo-600',
      action: async () => {
        if (!selectedStore) {
          toast.warning(t('tasks.selectStoreFirst'))
          return
        }
        setLoading('assistant')
        try {
          const pendingTasks = tasks.filter((t) => t.status === 'pending')
          const urgentTasks = pendingTasks.filter((t) => t.priority === 'urgent')

          setResultForTool('assistant', {
            type: 'assistant',
            data: {
              message: `待办任务管理 (共 ${pendingTasks.length} 个)`,
              tasks: pendingTasks,
              urgentCount: urgentTasks.length,
              totalCount: pendingTasks.length,
            },
          })
          toast.success(t('tools.assistantActivated'))
        } finally {
          setLoading(null)
        }
      },
    },
  ]

  return (
    <div className="space-y-6">
      {/* AI自动生成：一行一个，点击跳转独立界面 */}
      <div className="card">
        {propToolId ? (
          <>
            <div className="flex items-center gap-3 mb-4">
              <Link
                to="/tools"
                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('tools.backToTools')}
              </Link>
            </div>
            {(() => {
              const action = quickActions.find((a) => a.id === propToolId)
              if (!action) {
                return (
                  <p className="text-gray-500 py-4">{t('tools.toolNotFound')}<Link to="/tools" className="text-blue-600 hover:underline">{t('tools.backToList')}</Link></p>
                )
              }
              const Icon = action.icon
              const isScriptTool = propToolId === 'script' || propToolId === 'speech'
              const isScreenRecording = propToolId === 'screen-recording'

              if (isScreenRecording) {
                const materialsByVideo = materials.reduce<Record<string, typeof materials>>((acc, m) => {
                  const vid = m.videoId || '_none'
                  if (!acc[vid]) acc[vid] = []
                  acc[vid].push(m)
                  return acc
                }, {})
                return (
                  <div className="space-y-4">
                    <div className={`flex items-center gap-3 p-4 rounded-lg ${action.color}`}>
                      <div className="p-2 rounded-lg bg-white">
                        <Icon className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                          {action.label}
                          {action.inDevelopment && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                              {t('common.inDevelopment')}
                            </span>
                          )}
                        </h2>
                        <p className="text-sm text-gray-600 mt-0.5">{action.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{t('tools.mediaLibraryDesc')}</span>
                      <button
                        onClick={() => setShowUploadModal(true)}
                        disabled={!selectedStore}
                        className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50"
                      >
                        <Upload className="w-4 h-4" />
                        {t('tools.uploadVideo')}
                      </button>
                    </div>
                    {videos.length === 0 ? (
                      <div className="text-center py-12 rounded-lg border border-dashed border-gray-200 bg-gray-50/50">
                        <Video className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500 mb-2">{t('tools.noMaterials')}</p>
                        <p className="text-sm text-gray-400">{t('tools.uploadVideoHint')}</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {videos.map((video) => {
                          const vidMats = materialsByVideo[video.id] || []
                          const excellent = vidMats.filter((m) => m.type === 'excellent')
                          const problem = vidMats.filter((m) => m.type === 'problem')
                          const statusLabel =
                            video.status === 'processing'
                              ? t('tools.videoStatusProcessing')
                              : video.status === 'failed'
                                ? t('tools.videoStatusFailed')
                                : t('tools.videoStatusDone')
                          const statusColor = video.status === 'processing' ? 'bg-amber-100 text-amber-800' : video.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                          return (
                            <div
                              key={video.id}
                              className="p-4 rounded-lg border border-gray-200 bg-white space-y-3"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Video className="w-5 h-5 text-gray-500 shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">{video.fileName}</p>
                                    <p className="text-xs text-gray-500">{new Date(video.createdAt).toLocaleString()}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColor}`}>
                                    {statusLabel}
                                  </span>
                                  {video.status === 'active' && video.videoUrl && (
                                    <a
                                      href={video.videoUrl.startsWith('http') ? video.videoUrl : `${window.location.origin}${video.videoUrl}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:text-blue-800"
                                      title={t('tools.view')}
                                    >
                                      <Download className="w-4 h-4" />
                                    </a>
                                  )}
                                  <button
                                    onClick={async () => {
                                      if (!confirm(t('tools.deleteVideoConfirm'))) return
                                      try {
                                        await deleteVideo.mutateAsync(video.id)
                                        toast.success(t('tools.mediaDeleted'))
                                      } catch (e) {
                                        toast.error((e as Error)?.message || t('tools.mediaDeleteFailed'))
                                      }
                                    }}
                                    className="text-red-500 hover:text-red-700"
                                    title={t('common.delete')}
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                              {video.status === 'active' && video.description && (
                                <p className="text-xs text-gray-600 line-clamp-2">{video.description}</p>
                              )}
                              {video.status === 'failed' && video.description && (
                                <p className="text-xs text-red-600 line-clamp-3">{video.description}</p>
                              )}
                              {video.status === 'active' && (excellent.length > 0 || problem.length > 0) && (
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  {excellent.length > 0 && (
                                    <div className="p-2 rounded bg-green-50">
                                      <span className="font-medium text-green-800">优秀案例 {excellent.length} 条</span>
                                      <ul className="mt-1 space-y-1 text-green-700">
                                        {excellent.slice(0, 3).map((m) => (
                                          <li key={m.id} className="truncate" title={m.content || m.title}>{m.title || m.name}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {problem.length > 0 && (
                                    <div className="p-2 rounded bg-amber-50">
                                      <span className="font-medium text-amber-800">问题片段 {problem.length} 条</span>
                                      <ul className="mt-1 space-y-1 text-amber-700">
                                        {problem.slice(0, 3).map((m) => (
                                          <li key={m.id} className="truncate" title={m.content || m.title}>{m.title || m.name}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <p className="text-xs text-gray-500 border-t border-gray-100 pt-3">{t('tools.aiCaseHint')}</p>
                  </div>
                )
              }

              return (
                <div className="space-y-4">
                  <div className={`flex items-center gap-3 p-4 rounded-lg ${action.color}`}>
                    <div className="p-2 rounded-lg bg-white">
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                        {action.label}
                        {action.inDevelopment && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                            {t('common.inDevelopment')}
                          </span>
                        )}
                      </h2>
                      <p className="text-sm text-gray-600 mt-0.5">
                        {isScriptTool ? t('tools.scriptHint') : t('tools.scriptHintOther')}
                      </p>
                    </div>
                  </div>

                  {isScriptTool && scriptHasAccess === false && (
                    <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                      <p className="font-medium">{t('tools.scriptNoAccessTitle')}</p>
                      <p className="text-sm mt-1">{t('tools.scriptNoAccessDesc')}</p>
                    </div>
                  )}

                  {isScriptTool && (
                    <div className="p-5 bg-gray-50/80 rounded-xl border border-gray-200 space-y-4">
                      {/* 单品 / 组套 两个选项卡 */}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setProductTypeTab('single')}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                            productTypeTab === 'single'
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {t('tools.productTypeSingle')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setProductTypeTab('bundle')}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                            productTypeTab === 'bundle'
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {t('tools.productTypeBundle')}
                        </button>
                        <button
                          type="button"
                          onClick={clearCurrentScriptTabFields}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                        >
                          {t('tools.clearScriptForm')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowParseModal(true)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 flex items-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          {t('tools.smartParse', { fallback: '智能识别' })}
                        </button>
                        <div className="ml-auto flex items-center gap-2">
                          <span className="text-xs text-gray-500 hidden sm:inline">{t('tools.paramTypeHint')}</span>
                          <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">{t('tools.scriptType')}</label>
                            <select
                              value={scriptForm.scriptType}
                              onChange={(e) => setScriptForm((f) => ({ ...f, scriptType: e.target.value as ScriptType }))}
                              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
                            >
                              <option value="framework-weak-product">{t('tools.scriptTypeFrameworkWeakProduct', { fallback: '弱塑品强营销框架' })}</option>
                              <option value="framework-strong-product">{t('tools.scriptTypeFrameworkStrongProduct', { fallback: '强塑品理性说服框架' })}</option>
                              <option value="full-sales">{t('tools.scriptTypeFullSales')}</option>
                              <option value="segment-audience">{t('tools.scriptTypeSegmentAudience')}</option>
                              <option value="segment-product">{t('tools.scriptTypeSegmentProduct')}</option>
                              <option value="segment-concerns">{t('tools.scriptTypeSegmentConcerns')}</option>
                              <option value="segment-benefits">{t('tools.scriptTypeSegmentBenefits')}</option>
                              <option value="segment-after-sales">{t('tools.scriptTypeSegmentAfterSales')}</option>
                              <option value="segment-closing">{t('tools.scriptTypeSegmentClosing')}</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {productTypeTab === 'single' && (
                      <>
                      {/* 必填项靠前：产品名称、价格、国家 */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.productName')}</label>
                        <input
                          type="text"
                          value={scriptForm.productName}
                          onChange={(e) => setScriptForm((f) => ({ ...f, productName: e.target.value }))}
                          placeholder={t('tools.productNamePlaceholder')}
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.priceRequired')}</label>
                          <input
                            type="text"
                            value={scriptForm.price}
                            onChange={(e) => setScriptForm((f) => ({ ...f, price: e.target.value }))}
                            placeholder={t('tools.pricePlaceholder')}
                            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.countryRequired')}</label>
                          <input
                            type="text"
                            value={scriptForm.country}
                            onChange={(e) => setScriptForm((f) => ({ ...f, country: e.target.value }))}
                            placeholder={t('tools.countryPlaceholder')}
                            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                          />
                        </div>
                      </div>
                      {/* 价格定位 & 产品角色（弱塑品/强塑品路由） */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.priceLevelLabel')}</label>
                          <select
                            value={scriptForm.priceLevel}
                            onChange={(e) => setScriptForm((f) => ({ ...f, priceLevel: e.target.value }))}
                            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
                          >
                            <option value="">{t('tools.priceLevelNone')}</option>
                            <option value="低">{t('tools.priceLevelLow')}</option>
                            <option value="中">{t('tools.priceLevelMid')}</option>
                            <option value="高">{t('tools.priceLevelHigh')}</option>
                          </select>
                          <p className="mt-1 text-xs text-gray-500">{t('tools.priceLevelHint')}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.productRoleLabel')}</label>
                          <select
                            value={scriptForm.productRole}
                            onChange={(e) => setScriptForm((f) => ({ ...f, productRole: e.target.value }))}
                            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
                          >
                            <option value="">{t('tools.productRoleNone')}</option>
                            <option value="引流款">{t('tools.productRoleTraffic')}</option>
                            <option value="爆单款">{t('tools.productRoleBoom')}</option>
                            <option value="利润款">{t('tools.productRoleProfit')}</option>
                            <option value="战略款">{t('tools.productRoleStrategic')}</option>
                            <option value="普通款">{t('tools.productRoleNormal')}</option>
                          </select>
                          <p className="mt-1 text-xs text-gray-500">{t('tools.productRoleHint')}</p>
                        </div>
                      </div>
                      {/* 可选项：两列紧凑 */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.productSkuOptional')}</label>
                          <input
                            type="text"
                            value={scriptForm.productSku}
                            onChange={(e) => setScriptForm((f) => ({ ...f, productSku: e.target.value }))}
                            placeholder={t('tools.productSkuPlaceholder')}
                            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                          />
                          <p className="mt-1 text-xs text-gray-500">{t('tools.productSkuHint')}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.targetAudienceOptional')}</label>
                          <input
                            type="text"
                            value={scriptForm.targetAudience}
                            onChange={(e) => setScriptForm((f) => ({ ...f, targetAudience: e.target.value }))}
                            placeholder={t('tools.targetAudiencePlaceholder')}
                            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.coreFeaturesLabel')}</label>
                          <textarea
                            value={coreFeatures}
                            onChange={(e) => setCoreFeatures(e.target.value)}
                            placeholder={t('tools.coreFeaturesPlaceholder')}
                            rows={4}
                            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white resize-y min-h-[90px] text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.secondaryFeaturesLabel')}</label>
                          <textarea
                            value={secondaryFeatures}
                            onChange={(e) => setSecondaryFeatures(e.target.value)}
                            placeholder={t('tools.secondaryFeaturesPlaceholder')}
                            rows={4}
                            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white resize-y min-h-[90px] text-sm"
                          />
                        </div>
                      </div>
                      {/* 话术类型已移至顶部页签行（靠右） */}
                      {(
                        scriptForm.scriptType === 'full-sales' ||
                        scriptForm.scriptType === 'segment-benefits' ||
                        scriptForm.scriptType === 'segment-closing' ||
                        scriptForm.scriptType === 'framework-weak-product' ||
                        scriptForm.scriptType === 'framework-strong-product'
                      ) && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.promoOptional')}</label>
                          <textarea
                            value={scriptForm.promoCopy}
                            onChange={(e) => setScriptForm((f) => ({ ...f, promoCopy: e.target.value }))}
                            placeholder={t('tools.promoPlaceholder')}
                            rows={3}
                            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white resize-y min-h-[80px]"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.afterSalesInfoLabel')}</label>
                        <textarea
                          value={afterSalesInfo}
                          onChange={(e) => setAfterSalesInfo(e.target.value)}
                          placeholder={t('tools.afterSalesInfoPlaceholder')}
                          rows={3}
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white resize-y min-h-[80px]"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.competitorLinkLabel')}</label>
                        <textarea
                          value={competitorLink}
                          onChange={(e) => setCompetitorLink(e.target.value)}
                          placeholder={t('tools.competitorLinkPlaceholder')}
                          rows={2}
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white resize-y min-h-[64px] text-sm"
                        />
                        <p className="mt-1 text-xs text-gray-500">{t('tools.competitorLinkHint')}</p>
                      </div>
                      </>
                      )}

                      {productTypeTab === 'bundle' && (
                        <div className="space-y-4">
                          <div className="p-4 rounded-xl bg-white border border-gray-200 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.bundleNameLabel')}</label>
                                <input className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white" value={bundleName} onChange={(e) => setBundleName(e.target.value)} />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.bundleTotalPriceLabel')}</label>
                                <input className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white" value={bundleTotalPrice} onChange={(e) => setBundleTotalPrice(e.target.value)} />
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                                <div className="text-xs text-gray-500">{t('tools.bundleSingleBuySumLabel')}</div>
                                <div className="text-sm font-semibold text-gray-900 mt-0.5">{bundleSingleBuySum.toFixed(2)}</div>
                              </div>
                              <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                                <div className="text-xs text-gray-500">{t('tools.bundleDiscountLabel')}</div>
                                <div className={`text-sm font-semibold mt-0.5 ${bundleDiscount != null && bundleDiscount > 0 ? 'text-emerald-700' : 'text-gray-900'}`}>
                                  {bundleDiscount == null ? '—' : bundleDiscount.toFixed(2)}
                                </div>
                              </div>
                              <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                                <div className="text-xs text-gray-500">{t('tools.bundleHintLabel')}</div>
                                <div className="text-xs text-gray-600 mt-0.5">{t('tools.bundleHintText')}</div>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 rounded-xl bg-white border border-gray-200 space-y-3">
                            <div className="text-sm font-medium text-gray-800">{t('tools.bundleFeaturesTitle')}</div>
                            <textarea
                              value={bundleFeaturesText}
                              onChange={(e) => setBundleFeaturesText(e.target.value)}
                              placeholder={t('tools.bundleFeaturesPlaceholder')}
                              rows={4}
                              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white resize-y min-h-[90px] text-sm"
                            />
                            <p className="text-xs text-gray-500">{t('tools.bundleFeaturesHint')}</p>
                          </div>

                          <div className="p-4 rounded-xl bg-white border border-gray-200 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-medium text-gray-800">{t('tools.bundleItemsTitle')}</div>
                              <button
                                type="button"
                                onClick={() => {
                                  if (bundleItems.length >= BUNDLE_ITEMS_MAX) return toast.error(t('tools.maxBundleItemsToast', { max: BUNDLE_ITEMS_MAX }))
                                  setBundleEditingId(null)
                                  setBundleDraft({ name: '', price: '', sku: '', features: '', quantity: 1, role: 'tool' })
                                  setBundleEditorOpen(true)
                                }}
                                className="px-3 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                              >
                                {t('tools.addBundleItem')}
                              </button>
                            </div>

                            {bundleItems.map((it, idx) => (
                              <div key={it.id} className="p-3 rounded-lg border border-gray-200">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-sm font-medium text-gray-900">
                                    {t('tools.bundleItemPrefix', { index: idx + 1 })} {it.name}{' '}
                                    <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${it.role === 'core' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'}`}>
                                      {it.role === 'core' ? t('tools.roleBadgeCore') : t('tools.roleBadgeTool')}
                                    </span>
                                  </div>
                                  <div className="inline-flex items-center gap-3 text-sm">
                                    <button type="button" onClick={() => { setBundleEditingId(it.id); setBundleDraft({ id: it.id, name: it.name, price: it.price, sku: it.sku, features: it.features, quantity: it.quantity, role: it.role }); setBundleEditorOpen(true) }} className="text-indigo-600 hover:underline">{t('tools.edit')}</button>
                                    <button type="button" onClick={() => setBundleItems((prev) => prev.filter((x) => x.id !== it.id))} className="text-rose-600 hover:underline">{t('tools.delete')}</button>
                                  </div>
                                </div>
                                <div className="mt-2 text-sm text-gray-700 space-y-1">
                                  <div>{t('tools.itemUnitPrice')}：{it.price || '—'}　{t('tools.itemSku')}：{it.sku || '—'}</div>
                                  <div>{t('tools.itemFeatures')}：{it.features || '—'}</div>
                                </div>
                              </div>
                            ))}

                            {bundleEditorOpen && (
                              <div ref={bundleEditorRef} className="mt-4 p-4 rounded-lg border border-gray-200 bg-gray-50">
                                <div className="text-sm font-medium text-gray-900 mb-3">{bundleEditingId ? t('tools.inlineEditorTitleEdit') : t('tools.inlineEditorTitleAdd')}</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div className="sm:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.itemName')}</label>
                                    <input className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white" value={bundleDraft.name} onChange={(e) => setBundleDraft((d) => ({ ...d, name: e.target.value }))} />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.itemRole')}</label>
                                    <select className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white" value={bundleDraft.role} onChange={(e) => setBundleDraft((d) => ({ ...d, role: (e.target.value as BundleItemRole) === 'core' ? 'core' : 'tool' }))}>
                                      <option value="core">{t('tools.roleCore')}</option>
                                      <option value="tool">{t('tools.roleTool')}</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.itemUnitPrice')}</label>
                                    <input className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white" value={bundleDraft.price} onChange={(e) => setBundleDraft((d) => ({ ...d, price: e.target.value }))} />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.itemQuantity')}</label>
                                    <input type="number" min={1} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white" value={bundleDraft.quantity} onChange={(e) => setBundleDraft((d) => ({ ...d, quantity: Math.max(1, Math.floor(Number(e.target.value || 1))) }))} />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.itemSku')}</label>
                                    <input className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white" value={bundleDraft.sku} onChange={(e) => setBundleDraft((d) => ({ ...d, sku: e.target.value }))} />
                                  </div>
                                  <div className="sm:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.itemFeatures')}</label>
                                    <input className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white" value={bundleDraft.features} onChange={(e) => setBundleDraft((d) => ({ ...d, features: e.target.value }))} />
                                  </div>
                                </div>
                                <div className="flex items-center justify-end gap-2 mt-4">
                                  <button type="button" onClick={() => { setBundleEditorOpen(false); setBundleEditingId(null) }} className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-white">{t('tools.cancel')}</button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const name = bundleDraft.name.trim()
                                      if (!name) return toast.error(t('tools.fillItemName'))
                                      const next: BundleItem = {
                                        id: bundleEditingId || crypto.randomUUID(),
                                        name,
                                        price: bundleDraft.price,
                                        sku: bundleDraft.sku,
                                        features: bundleDraft.features,
                                        quantity: bundleDraft.quantity || 1,
                                        role: bundleDraft.role,
                                      }
                                      setBundleItems((prev) => {
                                        const exists = prev.some((x) => x.id === next.id)
                                        const items = exists ? prev.map((x) => (x.id === next.id ? next : x)) : [...prev, next]
                                        return (next.role === 'core' ? items.map((x) => (x.id === next.id ? x : { ...x, role: 'tool' as const })) : items).slice(0, BUNDLE_ITEMS_MAX)
                                      })
                                      setBundleEditorOpen(false)
                                      setBundleEditingId(null)
                                    }}
                                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
                                  >
                                    {t('tools.save')}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* 国家 / 营销 / 售后 / 竞品（话术类型仅在顶部选择，与清空逻辑一致） */}
                          <div className="p-4 rounded-xl bg-white border border-gray-200 space-y-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.countryRequired')}</label>
                              <input
                                type="text"
                                value={scriptForm.country}
                                onChange={(e) => setScriptForm((f) => ({ ...f, country: e.target.value }))}
                                placeholder={t('tools.countryPlaceholder')}
                                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                              />
                            </div>
                            {(
                              scriptForm.scriptType === 'full-sales' ||
                              scriptForm.scriptType === 'segment-benefits' ||
                              scriptForm.scriptType === 'segment-closing' ||
                              scriptForm.scriptType === 'framework-weak-product' ||
                              scriptForm.scriptType === 'framework-strong-product'
                            ) && (
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.promoOptional')}</label>
                                <textarea
                                  value={scriptForm.promoCopy}
                                  onChange={(e) => setScriptForm((f) => ({ ...f, promoCopy: e.target.value }))}
                                  placeholder={t('tools.promoPlaceholder')}
                                  rows={3}
                                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white resize-y min-h-[80px]"
                                />
                              </div>
                            )}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.afterSalesInfoLabel')}</label>
                              <textarea
                                value={afterSalesInfo}
                                onChange={(e) => setAfterSalesInfo(e.target.value)}
                                placeholder={t('tools.afterSalesInfoPlaceholder')}
                                rows={3}
                                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white resize-y min-h-[80px]"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.competitorLinkLabel')}</label>
                              <textarea
                                value={competitorLink}
                                onChange={(e) => setCompetitorLink(e.target.value)}
                                placeholder={t('tools.competitorLinkPlaceholder')}
                                rows={2}
                                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white resize-y min-h-[64px] text-sm"
                              />
                              <p className="mt-1 text-xs text-gray-500">{t('tools.competitorLinkHint')}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-5 flex justify-start">
                    <button
                    onClick={async (e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (isScriptTool) {
                        if (productTypeTab === 'single') {
                          if (!scriptForm.productName.trim()) {
                            toast.warning(t('tools.fillProductName'))
                            return
                          }
                          if (!scriptForm.price.trim()) {
                            toast.warning(t('tools.fillPrice'))
                            return
                          }
                        } else {
                          if (!bundleName.trim()) {
                            toast.warning(t('tools.fillBundleName'))
                            return
                          }
                          if (!bundleTotalPrice.trim()) {
                            toast.warning(t('tools.fillBundleTotalPrice'))
                            return
                          }
                        }
                        if (!scriptForm.country.trim()) {
                          toast.warning(t('tools.fillCountry'))
                          return
                        }
                        if (!selectedStore) {
                          toast.warning(t('tools.selectStoreForScript'))
                          return
                        }
                        setLoading(action.id)
                        setStreamingContent('')
                        streamedLengthRef.current = 0
                        try {
                          setResultForTool(propToolId!, { type: 'script', data: { content: '', streaming: true } })
                          await generateScriptStream(
                            {
                              productName: productTypeTab === 'single' ? scriptForm.productName.trim() : (bundleName.trim() || t('tools.productTypeBundle')),
                              productSku: productTypeTab === 'single' ? (scriptForm.productSku.trim() || undefined) : undefined,
                              price: productTypeTab === 'single' ? (scriptForm.price.trim() || undefined) : (bundleTotalPrice.trim() || undefined),
                              coreFeatures: productTypeTab === 'single' ? (coreFeatures.trim() || undefined) : undefined,
                              secondaryFeatures: productTypeTab === 'single' ? (secondaryFeatures.trim() || undefined) : undefined,
                              targetAudience: productTypeTab === 'single' ? (scriptForm.targetAudience.trim() || undefined) : undefined,
                              isBundle: productTypeTab === 'bundle',
                              bundleName: productTypeTab === 'bundle' ? (bundleName.trim() || undefined) : undefined,
                              bundleTotalPrice: productTypeTab === 'bundle' ? (bundleTotalPrice.trim() || undefined) : undefined,
                              bundleFeatures: productTypeTab === 'bundle'
                                ? bundleFeaturesText
                                  .split(/[\n\r;；]+/)
                                  .map((s) => s.trim())
                                  .filter(Boolean)
                                  .slice(0, 50)
                                : undefined,
                              bundleItems: productTypeTab === 'bundle' ? bundleItems.map((it) => ({
                                name: it.name,
                                price: it.price || undefined,
                                sku: it.sku || undefined,
                                features: it.features || undefined,
                                quantity: it.quantity,
                                role: it.role,
                              })) : undefined,
                              ...(productTypeTab === 'bundle'
                                ? {
                                    is_combo: true,
                                    combo_original_price:
                                      bundleSingleBuySum > 0 ? bundleSingleBuySum.toFixed(2) : undefined,
                                    combo_discount_amount:
                                      bundleDiscount != null && bundleDiscount > 0
                                        ? bundleDiscount.toFixed(2)
                                        : undefined,
                                    products: bundleItems.map((it, i) => ({
                                      id: i + 1,
                                      name: it.name,
                                      price: it.price || '',
                                      is_main: it.role === 'core',
                                      features: it.features || '',
                                      ...(it.sku ? { sku: it.sku } : {}),
                                      ...(it.quantity > 1 ? { quantity: it.quantity } : {}),
                                    })),
                                  }
                                : {}),
                              country: scriptForm.country.trim(),
                              scriptType: scriptForm.scriptType,
                              price_level: scriptForm.priceLevel || undefined,
                              product_role: scriptForm.productRole || undefined,
                              language: scriptLanguageFromLocale(locale),
                              promoCopy: (
                                scriptForm.scriptType === 'full-sales' ||
                                scriptForm.scriptType === 'segment-benefits' ||
                                scriptForm.scriptType === 'segment-closing' ||
                                scriptForm.scriptType === 'framework-weak-product' ||
                                scriptForm.scriptType === 'framework-strong-product'
                              ) ? (scriptForm.promoCopy.trim() || undefined) : undefined,
                              afterSalesInfo: afterSalesInfo.trim() || undefined,
                              competitorLink: competitorLink.trim() || undefined,
                              storeId: selectedStore.id,
                            },
                            {
                              onChunk: (chunk) => {
                                streamedLengthRef.current += (chunk?.length ?? 0)
                                setStreamingContent((prev) => prev + (chunk ?? ''))
                              },
                              onDone: (script) => {
                                const full = typeof script?.content === 'string' ? script.content : ''
                                const needSimulate = full.length > 0 && streamedLengthRef.current < full.length * 0.2
                                if (needSimulate) {
                                  simulatingStreamRef.current = true
                                  const chunkSize = 4
                                  const stepMs = 32
                                  let i = 0
                                  const id = setInterval(() => {
                                    i += chunkSize
                                    if (i >= full.length) {
                                      clearInterval(id)
                                      setStreamingContent(full)
                                      setTimeout(() => {
                                        simulatingStreamRef.current = false
                                        setResultForTool(propToolId!, { type: 'script', data: script })
                                        setStreamingContent('')
                                        setLoading(null)
                                        try {
                                          sessionStorage.setItem(
                                            SCRIPT_RESULT_STORAGE_KEY,
                                            JSON.stringify({ toolId: propToolId, type: 'script', data: script })
                                          )
                                        } catch {
                                          // ignore
                                        }
                                      }, 80)
                                      return
                                    }
                                    setStreamingContent(full.slice(0, i))
                                  }, stepMs)
                                  return
                                }
                                setResultForTool(propToolId!, { type: 'script', data: script })
                                setStreamingContent('')
                                setLoading(null)
                                try {
                                  sessionStorage.setItem(
                                    SCRIPT_RESULT_STORAGE_KEY,
                                    JSON.stringify({ toolId: propToolId, type: 'script', data: script })
                                  )
                                } catch {
                                  // ignore
                                }
                              },
                              onError: (msg) => {
                                setResultForTool(propToolId!, {
                                  type: 'script',
                                  data: { error: msg || t('tools.scriptGenerateError') },
                                })
                                toast.error(msg || t('tools.scriptGenerateError'))
                              },
                              onFallback: (reason) => {
                                if (reason === 'llm_timeout_or_empty') {
                                  toast.info(t('tools.fallbackTemplateTimeout'))
                                } else if (reason === 'llm_not_configured') {
                                  toast.info(t('tools.fallbackTemplateNoLlm'))
                                }
                              },
                            }
                          )
                        } catch (error) {
                          console.error('生成脚本失败:', error)
                          let errorMsg: string | undefined
                          if (error && typeof error === 'object') {
                            if ('response' in error) {
                              const response = (error as { response?: { data?: { error?: string } } }).response
                              errorMsg = response?.data?.error
                            }
                            if (!errorMsg && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
                              errorMsg = (error as { message?: string }).message
                            }
                          }
                          toast.error(errorMsg || t('tools.scriptGenerateFailedNetwork'))
                        } finally {
                          if (!simulatingStreamRef.current) setLoading(null)
                        }
                      } else {
                        action.action()
                      }
                    }}
                    disabled={loading !== null || (isScriptTool && scriptHasAccess === false)}
                    className="w-full sm:w-auto min-w-[140px] flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {loading === action.id ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        {t('tools.generatingScript')}
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 flex-shrink-0" />
                        {t('tools.generate')}
                      </>
                    )}
                  </button>
                  </div>
                </div>
              )
            })()}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">{t('tools.aiAutoGenerate')}</h2>
              {hasResults && (
                <button
                  onClick={() => {
                    if (confirm(t('tools.clearAllHistoryConfirm'))) {
                      clearAllResults()
                      toast.success(t('tools.historyCleared'))
                    }
                  }}
                  className="text-xs text-gray-500 hover:text-red-600 flex items-center gap-1"
                  title={t('tools.clearHistoryTitle')}
                >
                  <RefreshCw className="w-3 h-3" />
                  {t('tools.clearHistoryButton')}
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowGuideModal(true)}
                className="flex items-center gap-4 p-4 bg-violet-50 rounded-lg hover:bg-violet-100 border border-violet-100 hover:border-violet-200 transition-colors text-left w-full"
              >
                <div className="p-2.5 rounded-lg shrink-0 bg-violet-100 text-violet-600">
                  <BookOpen className="w-5 h-5" />
                </div>
                <span className="flex-1 text-sm font-medium text-gray-800">{t('tools.guidePromptTemplate')}</span>
                <ChevronRight className="w-5 h-5 text-violet-400 shrink-0" />
              </button>
              {quickActions.map((action) => {
                const Icon = action.icon
                return (
                  <Link
                    key={action.id}
                    to={`/tools/${action.id}`}
                    className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 border border-gray-100 hover:border-gray-200 transition-colors"
                  >
                    <div className={`p-2.5 rounded-lg shrink-0 ${action.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-800">{action.label}</span>
                        {action.inDevelopment && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                            {t('common.inDevelopment')}
                          </span>
                        )}
                      </span>
                      {action.description && (
                        <span className="block text-xs text-gray-500 mt-0.5">{action.description}</span>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
                  </Link>
                )
              })}
            </div>
            {/* 电商数据分析专家 - 交互提示词模板 弹窗 */}
            {showGuideModal && <GuideModal onClose={() => setShowGuideModal(false)} />}
          </>
        )}

        {result && propToolId && (
          <ToolResultDisplay
            result={result}
            propToolId={propToolId}
            selectedStore={selectedStore}
            streamingContent={streamingContent}
            onClose={() => { setResultForTool(propToolId, null) }}
            setResultForTool={setResultForTool}
            refetchTasks={refetchTasks as () => Promise<{ data: Task[] | undefined }>}
          />
        )}
      </div>

      {showUploadModal && (
        <UploadModal
          isScreenRecording={propToolId === 'screen-recording'}
          selectedStore={selectedStore}
          onClose={() => setShowUploadModal(false)}
          onUploadVideo={(formData) => {
            uploadVideo.mutate(formData, {
              onSuccess: () => { refetchVideos(); toast.success(t('tools.videoUploadSuccessAnalyzing')) },
              onError: (error: unknown) => {
                const err = error as { response?: { data?: { error?: string } }; message?: string }
                toast.error(err.response?.data?.error || err.message || t('tools.errorUploadShort'))
              },
            })
          }}
          onUploadMaterial={async (formData) => { await createMaterial.mutateAsync(formData) }}
          uploadPending={createMaterial.isPending || uploadVideo.isPending}
        />
      )}

      <ParseProductModal
        isOpen={showParseModal}
        onClose={() => setShowParseModal(false)}
        onParsed={(data) => {
          setScriptForm((prev) => ({
            ...prev,
            ...(data.productName ? { productName: data.productName } : {}),
            ...(data.price ? { price: data.price } : {})
          }))
          if (data.coreFeatures) setCoreFeatures((prev) => prev ? `${prev}\n\n${data.coreFeatures}` : data.coreFeatures)
          if (data.afterSalesInfo) setAfterSalesInfo((prev) => prev ? `${prev}\n\n${data.afterSalesInfo}` : data.afterSalesInfo)
          toast.success(t('tools.parseSuccess', { fallback: '已成功提取商品信息并填入表单' }))
        }}
      />
    </div>
  )
}
