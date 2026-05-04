import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppLayout from '../components/AppLayout'
import CustomSelect from '../components/CustomSelect'
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

const TABS: { id: LLMTabId; labelKey: string; icon: React.ReactNode; descriptionKey: string; usedInKey: string; detailKey: string }[] = [
  {
    id: 'todo',
    labelKey: 'llmPage.tabs.todo.label',
    icon: <ListTodo className="w-5 h-5" />,
    descriptionKey: 'llmPage.tabs.todo.desc',
    usedInKey: 'llmPage.tabs.todo.usedIn',
    detailKey: 'llmPage.tabs.todo.detail',
  },
  {
    id: 'anomaly',
    labelKey: 'llmPage.tabs.anomaly.label',
    icon: <AlertTriangle className="w-5 h-5" />,
    descriptionKey: 'llmPage.tabs.anomaly.desc',
    usedInKey: 'llmPage.tabs.anomaly.usedIn',
    detailKey: 'llmPage.tabs.anomaly.detail',
  },
  {
    id: 'script',
    labelKey: 'llmPage.tabs.script.label',
    icon: <MessageSquare className="w-5 h-5" />,
    descriptionKey: 'llmPage.tabs.script.desc',
    usedInKey: 'llmPage.tabs.script.usedIn',
    detailKey: 'llmPage.tabs.script.detail',
  },
  {
    id: 'future',
    labelKey: 'llmPage.tabs.future.label',
    icon: <Plus className="w-5 h-5" />,
    descriptionKey: 'llmPage.tabs.future.desc',
    usedInKey: 'llmPage.tabs.future.usedIn',
    detailKey: 'llmPage.tabs.future.detail',
  },
]

