/** TikTok 直播数据行结构（供内部 normalizeRow 和外部 dataImport 路由使用） */
export interface TikTokLiveData {
  date?: string; liveId?: string; liveTitle?: string; anchorName?: string
  totalViewers?: number; peakViewers?: number; averageViewers?: number
  newViewers?: number; returningViewers?: number
  totalInteractions?: number; likes?: number; comments?: number
  shares?: number; follows?: number
  totalGMV?: number; totalOrders?: number; completedOrders?: number
  refundOrders?: number; averageOrderValue?: number
  liveDuration?: number; startTime?: string; endTime?: string
  conversionRate?: number; clickThroughRate?: number; interactionRate?: number
  productViews?: number; productClicks?: number
  [key: string]: any
}

/** 从 row 中按多个候选列名取值（支持表头带首尾空格），返回第一个非空 */
function pick(row: any, trimmedMap: Record<string, any>, ...keys: string[]): any {
  for (const k of keys) {
    const v = trimmedMap[k] ?? row[k]
    if (v != null && v !== '') return v
  }
  return undefined
}

/**
 * 标准化数据行（处理不同的表头格式）
 */
function normalizeRow(row: any): TikTokLiveData {
  const normalized: TikTokLiveData = {}
  // 表头可能带首尾空格，建 trim 映射便于匹配
  const trimmedMap: Record<string, any> = {}
  for (const [k, v] of Object.entries(row || {})) {
    const t = String(k).trim()
    if (t && (trimmedMap[t] == null || trimmedMap[t] === '')) trimmedMap[t] = v
  }

  // 日期字段映射
  const dateVal = pick(row, trimmedMap, '日期', 'date', 'Date', '直播日期')
  if (dateVal) normalized.date = String(dateVal)

  // 直播ID映射
  const liveIdVal = pick(row, trimmedMap, '直播ID', 'liveId', 'Live ID', '直播编号')
  if (liveIdVal) normalized.liveId = String(liveIdVal)

  // 直播标题映射（Creator-Live-Performance: 直播间信息）
  const titleVal = pick(row, trimmedMap, '直播标题', 'title', 'Title', '直播名称', '直播间信息')
  if (titleVal) normalized.liveTitle = String(titleVal)

  // 主播名称映射
  const anchorVal = pick(row, trimmedMap, '主播', 'anchor', 'Anchor', '主播名称')
  if (anchorVal) normalized.anchorName = String(anchorVal)

  // 观看数据映射（Creator-Live-Performance: 直播间观看次数、累计在线人数、最高在线观看人数）
  normalized.totalViewers = parseNumber(
    pick(row, trimmedMap, '总观看人数', 'totalViewers', 'Total Viewers', 'Viewers', '观看人数', '直播间观看次数', '累计在线人数', '观看人次', '累计观看')
  )
  normalized.peakViewers = parseNumber(pick(row, trimmedMap, '峰值观看', 'peakViewers', 'Peak Viewers', 'Peak viewers', '峰值人数', '最高在线观看人数'))
  normalized.averageViewers = parseNumber(pick(row, trimmedMap, '平均观看', 'averageViewers', 'Average Viewers', '平均人数'))
  normalized.newViewers = parseNumber(pick(row, trimmedMap, '新观看', 'newViewers', 'New Viewers', '新用户'))
  normalized.returningViewers = parseNumber(pick(row, trimmedMap, '回访观看', 'returningViewers', 'Returning Viewers', '回访用户'))

  // 互动数据映射（总互动、互动数、评论+点赞+分享等；兼容抖音/抖店/TikTok 多种导出列名）
  normalized.totalInteractions = parseNumber(pick(row, trimmedMap, '总互动', 'totalInteractions', 'Total Interactions', '互动数', '总互动数', '互动次数'))
  normalized.likes = parseNumber(pick(row, trimmedMap, '点赞', '点赞数', '点赞总数', '点赞量', 'likes', 'Likes', 'Like count', 'like_count', '喜欢', '喜欢数'))
  normalized.comments = parseNumber(pick(row, trimmedMap, '评论', '评论数', '评论总数', '评论量', 'comments', 'Comments', 'Comment count', 'comment_count'))
  normalized.shares = parseNumber(pick(row, trimmedMap, '分享', '分享数', '分享次数', '分享总数', '分享量', 'shares', 'Shares', 'Share count', 'share_count'))
  normalized.follows = parseNumber(pick(row, trimmedMap, '关注', '关注数', '新增粉丝', '新增粉丝数', '新增关注', '粉丝增长', '涨粉', '涨粉数', 'follows', 'Follows', 'New followers', 'new_followers'))

  // 商品相关（Creator-Live-Performance / 抖店罗盘 等）
  normalized.productViews = parseNumber(
    pick(
      row,
      trimmedMap,
      '商品曝光',
      '商品曝光次数',
      '商品展示',
      '商品展示次数',
      'productViews',
      'Product Views',
      'Product impressions',
      '曝光',
      '曝光量',
      '曝光次数',
      'Impressions'
    )
  )
  normalized.productClicks = parseNumber(
    pick(
      row,
      trimmedMap,
      '商品点击',
      '商品点击次数',
      '商品点击数',
      'productClicks',
      'Product Clicks',
      'Product clicks',
      '点击',
      '点击量',
      '点击数',
      'Clicks'
    )
  )
  
  // 无「总互动」列时用点赞+评论+分享汇总，避免仪表盘总互动数恒为 0
  if ((normalized.totalInteractions == null || normalized.totalInteractions === 0) &&
      (normalized.likes != null || normalized.comments != null || normalized.shares != null)) {
    normalized.totalInteractions = (normalized.likes || 0) + (normalized.comments || 0) + (normalized.shares || 0)
  }
  
  // 销售数据映射（Creator-Live-Performance: 成交金额、直接 GMV、成交件数、支付订单次数）
  normalized.totalGMV = parseNumber(
    pick(
      row,
      trimmedMap,
      'GMV',
      'gmv',
      '总成交额',
      '成交额',
      '销售额',
      '成交金额',
      '直接 GMV',
      '直接GMV',
      'Direct GMV',
      'Gross revenue',
      'GMV(元)'
    )
  )
  normalized.totalOrders = parseNumber(
    pick(row, trimmedMap, '总订单', 'totalOrders', 'Total Orders', 'Orders paid for', '订单数', '成交件数', '订单数量', '支付订单数')
  )
  // TikTok Creator-Live-Performance：通常用 Orders paid for 表示已支付/成交订单数
  normalized.completedOrders = parseNumber(
    pick(row, trimmedMap, '成交订单', 'completedOrders', 'Completed Orders', 'Orders paid for', '完成订单', '支付订单次数', '支付订单数')
  )
  normalized.refundOrders = parseNumber(pick(row, trimmedMap, '退款订单', 'refundOrders', 'Refund Orders', '退款'))
  normalized.averageOrderValue = parseNumber(
    pick(row, trimmedMap, '客单价', 'averageOrderValue', 'Average Order Value', 'Avg. price', 'AOV', '平均价格')
  )

  // 时长数据映射（TikTok 等导出多为秒；支持秒/分钟/小时多种表头与单位，统一换算为分钟后下游转小时）
  const durationSeconds = parseNumber(
    pick(row, trimmedMap, '直播时长(秒)', '时长(秒)', '直播时长（秒）', '时长（秒）', 'Duration (seconds)', 'duration_seconds',
      '直播时长', '时长', 'duration', 'Duration', '观看时长', '开播时长')
  )
  const durationMinutes = parseNumber(
    pick(row, trimmedMap, '时长(分钟)', '直播时长(分钟)', '时长（分钟）', '直播时长（分钟）', '观看时长(分钟)')
  )
  if (durationMinutes != null && durationMinutes >= 0) {
    normalized.liveDuration = durationMinutes
  } else if (durationSeconds != null && durationSeconds >= 0) {
    normalized.liveDuration = Math.round(durationSeconds / 60)
  } else {
    const durationHours = parseNumber(pick(row, trimmedMap, '时长(小时)', '直播时长(小时)', '时长（小时）', '直播时长（小时）'))
    if (durationHours != null && durationHours >= 0) {
      normalized.liveDuration = durationHours * 60
    }
  }
  // 直播开始时间（用于按场次唯一去重）
  normalized.startTime = pick(row, trimmedMap, '直播开始时间', '开播时间', 'startTime', 'Start Time', 'Start time', '开始时间') as string | undefined
  if (normalized.startTime && !normalized.date) normalized.date = String(normalized.startTime).split(/\s+/)[0].replace(/\//g, '-')
  normalized.endTime = pick(row, trimmedMap, '结束时间', 'endTime', 'End Time') as string | undefined

  // 转化数据映射（Creator-Live-Performance / 抖店罗盘：看播-点击转化率、点击成交转化率、互动率等）
  normalized.conversionRate = parseNumber(
    pick(
      row,
      trimmedMap,
      '转化率',
      'conversionRate',
      'Conversion Rate',
      'CTOR (SKU orders)',
      '转化',
      '点击成交转化率（SKU 订单）',
      '成交转化率',
      '转化率%'
    )
  )
  normalized.clickThroughRate = parseNumber(pick(row, trimmedMap, '点击率', 'clickThroughRate', 'Click Through Rate', 'CTR', '看播-点击转化率', '点击转化率'))
  normalized.interactionRate = parseNumber(
    pick(row, trimmedMap, '互动率', 'interactionRate', 'Interaction Rate', '互动率%', '参与率', 'Engagement rate')
  )
  // 若表格未提供「互动率」列（你这份 4.13.xlsx 就没有），则用 总互动/观看人数 自动估算，避免仪表盘恒为 0
  if (
    (normalized.interactionRate == null || normalized.interactionRate === 0) &&
    normalized.totalInteractions != null &&
    normalized.totalViewers != null &&
    normalized.totalViewers > 0
  ) {
    normalized.interactionRate = normalized.totalInteractions / normalized.totalViewers
  }
  
  return normalized
}

/**
 * 解析数字（处理各种格式）
 */
function parseNumber(value: any): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined
  }
  
  if (typeof value === 'number') {
    return isNaN(value) ? undefined : value
  }
  
  if (typeof value === 'string') {
    // 先移除多字符货币前缀（马来西亚 RM、印尼 Rp、新加坡 S$ 等），支持 "RM 1,234" / "RM1234" 等格式
    let cleaned = value.replace(/\bRM\s*/gi, '').replace(/\bRp\.?\s*/gi, '').replace(/\bS\$\s*/gi, '')
      .replace(/\bHK\$\s*/gi, '').replace(/\bNT\$\s*/gi, '').replace(/\bB\$\s*/gi, '')
    cleaned = cleaned.trim()
    // 常见千分位：印尼/欧式用 '.' 做千分位（如 9.467.316），美式用 ','（如 9,467,316）
    // 规则：若数字满足 1-3 位开头 + (.[3位])+ 且不包含逗号，则视为千分位点号，移除全部点号
    const dotAsThousands = /^\d{1,3}(?:\.\d{3})+$/.test(cleaned) && !cleaned.includes(',')
    if (dotAsThousands) cleaned = cleaned.replace(/\./g, '')
    // 再移除单字符货币符号、千分位逗号、空格与百分号等（保留小数点用于 0.353407 这类）
    cleaned = cleaned.replace(/[¥$€£฿₫₱₭៛,\s%]/g, '').trim()
    const num = parseFloat(cleaned)
    return isNaN(num) ? undefined : num
  }
  
  return undefined
}

