import { useState, useEffect, useRef } from 'react'
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
  X,
  Download,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  ArrowLeft,
  Copy,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Activity,
} from 'lucide-react'
import { getCurrentUserRole } from '../services/auth'
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
  generateTasks,
  translateLongTextForDisplay,
  type GenerateTasksMetadata,
  type ScriptType,
  type ScriptLanguage,
} from '../services/ai'
import { useMaterials, useCreateMaterial, useDeleteMaterial } from '../services/materials'
import { useStores } from '../services/stores'
import { useStore } from '../contexts/StoreContext'
import { useLanguage } from '../contexts/LanguageContext'
import { useToast } from '../contexts/ToastContext'
import { useTasks, useUpdateTask, useBatchCompleteTasks, useCompleteAllTasks } from '../services/tasks'
import { useQueryClient } from '@tanstack/react-query'

const SCRIPT_FORM_STORAGE_KEY = 'lvbcsym_script_form_draft'
const SCRIPT_RESULT_STORAGE_KEY = 'lvbcsym_script_last_result'
const TOOLS_RESULTS_STORAGE_KEY = 'lvbcsym_tools_results'

function loadScriptFormDraft(): Partial<{
  productName: string
  productSku: string
  price: string
  features: string
  targetAudience: string
  country: string
  scriptType: ScriptType
  language: ScriptLanguage
  promoCopy: string
}> {
  try {
    const raw = localStorage.getItem(SCRIPT_FORM_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const allowed: (keyof ReturnType<typeof loadScriptFormDraft>)[] = [
      'productName', 'productSku', 'price', 'features', 'targetAudience', 'country', 'scriptType', 'promoCopy',
    ]
    const out: Record<string, string> = {}
    for (const key of allowed) {
      if (parsed[key] != null && typeof parsed[key] === 'string') out[key] = parsed[key] as string
    }
    if (parsed.scriptType && !['interaction', 'scenario', 'promotion', 'closing', 'full-sales'].includes(parsed.scriptType as string)) delete out.scriptType
    return out as Partial<ReturnType<typeof loadScriptFormDraft>>
  } catch {
    return {}
  }
}

function saveScriptFormDraft(form: {
  productName: string
  productSku: string
  price: string
  features: string
  targetAudience: string
  country: string
  scriptType: ScriptType
  language: ScriptLanguage
  promoCopy: string
}) {
  try {
    localStorage.setItem(SCRIPT_FORM_STORAGE_KEY, JSON.stringify(form))
  } catch {
    // ignore
  }
}

/** 话术生成使用全局界面语言（与侧边栏一致），仅支持 zh-CN / en-US / th-TH */
function scriptLanguageFromLocale(locale: string): ScriptLanguage {
  const l = (locale || '').toLowerCase()
  if (l.startsWith('th')) return 'th-TH'
  if (l.startsWith('en')) return 'en-US'
  return 'zh-CN'
}

export default function AIFeatures({ toolId: propToolId }: { toolId?: string }) {
  const { t } = useTranslation()
  const { locale } = useLanguage()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { selectedStore } = useStore()
  const { data: stores = [] } = useStores()
  const { data: materials = [] } = useMaterials(selectedStore?.id)
  const { data: tasks = [], refetch: refetchTasks } = useTasks(selectedStore?.id)
  const createMaterial = useCreateMaterial()
  const deleteMaterial = useDeleteMaterial()
  const updateTask = useUpdateTask()
  useBatchCompleteTasks()
  const completeAllTasks = useCompleteAllTasks()

  const [loading, setLoading] = useState<string | null>(null)
  const [resultExpanded, setResultExpanded] = useState(false)
  const [resultFullScreen, setResultFullScreen] = useState(false)
  
  // 从 localStorage 恢复上次的工具结果
  const loadToolsResults = (): Record<string, { type: string; data: any }> => {
    try {
      const raw = localStorage.getItem(TOOLS_RESULTS_STORAGE_KEY)
      if (!raw) return {}
      const parsed = JSON.parse(raw) as Record<string, { type: string; data: any }>
      // 过滤掉 streaming 状态的结果（避免恢复未完成的流式生成）
      const filtered: Record<string, { type: string; data: any }> = {}
      for (const [k, v] of Object.entries(parsed)) {
        if (v?.data?.streaming) continue // 跳过流式生成中的结果
        filtered[k] = v
      }
      return filtered
    } catch {
      return {}
    }
  }
  
  const [resultsByTool, setResultsByTool] = useState<Record<string, { type: string; data: any }>>(loadToolsResults)
  const result = propToolId ? (resultsByTool[propToolId] ?? null) : null
  
  const setResultForTool = (toolId: string, value: { type: string; data: any } | null) => {
    if (value === null) {
      setResultsByTool((prev) => {
        const next = { ...prev }
        delete next[toolId]
        // 持久化到 localStorage
        try {
          localStorage.setItem(TOOLS_RESULTS_STORAGE_KEY, JSON.stringify(next))
        } catch {
          // ignore
        }
        return next
      })
    } else {
      setResultsByTool((prev) => {
        const next = { ...prev, [toolId]: value }
        // 持久化到 localStorage（跳过 streaming 状态，避免保存未完成的流式生成）
        if (!value.data?.streaming) {
          try {
            localStorage.setItem(TOOLS_RESULTS_STORAGE_KEY, JSON.stringify(next))
          } catch {
            // ignore
          }
        }
        return next
      })
    }
  }
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [completingAll, setCompletingAll] = useState(false)
  const isScriptTool = propToolId === 'script' || propToolId === 'speech'
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
  }>({
    productName: '',
    productSku: '',
    price: '',
    features: '',
    targetAudience: '',
    country: '',
    scriptType: 'interaction',
    language: 'zh-CN',
    promoCopy: '',
  })
  const [streamingContent, setStreamingContent] = useState('')
  const streamedLengthRef = useRef(0)
  const simulatingStreamRef = useRef(false)
  const [scriptHasAccess, setScriptHasAccess] = useState<boolean | null>(null)
  /** 界面语言非中文时，话术内容为中文则自动翻译并缓存；key 为 scriptId 或 content 指纹 */
  const [scriptTranslatedContent, setScriptTranslatedContent] = useState<string | null>(null)
  const [scriptTranslationLoading, setScriptTranslationLoading] = useState(false)
  const [scriptTranslationCacheKey, setScriptTranslationCacheKey] = useState<string>('')
  const [showGuideModal, setShowGuideModal] = useState(false)
  const scriptFormSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setResultExpanded(false)
    setResultFullScreen(false)
  }, [propToolId])

  useEffect(() => {
    if (!isScriptTool) return
    const draft = loadScriptFormDraft()
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
      saveScriptFormDraft(scriptForm)
    }, 500)
    return () => {
      if (scriptFormSaveTimeout.current) clearTimeout(scriptFormSaveTimeout.current)
    }
  }, [isScriptTool, scriptForm])

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

  // 界面语言非中文且话术内容含中文时，自动请求翻译并展示（key 含 locale，切换语言会重新请求对应语言）
  const scriptContent = result?.type === 'script' && typeof result?.data?.content === 'string' ? result.data.content : ''
  const scriptNeedsTranslation = scriptContent && (locale === 'en-US' || locale === 'th-TH') && /[\u4e00-\u9fff]/.test(scriptContent) && !result?.data?.streaming
  const scriptTranslationKey = scriptNeedsTranslation ? `${result?.data?.id ?? `${scriptContent.length}-${scriptContent.slice(0, 80)}`}-${locale}` : ''
  const scriptTranslationInFlight = useRef<string | null>(null)
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
      .catch((err) => {
        if (scriptTranslationInFlight.current === keyForThisRequest) {
          setScriptTranslatedContent(null)
          setScriptTranslationCacheKey('')
        }
        const status = err?.response?.status
        const msg =
          status === 404
            ? t('tools.translation404Hint', { fallback: 'Translation API not found (404). Please restart the backend server (e.g. npm run dev in backend folder).' })
            : err?.response?.data?.error || err?.message || 'Translation failed'
        toast.error(typeof msg === 'string' && msg.length > 100 ? msg.slice(0, 100) + '…' : msg)
      })
      .finally(() => {
        setScriptTranslationLoading(false)
        if (scriptTranslationInFlight.current === keyForThisRequest) scriptTranslationInFlight.current = null
      })
  }, [scriptTranslationKey, scriptNeedsTranslation, scriptContent, locale])

  const quickActions: Array<{
    id: string
    icon: typeof BarChart3
    label: string
    description?: string
    color: string
    action: () => Promise<void>
  }> = [
    {
      id: 'report',
      icon: BarChart3,
      label: t('tools.report'),
      description: t('tools.reportDesc'),
      color: 'bg-green-100 text-green-600',
      action: async () => {
        if (!selectedStore) {
          toast.warning('请先选择店铺')
          return
        }
        setLoading('report')
        try {
          const report = await generateReport({ storeId: selectedStore.id, period: 'week' })
          setResultForTool('report', { type: 'report', data: report })
        } catch (error: any) {
          console.error('生成报告失败:', error)
          const errorMsg = error?.response?.data?.error || error?.message || '生成报告失败，请检查网络连接或登录状态'
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
      action: async () => {
        setLoading('market-analysis')
        try {
          const analysis = await analyzeMarket({ category: '全品类', timeframe: '7days' })
          setResultForTool('analysis', { type: 'analysis', data: analysis })
        } catch (error: any) {
          console.error('市场分析失败:', error)
          const errorMsg = error?.response?.data?.error || error?.message || '市场分析失败，请检查网络连接或登录状态'
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
      action: async () => {
        if (!selectedStore) {
          toast.warning('请先选择店铺')
          return
        }
        setLoading('recommendations')
        try {
          const recommendations = await getRecommendations({ storeId: selectedStore.id, count: 5 })
          setResultForTool('recommendations', { type: 'recommendations', data: recommendations })
        } catch (error: any) {
          console.error('商品推荐失败:', error)
          const errorMsg = error?.response?.data?.error || error?.message || '商品推荐失败，请检查网络连接或登录状态'
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
      action: async () => {
        if (!selectedStore) {
          toast.warning('请先选择店铺')
          return
        }
        setLoading('stats')
        try {
          const stats = await generateStats({ storeId: selectedStore.id, period: 'week' })
          setResultForTool('stats', { type: 'stats', data: stats })
        } catch (error: any) {
          console.error('数据统计失败:', error)
          const errorMsg = error?.response?.data?.error || error?.message || '数据统计失败，请检查网络连接或登录状态'
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
          setResultForTool('script', { type: 'script', data: script })
        } catch (error: any) {
          console.error('话术生成失败:', error)
          const errorMsg = error?.response?.data?.error || error?.message || '话术生成失败，请检查网络连接或登录状态'
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
      action: async () => { /* 录屏分析为独立页，仅展示素材库，无需执行 */ },
    },
    {
      id: 'compare',
      icon: Store,
      label: t('tools.compare'),
      description: t('tools.compareDesc'),
      color: 'bg-pink-100 text-pink-600',
      action: async () => {
        if (stores.length < 2) {
          toast.warning('至少需要2个商店才能进行对比')
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
            data: { comparison, efficiency },
          })
        } catch (error: any) {
          console.error('店铺对比失败:', error)
          const errorMsg = error?.response?.data?.error || error?.message || '店铺对比失败，请检查网络连接或登录状态'
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
          toast.warning('请先选择店铺')
          return
        }
        setLoading('assistant')
        try {
        // AI助手直接显示待办事项列表，支持快速查看和操作
        const pendingTasks = tasks.filter((t: any) => t.status === 'pending')
        const urgentTasks = pendingTasks.filter((t: any) => t.priority === 'urgent')
        
        setResultForTool('assistant', { 
            type: 'assistant', 
            data: { 
              message: `待办任务管理 (共 ${pendingTasks.length} 个)`,
              tasks: pendingTasks,
              urgentCount: urgentTasks.length,
              totalCount: pendingTasks.length,
            } 
          })
        toast.success('AI助手已激活，正在显示待办任务')
        } finally {
          setLoading(null)
        }
      },
    },
  ]

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.warning(t('tools.pleaseSelectFile'))
      return
    }

    if (!selectedStore) {
      toast.warning('请先选择店铺')
      return
    }

    const formData = new FormData()
    formData.append('file', selectedFile)
    formData.append('name', selectedFile.name)
    formData.append('type', 'video')
    formData.append('storeId', selectedStore.id)

    try {
      await createMaterial.mutateAsync(formData)
      setShowUploadModal(false)
      setSelectedFile(null)
      toast.success('上传成功')
    } catch (error: any) {
      console.error('上传失败:', error)
      const errorMsg = error?.response?.data?.error || error?.message || '上传失败，请检查网络连接或登录状态'
      toast.error(errorMsg)
    }
  }

  const handleDeleteMaterial = async (id: string) => {
    if (!confirm('确定要删除这个素材吗？')) return
    try {
      await deleteMaterial.mutateAsync(id)
    } catch (error: any) {
      console.error('删除失败:', error)
      const errorMsg = error?.response?.data?.error || error?.message || '删除失败，请检查网络连接或登录状态'
      toast.error(errorMsg)
    }
  }

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
                return (
                  <div className="space-y-4">
                    <div className={`flex items-center gap-3 p-4 rounded-lg ${action.color}`}>
                      <div className="p-2 rounded-lg bg-white">
                        <Icon className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900">{action.label}</h2>
                        <p className="text-sm text-gray-600 mt-0.5">{action.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{t('tools.mediaLibraryDesc')}</span>
                      <button
                        onClick={() => setShowUploadModal(true)}
                        className="btn-secondary flex items-center gap-2 text-sm"
                      >
                        <Upload className="w-4 h-4" />
                        {t('tools.uploadVideo')}
                      </button>
                    </div>
                    {materials.length === 0 ? (
                      <div className="text-center py-12 rounded-lg border border-dashed border-gray-200 bg-gray-50/50">
                        <Video className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500 mb-2">{t('tools.noMaterials')}</p>
                        <p className="text-sm text-gray-400">{t('tools.uploadVideoHint')}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {materials.map((material) => (
                          <div
                            key={material.id}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            <div className="flex items-center gap-3 flex-1">
                              <Video className="w-5 h-5 text-gray-500" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{material.name}</p>
                                {material.description && (
                                  <p className="text-xs text-gray-500 truncate">{material.description}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {material.url && (
                                <a
                                  href={typeof window !== 'undefined' ? `${window.location.origin}${material.url}` : material.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800"
                                  title={t('tools.view')}
                                >
                                  <Download className="w-4 h-4" />
                                </a>
                              )}
                              <button
                                onClick={() => handleDeleteMaterial(material.id)}
                                className="text-red-500 hover:text-red-700"
                                title={t('common.delete')}
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
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
                      <h2 className="text-lg font-semibold text-gray-900">{action.label}</h2>
                      <p className="text-sm text-gray-600 mt-0.5">
                        {isScriptTool ? t('tools.scriptHint') : t('tools.scriptHintOther')}
                      </p>
                    </div>
                  </div>

                  {isScriptTool && scriptHasAccess === false && (
                    <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                      <p className="font-medium">您暂无话术生成权限</p>
                      <p className="text-sm mt-1">请联系管理员在「管理员」-「LLM 配置」中为您勾选开通。</p>
                    </div>
                  )}

                  {isScriptTool && (
                    <div className="p-5 bg-gray-50/80 rounded-xl border border-gray-200 space-y-4">
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
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.productFeaturesOptional')}</label>
                          <input
                            type="text"
                            value={scriptForm.features}
                            onChange={(e) => setScriptForm((f) => ({ ...f, features: e.target.value }))}
                            placeholder={t('tools.productFeaturesPlaceholder')}
                            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('tools.scriptType')}</label>
                          <select
                            value={scriptForm.scriptType}
                            onChange={(e) => setScriptForm((f) => ({ ...f, scriptType: e.target.value as ScriptType }))}
                            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                          >
                            <option value="interaction">{t('tools.scriptTypeInteraction')}</option>
                            <option value="scenario">{t('tools.scriptTypeScenario')}</option>
                            <option value="promotion">{t('tools.scriptTypePromotion')}</option>
                            <option value="closing">{t('tools.scriptTypeClosing')}</option>
                            <option value="full-sales">{t('tools.scriptTypeFullSales')}</option>
                          </select>
                        </div>
                      </div>
                      {(scriptForm.scriptType === 'closing' || scriptForm.scriptType === 'promotion' || scriptForm.scriptType === 'full-sales') && (
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
                    </div>
                  )}

                  <div className="mt-5 flex justify-start">
                    <button
                    onClick={async (e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (isScriptTool) {
                        if (!scriptForm.productName.trim()) {
                          toast.warning(t('tools.fillProductName'))
                          return
                        }
                        if (!scriptForm.price.trim()) {
                          toast.warning(t('tools.fillPrice'))
                          return
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
                              productName: scriptForm.productName.trim(),
                              productSku: scriptForm.productSku.trim() || undefined,
                              price: scriptForm.price.trim() || undefined,
                              features: scriptForm.features.trim() || undefined,
                              targetAudience: scriptForm.targetAudience.trim() || undefined,
                              country: scriptForm.country.trim(),
                              scriptType: scriptForm.scriptType,
                              language: scriptLanguageFromLocale(locale),
                              promoCopy: (scriptForm.scriptType === 'closing' || scriptForm.scriptType === 'promotion' || scriptForm.scriptType === 'full-sales') ? (scriptForm.promoCopy.trim() || undefined) : undefined,
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
                                setResultForTool(propToolId!, { type: 'script', data: { error: msg || '生成话术时发生错误' } })
                                toast.error(msg || '生成话术时发生错误')
                              },
                              onFallback: (reason) => {
                                if (reason === 'llm_timeout_or_empty') {
                                  toast.info('生成超时或未返回内容，已为您切换为模板话术')
                                } else if (reason === 'llm_not_configured') {
                                  toast.info('未配置话术 LLM，已为您展示模板话术')
                                }
                              },
                            }
                          )
                        } catch (error: any) {
                          console.error('生成脚本失败:', error)
                          const errorMsg = error?.response?.data?.error || error?.message || '生成脚本失败，请检查网络连接或登录状态'
                          toast.error(errorMsg)
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
              {Object.keys(resultsByTool).length > 0 && (
                <button
                  onClick={() => {
                    if (confirm('确定清空所有工具的历史记录吗？')) {
                      setResultsByTool({})
                      try {
                        localStorage.removeItem(TOOLS_RESULTS_STORAGE_KEY)
                        toast.success('已清空历史记录')
                      } catch {
                        // ignore
                      }
                    }
                  }}
                  className="text-xs text-gray-500 hover:text-red-600 flex items-center gap-1"
                  title="清空所有工具的历史记录"
                >
                  <RefreshCw className="w-3 h-3" />
                  清空历史
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
                      <span className="block text-sm font-medium text-gray-800">{action.label}</span>
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
            {showGuideModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowGuideModal(false)}>
                <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
                    <h3 className="text-lg font-semibold text-gray-900">电商数据分析专家 - 交互提示词模板</h3>
                    <button type="button" onClick={() => setShowGuideModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                      <X className="w-5 h-5 text-gray-500" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 text-sm text-gray-700 space-y-4">
                    <section>
                      <h4 className="font-medium text-gray-900 mb-2">👋 开场欢迎语</h4>
                      <p className="whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">你好！我是你的电商数据分析专家助手，专注于帮助运营团队进行数据复盘和业务优化。我可以帮助你：分析店铺数据、搜索行业信息、生成营销素材、制作专业文档、优化直播间场景、生成主播话术。请告诉我你需要什么帮助！</p>
                    </section>
                    <section>
                      <h4 className="font-medium text-gray-900 mb-2">📦 常见使用场景</h4>
                      <ul className="list-disc list-inside space-y-1 text-gray-600">
                        <li>店铺数据分析（订单、用户、销售额、阶段）</li>
                        <li>多维度拆解（供应链、物流、定价、渠道、营销）</li>
                        <li>生成营销图片 / 海报</li>
                        <li>生成专业文档（Word / Excel / PPT）</li>
                        <li>直播间场景优化</li>
                        <li>生成主播话术（产品+人群+痛点）</li>
                        <li>搜索行业信息（平台规则、节庆、趋势、竞品）</li>
                        <li>综合分析报告（多维度+报告+PPT）</li>
                      </ul>
                    </section>
                    <section>
                      <h4 className="font-medium text-gray-900 mb-2">🎯 指令模板</h4>
                      <ul className="space-y-2 text-gray-600">
                        <li><strong>快速分析：</strong>快速分析：[简述问题或数据]</li>
                        <li><strong>深度分析：</strong>深度分析：[提供详细数据]</li>
                        <li><strong>生成素材：</strong>生成：[素材类型 + 具体要求]</li>
                        <li><strong>优化场景：</strong>优化场景：[图片URL] + [产品类别] + [主播风格]</li>
                        <li><strong>生成话术：</strong>生成话术：产品名称、类别、特点、目标人群、价格、痛点</li>
                      </ul>
                    </section>
                    <section>
                      <h4 className="font-medium text-gray-900 mb-2">💡 最佳实践</h4>
                      <p className="text-gray-600">提供完整信息（订单数、用户数、销售额、品类、阶段）；明确分析维度（如物流：配送时长、准时率、退货率）；要求具体输出（报告标题、章节、格式）；多维度结合分析（定价+内容+物流）。</p>
                    </section>
                    <p className="text-gray-500 text-xs border-t border-gray-100 pt-3">完整模板（含迭代优化、数据格式、话术/搜索提示词等）见项目文档：docs/电商数据分析专家-交互提示词模板.md</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* 显示结果 */}
        {result && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-blue-900">
                {result.type === 'script' && (result.data?.storeId ? t('tools.resultTitleScriptWithStore', { storeName: selectedStore?.name || t('tools.currentStore') }) : t('tools.resultTitleScript'))}
                {result.type === 'report' && t('tools.resultTitleReport')}
                {result.type === 'analysis' && t('tools.resultTitleAnalysis')}
                {result.type === 'stats' && t('tools.resultTitleStats')}
                {result.type === 'research' && t('tools.resultTitleResearch')}
                {result.type === 'recommendations' && t('tools.resultTitleRecommendations')}
                {result.type === 'compare' && t('tools.resultTitleCompare')}
                {result.type === 'assistant' && t('tools.resultTitleAssistant')}
              </h3>
              <div className="flex items-center gap-1">
                {result.type === 'script' && (typeof result.data?.content === 'string' || result.data?.streaming) && (
                  <>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const text = result.data?.streaming
                            ? streamingContent
                            : scriptNeedsTranslation && scriptTranslatedContent
                              ? scriptTranslatedContent
                              : result.data?.content
                          await navigator.clipboard.writeText(text || '')
                          toast.success(t('tools.copyToClipboard'))
                        } catch {
                          toast.error(t('tools.copyFailed'))
                        }
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
                  onClick={() => { if (propToolId) setResultForTool(propToolId, null); setResultExpanded(false); setResultFullScreen(false) }}
                  className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded"
                  title={t('tools.closeClearResult')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-2 border-b border-blue-100 pb-2 flex items-center justify-between">
              <span>
              {result.type === 'script' && (result.data?.storeId || selectedStore)
                ? t('tools.scriptDisclaimerWithStore')
                : t('tools.scriptDisclaimerDefault')}
              </span>
              <span className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {t('tools.saved')}
              </span>
            </p>
            <div
              className={`text-sm text-gray-700 overflow-y-auto rounded border border-blue-100 bg-white ${result.type === 'script' && resultExpanded ? 'max-h-[70vh] min-h-[320px]' : 'max-h-[28rem]'}`}
              style={result.type === 'script' ? { minHeight: resultExpanded ? undefined : '12rem' } : undefined}
            >
              {result.type === 'script' && (
                <div className="space-y-2">
                  {result.data?.storeId && selectedStore && !result.data?.streaming && (
                    <div className="flex items-center gap-2 px-2 py-1.5 bg-teal-50 rounded text-sm text-teal-800 border border-teal-200">
                      <Store className="w-4 h-4 shrink-0" />
                      <span>{t('tools.basedOnStore')}<strong>{selectedStore.name}</strong></span>
                    </div>
                  )}
                  {result.data?.relevanceWarning && (
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                      <p className="font-medium">⚠️ {t('tools.templateFallbackTitle')}</p>
                      <p className="mt-1">{result.data.relevanceWarning}</p>
                    </div>
                  )}
                  {result.data?.dataSource === 'template' && result.data?.fallbackReason && (
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm mb-2">
                      <p className="font-medium">⚠️ {t('tools.templateFallbackHint')}</p>
                    </div>
                  )}
                  {result.data?.translationSkipped && (
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                      <p className="font-medium">🌐 {result.data?.translationSkippedMessage ?? t('tools.scriptTranslationSkipped')}</p>
                    </div>
                  )}
                  {scriptNeedsTranslation && !result.data?.streaming && !scriptTranslationLoading && !scriptTranslatedContent && (
                    <div className="px-2 py-1.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          setScriptTranslationLoading(true)
                          try {
                            const translated = await translateLongTextForDisplay(scriptContent, locale, 'zh-CN')
                            setScriptTranslatedContent(translated)
                            setScriptTranslationCacheKey(scriptTranslationKey)
                          } catch (e: any) {
                            const status = e?.response?.status
                            const msg =
                              status === 404
                                ? t('tools.translation404Hint', { fallback: 'Translation API not found. Please restart the backend server.' })
                                : e?.response?.data?.error || e?.message || t('tools.translationFailed', { fallback: 'Translation failed. Please try again.' })
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
                  {result.data?.error ? (
                    <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                      <p className="font-semibold mb-2">{t('tools.cannotGenerateScript')}</p>
                      {getCurrentUserRole() === 'admin' ? (
                        <>
                          <p className="text-sm mb-2">您可以在管理员后台配置 LLM，配置后全体用户均可使用话术生成。</p>
                          <p className="text-sm mb-2">
                            请进入 <Link to="/admin" className="text-indigo-600 underline font-medium">管理员</Link> 页面，在「LLM 配置」中填写 API 地址与 API 密钥并保存。
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm mb-2">话术生成需要管理员先配置 LLM。</p>
                          <p className="text-sm">请联系管理员在「管理员」-「LLM 配置」中完成配置后即可使用。</p>
                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      {scriptNeedsTranslation && scriptTranslationLoading && (
                        <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded mb-2" role="status">
                          {t('tools.translatingLong')}
                        </p>
                      )}
                      <pre
                        className="whitespace-pre-wrap leading-relaxed text-[15px] p-4 font-sans min-h-[8rem]"
                        role="status"
                        aria-live="polite"
                      >
                        {result.data?.streaming
                          ? (streamingContent || t('tools.streamPlaceholder'))
                          : scriptNeedsTranslation
                            ? (scriptTranslatedContent ?? result.data?.content)
                            : result.data?.content}
                        {result.data?.streaming && streamingContent ? (
                          <span className="inline-block w-2 h-4 ml-0.5 bg-indigo-500 animate-pulse" aria-hidden />
                        ) : null}
                      </pre>
                    </>
                  )}
                </div>
              )}
              {result.type === 'report' && (
                <div>
                  <p className="mb-2">{result.data.summary}</p>
                  <div className="mt-2">
                    <strong>洞察：</strong>
                    <ul className="list-disc list-inside ml-2">
                      {result.data.insights.map((item: string, i: number) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {result.type === 'stats' && (
                <div>
                  <p className="mb-2 font-semibold">{result.data.summary}</p>
                  <div className="mt-2 space-y-1">
                    <p><strong>关键指标：</strong></p>
                    <ul className="list-disc list-inside ml-2 space-y-1">
                      <li>总GMV: ¥{result.data.keyMetrics?.totalGMV?.toLocaleString()}</li>
                      <li>总订单数: {result.data.keyMetrics?.totalOrders?.toLocaleString()}</li>
                      <li>成交订单: {result.data.keyMetrics?.completedOrders}</li>
                      <li>平均转化率: {result.data.keyMetrics?.averageConversionRate}%</li>
                    </ul>
                  </div>
                  <div className="mt-2">
                    <strong>趋势：</strong>
                    <ul className="list-disc list-inside ml-2">
                      {result.data.trends?.map((item: string, i: number) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {result.type === 'analysis' && (
                <div>
                  <p className="mb-2">趋势分析：</p>
                  <ul className="list-disc list-inside ml-2">
                    {result.data.trends.map((t: any, i: number) => (
                      <li key={i}>
                        {t.product}: {t.trend} ({t.change})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.type === 'research' && (
                <div>
                  <p className="mb-2 font-semibold">{result.data.summary}</p>
                  <div className="mt-2">
                    <strong>趋势：</strong>
                    <ul className="list-disc list-inside ml-2">
                      {result.data.trends?.map((item: string, i: number) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-2">
                    <strong>机会点：</strong>
                    <ul className="list-disc list-inside ml-2">
                      {result.data.opportunities?.map((item: string, i: number) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {result.type === 'recommendations' && (
                <div>
                  {result.data.map((item: any, i: number) => (
                    <div key={i} className="mb-2 p-2 bg-white rounded">
                      <strong>{item.name}</strong> - {item.category}
                      <br />
                      <span className="text-xs text-gray-600">{item.reason}</span>
                    </div>
                  ))}
                </div>
              )}
              {result.type === 'compare' && (
                <div className="space-y-4">
                  <div>
                    <p className="font-medium text-gray-800 mb-2">综合对比</p>
                    <ul className="list-disc list-inside ml-2">
                      {(result.data.comparison?.insights ?? result.data.insights ?? []).map((item: string, i: number) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                    {(!result.data.comparison?.insights?.length && !result.data.insights?.length) && (
                      <p className="text-sm text-gray-500">暂无综合对比数据（功能待接入）</p>
                    )}
                  </div>
                  <div className="border-t border-gray-200 pt-4">
                    <p className="font-medium text-gray-800 mb-2">时效对比</p>
                    {(result.data.efficiency?.comparison?.length > 0) ? (
                      <>
                        {result.data.efficiency.comparison.map((store: any, i: number) => (
                          <div key={i} className="mb-3 p-2 bg-white rounded border border-gray-100">
                            <strong>{store.storeName ?? store.name}</strong>
                            {store.score != null && <span className="text-gray-600"> (评分: {store.score})</span>}
                            {store.metrics && (
                              <ul className="list-disc list-inside ml-2 mt-1 text-xs text-gray-600">
                                {store.metrics.responseTime != null && <li>响应时间: {store.metrics.responseTime}</li>}
                                {store.metrics.orderProcessingTime != null && <li>订单处理时间: {store.metrics.orderProcessingTime}</li>}
                                {store.metrics.customerServiceTime != null && <li>客服时间: {store.metrics.customerServiceTime}</li>}
                                {store.metrics.deliveryTime != null && <li>配送时间: {store.metrics.deliveryTime}</li>}
                              </ul>
                            )}
                          </div>
                        ))}
                        {result.data.efficiency.recommendations?.length > 0 && (
                          <div className="mt-2">
                            <strong>建议：</strong>
                            <ul className="list-disc list-inside ml-2">
                              {result.data.efficiency.recommendations.map((item: string, i: number) => (
                                <li key={i}>{item}</li>
                              ))}
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
              {result.type === 'assistant' && (
                <div>
                  {/* 头部信息 */}
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-semibold text-gray-900">{result.data.message}</p>
                    <button
                      onClick={async () => {
                        if (!selectedStore) {
                          toast.warning('请先选择店铺')
                          return
                        }
                        setRefreshing(true)
                        try {
                          const res = await generateTasks({ storeId: selectedStore.id })
                          await queryClient.invalidateQueries({ queryKey: ['tasks'] })
                          await refetchTasks()
                          const updatedTasks = await refetchTasks()
                          const pendingTasks = (updatedTasks.data || []).filter((t: any) => t.status === 'pending')
                          const urgentTasks = pendingTasks.filter((t: any) => t.priority === 'urgent')
                          setResultForTool('assistant', { 
                            type: 'assistant', 
                            data: { 
                              message: `待办任务管理 (共 ${pendingTasks.length} 个)`,
                              tasks: pendingTasks,
                              urgentCount: urgentTasks.length,
                              totalCount: pendingTasks.length,
                            } 
                          })
                          const total = res?.tasks?.length ?? 0
                          const meta: GenerateTasksMetadata = res?.metadata ?? {}
                          const skipped = meta.skippedDuplicateCount ?? 0
                          const generated = meta.generatedCount ?? 0
                          if (total === 0) {
                            if (skipped > 0 && generated > 0) {
                              toast.info(`本次生成了 ${generated} 条建议，均与当前待办重复，未添加新任务。可先完成或关闭部分待办后再试。`)
                            } else {
                              toast.info('已刷新，当前无新任务。若刚点过「智能生成」且列表里已有待办，多半是本次建议与已有重复，可先完成或关闭部分待办后再试。')
                            }
                          } else {
                            toast.success(`成功生成 ${total} 个新任务！`)
                          }
                        } catch (error: any) {
                          console.error('生成任务失败:', error)
                          const errorMsg = error?.response?.data?.error || error?.message || '生成任务失败'
                          toast.error(errorMsg)
                        } finally {
                          setRefreshing(false)
                        }
                      }}
                      disabled={refreshing}
                      className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 shrink-0 ${refreshing ? 'animate-spin' : ''}`} />
                      {refreshing ? '生成中…(约 15–30 秒)' : '智能生成'}
                    </button>
                    <button
                      onClick={async () => {
                        if (!selectedStore) {
                          toast.warning('请先选择店铺')
                          return
                        }
                        if (result.data.totalCount === 0) {
                          toast.info('没有待办任务')
                          return
                        }
                        setCompletingAll(true)
                        try {
                          await completeAllTasks.mutateAsync(selectedStore.id)
                          await queryClient.invalidateQueries({ queryKey: ['tasks'] })
                          const updatedTasks = await refetchTasks()
                          const pendingTasks = (updatedTasks.data || []).filter((t: any) => t.status === 'pending')
                          const urgentTasks = pendingTasks.filter((t: any) => t.priority === 'urgent')
                          setResultForTool('assistant', { 
                            type: 'assistant', 
                            data: { 
                              message: `待办任务管理 (共 ${pendingTasks.length} 个)`,
                              tasks: pendingTasks,
                              urgentCount: urgentTasks.length,
                              totalCount: pendingTasks.length,
                            } 
                          })
                          toast.success('所有任务已完成！')
                        } catch (error: any) {
                          console.error('一键完成失败:', error)
                          const errorMsg = error?.response?.data?.error || error?.message || '一键完成失败'
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

                  {/* 统计信息 */}
                  {result.data.urgentCount > 0 && (
                    <div className="mb-3 p-2 bg-red-50 rounded-lg border border-red-200">
                      <p className="text-xs text-red-700">
                        <AlertCircle className="w-3 h-3 inline mr-1" />
                        <strong>{result.data.urgentCount} 个紧急任务</strong>需要优先处理
                      </p>
                    </div>
                  )}

                  {/* 任务列表 */}
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {result.data.tasks && result.data.tasks.length === 0 ? (
                      <div className="text-center py-8">
                        <Clock className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-600">还没有待办任务</p>
                        <p className="text-xs text-gray-400 mt-1">点击"智能生成"创建任务</p>
                      </div>
                    ) : (
                      result.data.tasks?.map((task: any) => (
                        <div
                          key={task.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border transition-all hover:shadow-sm ${
                            task.priority === 'urgent'
                              ? 'bg-red-50 border-red-200'
                              : 'bg-white border-gray-200'
                          }`}
                        >
                          {task.priority === 'urgent' ? (
                            <div className="p-1.5 bg-red-100 rounded shrink-0 mt-0.5">
                              <AlertCircle className="w-4 h-4 text-red-600" />
                            </div>
                          ) : (
                            <div className="p-1.5 bg-gray-100 rounded shrink-0 mt-0.5">
                              <CheckCircle2 className="w-4 h-4 text-gray-500" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold mb-1 ${
                              task.priority === 'urgent' ? 'text-red-900' : 'text-gray-900'
                            }`}>
                              {task.title}
                            </p>
                            {task.description && (
                              <p className="text-xs text-gray-600 leading-relaxed">
                                {task.description}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={async () => {
                              try {
                                await updateTask.mutateAsync({ id: task.id, status: 'completed' })
                                await queryClient.invalidateQueries({ queryKey: ['tasks'] })
                                const updatedTasks = await refetchTasks()
                                // 更新AI助手显示的任务列表
                                const pendingTasks = (updatedTasks.data || []).filter((t: any) => t.status === 'pending')
                                const urgentTasks = pendingTasks.filter((t: any) => t.priority === 'urgent')
                                setResultForTool('assistant', { 
                                  type: 'assistant', 
                                  data: { 
                                    message: `待办任务管理 (共 ${pendingTasks.length} 个)`,
                                    tasks: pendingTasks,
                                    urgentCount: urgentTasks.length,
                                    totalCount: pendingTasks.length,
                                  } 
                                })
                                toast.success('任务已完成！')
                              } catch (e) {
                                console.error('标记完成失败', e)
                                toast.error('操作失败，请重试')
                              }
                            }}
                            disabled={updateTask.isPending}
                            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors shrink-0 ${
                              task.priority === 'urgent'
                                ? 'bg-red-600 text-white hover:bg-red-700'
                                : 'bg-indigo-500 text-white hover:bg-indigo-600'
                            } disabled:opacity-50`}
                          >
                            ✓
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* 底部提示 */}
                  <div className="mt-3 p-2 bg-indigo-50 rounded-lg border border-indigo-200">
                    <p className="text-xs text-indigo-700">
                      💡 <strong>提示：</strong>所有任务都基于运营数据智能生成，包含详细的执行建议和量化预期效果
                    </p>
                  </div>
                </div>
              )}
            </div>
            {/* 全屏查看话术 */}
            {result?.type === 'script' && typeof result.data?.content === 'string' && resultFullScreen && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                onClick={() => setResultFullScreen(false)}
              >
                <div
                  className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between p-4 border-b">
                    <h3 className="font-semibold text-gray-900">{t('tools.resultTitleScriptFullScreen')}</h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const copyText = scriptNeedsTranslation && scriptTranslatedContent ? scriptTranslatedContent : result.data.content
                            await navigator.clipboard.writeText(copyText)
                            toast.success(t('tools.copyToClipboard'))
                          } catch {
                            toast.error(t('tools.copyFailed'))
                          }
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
                      {scriptNeedsTranslation && scriptTranslatedContent ? scriptTranslatedContent : result.data.content}
                    </pre>
                  </div>
                </div>
              </div>
            )}
        </div>
        )}
      </div>

      {/* 上传模态框（录屏分析页与素材上传共用） */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">{t('tools.uploadVideo')}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('tools.selectFile')}
                </label>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {selectedFile && (
                <div className="text-sm text-gray-600">
                  已选择: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowUploadModal(false)
                  setSelectedFile(null)
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleUpload}
                disabled={!selectedFile || createMaterial.isPending}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {createMaterial.isPending ? '上传中...' : '上传'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
