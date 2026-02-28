/**
 * 直播录屏分析服务
 * 使用 Vision 模型分析视频内容，识别优秀话术与问题片段，结合店铺上下文给出针对性建议。
 */

import crypto from 'crypto'
import { dbGet, dbAll } from '../db'
import { getLLMConfigForFeature } from './llmTools'
import type { VideoAnalysisInputParams } from '../constants/videoAnalysisParams'
import { isCozeVideoUrl, callCozeVideoAPI } from './cozeVideoClient'

const VIDEO_LLM_MODEL = process.env.VIDEO_LLM_MODEL || process.env.LLM_VISION_MODEL || 'doubao-seed-1-6-vision-250815'
const VIDEO_ANALYSIS_TIMEOUT_MS = Number(process.env.VIDEO_ANALYSIS_TIMEOUT_MS) || 120000

export interface ShopContext {
  shopName: string
  productCategories: string
  priceRange?: { min?: number; max?: number }
  targetAudience: string
  brandPositioning: string
  region?: string
}

export interface ShopMetrics {
  sessionCount: number
  avgGMV: number
  avgDurationHours: string
  gmvPerHour: number
  gmvTrend: string
  gmvChangePercent: string
  recentMetrics: Array<{ date: string; gmv: number; duration: number }>
}

export interface ExcellentMoment {
  startTime: string
  title: string
  description: string
  score: number
  script?: string
}

export interface ProblemMoment {
  startTime: string
  title: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  script?: string
}

export interface ShopInsights {
  categorySuggestions: string[]
  dataBasedSuggestions: string[]
  improvementPriorities: string[]
}

export interface VideoAnalysisResult {
  overallSummary: string
  excellentMoments: ExcellentMoment[]
  problemMoments: ProblemMoment[]
  suggestions: string[]
  shopInsights?: ShopInsights
}

/** 按 LLM 入参文档构建标准化用户消息内容 */
function buildUserMessageContent(
  basePrompt: string,
  videoUrl: string,
  inputParams?: VideoAnalysisInputParams
): string {
  const parts: string[] = [basePrompt, '', `视频URL（请分析）: ${videoUrl}`]
  if (inputParams) {
    parts.push(`平台：${inputParams.platform}`)
    parts.push(`国家/地区：${inputParams.country}`)
    if (inputParams.videoType) {
      parts.push(`视频类型：${inputParams.videoType}`)
    }
    if (inputParams.analysisFocus?.trim()) {
      parts.push('', `重点关注：${inputParams.analysisFocus.trim()}`)
    }
  }
  return parts.join('\n')
}