/**
 * 从Buffer解析Excel（用于上传文件）
 */
export function parseExcelBuffer(buffer: Buffer): TikTokLiveData[] {
  try {
    // 检查xlsx库是否已安装
    let XLSX: any
    try {
      // @ts-ignore
      XLSX = require('xlsx')
    } catch (err) {
      throw new Error('xlsx库未安装，请运行: npm install xlsx')
    }

    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const firstSheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[firstSheetName]
    
    let jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: null })
    // Creator-Live-Performance 等导出：表头在第 3 行（索引 2），前两行为日期范围/空行
    const firstRowKeys = jsonData.length > 0 ? Object.keys(jsonData[0]) : []
    const looksLikeDateRangeHeader = firstRowKeys.some(k => String(k).indexOf('~') >= 0)
    if (jsonData.length > 0 && (firstRowKeys.length <= 2 || looksLikeDateRangeHeader)) {
      jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: null, range: 2 })
    }
    if (process.env.DEBUG_EXCEL_HEADERS === '1' && jsonData.length > 0) {
      const headers = Object.keys(jsonData[0])
      console.log('[excelParser] 检测到的表头列名:', headers.join(' | '))
    }

    const normalizedData: TikTokLiveData[] = jsonData.map((row: any) => {
      return normalizeRow(row)
    })
    
    return normalizedData
  } catch (error) {
    console.error('解析Excel Buffer失败:', error)
    throw new Error(`解析Excel文件失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}
/**
 * ─────────────────────────────────────────────────────────────────
 * 以下为新版 TT 多格式导入解析器（4种数据范式）
 * 与旧版 parseExcelBuffer / TikTokLiveData 完全独立，向后兼容
 * ─────────────────────────────────────────────────────────────────
 */
import * as XLSX from 'xlsx'

export type TtDataType = 'live_sessions' | 'ad_sessions' | 'store_products' | 'product_details' | 'product_overview' | 'video_sessions'

export interface ParsedTtResult {
  dataType: TtDataType
  dateFrom: string | null
  dateTo: string | null
  currency: string
  headers: string[]
  rows: Record<string, unknown>[]
  rawHeaderRow: number
}

// ─── 数值清洗 ─────────────────────────────────────────────────────

function cleanNum(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number') return isNaN(val) ? 0 : val
  let s = String(val).trim()
    .replace(/^Rp\.?\s*/i, '').replace(/^฿\s*/i, '').replace(/^¥\s*/i, '')
    .replace(/^₫\s*/i, '').replace(/^RM\s*/i, '').replace(/%$/, '')
  const dots = (s.match(/\./g) || []).length
  const commas = (s.match(/,/g) || []).length
  if (dots > 1) { s = s.replace(/\./g, '').replace(/,/g, '.') }
  else if (dots === 1 && commas === 0) {
    const after = s.split('.')[1] || ''
    if (after.length === 3) s = s.replace('.', '') // 千分位
  } else if (commas > 0 && dots === 0) { s = s.replace(/,/g, '') }
  else if (commas > 0 && dots > 0) { s = s.replace(/,/g, '') }
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}
const cleanInt = (v: unknown) => Math.round(cleanNum(v))
const parseRate = (v: unknown) => parseFloat(String(v ?? '').replace('%', '').trim()) || 0

// ─── 日期提取 ─────────────────────────────────────────────────────

function extractDateRange(text: string): { dateFrom: string; dateTo: string } | null {
  // 标准: YYYY-MM-DD ~ YYYY-MM-DD
  const m1 = text.match(/(\d{4}-\d{2}-\d{2})\s*[~\-–]\s*(\d{4}-\d{2}-\d{2})/)
  if (m1) return { dateFrom: m1[1], dateTo: m1[2] }
  // TT 广告导出: YYYY-MM-DD HH ~ YYYY-MM-DD HH（日期后面跟小时数）
  const m1b = text.match(/(\d{4}-\d{2}-\d{2})\s+\d{1,2}\s*[~\-–]\s*(\d{4}-\d{2}-\d{2})\s+\d{1,2}/)
  if (m1b) return { dateFrom: m1b[1], dateTo: m1b[2] }
  // TT 标准导出格式: "Date range: YYYY/MM/DD - YYYY/MM/DD"
  const m2 = text.match(/(\d{4})[/\-](\d{2})[/\-](\d{2})\s*[~\-–\s]+\s*(\d{4})[/\-](\d{2})[/\-](\d{2})/)
  if (m2) return { dateFrom: `${m2[1]}-${m2[2]}-${m2[3]}`, dateTo: `${m2[4]}-${m2[5]}-${m2[6]}` }
  // TikTok 直播导出表头: "Date Start: 2026-03-15  Date End: 2026-04-11"
  const m3 = text.match(/Date Start[:\s]+([\d\-\/]+).*?Date End[:\s]+([\d\-\/]+)/i)
  if (m3) {
    const parse = (s: string) => s.replace(/\//g, '-').trim()
    return { dateFrom: parse(m3[1]), dateTo: parse(m3[2]) }
  }
  // 表格元数据单元格: "2026-04-06 to 2026-04-12"
  const m4 = text.match(/(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/i)
  if (m4) return { dateFrom: m4[1], dateTo: m4[2] }
  return null
}

function findDateInRows(rows: unknown[][]): { dateFrom: string; dateTo: string } | null {
  for (const row of rows.slice(0, 4)) {
    for (const cell of (row as unknown[])) {
      if (typeof cell === 'string') { const d = extractDateRange(cell); if (d) return d }
    }
  }
  return null
}

// ─── 格式识别 ─────────────────────────────────────────────────────

function detectTtType(headers: string[]): TtDataType | null {
  const h = headers.map(s => String(s || '').toLowerCase())
  const has = (k: string) => h.some(x => x.includes(k))
  if (has('campaign name') || has('net cost') || has('cost per live view')) return 'ad_sessions'
  if (has('livestream') && has('duration')) return 'live_sessions'
  // Video Sessions: TikTok short-video performance export — unique columns: Video Info + VV (video views)
  if (has('video info') || (has('vv') && has('gpm'))) return 'video_sessions'
  // Product Overview: multi-channel product report (Shop tab + LIVE + Video + Product card)
  if (has('shop tab gmv') && has('live gmv')) return 'product_overview'
  if (has('view to paid rate') || (has('product id') && has('add to cart'))) return 'store_products'
  if (has('总成交额') || has('成交件数') || has('佣金')) return 'product_details'
  return null
}

// ─── 行映射 ────────────────────────────────────────────────────────

function colGet(row: unknown[], headers: string[], key: string): unknown {
  const idx = headers.findIndex(h => h.toLowerCase().includes(key.toLowerCase()))
  return idx >= 0 ? row[idx] : undefined
}

/**
 * Convert an Excel date serial number (e.g. 46124.6284722222) to ISO datetime string.
 * Excel serial 25569 = 1970-01-01 (Unix epoch). Each unit = 1 day.
 * Falls back to normalising slash-delimited date strings ("2025/08/22 16:00:00" → "2025-08-22 16:00:00").
 */
function excelSerialToIso(v: unknown): string {
  if (v === '' || v == null) return ''
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  if (!isNaN(n) && n > 1000) {
    // (serial - 25569) * 86400 * 1000 = milliseconds since Unix epoch
    const d = new Date(Math.round((n - 25569) * 86400 * 1000))
    return d.toISOString().slice(0, 19).replace('T', ' ')
  }
  // Already a string date — normalise slashes to hyphens
  return String(v).replace(/\//g, '-').trim()
}


const mapLive = (row: unknown[], h: string[]): Record<string, unknown> => {
  const grossRevenue = cleanNum(colGet(row, h, 'gross revenue'))
  const durationSeconds = cleanInt(colGet(row, h, 'duration'))
  const views = cleanInt(colGet(row, h, 'views'))
  const viewers = cleanInt(colGet(row, h, 'viewers'))
  const likes = cleanInt(colGet(row, h, 'likes'))
  const comments = cleanInt(colGet(row, h, 'comments'))
  const shares = cleanInt(colGet(row, h, 'shares'))
  const ordersPaid = cleanInt(colGet(row, h, 'orders paid'))
  const productImpressions = cleanInt(colGet(row, h, 'product impressions'))
  const productClicks = cleanInt(colGet(row, h, 'product clicks'))

  // 衍生指标（在解析时直接计算，方便分析层直接使用）
  const durationHours = durationSeconds > 0 ? durationSeconds / 3600 : 0
  const gmvPerHour = durationHours > 0 ? Math.round(grossRevenue / durationHours) : 0
  const revenuePerViewer = viewers > 0 ? grossRevenue / viewers : 0
  const orderCvr = viewers > 0 ? ordersPaid / viewers : 0                   // 下单转化率
  const engagementRate = views > 0 ? (likes + comments + shares) / views : 0 // 互动率

  // CTR / CTOR 标准化：统一存为百分比（5.25 表示 5.25%）
  // TikTok 导出的 CTR 可能是小数形式（0.05）或百分比形式（5.25）或带%号（5.25%）
  const rawCtr = cleanNum(colGet(row, h, 'ctr'))
  const rawCtor = cleanNum(colGet(row, h, 'ctor'))
  // 如果值 < 1 且 > 0，认为是小数形式，需乘 100
  const normalizePct = (v: number): number => (v > 0 && v < 1) ? parseFloat((v * 100).toFixed(4)) : parseFloat(v.toFixed(4))

  let ctr = normalizePct(rawCtr)
  const ctor = normalizePct(rawCtor)

  // 如果 Excel 没提供 CTR 或值为 0，从 productClicks / productImpressions 计算
  if (ctr === 0 && productImpressions > 0 && productClicks > 0) {
    ctr = parseFloat(((productClicks / productImpressions) * 100).toFixed(4))
  }

  return {
    name: String(colGet(row, h, 'livestream') ?? ''),
    startTime: excelSerialToIso(colGet(row, h, 'start time')),
    durationSeconds,
    grossRevenue,
    directGmv: cleanNum(colGet(row, h, 'direct gmv')),
    itemsSold: cleanInt(colGet(row, h, 'items sold')),
    customers: cleanInt(colGet(row, h, 'customers')),
    avgPrice: cleanNum(colGet(row, h, 'avg. price')),
    ordersPaid,
    gmvPer1kShows: cleanNum(colGet(row, h, 'gmv/1k shows')),
    gmvPer1kViews: cleanNum(colGet(row, h, 'gmv/1k views')),
    views,
    viewers,
    peakViewers: cleanInt(colGet(row, h, 'peak viewers')),
    newFollowers: cleanInt(colGet(row, h, 'new followers')),
    avgViewDurationSec: cleanInt(colGet(row, h, 'avg. view duration')),
    likes,
    comments,
    shares,
    productImpressions,
    productClicks,
    ctr,
    ctor,
    // 衍生指标
    gmvPerHour,
    revenuePerViewer: parseFloat(revenuePerViewer.toFixed(2)),
    orderCvr: parseFloat((orderCvr * 100).toFixed(4)),   // 存为百分比
    engagementRate: parseFloat((engagementRate * 100).toFixed(4)), // 存为百分比
  }
}


const mapAd = (row: unknown[], h: string[]): Record<string, unknown> => {
  const currency = String(colGet(row, h, 'currency') ?? 'IDR')
  return {
    liveName: String(colGet(row, h, 'live name') ?? ''),
    launchedTime: excelSerialToIso(colGet(row, h, 'launched time')),
    status: String(colGet(row, h, 'status') ?? ''),
    campaignName: String(colGet(row, h, 'campaign name') ?? ''),
    campaignId: String(colGet(row, h, 'campaign id') ?? ''),
    adType: 'live', advertiserType: 'self', contentType: 'live_room',
    cost: cleanNum(colGet(row, h, 'cost')),
    netCost: cleanNum(colGet(row, h, 'net cost')),
    skuOrders: cleanInt(colGet(row, h, 'sku orders')),
    skuOrdersShop: cleanInt(colGet(row, h, 'sku orders (current shop)')),
    costPerOrder: cleanNum(colGet(row, h, 'cost per order')),
    grossRevenue: cleanNum(colGet(row, h, 'gross revenue')),
    grossRevenueShop: cleanNum(colGet(row, h, 'gross revenue (current shop)')),
    roi: cleanNum(colGet(row, h, 'roi')),
    liveViews: cleanInt(colGet(row, h, 'live views')),
    costPerLiveView: cleanNum(colGet(row, h, 'cost per live view')),
    views10s: cleanInt(colGet(row, h, '10-second live views')),
    costPer10sView: cleanNum(colGet(row, h, 'cost per 10-second')),
    liveFollows: cleanInt(colGet(row, h, 'live follows')),
    currency,
  }
}

const mapStoreProd = (row: unknown[], h: string[]): Record<string, unknown> => ({
  productId: String(colGet(row, h, 'product id') ?? ''),
  productName: String(colGet(row, h, 'name of product') ?? ''),
  viewers: cleanInt(colGet(row, h, 'viewers')),
  views: cleanInt(colGet(row, h, 'views')),
  uniqueClicks: cleanInt(colGet(row, h, 'unique clicks')),
  clicks: cleanInt(colGet(row, h, 'clicks')),
  skuOrders: cleanInt(colGet(row, h, 'sku orders')),
  customers: cleanInt(colGet(row, h, 'customers')),
  addToCartUsers: cleanInt(colGet(row, h, 'add to cart user')),
  clicksAddToCart: cleanInt(colGet(row, h, 'clicks add to cart')),
  gmv: cleanNum(colGet(row, h, 'gmv')),
  viewToPaidRate: parseRate(colGet(row, h, 'view to paid rate')),
  viewToClickRate: parseRate(colGet(row, h, 'view to click rate')),
  clickToCartRate: parseRate(colGet(row, h, 'click to cart rate')),
  clickToPaidRate: parseRate(colGet(row, h, 'click to paid rate')),
  cartToPaidRate: parseRate(colGet(row, h, 'cart to paid rate')),
  contentGmv: cleanNum(colGet(row, h, 'content attributed gmv')),
})

// Product Overview: one product row → expand into per-channel rows
const mapProductOverview = (row: unknown[], h: string[]): Record<string, unknown>[] => {
  const productId = String(colGet(row, h, 'id') ?? '')
  const productName = String(colGet(row, h, 'product') ?? '')
  const status = String(colGet(row, h, 'status') ?? '')

  const channels: Array<{
    channelType: string
    gmvKey: string
    itemsKey: string
    impressionsKey: string
    pageViewsKey: string
    uniquePageViewsKey: string
    customersKey: string
    ctrKey: string
    cvrKey: string
  }> = [
    { channelType: 'LIVE',         gmvKey: 'live gmv',          itemsKey: 'live items sold',          impressionsKey: 'live impressions',           pageViewsKey: 'page views from live',         uniquePageViewsKey: 'unique page views from live',         customersKey: 'live unique product customers',   ctrKey: 'live click-through rate',   cvrKey: 'live conversion rate' },
    { channelType: 'SHOP_TAB',     gmvKey: 'shop tab gmv',      itemsKey: 'shop tab items sold',      impressionsKey: 'shop tab listing impressions', pageViewsKey: 'shop tab page views',          uniquePageViewsKey: 'shop tab unique page views',          customersKey: 'shop tab unique product customers', ctrKey: 'shop tab clickthrough rate', cvrKey: 'shop tab conversion rate' },
    { channelType: 'VIDEO',        gmvKey: 'video gmv',         itemsKey: 'video items sold',         impressionsKey: 'video impressions',           pageViewsKey: 'page views from video',        uniquePageViewsKey: 'unique page views from video',        customersKey: 'video unique product customers',   ctrKey: 'video click-through rate',  cvrKey: 'video conversion rate' },
    { channelType: 'PRODUCT_CARD', gmvKey: 'product card gmv',  itemsKey: 'product  card items sold', impressionsKey: 'product card impressions',    pageViewsKey: 'page views from product card', uniquePageViewsKey: 'unique page views from product card', customersKey: 'product card unique customers',     ctrKey: 'product card click-through rate', cvrKey: 'product card conversion rate' },
  ]

  const results: Record<string, unknown>[] = []
  for (const ch of channels) {
    const gmv = cleanNum(colGet(row, h, ch.gmvKey))
    const skuOrders = cleanInt(colGet(row, h, ch.itemsKey))
    // Skip channel rows with zero GMV and zero orders (not sold through this channel)
    if (gmv === 0 && skuOrders === 0) continue
    results.push({
      productId,
      productName,
      status,
      channelType: ch.channelType,
      gmv,
      skuOrders,
      views: cleanInt(colGet(row, h, ch.impressionsKey)),
      clicks: cleanInt(colGet(row, h, ch.pageViewsKey)),
      uniqueClicks: cleanInt(colGet(row, h, ch.uniquePageViewsKey)),
      customers: cleanInt(colGet(row, h, ch.customersKey)),
      viewToClickRate: parseRate(colGet(row, h, ch.ctrKey)),
      clickToPaidRate: parseRate(colGet(row, h, ch.cvrKey)),
      addToCartUsers: 0,
    })
  }
  return results
}

// ─── Video Sessions: TikTok short-video performance ─────────────────────────
const mapVideo = (row: unknown[], h: string[]): Record<string, unknown> => {
  // Rates in this export are decimal (0.0815 = 8.15%) — normalise to percentage for consistency with live_sessions
  const normPct = (v: number): number => (v > 0 && v < 1) ? parseFloat((v * 100).toFixed(4)) : parseFloat(v.toFixed(4))
  const grossRevenue = cleanNum(colGet(row, h, 'gross merchandise value'))
  const videoViews   = cleanInt(colGet(row, h, 'vv'))
  const orders       = cleanInt(colGet(row, h, 'orders'))
  const itemsSold    = cleanInt(colGet(row, h, 'video items sold'))
  const productClicks = cleanInt(colGet(row, h, 'product clicks'))
  const productImpressions = cleanInt(colGet(row, h, 'product impressions'))
  // Derived: CTR from raw if missing
  const rawCtr = normPct(cleanNum(colGet(row, h, 'click-through rate')))
  const ctr = rawCtr === 0 && productImpressions > 0 && productClicks > 0
    ? parseFloat(((productClicks / productImpressions) * 100).toFixed(4))
    : rawCtr
  return {
    creatorName:      String(colGet(row, h, 'creator name') ?? ''),
    creatorId:        String(colGet(row, h, 'creator id') ?? ''),
    videoInfo:        String(colGet(row, h, 'video info') ?? ''),
    videoId:          String(colGet(row, h, 'video id') ?? ''),
    publishedAt:      excelSerialToIso(colGet(row, h, 'time')),
    products:         String(colGet(row, h, 'products') ?? ''),
    videoViews,
    likes:            cleanInt(colGet(row, h, 'likes')),
    comments:         cleanInt(colGet(row, h, 'comments')),
    shares:           cleanInt(colGet(row, h, 'shares')),
    newFollowers:     cleanInt(colGet(row, h, 'new followers')),
    videoToLiveClicks: cleanInt(colGet(row, h, 'v-to-l clicks')),
    productImpressions,
    productClicks,
    uniqueCustomers:  cleanInt(colGet(row, h, 'unique customers')),
    orders,
    itemsSold,
    grossRevenue,
    gpm:              cleanNum(colGet(row, h, 'gpm')),
    attributedGmv:    cleanNum(colGet(row, h, 'shoppable video attributed gmv')),
    ctr,
    videoToLiveRate:  normPct(cleanNum(colGet(row, h, 'v-to-l rate'))),
    videoFinishRate:  normPct(cleanNum(colGet(row, h, 'video finish rate'))),
    clickToOrderRate: normPct(cleanNum(colGet(row, h, 'click-to-order rate'))),
    mark:             String(colGet(row, h, 'mark') ?? ''),
  }
}

const mapProdDetail = (row: unknown[], h: string[]): Record<string, unknown> => {
  const lo = h.map(x => String(x).toLowerCase())
  const infoIdxs = lo.reduce<number[]>((a, x, i) => { if (x.includes('商品信息')) a.push(i); return a }, [])
  const get = (key: string) => { const idx = lo.findIndex(x => x.includes(key)); return idx >= 0 ? row[idx] : undefined }
  return {
    productId: String(row[infoIdxs[0] ?? 0] ?? ''),
    productName: String(row[infoIdxs[1] ?? 1] ?? ''),
    totalRevenue: cleanNum(get('总成交额')),
    commission: cleanNum(get('佣金')),
    unitsSold: cleanInt(get('成交件数')),
  }
}

// ─── 主解析入口 ───────────────────────────────────────────────────

export function parseTtExcelBuffer(
  buffer: Buffer,
  fileName: string,
  manualDateFrom?: string,
  manualDateTo?: string
): ParsedTtResult {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

  // 找真实表头行（第一个有 ≥3 非空单元格的行）
  let headerRowIdx = 0
  for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
    if ((rawRows[i] as unknown[]).filter(c => c !== '' && c !== null && c !== undefined).length >= 3) {
      headerRowIdx = i; break
    }
  }

  const headers = (rawRows[headerRowIdx] as unknown[]).map(h => String(h ?? '').trim())
  const dataRows = rawRows.slice(headerRowIdx + 1)
    .filter(r => (r as unknown[]).some(c => c !== '' && c !== null && c !== undefined))

  const dataType = detectTtType(headers)
  if (!dataType) throw new Error(`无法识别格式。列头: ${headers.slice(0, 5).join(' | ')}`)

  const dateInRows = findDateInRows(rawRows)
  const dateInName = extractDateRange(fileName)

  // 日期优先级策略：
  //   广告数据 (ad_sessions)：「文件名 > 表格内」
  //   → 因为表格内的日期是广告计划「创建日期」，不代表消耗周期
  //   → 文件名中的日期才是实际消耗统计周期
  //   其他数据类型：「表格内 > 文件名」
  let auto: { dateFrom: string; dateTo: string } | null
  if (dataType === 'ad_sessions') {
    auto = dateInName || dateInRows   // 文件名优先
  } else {
    auto = dateInRows || dateInName   // 表格内优先
  }

  const dateFrom = manualDateFrom || auto?.dateFrom || null
  const dateTo = manualDateTo || auto?.dateTo || null

  // 检测货币
  let currency = 'IDR'
  if (dataType === 'ad_sessions') {
    const ci = headers.findIndex(h => h.toLowerCase() === 'currency')
    for (const r of dataRows.slice(0, 5)) {
      if (ci >= 0 && r[ci]) { currency = String(r[ci]); break }
    }
  }

  // product_overview expands each row into multiple channel rows → stored as store_products
  if (dataType === 'product_overview') {
    const expandedRows: Record<string, unknown>[] = []
    for (const r of dataRows as unknown[][]) {
      expandedRows.push(...mapProductOverview(r, headers))
    }
    return { dataType: 'product_overview', dateFrom, dateTo, currency, headers, rows: expandedRows, rawHeaderRow: headerRowIdx }
  }

  const mapFns = { live_sessions: mapLive, ad_sessions: mapAd, store_products: mapStoreProd, product_details: mapProdDetail, video_sessions: mapVideo }
  const rows = (dataRows as unknown[][]).map(r => mapFns[dataType as Exclude<TtDataType, 'product_overview'>](r, headers))

  return { dataType, dateFrom, dateTo, currency, headers, rows, rawHeaderRow: headerRowIdx }
}
