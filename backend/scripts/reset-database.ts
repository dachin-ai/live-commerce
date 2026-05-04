/**
 * 重置 PostgreSQL 数据库：清空所有表并重新初始化表结构与种子数据。
 * 用法: cd backend && npx tsx scripts/reset-database.ts
 *
 * 注意：若后端正在运行，建议先停止后端（Ctrl+C）再运行此脚本，避免并发写入冲突。
 */
import '../src/loadEnv'
import { Pool } from 'pg'

async function main() {
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    database: process.env.PG_DATABASE || 'live_commerce',
    user: process.env.PG_USER || 'lvbcsym',
    password: process.env.PG_PASSWORD || 'lvbcsym2026',
  })

  console.log('重置 PostgreSQL 数据库...\n')

  try {
    // 断开其他连接（可选，提升安全性）
    await pool.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid()
    `).catch(() => {})

    // 删除 public schema 并重建（级联删除所有表、索引、序列等）
    console.log('🗑️  清空 public schema（删除所有表）...')
    await pool.query('DROP SCHEMA public CASCADE')
    await pool.query('CREATE SCHEMA public')
    await pool.query('GRANT ALL ON SCHEMA public TO public')
    console.log('✅ Schema 已重建\n')

    await pool.end()
  } catch (err: any) {
    console.error('❌ 重置数据库失败:', err?.message)
    await pool.end()
    process.exit(1)
  }

  // 重新初始化表结构与种子数据（通过 db-migrate.ts）
  console.log('正在初始化表结构与种子数据...\n')
  const { execSync } = require('child_process')
  const path = require('path')
  const backendRoot = path.join(__dirname, '..')
  try {
    execSync('npx tsx src/db-migrate.ts', { cwd: backendRoot, stdio: 'inherit', encoding: 'utf8' })
  } catch (err: any) {
    if (err?.stderr) process.stderr.write(err.stderr)
    if (err?.stdout) process.stdout.write(err.stdout)
    process.exit(1)
  }
  console.log('\n✅ PostgreSQL 数据库重置完成。可重新启动后端并上传数据。')
}

main()
