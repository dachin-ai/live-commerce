import { useState } from 'react'
import { X, Wand2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { parseProductText } from '../../utils/productParser'
import { parseProductWithSystemAgent } from '../../services/ai'
import { useToast } from '../../contexts/ToastContext'

interface ParseProductModalProps {
  isOpen: boolean
  onClose: () => void
  onParsed: (data: ReturnType<typeof parseProductText>) => void
}

export default function ParseProductModal({ isOpen, onClose, onParsed }: ParseProductModalProps) {
  const { t } = useTranslation()
  const toast = useToast()
  const [text, setText] = useState('')
  const [isParsing, setIsParsing] = useState(false)

  if (!isOpen) return null

  const handleParse = () => {
    if (!text.trim()) return
    const result = parseProductText(text)
    onParsed(result)
    setText('')
    onClose()
  }

  const handleAIParse = async () => {
    if (!text.trim()) return
    setIsParsing(true)
    try {
      const result = await parseProductWithSystemAgent(text)
      onParsed({
        productName: result.productName || '',
        price: result.price || '',
        coreFeatures: Array.isArray(result.coreFeatures) ? result.coreFeatures.join('\n') : (result.coreFeatures || ''),
        competitorLink: '',
        afterSalesInfo: result.afterSalesInfo || ''
      })
      setText('')
      onClose()
      toast.success(t('tools.smartParseSuccess', { fallback: 'AI 深度提炼完成' }))
    } catch (e: any) {
      toast.error(e.response?.data?.error || t('tools.smartParseFail', { fallback: 'AI 解析失败，请重试或检查 LLM 配置' }))
    } finally {
      setIsParsing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white/95 backdrop-blur-xl border border-white/50 rounded-2xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-indigo-600" />
            {t('tools.smartParse', { fallback: '智能识别文档主体' })}
          </h3>
          <button onClick={onClose} className="p-2 -mr-2 text-slate-500 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-4 shrink-0">
          {t('tools.smartParseDesc', { fallback: '直接粘贴商品文档或范式文本，系统将自动提取品名、卖点、注意事项等字段。' })}
        </p>

        <div className="flex-1 min-h-0 relative mb-6">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isParsing}
            className="w-full h-full min-h-[300px] p-4 bg-slate-50 border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            placeholder={t('tools.smartParsePlaceholder', { fallback: '请粘贴商品排版文档，例如：\n\n品名：...\n产品卖点：...\n使用小贴士：...' })}
          />
        </div>

        <div className="flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            disabled={isParsing}
            className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            {t('common.cancel', { fallback: '取消' })}
          </button>
          <button
            onClick={handleParse}
            disabled={!text.trim() || isParsing}
            className="px-5 py-2.5 rounded-xl bg-slate-800 text-white font-medium hover:bg-slate-900 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {t('tools.parseAndFill', { fallback: '基于代码转换' })}
          </button>
          <button
            onClick={handleAIParse}
            disabled={!text.trim() || isParsing}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium hover:opacity-90 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            <Wand2 className={`w-4 h-4 ${isParsing ? 'animate-spin' : ''}`} />
            {isParsing ? t('common.processing', { fallback: '处理中...' }) : '✨ AI 深度解析提炼'}
          </button>
        </div>
      </div>
    </div>
  )
}
