import { useTranslation } from 'react-i18next'
import { useVersionLogs } from '../services/version-logs'
import { FileText, Sparkles, Bug, Rocket } from 'lucide-react'

export default function VersionLogs() {
  const { t } = useTranslation()
  const { data: logs = [], isLoading } = useVersionLogs(10)

  const getIcon = (type: string) => {
    switch (type) {
      case 'feature':
        return Sparkles
      case 'bugfix':
        return Bug
      case 'release':
        return Rocket
      default:
        return FileText
    }
  }

  const getColor = (type: string) => {
    switch (type) {
      case 'feature':
        return 'bg-blue-100 text-blue-600'
      case 'bugfix':
        return 'bg-red-100 text-red-600'
      case 'release':
        return 'bg-green-100 text-green-600'
      default:
        return 'bg-gray-100 text-gray-600'
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'feature':
        return t('versionLog.typeFeature')
      case 'bugfix':
        return t('versionLog.typeBugfix')
      case 'improvement':
        return t('versionLog.typeImprovement')
      case 'release':
        return t('versionLog.typeRelease')
      default:
        return type
    }
  }

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('versionLog.title')}</h2>

      {isLoading ? (
        <div className="text-center py-8 text-gray-500">{t('versionLog.loading')}</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-gray-500">{t('versionLog.noLogs')}</div>
      ) : (
        <div className="space-y-4">
          {logs.map((log) => {
            const Icon = getIcon(log.type)
            return (
              <div
                key={log.id}
                className="border-l-4 border-blue-500 pl-4 py-2 hover:bg-gray-50 rounded-r"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`p-1 rounded ${getColor(log.type)}`}>
                        <Icon className="w-3 h-3" />
                      </div>
                      <span className="text-xs font-medium text-gray-500">{log.version}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${getColor(log.type)}`}>
                        {getTypeLabel(log.type)}
                      </span>
                    </div>
                    <h3 className="font-medium text-gray-900 mb-1">{log.title}</h3>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{log.content}</p>
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(log.createdAt).toLocaleString('zh-CN')}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
