import express from 'express'
import { AuthRequest } from '../../middleware/auth'
import { getLLMConfigForFeature } from '../../services/llmTools'
import { callLLMOnce } from '../../services/scriptLLM'
import { getScriptLLMProvider, type ScriptLLMProviderConfig } from '../../services/scriptLLMProvider'
import { getScriptLLMConfigSync, getLLMModesSync } from '../../services/scriptLLMConfig'

const router = express.Router()

router.post('/parse-product', async (req: AuthRequest, res) => {
  try {
    const { text } = req.body
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' })
    }

    // 尝试获取分配给 systemAgent 功能的 LLM 配置
    const config = await getLLMConfigForFeature('systemAgent')
    
    // 我们必须确定调用哪个 Provider (coze/openai/gemini)，getLLMConfigForFeature 返回的是 {url, apiKey, model}. 
    // 但并没有返回 provider id。如果配置存在，怎么知道它是哪个 provider？
    // 我们的现有架构：
    // 用户在「LLM 调用方式」里添加的工具其实并没有明确指定 provider (默认通过 url 后缀或是用户选择？)
    // 根据 scriptLLM.ts 第 738 行，callLLMOnce 内部会用 `getLLMModesSync().todo` 读取 provider type。
    // 为了支持自定义 provider，我们要么改进 callLLMOnce，要么在这里直接判断 url：
    
    let mockMode = getLLMModesSync().todo
    let targetConfig: ScriptLLMProviderConfig | undefined = config || undefined
    
    // 简单的嗅探逻辑，决定用什么 Provider：
    if (config) {
      if (config.url.includes('coze.site') || config.url.includes('coze.com') || config.url.includes('coze.cn')) {
        mockMode = 'coze_agent'
      } else if (config.url.includes('generativelanguage.googleapis.com')) {
        mockMode = 'gemini'
      } else {
        mockMode = 'openai'
      }
    } else {
      targetConfig = getScriptLLMConfigSync() || undefined
    }

    if (!targetConfig) {
      return res.status(500).json({ error: '系统尚未配置 System Agent 或默认 LLM' })
    }

    const provider = getScriptLLMProvider(mockMode)
    if (!provider || !provider.callOnce) {
      return res.status(500).json({ error: '找不到可用的 System Agent Provider' })
    }

    const systemPrompt = `You are an expert product data extraction assistant. Your task is to extract product attributes from raw, messy text (such as ERP exports, user descriptions, or messy spec sheets) and output STRICTLY VALID JSON. DO NOT INCLUDE ANY MARKDOWN formatting (like \`\`\`json) or comments, JUST the raw JSON object.

The output JSON must match this structure:
{
  "productName": "Extracted or inferred product name. Empty string if none.",
  "price": "Extracted price. Keep only the highest number if multiple, or empty string if none.",
  "productSku": "Extracted SKU or model number. Empty if none.",
  "coreFeatures": ["Selling point 1", "Selling point 2", ...],
  "afterSalesInfo": "Extracted after-sales info like warranty. Empty if none."
}

CRITICAL RULES FOR "coreFeatures":
1. DO NOT just copy technical parameters.
2. TRANSLATE cold industrial specs into attractive, consumer-friendly consumer benefits.
3. List them item by item (1... 2... 3...). E.g., if the raw text says "Material: 304 stainless steel", output "1. 采用食品级304不锈钢，全家使用更安心". Extract at most 5 core selling points.`

    console.log('[SystemAgent] Calling provider:', mockMode, 'url:', targetConfig.url)

    const rawResult = await provider.callOnce(targetConfig, {
      systemPrompt,
      userMessage: text,
      taskType: 'todo', // just a marker, doesn't matter much for our use
      timeoutMs: 60000,
    })

    if (!rawResult) {
      return res.status(500).json({ error: 'LLM 返回空结果' })
    }

    let parsed = null
    try {
      // 提取可能的纯 JSON 块，以防大模型不听话加了 markdown
      const jsonMatch = rawResult.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        parsed = JSON.parse(rawResult)
      }
    } catch (e) {
      console.error('[SystemAgent] parse JSON failed:', e, rawResult)
      return res.status(500).json({ error: 'LLM 返回的不是合法的 JSON，请重试' })
    }

    return res.json({ success: true, data: parsed })
  } catch (e: any) {
    console.error('POST /system-agent/parse-product 失败:', e)
    res.status(500).json({ error: e?.message || '服务器内部解析错误' })
  }
})

export default router
