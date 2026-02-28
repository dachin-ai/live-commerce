import fs from 'fs'

/**
 * TikTok直播数据Excel解析器
 * 根据后台导出的直播数据模板解析数据
 */
export interface TikTokLiveData {
  // 基础信息
  date?: string // 日期
  liveId?: string // 直播ID
  liveTitle?: string // 直播标题
  anchorName?: string // 主播名称
  
  // 观看数据
  totalViewers?: number // 总观看人数
  peakViewers?: number // 峰值观看人数
  averageViewers?: number // 平均观看人数
  newViewers?: number // 新观看人数
  returningViewers?: number // 回访观看人数
  
  // 互动数据
  totalInteractions?: number // 总互动数
  likes?: number // 点赞数
  comments?: number // 评论数
  shares?: number // 分享数
  follows?: number // 关注数
  
  // 销售数据
  totalGMV?: number // 总成交额
  totalOrders?: number // 总订单数
  completedOrders?: number // 成交订单数
  refundOrders?: number // 退款订单数
  averageOrderValue?: number // 客单价
  
  // 时长数据
  liveDuration?: number // 直播时长（分钟）
  startTime?: string // 开播时间
  endTime?: string // 结束时间
  
  // 转化数据
  conversionRate?: number // 转化率
  clickThroughRate?: number // 点击率
  interactionRate?: number // 互动率
  
  // 商品数据
  productViews?: number // 商品曝光次数
  productClicks?: number // 商品点击次数
  
  // 其他
  [key: string]: any // 允许其他字段
}

/**
 * 解析Excel文件
 */
export function parseExcelFile(filePath: string): TikTokLiveData[] {
  try {
    // 检查xlsx库是否已安装
    let XLSX: any
    try {
      // @ts-ignore
      XLSX = require('xlsx')
    } catch (err) {
      throw new Error('xlsx库未安装，请运行: npm install xlsx')
    }

    // 读取Excel文件
    const workbook = XLSX.readFile(filePath, { type: 'file' })
    
    // 获取第一个工作表
    const firstSheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[firstSheetName]
    
    // 转换为JSON（第一行作为表头）
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
      raw: false, // 保持原始格式
      defval: null, // 空单元格返回null
    })
    
    // 标准化字段名（处理中英文表头）
    const normalizedData: TikTokLiveData[] = jsonData.map((row: any) => {
      return normalizeRow(row)
    })
    
    return normalizedData
  } catch (error) {
    console.error('解析Excel文件失败:', error)
    throw new Error(`解析Excel文件失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
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
  normalized.totalViewers = parseNumber(pick(row, trimmedMap, '总观看人数', 'totalViewers', 'Total Viewers', '观看人数', '直播间观看次数', '累计在线人数', '观看人次', '累计观看'))
  normalized.peakViewers = parseNumber(pick(row, trimmedMap, '峰值观看', 'peakViewers', 'Peak Viewers', '峰值人数', '最高在线观看人数'))
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
  normalized.productViews = parseNumber(pick(row, trimmedMap, '商品曝光', '商品曝光次数', '商品展示', '商品展示次数', 'productViews', 'Product Views', '曝光', '曝光量', '曝光次数', 'Impressions'))
  normalized.productClicks = parseNumber(pick(row, trimmedMap, '商品点击', '商品点击次数', '商品点击数', 'productClicks', 'Product Clicks', '点击', '点击量', '点击数', 'Clicks'))
  
  // 无「总互动」列时用点赞+评论+分享汇总，避免仪表盘总互动数恒为 0
  if ((normalized.totalInteractions == null || normalized.totalInteractions === 0) &&
      (normalized.likes != null || normalized.comments != null || normalized.shares != null)) {
    normalized.totalInteractions = (normalized.likes || 0) + (normalized.comments || 0) + (normalized.shares || 0)
  }
  
  // 销售数据映射（Creator-Live-Performance: 成交金额、直接 GMV、成交件数、支付订单次数）
  normalized.totalGMV = parseNumber(pick(row, trimmedMap, 'GMV', 'gmv', '总成交额', '成交额', '销售额', '成交金额', '直接 GMV', '直接GMV', 'GMV(元)'))
  normalized.totalOrders = parseNumber(pick(row, trimmedMap, '总订单', 'totalOrders', 'Total Orders', '订单数', '成交件数', '订单数量', '支付订单数'))
  normalized.completedOrders = parseNumber(pick(row, trimmedMap, '成交订单', 'completedOrders', 'Completed Orders', '完成订单', '支付订单次数', '支付订单数'))
  normalized.refundOrders = parseNumber(pick(row, trimmedMap, '退款订单', 'refundOrders', 'Refund Orders', '退款'))
  normalized.averageOrderValue = parseNumber(pick(row, trimmedMap, '客单价', 'averageOrderValue', 'Average Order Value', 'AOV', '平均价格'))

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
  normalized.startTime = pick(row, trimmedMap, '直播开始时间', '开播时间', 'startTime', 'Start Time', '开始时间') as string | undefined
  if (normalized.startTime && !normalized.date) normalized.date = String(normalized.startTime).split(/\s+/)[0].replace(/\//g, '-')
  normalized.endTime = pick(row, trimmedMap, '结束时间', 'endTime', 'End Time') as string | undefined

  // 转化数据映射（Creator-Live-Performance / 抖店罗盘：看播-点击转化率、点击成交转化率、互动率等）
  normalized.conversionRate = parseNumber(pick(row, trimmedMap, '转化率', 'conversionRate', 'Conversion Rate', '转化', '点击成交转化率（SKU 订单）', '成交转化率', '转化率%'))
  normalized.clickThroughRate = parseNumber(pick(row, trimmedMap, '点击率', 'clickThroughRate', 'Click Through Rate', 'CTR', '看播-点击转化率', '点击转化率'))
  normalized.interactionRate = parseNumber(pick(row, trimmedMap, '互动率', 'interactionRate', 'Interaction Rate', '互动率%', '参与率', 'Engagement rate'))
  
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
    // 再移除单字符货币符号、千分位逗号等
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
