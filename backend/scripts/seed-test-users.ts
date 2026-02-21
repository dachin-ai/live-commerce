/**
 * 在现有数据库中补充 5 个运营测试账号 + 1 个虚拟管理员（若不存在）。
 * 仅在邮箱不存在时插入，不覆盖已有用户。
 * 用法：在 backend 目录执行 npm run db:seed-test-users 或 npx tsx scripts/seed-test-users.ts
 */
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { initDatabase, dbRun, dbGet } from '../src/db'

const TEST_USERS = [
  { id: 'user-4', name: '运营测试1', email: 'operator1@test.com', role: 'operator' as const },
  { id: 'user-5', name: '运营测试2', email: 'operator2@test.com', role: 'operator' as const },
  { id: 'user-6', name: '运营测试3', email: 'operator3@test.com', role: 'operator' as const },
  { id: 'user-7', name: '运营测试4', email: 'operator4@test.com', role: 'operator' as const },
  { id: 'user-8', name: '运营测试5', email: 'operator5@test.com', role: 'operator' as const },
  { id: 'user-9', name: '虚拟管理员', email: 'viewer@example.com', role: 'viewer' as const },
]

const DEFAULT_PASSWORD = '123456'

async function main() {
  await initDatabase()
  const hashedPassword = bcrypt.hashSync(DEFAULT_PASSWORD, 10)
  let created = 0
  for (const u of TEST_USERS) {
    const existing = await dbGet<{ id: string }>('SELECT id FROM users WHERE email = ?', [u.email])
    if (existing) {
      console.log('已存在，跳过:', u.email)
      continue
    }
    await dbRun(
      'INSERT INTO users (id, name, email, password, role, status) VALUES (?, ?, ?, ?, ?, ?)',
      [u.id, u.name, u.email, hashedPassword, u.role, 'active']
    )
    await dbRun(
      'INSERT INTO user_preferences (id, userId, preferences) VALUES (?, ?, ?)',
      [crypto.randomUUID(), u.id, '{}']
    )
    console.log('已创建:', u.email, `(${u.name}, ${u.role})`)
    created++
  }
  console.log('完成。本次创建', created, '个账号。默认密码:', DEFAULT_PASSWORD)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
