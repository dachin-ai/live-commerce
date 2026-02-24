/**
 * 模块 5 待办事项生成接口测试（按 module-test-workflow 后端验证）
 * 用法: 先启动后端 (cd backend && npm run dev)，再: cd backend && npx tsx scripts/test-generate-tasks-api.ts
 */
const BASE = 'http://localhost:3001'

async function main() {
  let token: string
  const results: { name: string; ok: boolean; detail?: string }[] = []

  // 1. 登录
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: '123456' }),
  })
  if (!loginRes.ok) {
    console.error('登录失败:', await loginRes.text())
    process.exit(1)
  }
  const loginData = await loginRes.json()
  token = loginData.token
  results.push({ name: '登录 POST /api/auth/login', ok: true })
  console.log('1. 登录: OK')

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  // 2. 获取店铺列表，取第一个店铺（或 greenpet）
  const storesRes = await fetch(`${BASE}/api/stores`, { headers })
  if (!storesRes.ok) {
    results.push({ name: '店铺列表 GET /api/stores', ok: false, detail: `${storesRes.status}` })
    console.error('2. 店铺列表失败:', storesRes.status)
    process.exit(1)
  }
  const stores = await storesRes.json()
  const storeList = Array.isArray(stores) ? stores : []
  const storeId = storeList.find((s: any) => (s.name || '').toLowerCase() === 'greenpet')?.id || storeList[0]?.id
  results.push({ name: '店铺列表 GET /api/stores', ok: true })
  console.log('2. 店铺列表: OK, 店铺数=', storeList.length, 'storeId=', storeId || '(无)')

  if (!storeId) {
    console.warn('无店铺，跳过 generate-tasks 调用')
    console.log('\n--- 待办生成接口测试结果 ---')
    console.log('通过:', results.filter((r) => r.ok).length, '项；跳过: 无店铺')
    return
  }

  // 3. 智能生成任务 POST /api/ai/generate-tasks（超时 70s，兼容 LLM 或规则路径）
  const ac = new AbortController()
  const timeoutId = setTimeout(() => ac.abort(), 70000)
  let genRes: Response
  try {
    genRes = await fetch(`${BASE}/api/ai/generate-tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ storeId }),
      signal: ac.signal,
    })
  } catch (e: any) {
    clearTimeout(timeoutId)
    if (e?.name === 'AbortError') {
      results.push({
        name: '智能生成任务 POST /api/ai/generate-tasks',
        ok: false,
        detail: '请求超时（70s）',
      })
      console.error('3. 智能生成任务: 超时')
      process.exit(1)
    }
    throw e
  }
  clearTimeout(timeoutId)
  if (!genRes.ok) {
    results.push({
      name: '智能生成任务 POST /api/ai/generate-tasks',
      ok: false,
      detail: `${genRes.status} ${await genRes.text()}`,
    })
    console.error('3. 智能生成任务失败:', genRes.status, await genRes.text())
    process.exit(1)
  }
  const genData = await genRes.json()
  const hasMessage = typeof genData?.message === 'string'
  const tasks = Array.isArray(genData?.tasks) ? genData.tasks : []
  const hasMetadata =
    genData?.metadata != null &&
    typeof genData.metadata === 'object'

  if (!hasMessage) {
    results.push({
      name: '智能生成任务 响应含 message',
      ok: false,
      detail: 'response.message 缺失或非字符串',
    })
  } else {
    results.push({ name: '智能生成任务 响应含 message', ok: true })
  }
  results.push({
    name: '智能生成任务 POST /api/ai/generate-tasks',
    ok: true,
  })
  console.log('3. 智能生成任务: OK')
  console.log('   message:', genData?.message)
  console.log('   tasks 条数:', tasks.length)
  const meta = genData?.metadata ?? {}
  console.log('   metadata:', hasMetadata ? JSON.stringify(meta) : '(无)')
  if (meta.statsDateRangeUsed) {
    console.log('   本次数据区间:', meta.statsDateRangeUsed.dateFrom, '~', meta.statsDateRangeUsed.dateTo)
  }
  if (meta.llmStatusMessage && meta.llmStatus !== 'used') {
    console.log('   LLM 提示:', meta.llmStatusMessage)
  }
  const llmFromMeta = meta.llmIntelligentCount ?? 0
  const ruleFromMeta = meta.ruleCount ?? 0
  const llmFromTasks = tasks.filter((t: any) => t.source === 'llm_intelligent' || t.source === 'llm_anomaly').length
  const ruleFromTasks = tasks.filter((t: any) =>
    t.source && ['event', 'stage', 'anomaly', 'threshold'].includes(t.source)
  ).length
  console.log('\n--- 最终结果：来源条数 ---')
  console.log('   来自 LLM（智能建议）:', llmFromMeta, '条 (metadata) /', llmFromTasks, '条 (本批 tasks.source)')
  console.log('   来自系统规则:', ruleFromMeta, '条 (metadata) /', ruleFromTasks, '条 (本批 tasks.source)')
  console.log('   本批创建总数:', tasks.length)

  // 4. 校验任务结构（至少一条时）
  if (tasks.length > 0) {
    const first = tasks[0]
    const hasTitle = typeof first?.title === 'string' && first.title.length > 0
    const hasPriority = first?.priority === 'urgent' || first?.priority === 'normal'
    if (hasTitle) results.push({ name: '任务项含 title', ok: true })
    else results.push({ name: '任务项含 title', ok: false, detail: '首条任务无 title' })
    if (hasPriority) results.push({ name: '任务项含 priority(urgent/normal)', ok: true })
    else results.push({ name: '任务项含 priority(urgent/normal)', ok: false, detail: '首条任务 priority 异常' })
  }

  console.log('\n--- 待办生成接口测试结果 ---')
  const failed = results.filter((r) => !r.ok)
  if (failed.length > 0) {
    failed.forEach((r) => console.error('FAIL:', r.name, r.detail))
    process.exit(1)
  }
  console.log('全部通过:', results.length, '项')
}

main().catch((e) => {
  console.error(e?.message || e)
  process.exit(1)
})
