import { useEffect } from 'react'
import { X, BookOpen, ChevronRight } from 'lucide-react'

interface TutorialModalProps {
  onClose: () => void
}

/** 教程：仅新 IP 首次登录时展示 */
const TUTORIAL_STEPS = [
  { title: '店铺管理', desc: '在首页可配置店铺、选择当前店铺，并查看核心数据与待处理任务。' },
  { title: '数据分析', desc: '进入「数据分析」查看多维度统计与图表，支持时间周期筛选。' },
  { title: '执行工具', desc: '话术生成、数据统计等工具在「执行工具」中按场景使用。' },
  { title: '智能待办', desc: '在店铺管理页底部使用「智能生成」可生成待办任务，支持 LLM 与规则结合。' },
]

export default function TutorialModal({ onClose }: TutorialModalProps) {
  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 pb-4 flex items-center justify-between border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-xl">
              <BookOpen className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">快速上手指南</h2>
              <p className="text-sm text-gray-500">首次从本设备/网络登录时展示</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          <ul className="space-y-4">
            {TUTORIAL_STEPS.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-medium">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-medium text-gray-900 flex items-center gap-1">
                    {step.title}
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </h3>
                  <p className="text-sm text-gray-600 mt-0.5">{step.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="p-6 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            开始使用
          </button>
        </div>
      </div>
    </div>
  )
}