async function callVisionAPI(
  url: string,
  apiKey: string,
  model: string | undefined,
  systemPrompt: string,
  userMessage: string,
  videoUrl: string,
  inputParams?: VideoAnalysisInputParams
): Promise<string> {
  const effectiveModel = model || VIDEO_LLM_MODEL
  const base = url.replace(/\/$/, '').replace(/\/stream_run.*$/, '')
  const chatUrl = base.includes('/chat/completions') ? base : base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`

  const userContent = buildUserMessageContent(userMessage, videoUrl, inputParams)

  const body: Record<string, unknown> = {
    model: effectiveModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    max_tokens: 4096,
    temperature: 0.7,
    session_id: crypto.randomUUID(), // 豆包/火山方舟等 API 要求
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), VIDEO_ANALYSIS_TIMEOUT_MS)

  try {
    const res = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      const text = (await res.text()).slice(0, 500)
      throw new Error(`Vision API 请求失败: ${res.status} ${text}`)
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      throw new Error('Vision API 返回内容格式异常')
    }
    return content
  } catch (e) {
    clearTimeout(timeoutId)
    if ((e as Error).name === 'AbortError') {
      throw new Error('视频分析超时，请稍后重试')
    }
    throw e
  }
}

export class VideoAnalysisService {
  async getShopContext(shopId: string): Promise<ShopContext | null> {
    const shop = await dbGet<{
      name?: string
      region?: string
      minPrice?: number
      maxPrice?: number
      targetAudience?: string
      brandPositioning?: string
    }>('SELECT name, region, minPrice, maxPrice, targetAudience, brandPositioning FROM stores WHERE id = ?', [shopId])
    if (!shop) return null

    const cats = await dbAll<{ name: string }>(
      `SELECT c.name FROM categories c INNER JOIN store_categories sc ON c.id = sc.categoryId WHERE sc.storeId = ?`,
      [shopId]
    )
    const categoryNames = (cats || []).map((r) => r.name)
    const productCategories = categoryNames.length > 0 ? categoryNames.join('、') : '未设置类目'

    return {
      shopName: shop.name || '未命名店铺',
      productCategories,
      priceRange: shop.minPrice != null || shop.maxPrice != null ? { min: shop.minPrice ?? undefined, max: shop.maxPrice ?? undefined } : undefined,
      targetAudience: shop.targetAudience || '未明确',
      brandPositioning: shop.brandPositioning || '未明确',
      region: shop.region || undefined,
    }
  }

  async getShopMetrics(shopId: string): Promise<ShopMetrics | null> {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const fromStr = thirtyDaysAgo.toISOString().split('T')[0]

    const metrics = await dbAll<{ date: string; gmv: number; duration: number }>(
      `SELECT date, totalGMV as gmv, totalDuration as duration FROM stats WHERE storeId = ? AND date >= ? AND date IS NOT NULL ORDER BY date DESC LIMIT 30`,
      [shopId, fromStr]
    )

    if (!metrics || metrics.length === 0) return null

    const totalGMV = metrics.reduce((sum, m) => sum + Number(m.gmv || 0), 0)
    const avgGMV = totalGMV / metrics.length
    const totalDurationHours = metrics.reduce((sum, m) => sum + (Number(m.duration) || 0), 0) / 3600
    const gmvPerHour = totalDurationHours > 0 ? totalGMV / totalDurationHours : 0

    const recent = metrics.slice(0, Math.min(10, metrics.length))
    const older = metrics.slice(10)
    const recentGMV = recent.reduce((s, m) => s + Number(m.gmv || 0), 0) / recent.length
    const olderGMV = older.length > 0 ? older.reduce((s, m) => s + Number(m.gmv || 0), 0) / older.length : recentGMV
    const gmvTrend = recentGMV >= olderGMV ? '上升' : '下降'
    const gmvChangePercent = olderGMV > 0 ? Math.abs(((recentGMV - olderGMV) / olderGMV) * 100).toFixed(1) : '0'

    return {
      sessionCount: metrics.length,
      avgGMV: Math.round(avgGMV),
      avgDurationHours: (metrics.reduce((s, m) => s + (Number(m.duration) || 0), 0) / 3600 / metrics.length).toFixed(1),
      gmvPerHour: Math.round(gmvPerHour),
      gmvTrend,
      gmvChangePercent,
      recentMetrics: metrics.slice(0, 5).map((m) => ({
        date: (m as any).date || '',
        gmv: Number((m as any).gmv || 0),
        duration: Math.round((Number((m as any).duration) || 0) / 60),
      })),
    }
  }

  private getSystemPrompt(
    shopContext: ShopContext | null,
    shopMetrics: ShopMetrics | null,
    language: 'zh-CN' | 'th-TH' | 'en-US'
  ): string {
    const isZh = language === 'zh-CN'
    const isTh = language === 'th-TH'

    const p = {
      systemRole: isZh
        ? '你是一位专业的直播带货分析专家，擅长从直播录屏中识别主播话术的优劣，提取可复用的优秀话术和需改进的问题片段。'
        : isTh
          ? 'คุณเป็นผู้เชี่ยวชาญด้านการวิเคราะห์ไลฟ์สตรีมขายสินค้า ชำนาญในการระบุข้อความที่ยอดเยี่ยมและส่วนที่ต้องปรับปรุง'
          : 'You are a professional live commerce analyst, skilled at identifying excellent scripts and problematic moments in live streaming recordings.',
      coreTask: isZh
        ? '请分析直播视频内容，识别优秀话术片段和问题话术片段，提取主播的具体话术原文，并结合店铺信息给出针对性建议。'
        : isTh
          ? 'วิเคราะห์วิดีโอไลฟ์สตรีม ระบุส่วนที่ยอดเยี่ยมและส่วนที่มีปัญหา แยกข้อความต้นฉบับ และให้คำแนะนำตามข้อมูลร้านค้า'
          : 'Analyze the live streaming video, identify excellent and problematic script moments, extract the host\'s exact words, and provide targeted suggestions based on shop context.',
    }

    let shopBlock = ''
    if (shopContext || shopMetrics) {
      if (shopContext) {
        shopBlock += `店铺名称：${shopContext.shopName}\n`
        shopBlock += `主营类目：${shopContext.productCategories}\n`
        shopBlock += `目标受众：${shopContext.targetAudience}\n`
        shopBlock += `品牌定位：${shopContext.brandPositioning}\n`
        if (shopContext.region) shopBlock += `地区：${shopContext.region}\n`
      }
      if (shopMetrics) {
        shopBlock += `场均GMV：${shopMetrics.avgGMV}\n`
        shopBlock += `时效（泰铢/小时）：${shopMetrics.gmvPerHour}\n`
        shopBlock += `GMV趋势：${shopMetrics.gmvTrend} (${shopMetrics.gmvChangePercent}%)\n`
      }
    }

    return `${p.systemRole}
${p.coreTask}

【重要】必须关注主播的具体话术内容：
1. 主播在特定时间点说的具体话语
2. 话术的结构和逻辑
3. 话术的感染力和说服力
4. 话术与产品卖点、用户痛点的结合程度
5. 话术的互动性和引导性

${shopBlock ? '店铺上下文：\n' + shopBlock : ''}

分析要求：
1. 分析话术是否与店铺主营类目特点相符
2. 评估话术是否符合目标受众的需求和语言习惯
3. 结合品牌定位，分析话术的调性是否合适
4. 参考历史数据，分析话术对提升GMV、转化率的潜力
5. 给出针对该店铺特点和类目特征的改进建议

返回严格的 JSON 格式，不要包含其他文字：
{
  "overallSummary": "整体总结（一段话）",
  "excellentMoments": [
    {
      "startTime": "00:01:30",
      "title": "优秀片段标题",
      "description": "描述",
      "score": 8,
      "script": "主播话术原文（尽量完整）"
    }
  ],
  "problemMoments": [
    {
      "startTime": "00:05:20",
      "title": "问题片段标题",
      "description": "描述",
      "severity": "high",
      "script": "主播话术原文"
    }
  ],
  "suggestions": ["建议1", "建议2"],
  "shopInsights": {
    "categorySuggestions": ["类目建议"],
    "dataBasedSuggestions": ["数据建议"],
    "improvementPriorities": ["改进优先级"]
  }
}

注意：excellentMoments 和 problemMoments 可以为空数组；severity 为 critical | high | medium | low；score 为 1-10。`
  }

  async analyzeVideo(
    videoUrl: string,
    shopId?: string,
    language: 'zh-CN' | 'th-TH' | 'en-US' = 'zh-CN',
    userId?: string,
    inputParams?: VideoAnalysisInputParams
  ): Promise<VideoAnalysisResult> {
    const shopContext = shopId ? await this.getShopContext(shopId) : null
    const shopMetrics = shopId ? await this.getShopMetrics(shopId) : null

    const systemPrompt = this.getSystemPrompt(shopContext, shopMetrics, language)

    const userPrompt =
      language === 'zh-CN'
        ? '请分析这段直播录屏，识别优秀话术片段和问题话术片段，提取主播具体话术原文，并给出改进建议。'
        : language === 'th-TH'
          ? 'กรุณาวิเคราะห์วิดีโอไลฟ์สตรีมนี้ ระบุส่วนที่ยอดเยี่ยมและส่วนที่มีปัญหา แยกข้อความต้นฉบับ และให้คำแนะนำ'
          : 'Please analyze this live streaming video, identify excellent and problematic script moments, extract the host\'s exact words, and provide improvement suggestions.'

    const llmConfig = await getLLMConfigForFeature('video')
    if (!llmConfig) {
      throw new Error('视频分析需要配置 Vision 模型或 Coze Agent。管理员可在「LLM 配置」中为「视频分析」功能指定支持视觉的模型或 Coze 发布站点。')
    }

    let content: string
    if (isCozeVideoUrl(llmConfig.url)) {
      const message = buildUserMessageContent(userPrompt, videoUrl, inputParams)
      const fullMessage = systemPrompt ? `【系统指令】\n${systemPrompt}\n\n【用户请求】\n${message}` : message
      content = await callCozeVideoAPI(llmConfig.url, llmConfig.apiKey, fullMessage)
    } else {
      content = await callVisionAPI(
        llmConfig.url,
        llmConfig.apiKey,
        llmConfig.model,
        systemPrompt,
        userPrompt,
        videoUrl,
        inputParams
      )
    }

    const cleaned = content.trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    const jsonStr = jsonMatch ? jsonMatch[0] : cleaned
    let result: VideoAnalysisResult
    try {
      result = JSON.parse(jsonStr) as VideoAnalysisResult
    } catch {
      throw new Error('AI 返回格式解析失败，请重试')
    }

    if (!result.shopInsights) {
      result.shopInsights = {
        categorySuggestions: [],
        dataBasedSuggestions: [],
        improvementPriorities: [],
      }
    }
    if (!Array.isArray(result.excellentMoments)) result.excellentMoments = []
    if (!Array.isArray(result.problemMoments)) result.problemMoments = []
    if (!Array.isArray(result.suggestions)) result.suggestions = []

    return result
  }
}

export const videoAnalysisService = new VideoAnalysisService()
