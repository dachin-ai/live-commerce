import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Mail, FileText, MessageCircle, Bell, Sparkles, Bug, Rocket } from 'lucide-react'
import { useVersionLogs, type VersionLog } from '../services/version-logs'
import { useMessages, useMarkMessageRead, useMarkAllMessagesRead, useUnreadCount, type InAppMessage } from '../services/messages'
import { useToast } from '../contexts/ToastContext'
import AppLayout from '../components/AppLayout'
import { GlassButton } from '../components/ui/GlassButton'

type Tab = 'all' | 'version' | 'feedback_reply' | 'system'

type MessageListItemBase = {
  id: string
  type: 'version' | 'feedback_reply' | 'system'
  title: string
  content: string
  createdAt: string
  readAt: string | null
  linkUrl: string | null
  version?: string
  versionType?: VersionLog['type']
}

type MessageListItemWithSort = MessageListItemBase & { _sort: number }

export default function MessageCenter() {
  const { t } = useTranslation()
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
      onError: (err) => {
        let errorMessage: string | undefined
        if (err && typeof err === 'object' && 'response' in err) {
          const response = (err as { response?: { data?: { error?: string } } }).response
          errorMessage = response?.data?.error
        }
        toast.error(errorMessage || t('feedback.submitFailed'))
      },
    })
  }

  const versionAsItems = useMemo<MessageListItemBase[]>(
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

  const mergedList = useMemo<MessageListItemBase[]>(() => {
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
    const list: MessageListItemWithSort[] = [
      ...versionAsItems.map<MessageListItemWithSort>((v) => ({ ...v, _sort: new Date(v.createdAt).getTime() })),
      ...messages.map<MessageListItemWithSort>((m: InAppMessage) => ({
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
    list.sort((a, b) => b._sort - a._sort)
    return list.map<MessageListItemBase>((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      content: item.content,
      createdAt: item.createdAt,
      readAt: item.readAt,
      linkUrl: item.linkUrl,
      version: item.version,
      versionType: item.versionType,
    }))
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
        case 'feature': return 'bg-primary-100 text-primary-600'
        case 'bugfix': return 'bg-red-100 text-red-600'
        case 'release': return 'bg-green-100 text-green-600'
        default: return 'bg-slate-100 text-slate-600'
      }
    }
    if (type === 'feedback_reply') return 'bg-green-100 text-green-600'
    return 'bg-slate-100 text-slate-600'
  }

  const tabs: { key: Tab; labelKey: string }[] = [
    { key: 'all', labelKey: 'messageCenter.tabAll' },
    { key: 'version', labelKey: 'messageCenter.tabVersion' },
    { key: 'feedback_reply', labelKey: 'messageCenter.tabFeedbackReply' },
    { key: 'system', labelKey: 'messageCenter.tabSystem' },
  ]

  return (
    <AppLayout
      title={t('messageCenter.title')}
      subtitle={t('messageCenter.subtitle')}
      headerExtra={
        unreadCount > 0 ? (
          <GlassButton
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={markAllRead.isPending}
          >
            {markAllRead.isPending ? t('common.loading') : t('messageCenter.markAllRead')}
          </GlassButton>
        ) : undefined
      }
    >
      <div className="max-w-5xl mx-auto">
        <div className="flex gap-2 mb-6 border-b border-slate-200">
          {tabs.map(({ key, labelKey }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>

        <div className="card min-h-[300px] !p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-slate-500">{t('common.loading')}</div>
          ) : mergedList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <Mail className="w-16 h-16 text-slate-300 mb-4" />
              <p>{t('messageCenter.noMessages')}</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {mergedList.map((item) => {
                const Icon = getIcon(item.type, item.versionType)
                const isUnread = item.readAt == null && item.type !== 'version'
                return (
                  <li
                    key={item.id}
                    className={`p-4 ${isUnread ? 'bg-primary-50/50' : ''} hover:bg-slate-50/50 transition-colors`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg shrink-0 ${getColor(item.type, item.versionType)}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {item.version && (
                            <span className="text-xs font-medium text-slate-500">{item.version}</span>
                          )}
                          <h3 className="font-medium text-slate-900">{item.title}</h3>
                        </div>
                        <p className="text-sm text-slate-600 whitespace-pre-wrap">{item.content}</p>
                        <p className="text-xs text-slate-400 mt-2">
                          {new Date(item.createdAt).toLocaleString()}
                        </p>
                        {isUnread && (
                          <button
                            type="button"
                            onClick={() => markRead.mutate(item.id)}
                            className="mt-2 text-xs text-primary-600 hover:underline"
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
    </AppLayout>
  )
}
