/**
 * 删除「疑似整月汇总的月初行」：仅当某月 1 日的 stats 在数值上接近该月其余日合计时，
 * 判定为旧「整月一行」与按日数据并存，删除该月初行，避免选择月份时两倍。
 * 不会误删其他客户或合法上传的「12 月 1 日」单日数据。
 * 使用：cd backend && npx tsx scripts/clean-monthly-orphan-stats.ts
 */
import { dbRun, dbAll } from '../src/db'

/** 若月初行的 GMV/时长 与当月其余日合计的比值在此区间内，视为「整月汇总」重复 */
const MONTH_AGGREGATE_RATIO_MIN = 0.5
const MONTH_AGGREGATE_RATIO_MAX = 1.5

async function main() {
  console.log('开始检测「疑似整月汇总的月初行」（仅删除与当月其余日合计接近的行）...\n')

  // 候选：storeId + 某月 1 日 有记录，且该店该月还有至少一条非 1 日的记录
  const candidates = await dbAll<{ storeId: string; date: string }>(
    `SELECT s1.storeId, s1.date
     FROM stats s1
     WHERE s1.date LIKE '%-01' AND s1.storeId IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM stats s2
       WHERE s2.storeId = s1.storeId
         AND s2.date LIKE substr(s1.date, 1, 7) || '-%'
         AND s2.date != s1.date
     )`
  )

  if (candidates.length === 0) {
    console.log('未发现候选月初行，无需清理。')
    return
  }

  const toDelete: { storeId: string; date: string; id: string }[] = []

  for (const { storeId, date } of candidates) {
    const monthPrefix = date.slice(0, 7) // YYYY-MM
    const firstRow = await dbAll<{ id: string; totalGMV: number; totalDuration: number }>(
      'SELECT id, totalGMV, totalDuration FROM stats WHERE storeId = ? AND date = ?',
      [storeId, date]
    )
    const rest = await dbAll<{ totalGMV: number; totalDuration: number }>(
      `SELECT totalGMV, totalDuration FROM stats WHERE storeId = ? AND date LIKE ? AND date != ?`,
      [storeId, `${monthPrefix}-%`, date]
    )
    if (firstRow.length === 0 || rest.length === 0) continue

    const gmvFirst = Number(firstRow[0].totalGMV) || 0
    const durFirst = Number(firstRow[0].totalDuration) || 0
    const gmvRest = rest.reduce((s, r) => s + (Number(r.totalGMV) || 0), 0)
    const durRest = rest.reduce((s, r) => s + (Number(r.totalDuration) || 0), 0)

    // 若月初行的 GMV/时长 与「其余日合计」比值在 [0.5, 1.5]，视为整月汇总重复，仅此时删除
    const ratioGMV = gmvRest > 0 ? gmvFirst / gmvRest : 0
    const ratioDur = durRest > 0 ? durFirst / durRest : 0
    const looksLikeMonthAggregate =
      ratioGMV >= MONTH_AGGREGATE_RATIO_MIN &&
      ratioGMV <= MONTH_AGGREGATE_RATIO_MAX &&
      ratioDur >= MONTH_AGGREGATE_RATIO_MIN &&
      ratioDur <= MONTH_AGGREGATE_RATIO_MAX

    if (looksLikeMonthAggregate) {
      toDelete.push({ storeId, date, id: firstRow[0].id })
      console.log(`  候选 storeId=${storeId}, date=${date}: 月初 GMV 与其余日合计比值 ${ratioGMV.toFixed(2)}，时长比值 ${ratioDur.toFixed(2)} → 判定为整月汇总，将删除`)
    } else {
      console.log(`  跳过 storeId=${storeId}, date=${date}: 比值 GMV=${ratioGMV.toFixed(2)} 时长=${ratioDur.toFixed(2)}，视为单日数据，不删`)
    }
  }

  if (toDelete.length === 0) {
    console.log('\n无需删除任何行。')
    return
  }

  console.log(`\n将删除 ${toDelete.length} 条疑似整月汇总的月初行。`)
  for (const { storeId, date, id } of toDelete) {
    await dbRun('UPDATE data_imports SET statsId = NULL WHERE statsId = ?', [id])
    await dbRun('DELETE FROM stats WHERE id = ?', [id])
    console.log(`  已删除 storeId=${storeId}, date=${date}`)
  }
  console.log('\n清理完成。')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
