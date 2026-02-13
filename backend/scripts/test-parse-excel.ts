/**
 * 快速解析 Excel：输出行数及首行字段，用于验证列名映射。
 * 使用：cd backend && npx tsx scripts/test-parse-excel.ts <Excel 路径>
 */
import fs from 'fs'
import { parseExcelBuffer } from '../src/utils/excelParser'

const filePath = process.argv[2]
if (!filePath || !fs.existsSync(filePath)) {
  console.error('用法: npx tsx scripts/test-parse-excel.ts <Excel 路径>')
  process.exit(1)
}

try {
  const buffer = fs.readFileSync(filePath)
  const data = parseExcelBuffer(buffer)
  console.log('Parsed rows:', data.length)
  if (data[0]) {
    console.log('First row:', { liveDuration: data[0].liveDuration, totalGMV: data[0].totalGMV, totalViewers: data[0].totalViewers, startTime: data[0].startTime })
  }
  if (data.length > 1) console.log('Second row totalGMV:', data[1].totalGMV)
} catch (e: any) {
  console.error(e.message)
  process.exit(1)
}
