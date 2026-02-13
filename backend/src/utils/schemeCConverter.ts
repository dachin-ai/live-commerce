/**
 * 方案C：将「完整 prompt」转换为结构化 API 数据（本系统即「第三方」）
 * 解析格式与 docs/待办生成-Coze调试入参示例-greenpet.md 一致。
 */

export interface StructuredSalesAnalysis {
  type: 'sales_analysis'
  platform: string
  country: string
  category?: string
  store_name?: string
  store_attributes?: Record<string, string>
  metrics: {
    total_orders: number
    total_viewers: number
    total_revenue: number
    conversion_rate: string
    total_duration?: number
    avg_gmv_per_hour?: number
    stage?: string
    platform?: string
    currency?: string
  }
  historical_comparison?: Record<string, number | string>
  raw_daily_table?: string
  stage_info?: string
  trend_info?: string
  natural_context?: Record<string, unknown>
}

/** 【店铺】greenpet（TikTok）| 区域：泰国 | 类目：宠物、宠物用品 */
function extractStoreInfo(prompt: string): { name: string; platform: string; region: string; category: string } {
  const storeRegex = /【店铺】([^（]+)（([^）]+)）\s*\|\s*区域：([^|]+)(?:\s*\|\s*类目：([^】\n]*))?/
  const match = prompt.match(storeRegex)
  if (match) {
    return {
      name: match[1].trim(),
      platform: match[2].trim(),
      region: match[3].trim(),
      category: (match[4] || '').trim(),
    }
  }
  return { name: '未知店铺', platform: 'TikTok', region: '泰国', category: '' }
}

/** 【店铺属性】目标人群：... | 品牌定位：... | 价格区间：... */
function extractStoreAttributes(prompt: string): Record<string, string> {
  const attrRegex = /【店铺属性】([^】\n]+)/
  const match = prompt.match(attrRegex)
  if (!match) return {}
  const attrText = match[1]
  const attrs: Record<string, string> = {}
  const audienceMatch = attrText.match(/目标人群：([^|]+)/)
  if (audienceMatch) attrs.target_audience = audienceMatch[1].trim()
  const brandMatch = attrText.match(/品牌定位：([^|]+)/)
  if (brandMatch) attrs.brand_positioning = brandMatch[1].trim()
  const priceMatch = attrText.match(/价格区间：([^|]+)/)
  if (priceMatch) attrs.price_range = priceMatch[1].trim()
  return attrs
}

/** 【最近30天数据】GMV 290600 | 时长 120h | 观看 17452 | 订单 636 | 转化率 3.6% | 时均GMV 2422 */
function extractMetrics(prompt: string, storeInfo: { platform: string }): StructuredSalesAnalysis['metrics'] {
  const metricsRegex = /【最近30天数据】([^】\n]+)/
  const match = prompt.match(metricsRegex)
  if (!match) {
    throw new Error('未找到【最近30天数据】')
  }
  const text = match[1]
  const num = (re: RegExp, def = 0) => {
    const m = text.match(re)
    return m ? parseInt(m[1], 10) || def : def
  }
  const gmv = num(/GMV\s+(\d+)/)
  const viewers = num(/观看\s+(\d+)/)
  const orders = num(/订单\s+(\d+)/)
  const durationMatch = text.match(/时长\s+([\d.]+)h?/)
  const duration = durationMatch ? Math.round(parseFloat(durationMatch[1]) || 0) : 1
  const convMatch = text.match(/转化率\s+([\d.]+)/)
  const conversion_rate = convMatch ? convMatch[1] : '0'
  const avgGmvMatch = text.match(/时均GMV\s+(\d+)/)
  const avg_gmv_per_hour = avgGmvMatch ? parseInt(avgGmvMatch[1], 10) : undefined
  const stageMatch = prompt.match(/【阶段与重点】([^：|]+)/)
  const stage = stageMatch ? stageMatch[1].trim() : '成长期'
  return {
    total_orders: orders,
    total_viewers: viewers,
    total_revenue: gmv,
    conversion_rate,
    total_duration: duration,
    avg_gmv_per_hour,
    stage,
    platform: storeInfo.platform,
    currency: '泰铢',
  }
}

