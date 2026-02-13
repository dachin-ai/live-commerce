/**
 * 店铺管理区域后端接口验证：健康检查 → 登录 → 任务/店铺/直播统计（含时间周期与月份年份）
 * 用法: cd backend && npx tsx scripts/test-dashboard-apis.ts
 */
const BASE = 'http://localhost:3000'

async function main() {
  let token: string
  const results: { name: string; ok: boolean; detail?: string }[] = []

  // 0. 健康检查
  try {
    const healthRes = await fetch(`${BASE}/health`)
    if (!healthRes.ok) throw new Error(await healthRes.text())
    const health = await healthRes.json()
    if (health?.status !== 'ok') throw new Error('status not ok')
    results.push({ name: '健康检查 GET /health', ok: true })
    console.log('0. 健康检查: OK')
  } catch (e: any) {
    results.push({ name: '健康检查 GET /health', ok: false, detail: e?.message })
    console.error('0. 健康检查: FAIL', e?.message)
    process.exit(1)
  }

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

  const headers = { Authorization: `Bearer ${token}` }

  // 2. 获取任务列表（无 storeId 与带 storeId）
  let tasksRes = await fetch(`${BASE}/api/tasks`, { headers })
  if (!tasksRes.ok) {
    results.push({ name: '任务列表 GET /api/tasks', ok: false, detail: `${tasksRes.status}` })
    console.error('2. 任务列表失败:', tasksRes.status, await tasksRes.text())
    process.exit(1)
  }
  let tasks = await tasksRes.json()
  let pending = Array.isArray(tasks) ? tasks.filter((t: any) => t.status === 'pending') : []
  results.push({ name: '任务列表 GET /api/tasks', ok: true })
  console.log('2. 任务列表: OK, 共', tasks.length, '个任务, 待处理', pending.length, '个')

  // 3. 若有待处理任务，标记第一个为完成
  if (pending.length > 0) {
    const taskId = pending[0].id
    const updateRes = await fetch(`${BASE}/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    })
    if (!updateRes.ok) {
      console.error('标记完成失败:', updateRes.status, await updateRes.text())
    } else {
      console.log('3. 标记完成: OK, 任务', taskId)
      // 改回 pending 以便下次测试
      await fetch(`${BASE}/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pending' }),
      })
    }
  } else {
    console.log('3. 标记完成: 跳过(无待处理任务)')
  }

  // 4. 店铺列表
  const storesRes = await fetch(`${BASE}/api/stores`, { headers })
  if (!storesRes.ok) {
    results.push({ name: '店铺列表 GET /api/stores', ok: false, detail: `${storesRes.status}` })
    console.error('4. 店铺列表失败:', storesRes.status, await storesRes.text())
    process.exit(1)
  }
  const stores = await storesRes.json()
  const storeIds = Array.isArray(stores) ? stores.map((s: any) => s.id) : []
  const greenpet = Array.isArray(stores) ? stores.find((s: any) => (s.name || '').toLowerCase() === 'greenpet') : null
  results.push({ name: '店铺列表 GET /api/stores', ok: true })
  console.log('4. 店铺列表: OK, 共', stores.length, '个店铺')

  // 5. 直播统计（需 storeId）：本周、选择月份、选择年份、自定义（优先用有数据的 greenpet）
  const storeId = storeIds[0]
  const storeIdForCustom = greenpet?.id || storeId
  if (storeId) {
    let statsRes = await fetch(`${BASE}/api/stats/live?timeRange=week&storeId=${storeId}`, { headers })
    if (!statsRes.ok) {
      results.push({ name: '直播统计 week GET /api/stats/live', ok: false, detail: `${statsRes.status}` })
      console.error('5a. 直播统计(本周)失败:', statsRes.status)
    } else {
      const stats = await statsRes.json()
      results.push({ name: '直播统计 week GET /api/stats/live', ok: true })
      console.log('5a. 直播统计(本周): OK, totalGMV=', stats?.totalGMV)
    }
    const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
    statsRes = await fetch(`${BASE}/api/stats/live?timeRange=monthPick&storeId=${storeId}&month=${thisMonth}`, { headers })
    if (!statsRes.ok) {
      results.push({ name: '直播统计 选择月份 GET /api/stats/live', ok: false, detail: `${statsRes.status}` })
      console.error('5b. 直播统计(选择月份)失败:', statsRes.status)
    } else {
      results.push({ name: '直播统计 选择月份 GET /api/stats/live', ok: true })
      console.log('5b. 直播统计(选择月份): OK')
    }
    const thisYear = String(new Date().getFullYear())
    statsRes = await fetch(`${BASE}/api/stats/live?timeRange=yearPick&storeId=${storeId}&year=${thisYear}`, { headers })
    if (!statsRes.ok) {
      results.push({ name: '直播统计 选择年份 GET /api/stats/live', ok: false, detail: `${statsRes.status}` })
      console.error('5c. 直播统计(选择年份)失败:', statsRes.status)
    } else {
      results.push({ name: '直播统计 选择年份 GET /api/stats/live', ok: true })
      console.log('5c. 直播统计(选择年份): OK')
    }
    // 5d. 自定义日期（按重叠月份查，应能命中 stats.date=YYYY-MM-01）
    const customFrom = '2025-12-15'
    const customTo = '2025-12-21'
    statsRes = await fetch(
      `${BASE}/api/stats/live?timeRange=custom&storeId=${encodeURIComponent(storeIdForCustom)}&dateFrom=${customFrom}&dateTo=${customTo}`,
      { headers }
    )
    if (!statsRes.ok) {
      results.push({ name: '直播统计 自定义 GET /api/stats/live', ok: false, detail: `${statsRes.status}` })
      console.error('5d. 直播统计(自定义)失败:', statsRes.status, await statsRes.text())
    } else {
      const customStats = await statsRes.json()
      results.push({ name: '直播统计 自定义 GET /api/stats/live', ok: true })
      console.log('5d. 直播统计(自定义): OK, totalGMV=', customStats?.totalGMV, 'totalOrders=', customStats?.totalOrders)
    }
  } else {
    console.log('5. 直播统计: 跳过(无店铺)')
  }

  console.log('\n--- 后端接口验证结果 ---')
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
