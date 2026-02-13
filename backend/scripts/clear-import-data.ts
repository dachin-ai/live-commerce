/**
 * 清空 stats 与 data_imports，便于重新上传 Excel。不删库、不删店铺/用户，后端可保持运行。
 * 用法: cd backend && npx tsx scripts/clear-import-data.ts
 */
import { dbRun, dbAll } from '../src/db'

async function main() {
  console.log('清空导入数据（stats + data_imports）...\n')

  const beforeStats = await dbAll<{ cnt: number }>('SELECT COUNT(*) as cnt FROM stats')
  const beforeImports = await dbAll<{ cnt: number }>('SELECT COUNT(*) as cnt FROM data_imports')

  await dbRun('UPDATE data_imports SET statsId = NULL')
  await dbRun('DELETE FROM stats')
  await dbRun('DELETE FROM data_imports')

  const afterStats = await dbAll<{ cnt: number }>('SELECT COUNT(*) as cnt FROM stats')
  const afterImports = await dbAll<{ cnt: number }>('SELECT COUNT(*) as cnt FROM data_imports')

  console.log('stats:      ', beforeStats[0]?.cnt ?? 0, '→', afterStats[0]?.cnt ?? 0)
  console.log('data_imports:', beforeImports[0]?.cnt ?? 0, '→', afterImports[0]?.cnt ?? 0)
  console.log('\n✅ 已清空，可重新在 Dashboard 上传 Excel。')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
