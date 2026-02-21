import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Mail, FileText, MessageCircle, Bell, Sparkles, Bug, Rocket } from 'lucide-react'
import { useVersionLogs } from '../services/version-logs'
import { useMessages, useMarkMessageRead, useMarkAllMessagesRead, useUnreadCount } from '../services/messages'
import { useToast } from '../contexts/ToastContext'

type Tab = 'all' | 'version' | 'feedback_reply' | 'system'

export default function MessageCenter() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('all')

  const { data: versionLogs = [], isLoading: versionLoading } = useVersionLogs(50)
  const { data: messages = [], isLoading: messagesLoading } = useMessages(
    tab === 'version' ? undefined : tab === 'all' ? undefined : tab
  )
  const markRead = useMarkMessageRead()
  const markAllRead = useMarkAllMessagesRead()
  const { data: unreadCount = 0 } = useUnreadCount()

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => toast.success(t('messageCenter.markAllReadSuccess')),
      onError: (err: any) => toast.error(err?.response?.data?.error || t('feedback.submitFailed')),
    })
  }

  const versionAsItems = useMemo(
    () =>
      versionLogs.map((log) => ({
        id: `version-${log.id}`,
        type: 'version' as const,
        title: log.title,
        content: log.content,
        createdAt: log.createdAt,
        version: log.version,
        versionType: log.type,
        readAt: null,
        linkUrl: null,
      })),
    [versionLogs]
  )

  const mergedList = useMemo(() => {
    if (tab === 'version') return versionAsItems
    if (tab === 'feedback_reply' || tab === 'system') {
      return messages.map((m) => ({
        id: m.id,
        type: m.type as 'feedback_reply' | 'system',
        title: m.title,
        content: m.content,
        createdAt: m.createdAt,
        readAt: m.readAt,
        linkUrl: m.linkUrl,
      }))
    }
    const list = [
      ...versionAsItems.map((v) => ({ ...v, _sort: new Date(v.createdAt).getTime() })),
      ...messages.map((m) => ({
        id: m.id,
        type: m.type as 'feedback_reply' | 'system',
        title: m.title,
        content: m.content,
        createdAt: m.createdAt,
        readAt: m.readAt,
        linkUrl: m.linkUrl,
        _sort: new Date(m.createdAt).getTime(),
      })),
    ]
    list.sort((a, b) => (b as any)._sort - (a as any)._sort)
    return list.map(({ _sort, ...x }) => x)
  }, [tab, versionAsItems, messages])

  const isLoading = tab === 'all' ? versionLoading || messagesLoading : tab === 'version' ? versionLoading : messagesLoading

  const getIcon = (type: string, versionType?: string) => {
    if (type === 'version') {
      switch (versionType) {
        case 'feature': return Sparkles
        case 'bugfix': return Bug
        case 'release': return Rocket
        default: return FileText
      }
    }
    if (type === 'feedback_reply') return MessageCircle
    return Bell
  }

  const getColor = (type: string, versionType?: string) => {
    if (type === 'version') {
      switch (versionType) {
        case 'feature': return 'bg-blue-100 text-blue-600'
        case 'bugfix': return 'bg-red-100 text-red-600'
        case 'release': return 'bg-green-100 text-green-600'
        default: return 'bg-gray-100 text-gray-600'
      }
    }
    if (type === 'feedback_reply') return 'bg-green-100 text-green-600'
    return 'bg-gray-100 text-gray-600'
  }

  const tabs: { key: Tab; labelKey: string }[] = [
    { key: 'all', labelKey: 'messageCenter.tabAll' },
    { key: 'version', labelKey: 'messageCenter.tabVersion' },
    { key: 'feedback_reply', labelKey: 'messageCenter.tabFeedbackReply' },
    { key: 'system', labelKey: 'messageCenter.tabSystem' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto p-6">
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
            <Mail className="w-8 h-8 text-gray-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t('messageCenter.title')}</h1>
              <p className="text-sm text-gray-500">{t('messageCenter.subtitle')}</p>
            </div>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={markAllRead.isPending}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              {markAllRead.isPending ? t('common.loading') : t('messageCenter.markAllRead')}
            </button>
          )}
        </div>

        <div className="flex gap-2 mb-6 border-b border-gray-200">
          {tabs.map(({ key, labelKey }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 min-h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-gray-500">{t('common.loading')}</div>
          ) : mergedList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <Mail className="w-16 h-16 text-gray-300 mb-4" />
              <p>{t('messageCenter.noMessages')}</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {mergedList.map((item: any) => {
                const Icon = getIcon(item.type, item.versionType)
                const isUnread = item.readAt == null && item.type !== 'version'
                return (
                  <li
                    key={item.id}
                    className={`p-4 ${isUnread ? 'bg-blue-50/50' : ''} hover:bg-gray-50/50`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg shrink-0 ${getColor(item.type, item.versionType)}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {item.version && (
                            <span className="text-xs font-medium text-gray-500">{item.version}</span>
                          )}
                          <h3 className="font-medium text-gray-900">{item.title}</h3>
                        </div>
                        <p className="text-sm text-gray-600 whitespace-pre-wrap">{item.content}</p>
                        <p className="text-xs text-gray-400 mt-2">
                          {new Date(item.createdAt).toLocaleString()}
                        </p>
                        {isUnread && (
                          <button
                            type="button"
                            onClick={() => markRead.mutate(item.id)}
                            className="mt-2 text-xs text-blue-600 hover:underline"
                          >
                            {t('messageCenter.markRead')}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
