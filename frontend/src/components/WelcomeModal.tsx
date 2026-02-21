import { useEffect } from 'react'
import { X, Sparkles } from 'lucide-react'

interface WelcomeModalProps {
  onClose: () => void
}

/** 欢迎语：仅账号首次登录时展示 */
const WELCOME_CONTENT = {
  title: '欢迎使用直播电商中台',
  lines: [
    '您好！感谢您加入直播电商中台。',
    '在这里您可以管理店铺、查看数据、使用智能待办与话术等能力。',
    '左侧导航可进入各模块，祝您使用愉快。',
  ],
}

export default function WelcomeModal({ onClose }: WelcomeModalProps) {
  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="关闭"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-100 rounded-xl">
            <Sparkles className="w-6 h-6 text-blue-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">{WELCOME_CONTENT.title}</h2>
        </div>
        <div className="space-y-2 text-gray-600">
          {WELCOME_CONTENT.lines.map((line, i) => (
            <p key={i} className="text-sm leading-relaxed">
              {line}
            </p>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          知道了
        </button>
      </div>
    </div>
  )
}
