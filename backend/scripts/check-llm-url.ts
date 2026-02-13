/**
 * 查看当前生效的 LLM URL 配置（用于核对待办生成调用的 Coze 地址）
 * 使用：在 backend 目录执行 npx tsx scripts/check-llm-url.ts
 */
import { dbGet } from '../src/db'
import { loadScriptLLMConfigCache, getScriptLLMConfigSync } from '../src/services/scriptLLMConfig'

async function main() {
  const fromDb = await dbGet<{ value: string }>(
    'SELECT value FROM system_config WHERE key = ?',
    ['script_llm_url']
  )
  const urlFromDb = fromDb?.value?.trim() || '(未配置)'
  await loadScriptLLMConfigCache()
  const effective = getScriptLLMConfigSync()
  console.log('--- 话术/待办 LLM 配置 ---')
  console.log('数据库 script_llm_url:', urlFromDb)
  console.log('当前生效 URL (getScriptLLMConfigSync):', effective?.url ?? '(无，未配置或未加载)')
  console.log('说明: 生效优先级为 环境变量 SCRIPT_LLM_URL > 数据库。coze-debug.log 中的 url 即实际请求地址。')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
