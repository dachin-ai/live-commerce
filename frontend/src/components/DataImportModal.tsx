import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Upload, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react'
import { useStore } from '../contexts/StoreContext'
import { useToast } from '../contexts/ToastContext'
import { importTikTokData, DataImportResult } from '../services/dataImport'
import { GlassButton } from './ui/GlassButton'

/** 传入则锁定本次导入目标店铺（避免打开弹窗后切换店铺导致数据导入到错误店铺） */
export interface DataImportModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (result: DataImportResult) => void
  /** 本次导入目标店铺（打开弹窗时由调用方传入，上传始终写入该店铺） */
  targetStore?: { id: string; name?: string; platform?: string } | null
}

export default function DataImportModal({ isOpen, onClose, onSuccess, targetStore }: DataImportModalProps) {
  const { t } = useTranslation()
  const { selectedStore } = useStore()
  const toast = useToast()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [importResult, setImportResult] = useState<DataImportResult | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // 锁定导入目标：优先使用调用方传入的 targetStore，保证「当前店铺正常抓取」不因切店而错写
  const importTarget = (targetStore && targetStore.id)
    ? { id: targetStore.id, name: targetStore.name || targetStore.id, platform: targetStore.platform }
    : selectedStore
      ? { id: selectedStore.id, name: selectedStore.name || selectedStore.id, platform: selectedStore.platform }
      : null

  if (!isOpen) return null

  const validateAndSetFile = (file: File | null) => {
    if (!file) return
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error(t('dataImport.excelOnly'))
      return
    }
    setSelectedFile(file)
    setImportResult(null)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    validateAndSetFile(file ?? null)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!uploading) setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (uploading) return
    const file = e.dataTransfer.files?.[0]
    validateAndSetFile(file ?? null)
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.warning('请选择Excel文件')
      return
    }

    if (!importTarget) {
      toast.warning(t('tasks.selectStoreFirst'))
      return
    }

    // 验证店铺平台
    if (importTarget.platform && importTarget.platform !== 'TikTok' && importTarget.platform !== '抖音') {
      toast.error(t('dataImport.tiktokDouyinOnly'))
      return
    }

    setUploading(true)
    try {
      const result = await importTikTokData(importTarget.id, selectedFile)
      setImportResult(result)
      toast.success(result?.message || t('dataImport.successDefault'))
      if (onSuccess) {
        onSuccess(result)
      }
      setTimeout(() => {
        handleClose()
      }, 3000)
    } catch (error) {
      console.error('导入失败:', error)
      let errorMsg: string | undefined
      if (error && typeof error === 'object') {
        if ('response' in error) {
          const response = (error as { response?: { data?: { message?: string; error?: string } } }).response
          errorMsg = response?.data?.message || response?.data?.error
        }
        if (!errorMsg && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
          errorMsg = (error as { message?: string }).message
        }
      }
      toast.error(errorMsg || t('dataImport.failedCheckFormat'))
    } finally {
      setUploading(false)
    }
  }

  const handleClose = () => {
    setSelectedFile(null)
    setImportResult(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-white/90 backdrop-blur-xl border border-white/50 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200/50">
          <h2 className="text-xl font-bold text-slate-800">导入TikTok直播数据</h2>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6 space-y-6">
          {/* 店铺信息：显式展示本次导入目标，避免切店导致数据写入错误店铺 */}
          {importTarget && (
            <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
              <p className="text-sm text-slate-600">
                <span className="font-medium">本次导入目标：</span>
                {importTarget.name}
                {importTarget.platform && ` (${importTarget.platform})`}
                {targetStore && targetStore.id && (
                  <span className="ml-1 text-primary-600 text-xs">（已锁定，数据将仅写入该店铺）</span>
                )}
              </p>
            </div>
          )}

          {/* 文件选择 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              选择Excel文件
            </label>
            <div
              className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-lg transition-colors ${
                isDragging
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-slate-300 hover:border-primary-400'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="space-y-1 text-center">
                <FileSpreadsheet className="mx-auto h-12 w-12 text-slate-400" />
                <div className="flex text-sm text-slate-600">
                  <label
                    htmlFor="file-upload"
                    className="relative cursor-pointer bg-white rounded-md font-medium text-primary-600 hover:text-primary-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary-500"
                  >
                    <span>选择文件</span>
                    <input
                      id="file-upload"
                      name="file-upload"
                      type="file"
                      accept=".xlsx,.xls"
                      className="sr-only"
                      onChange={handleFileSelect}
                      disabled={uploading}
                    />
                  </label>
                  <p className="pl-1">或拖拽文件到此处</p>
                </div>
                <p className="text-xs text-slate-500">支持 .xlsx, .xls 格式，最大50MB</p>
              </div>
            </div>
            {selectedFile && (
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                <FileSpreadsheet className="w-5 h-5 text-green-600" />
                <span className="font-medium">{selectedFile.name}</span>
                <span className="text-slate-500">
                  ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                </span>
              </div>
            )}
          </div>

          {/* 导入结果 */}
          {importResult && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-900">
                    {importResult?.message ?? '数据导入成功'}
                  </p>
                  {importResult?.stats && (
                    <div className="mt-2 text-xs text-green-700 space-y-1">
                      <p>• 总成交额：{selectedStore?.currencySymbol ?? '¥'}{importResult.stats.totalGMV?.toLocaleString() || 0} {selectedStore?.currency ?? 'CNY'}</p>
                      <p>• 总观看人数：{importResult.stats.totalViewers?.toLocaleString() || 0}</p>
                      <p>• 直播场次：{importResult.stats.rounds || 0}</p>
                      <p>• 数据条数：{importResult.importRecord?.recordCount ?? 0}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 说明 */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-900 mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              数据格式说明
            </h3>
            <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
              <li>Excel文件应包含以下字段：日期、直播ID、直播标题、总观看人数、总成交额(GMV)、总订单数、直播时长等</li>
              <li>支持中英文表头，系统会自动识别</li>
              <li>导入的数据将自动计算统计数据并更新到Dashboard</li>
              <li>导入成功后会自动生成基于数据的待办事项</li>
            </ul>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200/50">
          <GlassButton
            onClick={handleClose}
            disabled={uploading}
            variant="secondary"
          >
            取消
          </GlassButton>
          <GlassButton
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            variant="primary"
            className="gap-2"
          >
            {uploading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                导入中...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                开始导入
              </>
            )}
          </GlassButton>
        </div>
      </div>
    </div>
  )
}
