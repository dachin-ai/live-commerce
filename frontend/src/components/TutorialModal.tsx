import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, BookOpen, ChevronRight } from 'lucide-react'
import { GlassButton } from './ui/GlassButton'

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

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="bg-white/70 backdrop-blur-3xl border border-white/60 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 pb-4 flex items-center justify-between border-b border-white/40">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100/50 backdrop-blur-sm rounded-xl border border-amber-200/50 shadow-inner">
              <BookOpen className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">快速上手指南</h2>
              <p className="text-sm text-slate-500">首次从本设备/网络登录时展示</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:bg-slate-100/50 hover:text-slate-600 transition-colors"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          <ul className="space-y-4">
            {TUTORIAL_STEPS.map((step, i) => (
              <li key={i} className="group flex gap-4 p-3 -mx-3 rounded-xl hover:bg-white/40 transition-colors border border-transparent hover:border-white/50">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100/60 shadow-inner text-primary-700 flex items-center justify-center text-sm font-medium group-hover:scale-110 group-hover:bg-primary-500 group-hover:text-white group-hover:shadow-primary-500/30 transition-all duration-300">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <h3 className="font-medium text-slate-900 flex items-center gap-1 group-hover:text-primary-700 transition-colors">
                    {step.title}
                    <ChevronRight className="w-4 h-4 text-slate-400 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                  </h3>
                  <p className="text-sm text-slate-600 mt-1 leading-relaxed">{step.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="p-6 pt-5 border-t border-white/40">
          <GlassButton
            type="button"
            variant="primary"
            fullWidth
            onClick={onClose}
            size="lg"
            className="shadow-primary-500/20 shadow-lg text-lg"
          >
            开始使用
          </GlassButton>
        </div>
      </div>
    </div>,
    document.body
  )
}
