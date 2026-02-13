/**
 * 重置数据库：删除 data.db 并重新初始化表结构与种子数据。
 * 用法: cd backend && npx tsx scripts/reset-database.ts
 *
 * 注意：若后端正在运行，会报 EBUSY，请先停止后端（Ctrl+C）再运行此脚本。
 */
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const backendRoot = path.join(__dirname, '..')
const dbPath = path.join(backendRoot, 'data.db')

console.log('重置数据库...\n')

try {
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath)
    console.log('✅ 已删除 data.db')
  } else {
    console.log('ℹ️  data.db 不存在，跳过删除')
  }
} catch (err: any) {
  if (err?.code === 'EBUSY') {
    console.error('❌ 数据库文件被占用，请先停止后端服务（在运行 npm run dev 的终端按 Ctrl+C），再重新运行此脚本。')
    process.exit(1)
  }
  throw err
}

console.log('正在初始化表结构与种子数据...\n')
try {
  execSync('npx tsx src/db-migrate.ts', { cwd: backendRoot, stdio: 'inherit', encoding: 'utf8' })
} catch (err: any) {
  if (err?.stderr) process.stderr.write(err.stderr)
  if (err?.stdout) process.stdout.write(err.stdout)
  throw err
}
console.log('\n✅ 数据库重置完成。可重新启动后端并上传数据。')
