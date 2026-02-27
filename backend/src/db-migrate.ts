/**
 * 数据库迁移和种子数据更新工具
 * 
 * 使用方法：
 * 1. 更新种子数据：npm run db:update-seed
 * 2. 重置数据库：npm run db:reset
 */

import { getDatabase, dbRun, dbGet, initDatabase } from './db'
import crypto from 'crypto'

// 数据库版本表
const DB_VERSION_TABLE = 'db_version'

/**
 * 初始化数据库版本表
 */
async function initVersionTable() {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS ${DB_VERSION_TABLE} (
      version INTEGER PRIMARY KEY,
      description TEXT,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
}

/**
 * 获取当前数据库版本
 */
async function getCurrentVersion(): Promise<number> {
  const result = await dbGet<{ version: number }>(
    `SELECT MAX(version) as version FROM ${DB_VERSION_TABLE}`
  )
  return result?.version || 0
}

/**
 * 记录迁移版本（若已存在则跳过，避免 UNIQUE 冲突）
 */
async function recordMigration(version: number, description: string) {
  const exists = await dbGet<{ c: number }>(
    `SELECT COUNT(*) as c FROM ${DB_VERSION_TABLE} WHERE version = ?`,
    [version]
  )
  if (exists && exists.c > 0) return
  await dbRun(
    `INSERT INTO ${DB_VERSION_TABLE} (version, description) VALUES (?, ?)`,
    [version, description]
  )
}

/**
 * 更新种子数据（不删除现有数据）
 * 只更新分类等种子数据，保留业务数据
 */
export async function updateSeedData() {
  console.log('🔄 开始更新种子数据...')
  
  await initVersionTable()
  const currentVersion = await getCurrentVersion()
  
  // 检查分类数据是否存在
  const existingCategories = await dbGet<{ count: number }>(
    'SELECT COUNT(*) as count FROM categories'
  )
  
  console.log('📦 检查并插入分类种子数据...')
  await insertCategories()
  await recordMigration(1, '初始化/更新分类数据')
  
  // 检查用户数据
  const existingUsers = await dbGet<{ count: number }>(
    'SELECT COUNT(*) as count FROM users'
  )
  
  if (existingUsers && existingUsers.count === 0) {
    console.log('📦 插入用户种子数据...')
    await insertUsers()
    await recordMigration(2, '初始化用户数据')
  }
  
  // 检查版本日志
  const existingLogs = await dbGet<{ count: number }>(
    'SELECT COUNT(*) as count FROM version_logs'
  )
  
  if (existingLogs && existingLogs.count === 0) {
    console.log('📦 插入版本日志种子数据...')
    await insertVersionLogs()
    await recordMigration(3, '初始化版本日志数据')
  }

  // 迁移：添加运动户外下的休闲与室外休闲设备、骑行用品等（已有库增量更新）
  if (currentVersion < 10) {
    console.log('📦 添加运动户外细分类目（休闲与室外休闲设备、骑行用品等）...')
    await addMissingCategoriesV10()
    await recordMigration(10, '添加运动户外细分类目')
  }

  // 迁移：将虚拟管理员(viewer)合并为经理(manager)
  if (currentVersion < 11) {
    console.log('📦 将虚拟管理员(viewer)角色合并为经理(manager)...')
    const result = await dbRun('UPDATE users SET role = ? WHERE role = ?', ['manager', 'viewer'])
    console.log('✅ 已迁移 viewer 用户为 manager')
    await recordMigration(11, '合并 viewer 角色为 manager')
  }

  // 迁移：创建 user_store_access 表，支持一个店铺被多人查看
  if (currentVersion < 12) {
    console.log('📦 创建 user_store_access 表（店铺多人可见）...')
    await dbRun(`
      CREATE TABLE IF NOT EXISTS user_store_access (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        storeId TEXT NOT NULL,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (userId) REFERENCES users(id),
        FOREIGN KEY (storeId) REFERENCES stores(id),
        UNIQUE(userId, storeId)
      )
    `)
    await dbRun('CREATE INDEX IF NOT EXISTS idx_user_store_access_userId ON user_store_access(userId)')
    await dbRun('CREATE INDEX IF NOT EXISTS idx_user_store_access_storeId ON user_store_access(storeId)')
    await recordMigration(12, '创建 user_store_access 表')
  }

  console.log('✅ 种子数据更新完成')
}

/** 添加运动户外下的休闲与室外休闲设备、骑行用品等（INSERT OR IGNORE 避免重复） */
async function addMissingCategoriesV10() {
  const toAdd = [
    ['cat-2-69', '休闲与室外休闲设备', 'อุปกรณ์สันทนาการและกลางแจ้ง', 2, 'cat-1-7', 4],
    ['cat-3-77', '骑行用品', 'อุปกรณ์ขี่จักรยาน', 3, 'cat-2-69', 1],
    ['cat-3-78', '露营装备', 'อุปกรณ์แค้มป์', 3, 'cat-2-69', 2],
    ['cat-3-79', '垂钓用品', 'อุปกรณ์ตกปลา', 3, 'cat-2-69', 3],
  ]
  for (const row of toAdd) {
    await dbRun(
      'INSERT OR IGNORE INTO categories (id, name, nameTh, level, parentId, sortOrder) VALUES (?, ?, ?, ?, ?, ?)',
      row
    )
  }
  console.log('✅ 运动户外细分类目已添加')
}

/**
 * 插入分类数据
 * 如果分类表为空，则插入；如果已有数据，则跳过
 */
async function insertCategories() {
  const existing = await dbGet<{ count: number }>('SELECT COUNT(*) as count FROM categories')
  if (existing && existing.count > 0) {
    console.log('⚠️  分类数据已存在，跳过插入')
    console.log('💡 如需更新分类，请先重置数据库（选项1）')
    return
  }

  // 调用 initDatabase 插入分类数据
  const { initDatabase } = require('./db')
  await initDatabase()
  console.log('✅ 分类数据已插入')
}

/**
 * 插入用户数据
 */
async function insertUsers() {
  const bcrypt = require('bcryptjs')
  const adminPassword = bcrypt.hashSync('123456', 10)
  const userPassword = bcrypt.hashSync('123456', 10)

  const sampleUsers = [
    ['user-1', 'Admin User', 'admin@example.com', adminPassword, 'admin', 'active'],
    ['user-2', '运营专员', 'operator@example.com', userPassword, 'operator', 'active'],
    ['user-3', '主播测试', 'anchor@example.com', userPassword, 'anchor', 'active'],
  ]

  for (const user of sampleUsers) {
    await dbRun(
      'INSERT INTO users (id, name, email, password, role, status) VALUES (?, ?, ?, ?, ?, ?)',
      user
    )
    await dbRun(
      'INSERT INTO user_preferences (id, userId, preferences) VALUES (?, ?, ?)',
      [crypto.randomUUID(), user[0], '{}']
    )
  }
}

/**
 * 插入版本日志数据
 */
async function insertVersionLogs() {
  const sampleLogs = [
    ['v1.0.0', '初始版本发布', '系统初始版本，包含基础功能', 'release'],
    ['v1.1.0', '新增AI功能', '添加AI生成脚本、报告等功能', 'feature'],
    ['v1.2.0', '优化用户体验', '改进界面设计，优化操作流程', 'improvement'],
  ]

  for (const log of sampleLogs) {
    const id = crypto.randomUUID()
    await dbRun(
      'INSERT INTO version_logs (id, version, title, content, type, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      [id, ...log, new Date().toISOString()]
    )
  }
}

// 如果直接运行此文件（先建表再插种子数据）
if (require.main === module) {
  ;(async () => {
    try {
      console.log('🔄 初始化数据库表结构...')
      await initDatabase()
      console.log('✅ 表结构就绪')
      await updateSeedData()
      console.log('✅ 完成')
      process.exit(0)
    } catch (err) {
      console.error('❌ 错误:', err)
      process.exit(1)
    }
  })()
}
