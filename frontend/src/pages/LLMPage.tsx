import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Sidebar from '../components/Sidebar'
import { getScriptLLMConfig, getLlmModes, setLlmModes, type LLMModeId } from '../services/ai'
import { useCurrentUser } from '../services/auth'
import { useToast } from '../contexts/ToastContext'
import {
  ListTodo,
  AlertTriangle,
  MessageSquare,
  Plus,
  CheckCircle2,
  XCircle,
  ExternalLink,
  FileText,
} from 'lucide-react'

type LLMTabId = 'todo' | 'anomaly' | 'script' | 'future'

/** 各选项卡对应的智能体偏好 key（异常分析与待办共用 todo） */
const TAB_TO_MODE_KEY: Record<LLMTabId, 'todo' | 'script' | null> = {
  todo: 'todo',
  anomaly: 'todo',
  script: 'script',
  future: null,
}

const TABS: { id: LLMTabId; label: string; icon: React.ReactNode; description: string; usedIn: string; detail: string }[] = [
  {
    id: 'todo',
    label: '智能待办生成',
    icon: <ListTodo className="w-5 h-5" />,
    description: '基于店铺最近 30 天数据、阶段、趋势与按日明细，一次性调用 LLM 生成待办列表（JSON），条数由 Coze 内置规则控制。',
    usedIn: '店铺管理 → 待处理任务 → 智能生成',
    detail: 'callLLMOnce；systemPrompt + userMessage 拼成一条发给 Coze，或走 OpenAI 兼容 messages。返回完整 JSON 后解析 tasks 数组，失败则规则兜底。',
  },
  {
    id: 'anomaly',
    label: '异常分析待办',
    icon: <AlertTriangle className="w-5 h-5" />,
    description: '系统检测到数据异常后，调用 LLM 针对异常生成 1～3 条可执行待办（扭转异常、优化指标）。',
    usedIn: '智能生成待办流程中（当存在异常时）',
    detail: 'callLLMOnce；输入为异常列表与店铺/类目/当前数据，输出 JSON tasks。未配置或失败返回空数组。',
  },
  {
    id: 'script',
    label: '话术生成（流式）',
    icon: <MessageSquare className="w-5 h-5" />,
    description: '根据商品、场景、风格等生成直播话术，以流式方式逐块返回，支持打字机效果。',
    usedIn: '执行工具 → 话术生成',
    detail: 'streamScriptFromLLM；Coze 为 stream_run 流式 SSE，OpenAI 兼容为 stream: true。',
  },
  {
    id: 'future',
    label: '预留扩展',
    icon: <Plus className="w-5 h-5" />,
    description: '后续可在此增加其他 LLM 模型或调用方式（如专用分析模型、多轮对话等）。',
    usedIn: '—',
    detail: '新增选项卡与对应路由/功能后，在此补充说明与入口。',
  },
]

