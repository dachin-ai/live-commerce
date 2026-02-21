import { useState, useEffect, useRef } from 'react'
import { X, Send, ImagePlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { submitFeedback, uploadFeedbackImage, type FeedbackType } from '../services/feedback'
import { useToast } from '../contexts/ToastContext'

interface FeedbackModalProps {
  onClose: () => void
}

const TYPES: { value: FeedbackType; labelKey: string }[] = [
  { value: 'problem', labelKey: 'feedback.typeProblem' },
  { value: 'feature', labelKey: 'feedback.typeFeature' },
  { value: 'other', labelKey: 'feedback.typeOther' },
]

export default function FeedbackModal({ onClose }: FeedbackModalProps) {
  const { t } = useTranslation()
  const toast = useToast()
  const [type, setType] = useState<FeedbackType>('problem')
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  const [contact, setContact] = useState('')
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [onClose])

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    const max = 5
    if (imageUrls.length + files.length > max) {
      toast.error(t('feedback.imageMax', { max }))
      return
    }
    setUploading(true)
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (!/^image\/(jpeg|png|gif|webp)$/i.test(file.type)) continue
        const url = await uploadFeedbackImage(file)
        setImageUrls(prev => [...prev, url].slice(0, max))
      }
    } catch (err: any) {
      toast.error(err?.message || t('feedback.submitFailed'))
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const sub = subject.trim()
    const cnt = content.trim()
    if (!sub) {
      toast.error(t('feedback.subjectPlaceholder'))
      return
    }
    if (!cnt) {
      toast.error(t('feedback.contentPlaceholder'))
      return
    }
    setSubmitting(true)
    try {
      await submitFeedback({
        type,
        subject: sub,
        content: cnt,
        contact: contact.trim() || undefined,
        imageUrls: imageUrls.length ? imageUrls : undefined,
      })
      toast.success(t('feedback.submitSuccess'))
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('feedback.submitFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{t('feedback.submitTitle')}</h2>
            <p className="text-sm text-gray-500 mt-1">{t('feedback.submitIntro')}</p>
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('feedback.typeLabel')}</label>
            <div className="flex gap-2 flex-wrap">
              {TYPES.map(({ value, labelKey }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setType(value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    type === value
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('feedback.subjectLabel')}</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={t('feedback.subjectPlaceholder')}
              maxLength={200}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('feedback.contentLabel')}</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[120px] resize-y"
              placeholder={t('feedback.contentPlaceholder')}
              maxLength={2000}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                multiple
                className="hidden"
                onChange={handleImageSelect}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || imageUrls.length >= 5}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <ImagePlus className="w-4 h-4" />
                {t('feedback.insertImage')}
              </button>
              {imageUrls.length > 0 && (
                <span className="text-xs text-gray-500">
                  {imageUrls.length}/5
                </span>
              )}
              <div className="flex flex-wrap gap-2 mt-1 w-full">
                {imageUrls.map((url) => (
                  <div key={url} className="relative group">
                    <img src={url} alt="" className="w-16 h-16 object-cover rounded border border-gray-200" />
                    <button
                      type="button"
                      onClick={() => setImageUrls(prev => prev.filter(u => u !== url))}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs opacity-90 group-hover:opacity-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('feedback.contactLabel')}</label>
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={t('feedback.contactPlaceholder')}
            />
            <p className="text-xs text-gray-500 mt-1">{t('feedback.contactHint')}</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              {t('feedback.close')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              {t('feedback.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
