import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Heart } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import supportAuthorQr from '@/assets/support-author-qr.png'

interface SupportAuthorModalProps {
  onClose: () => void
}

export default function SupportAuthorModal({ onClose }: SupportAuthorModalProps) {
  const { t } = useTranslation()
  const [imageError, setImageError] = useState(false)

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white/70 backdrop-blur-3xl border border-white/60 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 pb-3 flex items-center justify-between border-b border-white/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-100/60 backdrop-blur-sm rounded-xl border border-rose-200/50 shadow-inner group">
              <Heart className="w-5 h-5 text-rose-500 fill-rose-500/20 group-hover:fill-rose-500/50 transition-colors duration-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                {t('sidebar.supportAuthor')}
              </h2>
              <p className="text-sm text-slate-500 font-medium mt-0.5">要秃头啦❤ 支持一下我的植发事业吧❤</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:bg-white/50 hover:text-slate-600 transition-all border border-transparent hover:border-white/60"
            aria-label={t('feedback.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 flex flex-col items-center">
          {/* 裁剪右下角约 8% 以去除水印区域, 同时加入玻璃边框和浮起效果 */}
          <div className="relative group perspective-1000">
            <div className="absolute -inset-1 bg-gradient-to-r from-rose-200 to-amber-200 rounded-2xl blur opacity-30 group-hover:opacity-70 transition duration-500"></div>
            <div
              className="relative w-full rounded-2xl overflow-hidden bg-white/50 backdrop-blur-md border border-white/80 shadow-lg flex justify-center min-h-[220px] transition-transform duration-500 group-hover:scale-[1.02]"
              style={{ clipPath: 'inset(0 8% 8% 0)' }}
            >
              {!imageError ? (
                <img
                  src={supportAuthorQr}
                  alt={t('sidebar.supportAuthor')}
                  className="w-full max-w-[320px] h-auto object-contain p-2"
                  onError={() => setImageError(true)}
                />
              ) : (
                <p className="text-sm text-slate-400 py-8 px-4 text-center flex items-center justify-center h-full">
                  请替换 frontend/src/assets/support-author-qr.png 为植发支持码图片
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
