/**
 * 话术模板兜底（仅用于 LLM 空结果/失败时）
 * 约束：
 * 1) 仅输出中文模板，避免对 Coze 正常链路产生规则干预
 * 2) 多语言统一走路由层翻译后处理（translateLongText）
 */
import { buildFullSalesScript } from './fullSalesScript'
import type { ScriptType } from './scriptGeneration'

export interface ScriptContentParams {
  productName: string
  productSku?: string
  price?: string
  features?: string
  targetAudience?: string
  addressTerm?: string
  painPointsHint?: string
  promoCopy?: string
  platform?: string
}

export function buildScriptContent(
  scriptType: ScriptType,
  _language: string,
  params: ScriptContentParams
): string {
  if (scriptType === 'full-sales') {
    return buildFullSalesScript({
      ...params,
      platform: params.platform,
    })
  }
  return buildSimpleChineseSegment(scriptType, params)
}

function buildSimpleChineseSegment(scriptType: ScriptType, params: ScriptContentParams): string {
  const p = params.productName || '本品'
  const sku = params.productSku ? `（SKU：${params.productSku}）` : ''
  const price = params.price ? `到手价 ${params.price}` : '价格以直播间为准'
  const features = params.features || '核心卖点'
  const audience = params.targetAudience || params.addressTerm || '目标人群'
  const promo = params.promoCopy || '本场福利以直播间活动为准'
  const pain = params.painPointsHint || '常见痛点与使用顾虑'

  if (scriptType === 'segment-audience') {
    return `【圈人群部分话术】
${audience}的家人们看过来，今天重点讲${p}${sku}。如果你最近正被「${pain}」困扰，这段就是为你准备的，先别划走。`
  }
  if (scriptType === 'segment-product') {
    return `【塑品部分话术】
我们直接看产品价值：${p}${sku}的核心是「${features}」。不是只能用，而是更省心、更稳定、更适合日常场景。`
  }
  if (scriptType === 'segment-concerns') {
    return `【打消顾虑部分话术】
你们最关心的点我先回答：是否适合、是否耐用、买回去不合适怎么办。今天把规则讲明白，让你下单前心里有底。`
  }
  if (scriptType === 'segment-benefits') {
    return `【利益点部分话术】
直接说福利：${p}${sku}，${price}。本场活动是：${promo}。这套权益不是天天有，现在入手更划算。`
  }
  if (scriptType === 'segment-after-sales') {
    return `【售后部分话术】
售后保障给你讲透：退换、发货、客服支持都有明确流程。你下单不用担心“买了没人管”，买得放心最重要。`
  }
  if (scriptType === 'segment-closing') {
    return `【逼单部分话术】
最后提醒：${p}${sku}，${features}，${price}，再加上${promo}。活动窗口有限，想要的现在就点小黄车，避免错过。`
  }

  return `【话术片段】
${p}${sku}，${features}，${price}。请根据直播间实时反馈做口语化调整。`
}
