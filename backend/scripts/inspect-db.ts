/**
 * 查看当前数据库 stats / data_imports 情况，用于清理前后核对。
 * 使用：在 backend 目录执行 npx tsx scripts/inspect-db.ts
 */
import { dbAll } from '../src/db'

async function main() {
  console.log('--- 当前数据库情况 ---\n')

  const statsCount = await dbAll<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM stats'
  )
  console.log('stats 表总条数:', statsCount[0]?.cnt ?? 0)

  const stores = await dbAll<{ id: string; name: string }>('SELECT id, name FROM stores ORDER BY name')
  console.log('\nstores 表 (id -> name):')
  stores.forEach((r) => console.log(`  ${r.id} -> ${r.name}`))

  const byStoreDate = await dbAll<{ storeId: string; date: string; cnt: number }>(
    `SELECT storeId, date, COUNT(*) as cnt FROM stats
     WHERE storeId IS NOT NULL AND date IS NOT NULL
     GROUP BY storeId, date
     ORDER BY storeId, date`
  )
  if (byStoreDate.length > 0) {
    console.log('\n按 (店铺, 日期) 分布:')
    byStoreDate.forEach((r) => {
      const name = stores.find((s) => s.id === r.storeId)?.name ?? r.storeId
      console.log(`  storeId=${r.storeId} (${name}), date=${r.date}, 条数=${r.cnt}`)
    })
  }

  const sample = await dbAll<{ id: string; storeId: string; date: string; totalGMV: number; createdAt: string }>(
    `SELECT id, storeId, date, totalGMV, createdAt FROM stats ORDER BY createdAt DESC LIMIT 5`
  )
  if (sample.length > 0) {
    console.log('\n最近 5 条 stats 示例:')
    sample.forEach((r) => console.log(`  id=${r.id}, storeId=${r.storeId}, date=${r.date}, totalGMV=${r.totalGMV}, createdAt=${r.createdAt}`))
  }

  const importsCount = await dbAll<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM data_imports'
  )
  console.log('\ndata_imports 表总条数:', importsCount[0]?.cnt ?? 0)
  console.log('\n--- 结束 ---')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
