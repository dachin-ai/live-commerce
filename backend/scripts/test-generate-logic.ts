/**
 * 待办生成逻辑直测（不依赖 HTTP 服务）
 * 用法: cd backend && npx tsx scripts/test-generate-logic.ts [storeId]
 * 不传 storeId 时取数据库中第一个店铺。
 */
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '..', '.env') })

async function main() {
  const { initDatabase } = await import('../src/db')
  const { dbAll, dbGet } = await import('../src/db')
  const { loadScriptLLMConfigCache } = await import('../src/services/scriptLLMConfig')
  const { generateSuggestedTodosForStore } = await import('../src/routes/ai-refactored')

  console.log('--- 待办生成逻辑直测 ---\n')

  await initDatabase()
  console.log('1. 数据库初始化: OK')

  await loadScriptLLMConfigCache()
  console.log('2. LLM 配置缓存加载: OK')

  let storeId = process.argv[2]?.trim()
  if (!storeId) {
    const withStats = await dbGet<{ storeId: string }>(
      'SELECT storeId FROM stats WHERE storeId IS NOT NULL GROUP BY storeId ORDER BY COUNT(*) DESC LIMIT 1'
    )
    if (withStats?.storeId) {
      const nameRow = await dbGet<{ name: string }>('SELECT name FROM stores WHERE id = ?', [withStats.storeId])
      storeId = withStats.storeId
      console.log('3. 使用有 stats 的店铺(走 LLM 路径):', nameRow?.name || storeId, '(', storeId, ')')
    }
    if (!storeId) {
      const stores = await dbAll<{ id: string; name: string }>('SELECT id, name FROM stores LIMIT 5')
      if (!stores?.length) {
        console.error('无店铺数据，请先创建店铺或导入数据后再测。')
        process.exit(1)
      }
      storeId = stores[0].id
      console.log('3. 使用首个店铺(无 stats 时走规则兜底):', stores[0].name || storeId, '(', storeId, ')')
    }
  } else {
    const store = await dbGet<{ name: string }>('SELECT name FROM stores WHERE id = ?', [storeId])
    if (!store) {
      console.error('店铺不存在:', storeId)
      process.exit(1)
    }
    console.log('3. 指定店铺:', store.name || storeId, '(', storeId, ')')
  }

  const statsCount = await dbGet<{ c: number }>('SELECT COUNT(*) as c FROM stats WHERE storeId = ?', [storeId])
  const hasStats = (statsCount?.c ?? 0) > 0
  console.log('4. 该店铺 stats 条数:', statsCount?.c ?? 0, hasStats ? '(有数据)' : '(无数据，将走规则兜底或 useStatsFromStoreId)')

  console.log('\n5. 调用 generateSuggestedTodosForStore(storeId)...')
  const start = Date.now()
  const result = await generateSuggestedTodosForStore(storeId, {})
  const elapsed = Date.now() - start

  const tasks = result.tasks
  const llmReason = result.llmEmptyReason

  console.log('   耗时:', elapsed, 'ms')
  console.log('   返回条数:', tasks.length)
  if (llmReason) console.log('   LLM 空原因:', llmReason)

  if (tasks.length === 0) {
    console.error('\n❌ 生成逻辑返回 0 条待办，视为失败。')
    if (llmReason) console.error('   原因:', llmReason)
    process.exit(1)
  }

  const llmCount = tasks.filter((t) => t.source === 'llm_intelligent' || t.source === 'llm_anomaly').length
  const ruleCount = tasks.filter((t) =>
    t.source && ['event', 'stage', 'anomaly', 'threshold'].includes(t.source)
  ).length
  console.log('\n6. 来源统计: LLM', llmCount, '条, 规则', ruleCount, '条')
  console.log('   前 3 条标题:')
  tasks.slice(0, 3).forEach((t, i) => {
    console.log('   ', i + 1, '.', t.title, '| priority:', t.priority, '| source:', t.source || '-')
  })

  if (llmCount > 0) {
    console.log('\n--- 走 LLM 方式: 成功 ---')
    console.log('   本次共', llmCount, '条来自 LLM（智能建议），完整生成逻辑测试通过。')
  } else if (hasStats) {
    console.log('\n--- 走 LLM 方式: 未产出 ---')
    console.log('   该店有数据已尝试调用 LLM，但本次 0 条来自 LLM。', llmReason ? `原因: ${llmReason}` : '')
    console.log('   完整生成逻辑测试通过（规则兜底已返回', tasks.length, '条）。')
  } else {
    console.log('\n--- 走 LLM 方式: 未调用(该店无 stats) ---')
    console.log('   规则兜底正常，完整生成逻辑测试通过。')
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e?.message || e)
  process.exit(1)
})
