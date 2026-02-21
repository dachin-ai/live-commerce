/**
 * 必须在任何使用 process.env 的模块之前加载，确保 backend/.env 被读取。
 * index.ts 第一个 import 必须是本文件。
 */
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

const envPaths = [
  path.join(__dirname, '..', '.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend', '.env'),
]
for (const p of envPaths) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p })
    break
  }
}
dotenv.config()
