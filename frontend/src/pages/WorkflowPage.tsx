import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Sidebar from '../components/Sidebar'
import { useLayoutPreferences } from '../hooks/useLayoutPreferences'
import { listRounds, getRoundDetail, triggerWorkflow, getOutputFileContent, type RoundSummary, type RoundDetail } from '../services/workflow'
import { GitBranch, Play, Loader2, ChevronRight, FileText, X } from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  planner: '规划师',
  industry_expert: '行业专家',
  senior_user: '资深用户',
  engineer: '程序工程师',
  novice: '小白',
}

export default function WorkflowPage() {
  try {
    return <WorkflowPageContent />
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    console.error('WorkflowPage 渲染错误:', error)
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">工作流页面加载失败</h1>
          <p className="text-gray-700 mb-4">{message}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            刷新页面
          </button>
        </div>
      </div>
    )
  }
}

function WorkflowPageContent() {
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ roundLabel: string; path: string; content: string; isJson?: boolean } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  
  const { preferences } = useLayoutPreferences()
  const queryClient = useQueryClient()

  const handleOpenFile = async (roundLabel: string, filePath: string) => {
    setPreviewError(null)
    setPreviewLoading(true)
    setPreview(null)
    try {
      const res = await getOutputFileContent(roundLabel, filePath)
      if (res && typeof res === 'object' && 'content' in res && typeof (res as { content: string }).content === 'string') {
        setPreview({ roundLabel, path: filePath, content: (res as { content: string }).content })
      } else {
        setPreview({
          roundLabel,
          path: filePath,
          content: JSON.stringify(res, null, 2),
          isJson: true,
        })
      }
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'response' in e && (e as { response?: { data?: { error?: string } } }).response?.data?.error
      setPreviewError((typeof msg === 'string' ? msg : null) ?? '加载失败')
    } finally {
      setPreviewLoading(false)
    }
  }

  const { data: rounds = [], isLoading: roundsLoading, error: roundsError } = useQuery({
    queryKey: ['workflow', 'rounds'],
    queryFn: async () => {
      try {
        return await listRounds()
      } catch (e) {
        console.error('获取轮次列表失败:', e)
        if (e && typeof e === 'object' && 'response' in e) {
          const response = (e as { response?: { status?: number } }).response
          if (response?.status === 403 || response?.status === 401) {
            return []
          }
        }
        throw e
      }
    },
    retry: false,
  })

  const { data: roundDetail, isLoading: detailLoading, error: detailError } = useQuery({
    queryKey: ['workflow', 'round', selectedRoundId],
    queryFn: async () => {
      try {
        return await getRoundDetail(selectedRoundId!)
      } catch (e) {
        console.error('获取轮次详情失败:', e)
        throw e
      }
    },
    enabled: !!selectedRoundId,
    retry: false,
  })

  const trigger = useMutation({
    mutationFn: triggerWorkflow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', 'rounds'] })
      queryClient.invalidateQueries({ queryKey: ['workflow', 'round', selectedRoundId] })
    },
  })

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
              <h1 className="text-xl font-bold text-gray-900">工作流 / 迭代</h1>
              <p className="text-sm text-gray-500 mt-1">五角色协同自动化闭环，查看轮次与触发新轮</p>
            </div>
            <button
              onClick={() => trigger.mutate({})}
              disabled={trigger.isPending}
              className="btn-primary flex items-center gap-2"
            >
              {trigger.isPending ? <Loader2 className="w-4 h-5 animate-spin" /> : <Play className="w-4 h-5" />}
              {trigger.isPending ? '执行中...' : '立即执行一轮'}
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <div className="card">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  {preferences?.showIcons && <GitBranch className="w-5 h-5" />}
                  迭代轮次
                </h2>
                {roundsLoading ? (
                  <div className="text-gray-500 py-4">加载中...</div>
                ) : roundsError ? (
                  <div className="text-red-600 py-4 text-sm">加载失败：{roundsError instanceof Error ? roundsError.message : '未知错误'}</div>
                ) : rounds.length === 0 ? (
                  <div className="text-gray-500 py-4">暂无轮次，点击「立即执行一轮」创建</div>
                ) : (
                  <ul className="space-y-2">
                    {rounds.map((r: RoundSummary) => (
                      <li key={r.roundId}>
                        <button
                          onClick={() => setSelectedRoundId(r.roundId)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left ${
                            selectedRoundId === r.roundId ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700'
                          }`}
                        >
                          <span className="font-medium">{r.roundLabel}</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="lg:col-span-2">
              <div className="card">
                {!selectedRoundId ? (
                  <div className="text-gray-500 py-12 text-center">请从左侧选择一轮查看详情</div>
                ) : detailLoading ? (
                  <div className="text-gray-500 py-12 text-center">加载中...</div>
                ) : detailError ? (
                  <div className="text-red-600 py-12 text-center">加载失败：{detailError instanceof Error ? detailError.message : '未知错误'}</div>
                ) : roundDetail ? (
                  <RoundDetailView detail={roundDetail} onFileClick={handleOpenFile} />
                ) : (
                  <div className="text-gray-500 py-12 text-center">加载失败</div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* 文档预览弹窗（带鉴权，避免直接链接未登录） */}
      {(previewLoading || preview || previewError) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => { if (!previewLoading) { setPreview(null); setPreviewError(null) } }}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <span className="font-medium text-gray-900 truncate">{preview ? preview.path : '加载中...'}</span>
              <button type="button" onClick={() => { setPreview(null); setPreviewError(null) }} className="p-1 hover:bg-gray-100 rounded" aria-label="关闭">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 min-h-0">
              {previewLoading && <div className="text-gray-500">加载中...</div>}
              {previewError && <div className="text-red-600">{previewError}</div>}
              {preview && (
                <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono bg-gray-50 p-4 rounded border border-gray-200">
                  {preview.content}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RoundDetailView({ detail, onFileClick }: { detail: RoundDetail; onFileClick: (roundLabel: string, path: string) => void }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{detail.roundLabel}</h2>
      <p className="text-sm text-gray-500 mb-4">轮次 ID：{detail.roundId}</p>
      <div className="space-y-4">
        <h3 className="font-medium text-gray-800">角色产出</h3>
        {(detail.manifest?.entries || []).map((entry) => (
          <div key={entry.roleId} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-gray-500" />
              <span className="font-medium">{ROLE_LABELS[entry.roleId] || entry.roleId}</span>
            </div>
            {entry.summary && <p className="text-sm text-gray-600 mb-2">{entry.summary}</p>}
            <ul className="text-sm text-gray-600 space-y-1">
              {entry.files.map((f) => (
                <li key={f}>
                  <button
                    type="button"
                    onClick={() => onFileClick(detail.roundLabel, f)}
                    className="text-blue-600 hover:underline text-left"
                  >
                    {f}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-6 pt-4 border-t border-gray-200">
        <h3 className="font-medium text-gray-800 mb-2">检查点状态</h3>
        <ul className="text-sm space-y-1">
          {(detail.checkpoints || []).map((cp) => (
            <li key={cp.role_id}>
              <span className="text-gray-700">{ROLE_LABELS[cp.role_id] || cp.role_id}</span>
              <span className={cp.status === 'completed' ? ' text-green-600' : ' text-amber-600'}> · {cp.status}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
