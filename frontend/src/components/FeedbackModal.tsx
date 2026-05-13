import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Send, ImagePlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { submitFeedback, uploadFeedbackImage, type FeedbackType } from '../services/feedback'
import { useToast } from '../contexts/ToastContext'
import { GlassInput } from './ui/GlassInput'
import { GlassTextarea } from './ui/GlassTextarea'
import { GlassButton } from './ui/GlassButton'

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
    } catch (err: unknown) {
      const error = err as { message?: string }
      toast.error(error.message || t('feedback.submitFailed'))
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
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      toast.error(error.response?.data?.error || t('feedback.submitFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white/70 backdrop-blur-3xl border border-white/60 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-white/40 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{t('feedback.submitTitle')}</h2>
            <p className="text-sm text-slate-500 mt-1">{t('feedback.submitIntro')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:bg-slate-100/50 hover:text-slate-600 transition-colors"
            aria-label={t('feedback.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">{t('feedback.typeLabel')}</label>
            <div className="flex gap-2 flex-wrap">
              {TYPES.map(({ value, labelKey }) => (
                <GlassButton
                  key={value}
                  type="button"
                  variant={type === value ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setType(value)}
                  className="rounded-full px-4"
                >
                  {t(labelKey)}
                </GlassButton>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">{t('feedback.subjectLabel')}</label>
            <GlassInput
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t('feedback.subjectPlaceholder')}
              maxLength={200}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">{t('feedback.contentLabel')}</label>
            <GlassTextarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('feedback.contentPlaceholder')}
              maxLength={2000}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                multiple
                className="hidden"
                onChange={handleImageSelect}
              />
              <GlassButton
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || imageUrls.length >= 5}
                className="gap-1.5 bg-white/40"
              >
                <ImagePlus className="w-4 h-4" />
                {t('feedback.insertImage')}
              </GlassButton>
              {imageUrls.length > 0 && (
                <span className="text-xs text-slate-500 font-medium">
                  {imageUrls.length}/5
                </span>
              )}
              <div className="flex flex-wrap gap-2 mt-2 w-full">
                {imageUrls.map((url) => (
                  <div key={url} className="relative group rounded-lg overflow-hidden shadow-sm border border-slate-200">
                    <img src={url} alt="" className="w-16 h-16 object-cover" />
                    <button
                      type="button"
                      onClick={() => setImageUrls(prev => prev.filter(u => u !== url))}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-900/60 backdrop-blur-md text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">{t('feedback.contactLabel')}</label>
            <GlassInput
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder={t('feedback.contactPlaceholder')}
            />
            <p className="text-xs text-slate-500 mt-1.5">{t('feedback.contactHint')}</p>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-white/30">
            <GlassButton
              type="button"
              variant="ghost"
              onClick={onClose}
              className="text-slate-600 hover:text-slate-900 px-5"
            >
              {t('feedback.close')}
            </GlassButton>
            <GlassButton
              type="submit"
              variant="primary"
              disabled={submitting}
              className="gap-2 px-6 shadow-primary-500/20"
            >
              <Send className="w-4 h-4" />
              {t('feedback.submit')}
            </GlassButton>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
