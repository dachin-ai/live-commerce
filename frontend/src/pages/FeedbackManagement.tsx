import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, MessageSquare, MessageCircle, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  fetchFeedbackList,
  updateFeedbackStatus,
  replyFeedback,
  deleteFeedback,
  type FeedbackItem,
  type FeedbackStatus,
} from '../services/feedback'
import { useToast } from '../contexts/ToastContext'

const CATEGORY_OPTIONS = [
  { value: 'all', labelKey: 'feedbackManage.categoryAll' },
  { value: 'problem', labelKey: 'feedback.typeProblem' },
  { value: 'feature', labelKey: 'feedback.typeFeature' },
  { value: 'other', labelKey: 'feedback.typeOther' },
]
const STATUS_OPTIONS = [
  { value: 'all', labelKey: 'feedbackManage.statusAll' },
  { value: 'pending', labelKey: 'feedbackManage.statusPending' },
  { value: 'read', labelKey: 'feedbackManage.statusRead' },
  { value: 'replied', labelKey: 'feedbackManage.statusReplied' },
]

export default function FeedbackManagement() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('all')
  const [replyingId, setReplyingId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')

  const { data: list = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['feedback', category, status],
    queryFn: () => fetchFeedbackList(category, status),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: FeedbackStatus }) =>
      updateFeedbackStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback'] })
      toast.success(t('common.save'))
    },
    onError: () => toast.error(t('feedback.submitFailed')),
  })

  const replyMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => replyFeedback(id, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback'] })
      setReplyingId(null)
      setReplyText('')
      toast.success(t('feedbackManage.replySuccess'))
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      const msg = error.response?.data?.error || error.message || t('feedback.submitFailed')
      toast.error(msg)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFeedback(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback'] })
      toast.success(t('common.delete'))
    },
    onError: () => toast.error(t('feedback.submitFailed')),
  })

  const handleDelete = (item: FeedbackItem) => {
    if (!window.confirm(t('feedbackManage.confirmDelete'))) return
    deleteMutation.mutate(item.id)
  }

  const typeLabel = (type: string) => {
    if (type === 'problem') return t('feedback.typeProblem')
    if (type === 'feature') return t('feedback.typeFeature')
    return t('feedback.typeOther')
  }
  const statusLabel = (s: string) => {
    if (s === 'pending') return t('feedbackManage.statusPending')
    if (s === 'read') return t('feedbackManage.statusRead')
    return t('feedbackManage.statusReplied')
  }

  const getImageUrls = (item: FeedbackItem): string[] => {
    const v = item.imageUrls
    if (Array.isArray(v)) return v
    if (typeof v === 'string' && v) {
      try { return JSON.parse(v) } catch { return [] }
    }
    return []
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-200 rounded-lg"
              aria-label={t('common.back')}
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t('feedbackManage.title')}</h1>
              <p className="text-sm text-gray-500">{t('feedbackManage.subtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            {t('feedbackManage.refresh')}
          </button>
        </div>

        <div className="mb-6 p-4 bg-white rounded-xl border border-gray-200">
          <h2 className="text-sm font-medium text-gray-700 mb-3">{t('feedbackManage.filters')}</h2>
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('feedbackManage.category')}</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('feedbackManage.status')}</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 min-h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-gray-500">
              <RefreshCw className="w-8 h-8 animate-spin mr-2" />
              {t('common.loading')}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-600">
              <p className="font-medium mb-2">加载失败</p>
              <p className="text-sm text-gray-500 mb-4">
                {(() => {
                  const err = error as { response?: { status?: number; data?: { error?: string } } } | Error | null
                  const response = (err as { response?: { status?: number; data?: { error?: string } } })?.response
                  if (response?.status === 403) {
                    return '仅管理员/经理可查看反馈列表，请使用对应账号登录。'
                  }
                  return response?.data?.error || (err as Error)?.message || '请稍后重试'
                })()}
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                {t('feedbackManage.refresh')}
              </button>
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <MessageSquare className="w-16 h-16 text-gray-300 mb-4" />
              <p>{t('feedbackManage.noFeedback')}</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {list.map((item: FeedbackItem) => (
                <li key={item.id} className="p-4 hover:bg-gray-50/50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                          {typeLabel(item.type)}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                          {statusLabel(item.status)}
                        </span>
                      </div>
                      <h3 className="font-medium text-gray-900 truncate">{item.subject}</h3>
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">{item.content}</p>
                      {getImageUrls(item).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {getImageUrls(item).map((url) => (
                            <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block">
                              <img src={url} alt="" className="w-12 h-12 object-cover rounded border border-gray-200 hover:opacity-90" />
                            </a>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span>{t('feedbackManage.user')}: {item.userName || item.userEmail || '-'}</span>
                        {item.contact && (
                          <span>{t('feedbackManage.contact')}: {item.contact}</span>
                        )}
                        <span>{t('feedbackManage.createdAt')}: {new Date(item.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0 flex-wrap">
                      <button
                        type="button"
                        onClick={() => { setReplyingId(item.id); setReplyText(item.replyContent || '') }}
                        disabled={replyMutation.isPending}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-blue-200 text-blue-700 hover:bg-blue-50"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        {t('feedbackManage.reply')}
                      </button>
                      {item.status !== 'read' && (
                        <button
                          type="button"
                          onClick={() => updateStatus.mutate({ id: item.id, status: 'read' })}
                          disabled={updateStatus.isPending}
                          className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100"
                        >
                          {t('feedbackManage.markRead')}
                        </button>
                      )}
                      {item.status !== 'replied' && (
                        <button
                          type="button"
                          onClick={() => updateStatus.mutate({ id: item.id, status: 'replied' })}
                          disabled={updateStatus.isPending}
                          className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100"
                        >
                          {t('feedbackManage.markReplied')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        disabled={deleteMutation.isPending}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {t('feedbackManage.delete')}
                      </button>
                    </div>
                  </div>
                  {item.replyContent && (
                    <div className="mt-3 p-3 bg-green-50/80 rounded-lg border border-green-100">
                      <p className="text-xs text-green-700 font-medium mb-1">
                        {t('feedbackManage.replyContent')} {item.replyAt && `· ${new Date(item.replyAt).toLocaleString()}`}
                      </p>
                      <pre className="text-sm text-gray-700 whitespace-pre-wrap">{item.replyContent}</pre>
                    </div>
                  )}
                  <details className="mt-2">
                    <summary className="text-xs text-blue-600 cursor-pointer hover:underline">
                      {t('feedbackManage.viewFull')}
                    </summary>
                    <pre className="mt-2 p-3 bg-gray-50 rounded text-sm text-gray-700 whitespace-pre-wrap">
                      {item.content}
                    </pre>
                    {getImageUrls(item).length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {getImageUrls(item).map((url) => (
                          <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                            <img src={url} alt="" className="max-w-[200px] max-h-[200px] object-contain rounded border border-gray-200" />
                          </a>
                        ))}
                      </div>
                    )}
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 回复弹窗 */}
        {replyingId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setReplyingId(null)}>
            <div className="bg-white rounded-xl shadow-xl max-w-xl w-full p-5" onClick={e => e.stopPropagation()}>
              <h3 className="font-medium text-gray-900 mb-3">{t('feedbackManage.reply')}</h3>
              <textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder={t('feedbackManage.replyPlaceholder')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[120px] resize-y"
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => { setReplyingId(null); setReplyText('') }}
                  className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  disabled={!replyText.trim() || replyMutation.isPending}
                  onClick={() => replyMutation.mutate({ id: replyingId, content: replyText.trim() })}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {replyMutation.isPending ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