/** 【历史对比】前4个30天区间平均 GMV 250000 | 平均转化 3.2% */
function extractHistoricalComparison(prompt: string): Record<string, number | string> {
  const histRegex = /【历史对比】([^】\n]+)/
  const match = prompt.match(histRegex)
  if (!match) return {}
  const text = match[1]
  const out: Record<string, number | string> = {}
  const gmvMatch = text.match(/平均\s*GMV\s+(\d+)/)
  if (gmvMatch) out.avg_gmv_last_4_periods = parseInt(gmvMatch[1], 10)
  const convMatch = text.match(/平均转化\s+([\d.]+)/)
  if (convMatch) out.avg_conversion_last_4_periods = convMatch[1]
  return out
}

/** 【最近30天按日明细】... 表格 ...（到下一个【或结尾） */
function extractDailyTable(prompt: string): string {
  const tableRegex = /【最近30天按日明细】[^\n]*\n([\s\S]+?)(?=【|$)/
  const match = prompt.match(tableRegex)
  return match ? match[1].trim() : ''
}

/** 【阶段与重点】成长期：... | 趋势：... */
function extractStageInfo(prompt: string): string {
  const stageRegex = /【阶段与重点】([^【\n]+)/
  const match = prompt.match(stageRegex)
  return match ? match[1].trim() : ''
}

function extractTrendInfo(prompt: string): string {
  const trendRegex = /趋势：([\w\s（）、]+?)(?:\s*[|】]|$)/
  const match = prompt.match(trendRegex)
  return match ? match[1].trim() : ''
}

/** 【时间与自然】秋季2月 | 即将节日：... | 气温：... */
function extractNaturalContext(prompt: string): Record<string, unknown> {
  const contextRegex = /【时间与自然】([^】\n]+)/
  const match = prompt.match(contextRegex)
  if (!match) return {}
  const text = match[1]
  const ctx: Record<string, unknown> = {}
  const seasonMatch = text.match(/^([^|]+)\|/)
  if (seasonMatch) ctx.season = seasonMatch[1].trim()
  const festivalsMatch = text.match(/即将节日：([^|]+)/)
  if (festivalsMatch) {
    const names = festivalsMatch[1].match(/(\w+)(\d+)天后/g) || []
    ctx.upcoming_festivals = names.map((s) => {
      const m = s.match(/(\w+)(\d+)天后/)
      return m ? { name: m[1], days_until: parseInt(m[2], 10) } : null
    }).filter(Boolean)
  }
  const weatherMatch = text.match(/气温：([^|]+)/)
  if (weatherMatch) ctx.weather = weatherMatch[1].trim()
  return ctx
}

/**
 * 将本系统发给 Coze 的完整 prompt 转为方案C结构化数据（原用于已移除的 POST /api/agent/chat，现仅作工具函数保留，可供其他逻辑复用）
 */
export function convertPromptToStructuredData(fullPrompt: string): StructuredSalesAnalysis {
  const storeInfo = extractStoreInfo(fullPrompt)
  const storeAttributes = extractStoreAttributes(fullPrompt)
  const metrics = extractMetrics(fullPrompt, storeInfo)
  const historicalComparison = extractHistoricalComparison(fullPrompt)
  const rawDailyTable = extractDailyTable(fullPrompt)
  const stageInfo = extractStageInfo(fullPrompt)
  const trendInfo = extractTrendInfo(fullPrompt)
  const naturalContext = extractNaturalContext(fullPrompt)

  return {
    type: 'sales_analysis',
    platform: storeInfo.platform,
    country: storeInfo.region,
    category: storeInfo.category || undefined,
    store_name: storeInfo.name,
    store_attributes: Object.keys(storeAttributes).length > 0 ? storeAttributes : undefined,
    metrics,
    historical_comparison: Object.keys(historicalComparison).length > 0 ? historicalComparison : undefined,
    raw_daily_table: rawDailyTable || undefined,
    stage_info: stageInfo || undefined,
    trend_info: trendInfo || undefined,
    natural_context: Object.keys(naturalContext).length > 0 ? naturalContext : undefined,
  }
}