export default function LLMPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  useCurrentUser()
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [activeTab, setActiveTab] = useState<LLMTabId>('todo')

  const { data: scriptConfig, isLoading: configLoading } = useQuery({
    queryKey: ['script-llm-config'],
    queryFn: getScriptLLMConfig,
    staleTime: 60_000,
  })
  const { data: llmModes, isLoading: modesLoading } = useQuery({
    queryKey: ['llm-modes'],
    queryFn: getLlmModes,
    staleTime: 30_000,
  })
  const setLlmModesMutation = useMutation({
    mutationFn: setLlmModes,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llm-modes'] })
      toast.success('智能体偏好已保存')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || '保存失败'
      toast.error(err?.response?.status === 403 ? '仅管理员可修改智能体偏好' : msg)
    },
  })

  const configured = scriptConfig?.configured ?? false

  const currentModeForTab = (tabId: LLMTabId): LLMModeId => {
    const key = TAB_TO_MODE_KEY[tabId]
    if (!key || !llmModes) return 'coze_agent'
    const v = key === 'todo' ? llmModes.currentTodo : llmModes.currentScript
    return (v === 'coze_agent' || v === 'openai' ? v : 'coze_agent') as LLMModeId
  }

  const handleModeChange = (tabId: LLMTabId, modeId: LLMModeId) => {
    const key = TAB_TO_MODE_KEY[tabId]
    if (!key) return
    setLlmModesMutation.mutate(key === 'todo' ? { todo: modeId } : { script: modeId })
  }

  return (
    <div className="h-screen min-h-0 bg-gray-50 flex overflow-hidden">
      <Sidebar
        isExpanded={sidebarExpanded}
        onToggle={setSidebarExpanded}
      />

      <div className="flex-1 flex flex-col min-h-0 transition-all duration-300">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">LLM 调用方式</h1>
              <p className="text-sm text-gray-500 mt-1">当前与 LLM 的多种调用方式及使用位置，后续可扩展更多模型</p>
            </div>
            <div className="flex items-center gap-3">
              {configLoading ? (
                <span className="text-sm text-gray-500">检查配置…</span>
              ) : configured ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-green-700 bg-green-50 px-3 py-1.5 rounded-lg">
                  <CheckCircle2 className="w-4 h-4" />
                  LLM 已配置
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg">
                  <XCircle className="w-4 h-4" />
                  未配置（管理员可配置）
                </span>
              )}
              <button
                type="button"
                onClick={() => navigate('/admin')}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                前往配置
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            {/* 选项卡导航 */}
            <div className="flex flex-wrap gap-1 p-1 bg-gray-100 rounded-xl mb-6">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 当前选项卡内容 */}
            {TABS.map((tab) => (
              <div
                key={tab.id}
                className={`rounded-xl border bg-white p-6 ${activeTab === tab.id ? 'block' : 'hidden'}`}
              >
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-2">
                  {tab.icon}
                  {tab.label}
                </h2>
                <p className="text-gray-600 mb-4">{tab.description}</p>

                {/* 智能体及版本选择（待办/异常/话术有对应偏好，预留扩展无）— 始终展示，避免因接口未返回而看不到选择按钮 */}
                {TAB_TO_MODE_KEY[tab.id] && (
                  <div className="mb-5 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">智能体及版本</h3>
                    {modesLoading ? (
                      <p className="text-sm text-gray-500">加载中…</p>
                    ) : (
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                          <label className="text-sm text-gray-600">调用方式</label>
                          <select
                            value={currentModeForTab(tab.id)}
                            onChange={(e) => handleModeChange(tab.id, e.target.value as LLMModeId)}
                            disabled={setLlmModesMutation.isPending}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60 min-w-[220px]"
                          >
                            <option value="coze_agent">Coze Agent</option>
                            <option value="openai">OpenAI 兼容接口</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-sm text-gray-600">版本</label>
                          <select
                            defaultValue="default"
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[120px]"
                          >
                            <option value="default">当前默认</option>
                          </select>
                        </div>
                        {llmModes?.effectiveMode != null && (
                          <span className="text-xs text-gray-500">
                            当前生效：{llmModes.modes.find((m) => m.id === llmModes.effectiveMode)?.label ?? llmModes.effectiveMode}
                          </span>
                        )}
                      </div>
                    )}
                    {!modesLoading && (
                      <p className="text-xs text-gray-500 mt-2">实际生效方式由「LLM 配置」中的 API 地址决定。</p>
                    )}
                  </div>
                )}

                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-gray-500 font-medium">使用位置</dt>
                    <dd className="text-gray-800 mt-0.5">{tab.usedIn}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 font-medium">实现要点</dt>
                    <dd className="text-gray-800 mt-0.5">{tab.detail}</dd>
                  </div>
                </dl>
                {tab.id === 'todo' && (
                  <button
                    type="button"
                    onClick={() => navigate('/')}
                    className="mt-4 inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm"
                  >
                    <ExternalLink className="w-4 h-4" />
                    前往店铺管理 · 智能生成
                  </button>
                )}
                {tab.id === 'script' && (
                  <button
                    type="button"
                    onClick={() => navigate('/tools')}
                    className="mt-4 inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm"
                  >
                    <ExternalLink className="w-4 h-4" />
                    前往执行工具 · 话术生成
                  </button>
                )}
              </div>
            ))}

            <div className="mt-6 flex items-center gap-2 text-sm text-gray-500">
              <FileText className="w-4 h-4 shrink-0" />
              <span>详细流程与配置见文档：<code className="bg-gray-100 px-1 rounded">docs/LLM交互流程说明.md</code></span>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
