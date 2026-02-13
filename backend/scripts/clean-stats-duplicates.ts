/**
 * 清洗 stats 重复数据：同一店铺、同一日期只保留最新一条，其余删除，避免仪表盘叠加显示。
 * 使用：在 backend 目录执行 npx tsx scripts/clean-stats-duplicates.ts
 */
import { dbRun, dbAll } from '../src/db'

interface StatsRow {
  id: string
  storeId: string
  date: string
  createdAt: string
}

async function main() {
  console.log('开始清洗 stats 重复数据（同店同日只保留最新一条）...\n')

  // 1. 找出「同店同日」有多条记录的组合
  const duplicates = await dbAll<{ storeId: string; date: string; cnt: number }>(
    `SELECT storeId, date, COUNT(*) as cnt
     FROM stats
     WHERE storeId IS NOT NULL AND date IS NOT NULL
     GROUP BY storeId, date
     HAVING COUNT(*) > 1`
  )

  if (duplicates.length === 0) {
    console.log('未发现同店同日的重复 stats，无需清洗。')
    return
  }

  console.log(`发现 ${duplicates.length} 组 (店铺, 日期) 存在重复：`)
  for (const d of duplicates) {
    console.log(`  - storeId=${d.storeId}, date=${d.date}, 条数=${d.cnt}`)
  }

  let totalDeleted = 0
  for (const { storeId, date } of duplicates) {
    // 2. 该组内按 createdAt 降序，保留第一条（最新），其余 id 收集起来删除
    const rows = await dbAll<StatsRow>(
      `SELECT id, storeId, date, createdAt FROM stats
       WHERE storeId = ? AND date = ?
       ORDER BY createdAt DESC`,
      [storeId, date]
    )
    const toKeep = rows[0]
    const toDelete = rows.slice(1)
    const idsToDelete = toDelete.map((r) => r.id)

    if (idsToDelete.length === 0) continue

    // 3. 解除 data_imports 对即将删除的 stats 的引用
    const placeholders = idsToDelete.map(() => '?').join(',')
    await dbRun(
      `UPDATE data_imports SET statsId = NULL WHERE statsId IN (${placeholders})`,
      idsToDelete
    )

    // 4. 删除重复的 stats 行
    await dbRun(
      `DELETE FROM stats WHERE id IN (${placeholders})`,
      idsToDelete
    )

    totalDeleted += idsToDelete.length
    console.log(`  保留 id=${toKeep.id} (${toKeep.createdAt})，删除 ${idsToDelete.length} 条`)
  }

  console.log(`\n清洗完成：共删除 ${totalDeleted} 条重复 stats。`)
}

main().catch((err) => {
  console.error('清洗失败:', err)
  process.exit(1)
})
