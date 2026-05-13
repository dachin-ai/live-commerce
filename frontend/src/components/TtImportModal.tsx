import { useState, useCallback, useRef } from 'react'
import {
  Upload, FileSpreadsheet, CheckCircle, AlertCircle, X, Loader2, Calendar,
  BarChart3, Megaphone, ShoppingBag, Package, Video as VideoIcon, LucideIcon
} from 'lucide-react'
import { previewTtFile, commitTtImport, TtPreviewResult } from '../services/ttImport'

// ─── 数据类型引导配置 ────────────────────────────────────────────────
interface GuideItem {
  type: string
  label: string
  icon: LucideIcon
  desc: string
  path: string
  // 静态 Tailwind 类（避免动态字符串被 PurgeCSS 删除）
  cardActive: string
  cardHover: string
  titleActive: string
  iconActive: string
  hintBar: string
}

const DATA_TYPE_GUIDE: GuideItem[] = [
  {
    type: 'live_sessions',
    label: '直播数据明细',
    icon: BarChart3,
    desc: '场次 GMV / 观看 / 互动 / 转化',
    path: 'Seller Center → 直播 → 数据分析 → 导出报表',
    cardActive:  'border-blue-400 bg-blue-50',
    cardHover:   'hover:border-blue-200',
    titleActive: 'text-blue-800',
    iconActive:  'text-blue-600',
    hintBar:     'bg-blue-50 border-blue-200 text-blue-800',
  },
  {
    type: 'ad_sessions',
    label: '广告消耗明细',
    icon: Megaphone,
    desc: '广告花费 / ROI / 计划明细',
    path: 'Seller Center → 广告 → 报告 → 导出',
    cardActive:  'border-amber-400 bg-amber-50',
    cardHover:   'hover:border-amber-200',
    titleActive: 'text-amber-800',
    iconActive:  'text-amber-600',
    hintBar:     'bg-amber-50 border-amber-200 text-amber-800',
  },
  {
    type: 'product_overview',
    label: '全渠道商品大盘',
    icon: ShoppingBag,
    desc: '直播 / 商品卡 / 视频各渠道 GMV',
    path: 'Seller Center → 商品 → 全渠道概览 → 导出',
    cardActive:  'border-emerald-400 bg-emerald-50',
    cardHover:   'hover:border-emerald-200',
    titleActive: 'text-emerald-800',
    iconActive:  'text-emerald-600',
    hintBar:     'bg-emerald-50 border-emerald-200 text-emerald-800',
  },
  {
    type: 'product_details',
    label: '产品数据明细',
    icon: Package,
    desc: '直播产品佣金 / 成交明细',
    path: '直播报告 → 产品数据 → 导出',
    cardActive:  'border-violet-400 bg-violet-50',
    cardHover:   'hover:border-violet-200',
    titleActive: 'text-violet-800',
    iconActive:  'text-violet-600',
    hintBar:     'bg-violet-50 border-violet-200 text-violet-800',
  },
  {
    type: 'video_sessions',
    label: '视频数据明细',
    icon: VideoIcon,
    desc: '短视频 VV / GPM / 引流转化',
    path: 'Seller Center → 视频 → 达人视频 → 导出',
    cardActive:  'border-pink-400 bg-pink-50',
    cardHover:   'hover:border-pink-200',
    titleActive: 'text-pink-800',
    iconActive:  'text-pink-600',
    hintBar:     'bg-pink-50 border-pink-200 text-pink-800',
  },
]

interface Props {
  isOpen: boolean
  onClose: () => void
  storeId: string
  storeName: string
  onImportComplete?: () => void
}

type Step = 'upload' | 'preview' | 'importing' | 'done' | 'error'

