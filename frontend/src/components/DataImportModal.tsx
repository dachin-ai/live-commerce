import { useState } from 'react'
import { X, Upload, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react'
import { useStore } from '../contexts/StoreContext'
import { useToast } from '../contexts/ToastContext'
import { importTikTokData, DataImportResult } from '../services/dataImport'

/** 传入则锁定本次导入目标店铺（避免打开弹窗后切换店铺导致数据导入到错误店铺） */
export interface DataImportModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (result: DataImportResult) => void
  /** 本次导入目标店铺（打开弹窗时由调用方传入，上传始终写入该店铺） */
  targetStore?: { id: string; name?: string; platform?: string } | null
}

export default function DataImportModal({ isOpen, onClose, onSuccess, targetStore }: DataImportModalProps) {
  const { selectedStore } = useStore()
  const toast = useToast()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [importResult, setImportResult] = useState<DataImportResult | null>(null)

  // 锁定导入目标：优先使用调用方传入的 targetStore，保证「当前店铺正常抓取」不因切店而错写
  const importTarget = (targetStore && targetStore.id)
    ? { id: targetStore.id, name: targetStore.name || targetStore.id, platform: targetStore.platform }
    : selectedStore
      ? { id: selectedStore.id, name: selectedStore.name || selectedStore.id, platform: selectedStore.platform }
      : null

  if (!isOpen) return null

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // 验证文件类型
      if (!file.name.match(/\.(xlsx|xls)$/i)) {
        toast.error('只支持Excel文件（.xlsx, .xls）')
        return
      }
      setSelectedFile(file)
      setImportResult(null)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.warning('请选择Excel文件')
      return
    }

    if (!importTarget) {
      toast.warning('请先选择店铺')
      return
    }

    // 验证店铺平台
    if (importTarget.platform && importTarget.platform !== 'TikTok' && importTarget.platform !== '抖音') {
      toast.error('该功能仅支持TikTok/抖音平台店铺')
      return
    }

    setUploading(true)
    try {
      const result = await importTikTokData(importTarget.id, selectedFile)
      setImportResult(result)
      toast.success(result?.message || '数据导入成功')
      
      if (onSuccess) {
        onSuccess(result)
      }
      
      // 3秒后自动关闭
      setTimeout(() => {
        handleClose()
      }, 3000)
    } catch (error: any) {
      console.error('导入失败:', error)
      const errorMsg = error?.response?.data?.message || error?.response?.data?.error || error?.message || '导入失败，请检查文件格式'
      toast.error(errorMsg)
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">导入TikTok直播数据</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6 space-y-6">
          {/* 店铺信息：显式展示本次导入目标，避免切店导致数据写入错误店铺 */}
          {importTarget && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-gray-600">
                <span className="font-medium">本次导入目标：</span>
                {importTarget.name}
                {importTarget.platform && ` (${importTarget.platform})`}
                {targetStore && targetStore.id && (
                  <span className="ml-1 text-blue-600 text-xs">（已锁定，数据将仅写入该店铺）</span>
                )}
              </p>
            </div>
          )}

          {/* 文件选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              选择Excel文件
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-blue-400 transition-colors">
              <div className="space-y-1 text-center">
                <FileSpreadsheet className="mx-auto h-12 w-12 text-gray-400" />
                <div className="flex text-sm text-gray-600">
                  <label
                    htmlFor="file-upload"
                    className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
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
                <p className="text-xs text-gray-500">支持 .xlsx, .xls 格式，最大50MB</p>
              </div>
            </div>
            {selectedFile && (
              <div className="mt-3 flex items-center gap-2 text-sm text-gray-700">
                <FileSpreadsheet className="w-5 h-5 text-green-600" />
                <span className="font-medium">{selectedFile.name}</span>
                <span className="text-gray-500">
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
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              数据格式说明
            </h3>
            <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
              <li>Excel文件应包含以下字段：日期、直播ID、直播标题、总观看人数、总成交额(GMV)、总订单数、直播时长等</li>
              <li>支持中英文表头，系统会自动识别</li>
              <li>导入的数据将自动计算统计数据并更新到Dashboard</li>
              <li>导入成功后会自动生成基于数据的待办事项</li>
            </ul>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            disabled={uploading}
          >
            取消
          </button>
          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {uploading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                导入中...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                开始导入
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
