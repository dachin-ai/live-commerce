/**
 * 使用测试 Excel 和 Greenpet 店铺调用导入 API（需先启动后端）
 * 用法: npx tsx scripts/import-test-file.ts [Excel路径] [店铺ID]
 */
import fs from 'fs'
import path from 'path'

const EXCEL_PATH = process.argv[2] || path.join('d:', 'Work space', 'Coze programmer', 'test data', 'Creator-Live-Performance_20260119084117.xlsx')
const STORE_ID = process.argv[3] || 'store-8f0a56b9-8d94-4741-9a16-511299645d04' // Greenpet
const BASE = 'http://localhost:3000'

async function main() {
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error('文件不存在:', EXCEL_PATH)
    process.exit(1)
  }

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

  const form = new FormData()
  form.append('file', new Blob([fs.readFileSync(EXCEL_PATH)]), path.basename(EXCEL_PATH))
  form.append('storeId', STORE_ID)

  const importRes = await fetch(`${BASE}/api/data-import/tiktok`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })

  const data = await importRes.json().catch(() => ({}))
  if (!importRes.ok) {
    console.error('导入失败:', importRes.status, data)
    process.exit(1)
  }
  console.log('导入成功:', data.message)
  console.log('统计:', data.stats)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
