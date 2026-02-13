/**
 * 触发工作流一轮（管理员）
 * 用法: 先启动后端 (cd backend && npm run dev)，再: cd backend && npx tsx scripts/trigger-workflow-round.ts
 */
const BASE = 'http://localhost:3000'

async function main() {
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: '123456' }),
  })
  if (!loginRes.ok) {
    console.error('登录失败:', await loginRes.text())
    process.exit(1)
  }
  const { token } = await loginRes.json()

  const triggerRes = await fetch(`${BASE}/api/workflow/trigger`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!triggerRes.ok) {
    console.error('触发工作流失败:', triggerRes.status, await triggerRes.text())
    process.exit(1)
  }
  const result = await triggerRes.json()
  console.log('第一轮已触发')
  console.log(JSON.stringify(result, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
