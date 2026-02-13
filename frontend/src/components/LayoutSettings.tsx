import { useState } from 'react'
import { Settings, Eye, EyeOff, Maximize2, Minimize2, RotateCcw } from 'lucide-react'
import { useLayoutPreferences, LayoutPreferences } from '../hooks/useLayoutPreferences'

interface LayoutSettingsProps {
  onClose?: () => void
}

export default function LayoutSettings({ onClose }: LayoutSettingsProps) {
  const { preferences, setPreferences, resetPreferences } = useLayoutPreferences()
  const [isOpen, setIsOpen] = useState(false)

  const handleToggle = (key: keyof LayoutPreferences) => {
    setPreferences({ [key]: !preferences[key] })
  }

  const handleColsChange = (key: 'storeListCols' | 'statsCols' | 'taskListCols', value: number) => {
    setPreferences({ [key]: Math.max(1, Math.min(12, value)) })
  }

  return (
    <>
      {/* 设置按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 z-50 transition-all"
        title="布局设置"
      >
        <Settings className="w-5 h-5" />
      </button>

      {/* 设置面板 */}
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">布局设置</h2>
              <button
                onClick={() => {
                  setIsOpen(false)
                  onClose?.()
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6">
              {/* 功能区显示/隐藏 */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">功能区显示/隐藏</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'showStoreList' as const, label: '店铺列表' },
                    { key: 'showStats' as const, label: '数据统计' },
                    { key: 'showTaskList' as const, label: '任务管理' },
                    { key: 'showChart' as const, label: '图表' },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => handleToggle(key)}
                      className={`flex items-center justify-between p-3 rounded-lg border-2 transition-colors ${
                        preferences[key]
                          ? 'bg-blue-50 border-blue-300'
                          : 'bg-gray-50 border-gray-300'
                      }`}
                    >
                      <span className="font-medium text-gray-900">{label}</span>
                      {preferences[key] ? (
                        <Eye className="w-5 h-5 text-blue-600" />
                      ) : (
                        <EyeOff className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* 功能区大小调整 */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">功能区大小（列数，总共12列）</h3>
                <div className="space-y-3">
                  {[
                    { key: 'storeListCols' as const, label: '店铺列表', max: 6 },
                    { key: 'statsCols' as const, label: '数据统计', max: 9 },
                    { key: 'taskListCols' as const, label: '任务管理', max: 6 },
                  ].map(({ key, label, max }) => (
                    <div key={key} className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700 w-24">{label}</label>
                      <div className="flex items-center gap-2 flex-1">
                        <button
                          onClick={() => handleColsChange(key, preferences[key] - 1)}
                          disabled={preferences[key] <= 1}
                          className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Minimize2 className="w-4 h-4" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          max={max}
                          value={preferences[key]}
                          onChange={(e) => handleColsChange(key, parseInt(e.target.value) || 1)}
                          className="w-16 px-2 py-1 text-center border border-gray-300 rounded"
                        />
                        <button
                          onClick={() => handleColsChange(key, preferences[key] + 1)}
                          disabled={preferences[key] >= max}
                          className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Maximize2 className="w-4 h-4" />
                        </button>
                        <span className="text-sm text-gray-500 ml-2">列</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 图标显示/隐藏 */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">图标显示</h3>
                <button
                  onClick={() => handleToggle('showIcons')}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-colors ${
                    preferences.showIcons
                      ? 'bg-blue-50 border-blue-300'
                      : 'bg-gray-50 border-gray-300'
                  }`}
                >
                  <span className="font-medium text-gray-900">显示图标</span>
                  {preferences.showIcons ? (
                    <Eye className="w-5 h-5 text-blue-600" />
                  ) : (
                    <EyeOff className="w-5 h-5 text-gray-400" />
                  )}
                </button>
              </div>

              {/* 重置按钮 */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={resetPreferences}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  重置为默认
                </button>
                <button
                  onClick={() => {
                    setIsOpen(false)
                    onClose?.()
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  完成
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
