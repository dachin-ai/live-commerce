/**
 * UploadModal — 视频上传模态框
 * 录屏分析 + 素材上传共用
 */

import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { VIDEO_PLATFORMS, VIDEO_COUNTRIES, VIDEO_TYPES } from '../../constants/videoAnalysisParams'

interface UploadModalProps {
  isScreenRecording: boolean
  selectedStore: { id: string; name: string } | null
  onClose: () => void
  onUploadVideo: (formData: FormData) => void
  onUploadMaterial: (formData: FormData) => Promise<void>
  uploadPending: boolean
}

export default function UploadModal({
  isScreenRecording,
  selectedStore,
  onClose,
  onUploadVideo,
  onUploadMaterial,
  uploadPending,
}: UploadModalProps) {
  const { t } = useTranslation()
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [videoPlatform, setVideoPlatform] = useState('tiktok')
  const [videoCountry, setVideoCountry] = useState('cn')
  const [videoType, setVideoType] = useState('')
  const [videoAnalysisFocus, setVideoAnalysisFocus] = useState('')

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.warning(t('tools.pleaseSelectFile'))
      return
    }
    if (!selectedStore) {
      toast.warning(t('tasks.selectStoreFirst'))
      return
    }

    if (isScreenRecording) {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('storeId', selectedStore.id)
      formData.append('platform', videoPlatform)
      formData.append('country', videoCountry)
      if (videoType) formData.append('videoType', videoType)
      if (videoAnalysisFocus.trim()) formData.append('analysisFocus', videoAnalysisFocus.trim())
      onClose()
      setSelectedFile(null)
      toast.info(t('tools.videoUploadBackground'))
      onUploadVideo(formData)
    } else {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('name', selectedFile.name)
      formData.append('type', 'video')
      formData.append('storeId', selectedStore.id)
      try {
        await onUploadMaterial(formData)
        onClose()
        setSelectedFile(null)
        toast.success(t('tools.uploadSuccessShort'))
      } catch (error: unknown) {
        const err = error as { response?: { data?: { error?: string } }; message?: string }
        console.error('上传失败:', error)
        const errorMsg = err.response?.data?.error || err.message || t('tools.errorUploadFailed')
        toast.error(errorMsg)
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">{t('tools.uploadVideo')}</h3>
        <div className="space-y-4">
          {isScreenRecording && (
            <div className="space-y-3 pb-3 border-b border-gray-200">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('tools.videoPlatform')}</label>
                <select
                  value={videoPlatform}
                  onChange={(e) => setVideoPlatform(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {VIDEO_PLATFORMS.map((p) => (
                    <option key={p.code} value={p.code}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('tools.videoCountry')}</label>
                <select
                  value={videoCountry}
                  onChange={(e) => setVideoCountry(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {VIDEO_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('tools.videoType')}</label>
                <select
                  value={videoType}
                  onChange={(e) => setVideoType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {VIDEO_TYPES.map((vt) => (
                    <option key={vt.code || '_auto'} value={vt.code}>{vt.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('tools.videoAnalysisFocus')}</label>
                <textarea
                  value={videoAnalysisFocus}
                  onChange={(e) => setVideoAnalysisFocus(e.target.value)}
                  placeholder={t('tools.videoAnalysisFocusPlaceholder')}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
          />
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true) }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false) }}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setIsDragging(false)
              const file = e.dataTransfer?.files?.[0]
              if (file?.type?.startsWith('video/')) {
                setSelectedFile(file)
              } else if (file) {
                toast.error(t('tools.pickVideoFormat'))
              }
            }}
            className={`border-2 border-dashed rounded-xl min-h-[220px] py-16 px-12 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
            }`}
          >
            <Upload className="w-12 h-12 mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-600">{t('tools.dragDropHint')}</p>
          </div>
          {selectedFile && (
            <div className="text-sm text-gray-600">
              已选择: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={() => { onClose(); setSelectedFile(null) }}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploadPending}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {uploadPending ? t('common.loading') : t('tools.uploadVideo')}
          </button>
        </div>
      </div>
    </div>
  )
}
