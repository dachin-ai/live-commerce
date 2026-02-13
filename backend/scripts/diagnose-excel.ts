/**
 * 诊断 Excel 直播明细：解析行数、日期分布、GMV/时长汇总，用于排查导入后数据不对。
 * 使用：cd backend && npx tsx scripts/diagnose-excel.ts <Excel 路径>
 */
import fs from 'fs'
import path from 'path'
import { parseExcelBuffer, TikTokLiveData } from '../src/utils/excelParser'

function parseDate(raw: string | number | undefined): string | null {
  if (raw == null) return null
  if (typeof raw === 'number' && !Number.isNaN(raw) && raw > 0) {
    const d = new Date((raw - 25569) * 86400 * 1000)
    if (Number.isNaN(d.getTime())) return null
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const str = String(raw).trim()
  if (!str) return null
  const part = str.split(/\s+/)[0]
  const m = part.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (m) return `${m[1]}-${String(parseInt(m[2], 10)).padStart(2, '0')}-${String(parseInt(m[3], 10)).padStart(2, '0')}`
  const mShort = part.match(/^(\d{4})[-/](\d{1,2})/)
  if (mShort) return `${mShort[1]}-${String(parseInt(mShort[2], 10)).padStart(2, '0')}-01`
  const parsed = new Date(part)
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
  }
  return null
}

function main() {
  const filePath = process.argv[2]
  if (!filePath || !fs.existsSync(filePath)) {
    console.error('用法: npx tsx scripts/diagnose-excel.ts <Excel 路径>')
    process.exit(1)
  }

  const buffer = fs.readFileSync(filePath)
  const rows = parseExcelBuffer(buffer)
  console.log('=== 解析行数:', rows.length)
  if (rows.length === 0) {
    console.log('无数据行，请检查表头是否在第3行（Creator-Live-Performance 格式）')
    process.exit(1)
  }

  // 原始表头（从第一行推断）
  const first = rows[0] as Record<string, unknown>
  console.log('\n=== 首行字段示例（解析后）:', Object.keys(first).filter(k => first[k] != null && first[k] !== '').slice(0, 25))

  // 日期分布
  const byDate = new Map<string, TikTokLiveData[]>()
  const noDate: TikTokLiveData[] = []
  for (const r of rows) {
    const dateStr = parseDate(r.date)
    if (!dateStr) {
      noDate.push(r)
      continue
    }
    const list = byDate.get(dateStr) || []
    list.push(r)
    byDate.set(dateStr, list)
  }
  const dates = Array.from(byDate.keys()).sort()
  console.log('\n=== 解析到日期的行数:', rows.length - noDate.length, '| 未解析日期行数:', noDate.length)
  console.log('=== 日期范围:', dates[0], '~', dates[dates.length - 1], '| 共', dates.length, '个自然日')

  // 每日期行数（含重复场次）
  const dec2025 = dates.filter(d => d.startsWith('2025-12'))
  console.log('\n=== 2025-12 自然日数:', dec2025.length)
  if (dec2025.length > 0) {
    let totalRowsDec = 0
    dec2025.forEach(d => { totalRowsDec += byDate.get(d)!.length })
    console.log('=== 2025-12 总行数（未去重）:', totalRowsDec)
    // 按 liveId 去重后
    let uniqueRows = 0
    dec2025.forEach(d => {
      const list = byDate.get(d)!
      const seen = new Set<string>()
      list.forEach(r => {
        const id = r.liveId != null && String(r.liveId).trim() !== '' ? String(r.liveId) : `row-${uniqueRows}`
        if (!seen.has(id)) { seen.add(id); uniqueRows += 1 }
      })
    })
    // 上面 uniqueRows 是跨日累计的，不对。改成每日内去重后行数
    let uniquePerDay = 0
    dec2025.forEach(d => {
      const list = byDate.get(d)!
      const seen = new Set<string>()
      list.forEach(r => {
        const id = r.liveId != null && String(r.liveId).trim() !== '' ? String(r.liveId) : `nodup-${d}-${list.indexOf(r)}`
        if (!seen.has(id)) { seen.add(id); uniquePerDay += 1 }
      })
    })
    console.log('=== 2025-12 按 liveId 去重后场次（约）:', uniquePerDay)
  }

  // 汇总：全表直接加总 vs 按日加总再合计（应与导入按日写入后 SUM 一致）
  let sumGMVAll = 0
  let sumDurAll = 0
  rows.forEach(r => {
    sumGMVAll += r.totalGMV || 0
    sumDurAll += (r.liveDuration || 0) / 60
  })
  let sumGMVByDay = 0
  let sumDurByDay = 0
  byDate.forEach((list) => {
    let g = 0, d = 0
    list.forEach(r => {
      g += r.totalGMV || 0
      d += (r.liveDuration || 0) / 60
    })
    sumGMVByDay += g
    sumDurByDay += d
  })
  console.log('\n=== 全表直接加总: GMV=', sumGMVAll.toFixed(2), '时长(小时)=', sumDurAll.toFixed(2))
  console.log('=== 按日分组后加总: GMV=', sumGMVByDay.toFixed(2), '时长(小时)=', sumDurByDay.toFixed(2))

  // 仅 2025-12
  let gmvDec = 0, durDec = 0, rowsDec = 0
  dec2025.forEach(d => {
    byDate.get(d)!.forEach(r => {
      gmvDec += r.totalGMV || 0
      durDec += (r.liveDuration || 0) / 60
      rowsDec += 1
    })
  })
  console.log('\n=== 仅 2025年12月: 行数=', rowsDec, 'GMV=', gmvDec.toFixed(2), '时长(小时)=', durDec.toFixed(2))
}

main()