export default function TtImportModal({ isOpen, onClose, storeId, storeName, onImportComplete }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<TtPreviewResult | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [advertiserType, setAdvertiserType] = useState('self')
  const [adType, setAdType] = useState('live')
  const [contentType, setContentType] = useState('live_room')
  const [channelType, setChannelType] = useState('ALL')
  const [isDragOver, setIsDragOver] = useState(false)
  const [hintType, setHintType] = useState<string | null>(null)
  // 粒度约束（针对无日明细类型）
  const [periodGranularity, setPeriodGranularity] = useState<'week' | 'month' | 'custom'>('week')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setStep('upload'); setFile(null); setPreview(null); setError('')
    setResult(null); setDateFrom(''); setDateTo(''); setChannelType('ALL'); setHintType(null)
  }

  const handleClose = () => { reset(); onClose() }

  const handleFile = useCallback(async (f: File) => {
    // 前端大小校验：给用户即时反馈，无需等到服务端 413
    if (f.size > 50 * 1024 * 1024) {
      setError(`文件过大（${(f.size / 1024 / 1024).toFixed(1)} MB），请上传 50 MB 以内的文件`)
      setStep('error')
      return
    }
    setFile(f); setError('')
    try {
      const res = await previewTtFile(f, storeId)
      setPreview(res)
      if (res.dateFrom) setDateFrom(res.dateFrom)
      if (res.dateTo) setDateTo(res.dateTo)
      setStep('preview')
    } catch (e: any) {
      setError(e.message || '解析失败')
      setStep('error')
    }
  }, [storeId])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.csv'))) {
      handleFile(f)
    } else {
      setError('请上传 .xlsx / .xls / .csv 文件')
    }
  }, [handleFile])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  const handleCommit = async () => {
    if (!file) return
    setStep('importing')
    try {
      const res = await commitTtImport({
        file, storeId, dateFrom, dateTo,
        advertiserType: preview?.dataType === 'ad_sessions' ? advertiserType : undefined,
        adType: preview?.dataType === 'ad_sessions' ? adType : undefined,
        contentType: preview?.dataType === 'ad_sessions' ? contentType : undefined,
        channelType: (preview?.dataType === 'store_products' || preview?.dataType === 'product_details') ? channelType : undefined,
      })
      setResult(res); setStep('done')
      onImportComplete?.()
    } catch (e: any) {
      setError(e.message || '导入失败'); setStep('error')
    }
  }

  if (!isOpen) return null

  const activeGuide = hintType ? DATA_TYPE_GUIDE.find(g => g.type === hintType) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={handleClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              TikTok 数据导入
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">店铺: {storeName}</p>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-130px)]">
          {/* Step: Upload — 双栏引导布局 */}
          {step === 'upload' && (
            <div className="flex gap-4">
              {/* 左侧：数据类型引导卡片 */}
              <div className="w-48 shrink-0 space-y-1.5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">选择数据类型</p>
                {DATA_TYPE_GUIDE.map(g => {
                  const isActive = hintType === g.type
                  const Icon = g.icon
                  return (
                    <button
                      key={g.type}
                      onClick={() => setHintType(isActive ? null : g.type)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border-2 transition-all ${
                        isActive ? g.cardActive : `border-slate-200 bg-white ${g.cardHover}`
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? g.iconActive : 'text-slate-400'}`} />
                        <span className={`text-xs font-semibold leading-tight ${isActive ? g.titleActive : 'text-slate-700'}`}>
                          {g.label}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-snug pl-5">{g.desc}</p>
                    </button>
                  )
                })}
                <p className="text-[10px] text-slate-400 pt-1 leading-snug">💡 点击卡片查看 TikTok 导出路径</p>
              </div>

              {/* 右侧：拖拽区 + 导出路径提示 */}
              <div className="flex-1 flex flex-col gap-3">
                {activeGuide ? (
                  <div className={`px-3 py-2.5 rounded-xl border text-xs leading-snug ${activeGuide.hintBar}`}>
                    <span className="font-semibold">TikTok 导出路径：</span>{activeGuide.path}
                  </div>
                ) : (
                  <div className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500">
                    👈 选择左侧类型可查看对应的 TikTok 后台导出路径
                  </div>
                )}
                <div
                  className={`flex-1 border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer flex flex-col items-center justify-center ${
                    isDragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-blue-300 hover:bg-slate-50'
                  }`}
                  onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-10 h-10 text-slate-400 mb-3" />
                  <p className="text-slate-700 font-medium mb-1">
                    {hintType
                      ? `拖入「${DATA_TYPE_GUIDE.find(g => g.type === hintType)?.label}」文件`
                      : '拖拽 Excel 文件到此处，或点击选择'}
                  </p>
                  <p className="text-xs text-slate-400">支持 .xlsx / .xls / .csv · 自动识别数据类型，无需手动选择</p>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleInputChange} />
                </div>
              </div>
            </div>
          )}

          {/* Step: Preview */}
          {step === 'preview' && preview && (
            <div className="space-y-5">
              {/* 识别结果 */}
              <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                <CheckCircle className="w-6 h-6 text-green-600 shrink-0" />
                <div>
                  <p className="font-semibold text-green-900">
                    识别为: {preview.dataTypeLabel}
                  </p>
                  <p className="text-sm text-green-700">
                    共 {preview.totalRows} 条数据 · 货币: {preview.currency} · 文件: {file?.name}
                  </p>
                </div>
              </div>

              {/* 日期范围 / 统计周期 */}
              {(() => {
                // 无日明细类型：广告、商品卡、全渠道商品 → 锁定粒度选择
                const needsGranLock = preview.dataType === 'ad_sessions'
                  || preview.dataType === 'store_products'
                  || preview.dataType === 'product_overview'
                  || preview.dataType === 'product_details' // 通常无内置日期，与广告/商品卡同样用粒度选择器

                // ISO 周转 Mon/Sun 日期
                const weekToRange = (isoWeek: string) => {
                  const [y, w] = isoWeek.split('-W').map(Number)
                  const jan4 = new Date(y, 0, 4)
                  const startOfW1 = new Date(jan4)
                  startOfW1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7))
                  const monday = new Date(startOfW1)
                  monday.setDate(monday.getDate() + (w - 1) * 7)
                  const sunday = new Date(monday)
                  sunday.setDate(monday.getDate() + 6)
                  const fmt = (d: Date) => d.toLocaleDateString('sv-SE')
                  return { from: fmt(monday), to: fmt(sunday) }
                }

                return (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <Calendar className="w-4 h-4" />
                      数据统计周期
                      {needsGranLock && (
                        <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          ⚠️ 不含日明细
                        </span>
                      )}
                      {preview.needsDateInput && !needsGranLock && (
                        <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">需手动填写</span>
                      )}
                    </div>

                    {needsGranLock ? (
                      <div className="space-y-3">
                        {/* 粒度选择 */}
                        <div className="flex gap-2">
                          {(['week', 'month', 'custom'] as const).map(g => (
                            <button
                              key={g}
                              onClick={() => { setPeriodGranularity(g); setDateFrom(''); setDateTo('') }}
                              className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${
                                periodGranularity === g
                                  ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                                  : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300'
                              }`}
                            >
                              {g === 'week' ? '📅 按周' : g === 'month' ? '🗓️ 按月' : '✏️ 自定义'}
                            </button>
                          ))}
                        </div>

                        {/* 按周 */}
                        {periodGranularity === 'week' && (
                          <div>
                            <input
                              type="week"
                              className="px-3 py-2 rounded-lg border border-slate-300 text-sm w-full focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                              onChange={e => {
                                if (!e.target.value) return
                                const { from, to } = weekToRange(e.target.value)
                                setDateFrom(from); setDateTo(to)
                              }}
                            />
                            <p className="text-[10px] text-slate-400 mt-1">选中后自动对齐到该周一 ~ 周日</p>
                          </div>
                        )}

                        {/* 按月 */}
                        {periodGranularity === 'month' && (
                          <div>
                            <input
                              type="month"
                              className="px-3 py-2 rounded-lg border border-slate-300 text-sm w-full focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                              onChange={e => {
                                if (!e.target.value) return
                                const [y, m] = e.target.value.split('-').map(Number)
                                const lastDay = new Date(y, m, 0).getDate()
                                setDateFrom(`${String(y)}-${String(m).padStart(2,'0')}-01`)
                                setDateTo(`${String(y)}-${String(m).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`)
                              }}
                            />
                            <p className="text-[10px] text-slate-400 mt-1">自动填入所选月份首日到末日</p>
                          </div>
                        )}

                        {/* 自定义（带警告） */}
                        {periodGranularity === 'custom' && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                              <span className="text-slate-400">~</span>
                              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                            </div>
                            <p className="text-[10px] text-amber-600">
                              ⚠️ 建议使用完整自然周或自然月，跨标准周期可能影响同环比对比准确性
                            </p>
                          </div>
                        )}

                        {/* 已选日期回显 */}
                        {dateFrom && dateTo && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg">
                            <span className="text-xs text-amber-700 font-medium">已选周期：</span>
                            <span className="text-xs text-amber-800 font-mono">{dateFrom} ~ {dateTo}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* 普通日期输入（直播 / 视频 — 通常含行级日期，从文件中自动提取） */
                      <div className="flex items-center gap-3">
                        <input
                          type="date" value={dateFrom}
                          onChange={e => setDateFrom(e.target.value)}
                          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <span className="text-slate-400">~</span>
                        <input
                          type="date" value={dateTo}
                          onChange={e => setDateTo(e.target.value)}
                          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* 广告类型选项 */}
              {preview.dataType === 'ad_sessions' && (
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-200 space-y-3">
                  <p className="text-sm font-medium text-blue-900">广告配置</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">广告主类型</label>
                      <select value={advertiserType} onChange={e => setAdvertiserType(e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-sm">
                        <option value="self">自运营</option>
                        <option value="influencer">达人</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">广告类型</label>
                      <select value={adType} onChange={e => setAdType(e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-sm">
                        <option value="live">直播广告</option>
                        <option value="video">视频广告</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">内容类型</label>
                      <select value={contentType} onChange={e => setContentType(e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-sm">
                        <option value="live_room">直播间画面</option>
                        <option value="short_video">短视频</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* 渠道类型选项：店铺产品 & 产品明细 */}
              {(preview.dataType === 'store_products' || preview.dataType === 'product_details') && (
                <div className="p-4 bg-violet-50 rounded-xl border border-violet-200 space-y-3">
                  <p className="text-sm font-medium text-violet-900">销售渠道归属</p>
                  <p className="text-xs text-violet-600">请选择该数据所属的销售渠道，用于后续的分渠道查看与占比分析</p>
                  <div className="flex gap-2">
                    {[
                      { value: 'ALL', label: '综合/全渠道', desc: '不区分渠道' },
                      { value: 'LIVE', label: '直播', desc: '直播间成交' },
                      { value: 'SHOP_TAB', label: '商品卡', desc: '橱窗/商城' },
                    ].map(ch => (
                      <button
                        key={ch.value}
                        onClick={() => setChannelType(ch.value)}
                        className={`flex-1 px-3 py-2.5 rounded-lg border-2 text-left transition-all ${
                          channelType === ch.value
                            ? 'border-violet-500 bg-violet-100 shadow-sm'
                            : 'border-slate-200 bg-white hover:border-violet-300'
                        }`}
                      >
                        <p className={`text-sm font-medium ${channelType === ch.value ? 'text-violet-800' : 'text-slate-700'}`}>{ch.label}</p>
                        <p className="text-[10px] text-slate-400">{ch.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 数据预览表格 */}
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">数据预览（前5行）</p>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-slate-100">
                        {Object.keys(preview.previewRows[0] || {}).slice(0, 8).map(k => (
                          <th key={k} className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.previewRows.slice(0, 5).map((row, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          {Object.values(row).slice(0, 8).map((v, j) => (
                            <td key={j} className="px-3 py-1.5 text-slate-700 whitespace-nowrap max-w-[200px] truncate">
                              {String(v ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 覆盖提示 */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                ⚠️ 若该店铺同日期范围已有同类型数据，将自动覆盖旧数据。
              </div>
            </div>
          )}

          {/* Step: Importing */}
          {step === 'importing' && (
            <div className="text-center py-16">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
              <p className="font-medium text-slate-700">正在导入数据...</p>
              <p className="text-sm text-slate-500 mt-1">请勿关闭窗口</p>
            </div>
          )}

          {/* Step: Done */}
          {step === 'done' && result && (
            <div className="text-center py-12">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-slate-900 mb-2">导入成功!</h3>
              <div className="inline-block bg-green-50 border border-green-200 rounded-xl p-4 text-left text-sm space-y-1">
                <p><span className="font-medium">类型:</span> {result.dataTypeLabel}</p>
                <p><span className="font-medium">记录数:</span> {result.recordCount} 条</p>
                <p><span className="font-medium">日期范围:</span> {result.dateFrom} ~ {result.dateTo}</p>
                <p><span className="font-medium">货币:</span> {result.currency}</p>
                {result.overwritten && <p className="text-amber-600">⚡ 已覆盖旧数据</p>}
              </div>
            </div>
          )}

          {/* Step: Error */}
          {step === 'error' && (
            <div className="text-center py-12">
              <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-slate-900 mb-2">操作失败</h3>
              <p className="text-red-600 text-sm mb-4">{error}</p>
              <button onClick={reset}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm">
                重新上传
              </button>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {(step === 'preview' || step === 'done') && (
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
            {step === 'preview' && (
              <>
                <button onClick={reset} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                  重新选择
                </button>
                <button
                  onClick={handleCommit}
                  disabled={!dateFrom || !dateTo}
                  className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  确认导入 ({preview?.totalRows} 条)
                </button>
              </>
            )}
            {step === 'done' && (
              <button onClick={handleClose}
                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                完成
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
