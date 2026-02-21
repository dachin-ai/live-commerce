import { useEffect, useState } from 'react'
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

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 pb-3 flex items-center justify-between border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-rose-100 rounded-xl">
              <Heart className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {t('sidebar.supportAuthor')}
              </h2>
              <p className="text-sm text-gray-500">要秃头啦❤ 支持一下我的植发事业吧❤</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label={t('feedback.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 flex flex-col items-center">
          {/* 裁剪右下角约 8% 以去除水印区域 */}
          <div
            className="w-full rounded-lg overflow-hidden bg-gray-50 flex justify-center min-h-[200px]"
            style={{ clipPath: 'inset(0 8% 8% 0)' }}
          >
            {!imageError ? (
              <img
                src={supportAuthorQr}
                alt={t('sidebar.supportAuthor')}
                className="w-full max-w-[320px] h-auto object-contain"
                onError={() => setImageError(true)}
              />
            ) : (
              <p className="text-sm text-gray-400 py-8 px-4 text-center">
                请替换 frontend/src/assets/support-author-qr.png 为植发支持码图片
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