export default function LLMPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  useCurrentUser()

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
      toast.success(t('llmPage.modesSaved', { defaultValue: 'Preferences saved' }))
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string }; status?: number }; message?: string }
      const msg = error.response?.data?.error || error.message || t('common.saveFailed', { defaultValue: 'Save failed' })
      toast.error(error.response?.status === 403 ? t('llmPage.onlyAdminCanEdit', { defaultValue: 'Only admin can edit preferences' }) : msg)
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

  const headerExtra = (
    <div className="flex items-center gap-3">
      {configLoading ? (
        <span className="text-sm text-slate-500">{t('llmPage.checkingConfig', { defaultValue: 'Checking…' })}</span>
      ) : configured ? (
        <span className="inline-flex items-center gap-1.5 text-sm text-green-700 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
          <CheckCircle2 className="w-4 h-4" />
          {t('llmPage.configured', { defaultValue: 'Configured' })}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-sm text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
          <XCircle className="w-4 h-4" />
          {t('llmPage.notConfigured', { defaultValue: 'Not configured' })}
        </span>
      )}
      <button
        type="button"
        onClick={() => navigate('/admin/permissions?tab=llm')}
        className="text-sm text-primary-600 hover:text-primary-800 font-medium"
      >
        {t('llmPage.goToConfig', { defaultValue: 'Go to config' })}
      </button>
    </div>
  )

  return (
    <AppLayout
      title={t('llmPage.title', { defaultValue: 'LLM 调用方式' })}
      subtitle={t('llmPage.subtitle', { defaultValue: '配置系统调用 LLM 的方式及使用场景，可扩展更多模型' })}
      headerExtra={headerExtra}
    >
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* 智能体配置列表：直接展开渲染所有项 */}
            {TABS.map((tab) => (
              <div
                key={tab.id}
                className="card p-6 sm:p-8 transition-transform duration-300"
              >
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2.5 mb-3">
                  <span className="text-primary-600 bg-primary-50 p-2 rounded-lg">
                    {tab.icon}
                  </span>
                  {t(tab.labelKey)}
                </h2>
                <p className="text-slate-500 text-sm mb-6 pb-6 border-b border-slate-100">{t(tab.descriptionKey)}</p>

                {/* 智能体及版本选择（待办/异常/话术有对应偏好，预留扩展无）— 始终展示，避免因接口未返回而看不到选择按钮 */}
                {TAB_TO_MODE_KEY[tab.id] && (
                  <div className="mb-6 p-5 bg-slate-50/50 rounded-xl border border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">{t('llmPage.agentAndVersion', { defaultValue: 'Agent & Version' })}</h3>
                    {modesLoading ? (
                      <p className="text-sm text-slate-500 animate-pulse">{t('common.loading')}</p>
                    ) : (
                      <div className="flex flex-wrap items-center gap-6">
                        <div className="w-56 cursor-pointer">
                          <label className="block text-xs font-medium text-slate-500 mb-1.5">{t('llmPage.callingMethod', { defaultValue: 'Calling method' })}</label>
                          <CustomSelect
                            value={currentModeForTab(tab.id)}
                            onChange={(val) => handleModeChange(tab.id, val as LLMModeId)}
                            disabled={setLlmModesMutation.isPending}
                            options={[
                              { value: 'coze_agent', label: 'Coze Agent' },
                              { value: 'openai', label: t('llmPage.openaiCompatible', { defaultValue: 'OpenAI-compatible API' }) }
                            ]}
                          />
                        </div>
                        <div className="w-40 cursor-pointer">
                          <label className="block text-xs font-medium text-slate-500 mb-1.5">{t('llmPage.version', { defaultValue: 'Version' })}</label>
                          <CustomSelect
                            value="default"
                            onChange={() => {}}
                            options={[
                              { value: 'default', label: t('llmPage.currentDefault', { defaultValue: 'Current default' }) }
                            ]}
                          />
                        </div>
                        {llmModes?.effectiveMode != null && (
                          <span className="text-xs text-slate-500">
                            当前生效：{llmModes.modes.find((m) => m.id === llmModes.effectiveMode)?.label ?? llmModes.effectiveMode}
                          </span>
                        )}
                      </div>
                    )}
                    {!modesLoading && (
                      <p className="text-xs text-slate-500 mt-2">{t('llmPage.effectiveMethodHint', { defaultValue: 'The effective method is determined by the API URL in LLM settings.' })}</p>
                    )}
                  </div>
                )}

                <dl className="space-y-4 text-sm mt-2">
                  <div className="flex gap-4">
                    <dt className="text-slate-400 font-medium w-24 shrink-0">{t('llmPage.usedIn', { defaultValue: 'Used in' })}</dt>
                    <dd className="text-slate-700 font-medium">{t(tab.usedInKey)}</dd>
                  </div>
                  <div className="flex gap-4">
                    <dt className="text-slate-400 font-medium w-24 shrink-0">{t('llmPage.implementation', { defaultValue: 'Implementation' })}</dt>
                    <dd className="text-slate-700 leading-relaxed">{t(tab.detailKey)}</dd>
                  </div>
                </dl>
                {tab.id === 'todo' && (
                  <button
                    type="button"
                    onClick={() => navigate('/')}
                    className="mt-6 inline-flex items-center gap-1.5 text-primary-600 hover:text-primary-800 font-medium text-sm transition-colors decoration-primary-300 hover:underline underline-offset-4"
                  >
                    <ExternalLink className="w-4 h-4" />
                    {t('llmPage.goToStoreManagementSmartGenerate', { defaultValue: 'Go to Store Management · Smart Generate' })}
                  </button>
                )}
                {tab.id === 'script' && (
                  <button
                    type="button"
                    onClick={() => navigate('/tools')}
                    className="mt-6 inline-flex items-center gap-1.5 text-primary-600 hover:text-primary-800 font-medium text-sm transition-colors decoration-primary-300 hover:underline underline-offset-4"
                  >
                    <ExternalLink className="w-4 h-4" />
                    前往执行工具 · 话术生成
                  </button>
                )}
              </div>
            ))}

          </div>
          <div className="mt-6 flex items-center gap-2.5 text-sm text-slate-500">
            <FileText className="w-4 h-4 text-slate-400 shrink-0" />
            <span>详细流程与配置见文档：<code className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded shadow-sm font-mono text-xs">docs/LLM交互流程说明.md</code></span>
          </div>
    </AppLayout>
  )
}
