import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, MessageSquare, MessageCircle, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  fetchFeedbackList,
  updateFeedbackStatus,
  replyFeedback,
  deleteFeedback,
  type FeedbackItem,
  type FeedbackStatus,
} from '../services/feedback'
import CustomSelect from '../components/CustomSelect'
import { useToast } from '../contexts/ToastContext'
import AppLayout from '../components/AppLayout'
import { GlassButton } from '../components/ui/GlassButton'
import { GlassTextarea } from '../components/ui/GlassTextarea'

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

  const headerExtra = (
    <GlassButton
      type="button"
      onClick={() => refetch()}
      disabled={isLoading}
      variant="secondary"
      className="!py-1.5"
    >
      <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
      {t('feedbackManage.refresh')}
    </GlassButton>
  )

  return (
    <AppLayout
      title={t('feedbackManage.title')}
      subtitle={t('feedbackManage.subtitle')}
      headerExtra={headerExtra}
    >
      <div className="space-y-6">
        <div className="card">
          <h2 className="text-sm font-medium text-slate-700 mb-3">{t('feedbackManage.filters')}</h2>
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t('feedbackManage.category')}</label>
              <div className="w-36">
                <CustomSelect
                  value={category}
                  onChange={setCategory}
                  options={CATEGORY_OPTIONS.map((o) => ({
                    value: o.value,
                    label: t(o.labelKey)
                  }))}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t('feedbackManage.status')}</label>
              <div className="w-36">
                <CustomSelect
                  value={status}
                  onChange={setStatus}
                  options={STATUS_OPTIONS.map((o) => ({
                    value: o.value,
                    label: t(o.labelKey)
                  }))}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="card min-h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-slate-500">
              <RefreshCw className="w-8 h-8 animate-spin mr-2" />
              {t('common.loading')}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-600">
              <p className="font-medium mb-2">加载失败</p>
              <p className="text-sm text-slate-500 mb-4">
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
                className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50"
              >
                {t('feedbackManage.refresh')}
              </button>
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <MessageSquare className="w-16 h-16 mb-4 opacity-50" />
              <p>{t('feedbackManage.noFeedback')}</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100/50">
              {list.map((item: FeedbackItem) => (
                <li key={item.id} className="p-4 hover:bg-slate-50/50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {typeLabel(item.type)}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {statusLabel(item.status)}
                        </span>
                      </div>
                      <h3 className="font-medium text-slate-900 truncate">{item.subject}</h3>
                      <p className="text-sm text-slate-600 mt-1 line-clamp-2">{item.content}</p>
                      {getImageUrls(item).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {getImageUrls(item).map((url) => (
                            <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block">
                              <img src={url} alt="" className="w-12 h-12 object-cover rounded border border-slate-200 hover:opacity-90" />
                            </a>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                        <span>{t('feedbackManage.user')}: {item.userName || item.userEmail || '-'}</span>
                        {item.contact && (
                          <span>{t('feedbackManage.contact')}: {item.contact}</span>
                        )}
                        <span>{t('feedbackManage.createdAt')}: {new Date(item.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0 flex-wrap">
                      <GlassButton
                        type="button"
                        onClick={() => { setReplyingId(item.id); setReplyText(item.replyContent || '') }}
                        disabled={replyMutation.isPending}
                        variant="primary"
                        className="!px-2.5 !py-1 !text-xs !bg-primary-50 !text-primary-700 !border-primary-200 hover:!bg-primary-100 gap-1"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        {t('feedbackManage.reply')}
                      </GlassButton>
                      {item.status !== 'read' && (
                        <GlassButton
                          type="button"
                          onClick={() => updateStatus.mutate({ id: item.id, status: 'read' })}
                          disabled={updateStatus.isPending}
                          variant="secondary"
                          className="!px-2.5 !py-1 !text-xs"
                        >
                          {t('feedbackManage.markRead')}
                        </GlassButton>
                      )}
                      {item.status !== 'replied' && (
                        <GlassButton
                          type="button"
                          onClick={() => updateStatus.mutate({ id: item.id, status: 'replied' })}
                          disabled={updateStatus.isPending}
                          variant="secondary"
                          className="!px-2.5 !py-1 !text-xs"
                        >
                          {t('feedbackManage.markReplied')}
                        </GlassButton>
                      )}
                      <GlassButton
                        type="button"
                        onClick={() => handleDelete(item)}
                        disabled={deleteMutation.isPending}
                        variant="danger"
                        className="!px-2.5 !py-1 !text-xs gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {t('feedbackManage.delete')}
                      </GlassButton>
                    </div>
                  </div>
                  {item.replyContent && (
                    <div className="mt-3 p-3 bg-green-50/80 rounded-lg border border-green-100">
                      <p className="text-xs text-green-700 font-medium mb-1">
                        {t('feedbackManage.replyContent')} {item.replyAt && `· ${new Date(item.replyAt).toLocaleString()}`}
                      </p>
                      <pre className="text-sm text-slate-700 whitespace-pre-wrap">{item.replyContent}</pre>
                    </div>
                  )}
                  <details className="mt-2">
                    <summary className="text-xs text-primary-600 cursor-pointer hover:underline">
                      {t('feedbackManage.viewFull')}
                    </summary>
                    <pre className="mt-2 p-3 bg-slate-50 rounded text-sm text-slate-700 whitespace-pre-wrap">
                      {item.content}
                    </pre>
                    {getImageUrls(item).length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {getImageUrls(item).map((url) => (
                          <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                            <img src={url} alt="" className="max-w-[200px] max-h-[200px] object-contain rounded border border-slate-200" />
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
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setReplyingId(null)}>
            <div className="bg-white/90 backdrop-blur-2xl border border-white/40 rounded-2xl shadow-2xl max-w-xl w-full p-6 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <h3 className="font-bold text-slate-800 mb-6">{t('feedbackManage.reply')}</h3>
              <GlassTextarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder={t('feedbackManage.replyPlaceholder')}
                className="w-full min-h-[120px] resize-y"
                autoFocus
              />
              <div className="flex justify-end gap-3 mt-6">
                <GlassButton
                  type="button"
                  onClick={() => { setReplyingId(null); setReplyText('') }}
                  variant="secondary"
                >
                  {t('common.cancel')}
                </GlassButton>
                <GlassButton
                  type="button"
                  disabled={!replyText.trim() || replyMutation.isPending}
                  onClick={() => replyMutation.mutate({ id: replyingId, content: replyText.trim() })}
                  variant="primary"
                >
                  {replyMutation.isPending ? t('common.loading') : t('common.save')}
                </GlassButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
