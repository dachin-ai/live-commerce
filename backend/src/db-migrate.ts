/**
 * 数据库迁移和种子数据更新工具
 * 
 * 使用方法：
 * 1. 更新种子数据：npm run db:update-seed
 * 2. 重置数据库：npm run db:reset
 */

import { getDatabase, dbRun, dbGet, dbAll, initDatabase } from './db'
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
      applied_at TEXT NOT NULL DEFAULT NOW()
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
        createdAt TEXT NOT NULL DEFAULT NOW(),
        FOREIGN KEY (userId) REFERENCES users(id),
        FOREIGN KEY (storeId) REFERENCES stores(id),
        UNIQUE(userId, storeId)
      )
    `)
    await dbRun('CREATE INDEX IF NOT EXISTS idx_user_store_access_userId ON user_store_access(userId)')
    await dbRun('CREATE INDEX IF NOT EXISTS idx_user_store_access_storeId ON user_store_access(storeId)')
    await recordMigration(12, '创建 user_store_access 表')
  }

  // 迁移：补齐「厨具」三级类目（已有库增量更新）
  if (currentVersion < 13) {
    console.log('📦 补齐厨具三级类目（锅具/刀具/餐具等）...')
    await addMissingCategoriesV13()
    await recordMigration(13, '补齐厨具三级类目')
  }

  // 迁移：为所有缺三级的二级类目补“其他”，并补充部分常用三级
  if (currentVersion < 14) {
    console.log('📦 补齐缺失的三级类目（至少“其他”）...')
    await addMissingLevel3FallbacksV14()
    await recordMigration(14, '补齐缺失的三级类目（其他）')
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
      'INSERT INTO categories (id, name, nameTh, level, parentId, sortOrder) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
      row
    )
  }
  console.log('✅ 运动户外细分类目已添加')
}

/** 补齐厨具(cat-2-26)下的三级类目（INSERT OR IGNORE 避免重复） */
async function addMissingCategoriesV13() {
  const toAdd = [
    ['cat-3-80', '锅具', 'เครื่องครัวประเภทหม้อ/กระทะ', 3, 'cat-2-26', 1],
    ['cat-3-81', '刀具', 'มีดทำครัว', 3, 'cat-2-26', 2],
    ['cat-3-82', '砧板', 'เขียง', 3, 'cat-2-26', 3],
    ['cat-3-83', '餐具', 'ช้อนส้อม/จานชาม', 3, 'cat-2-26', 4],
    ['cat-3-84', '厨房收纳', 'ที่เก็บของในครัว', 3, 'cat-2-26', 5],
    ['cat-3-85', '保鲜存储', 'กล่องถนอมอาหาร/เก็บรักษา', 3, 'cat-2-26', 6],
    ['cat-3-86', '烘焙工具', 'อุปกรณ์อบ', 3, 'cat-2-26', 7],
    ['cat-3-87', '厨房小工具', 'อุปกรณ์ครัวชิ้นเล็ก', 3, 'cat-2-26', 8],
    ['cat-3-88', '清洁工具', 'อุปกรณ์ทำความสะอาดครัว', 3, 'cat-2-26', 9],
    ['cat-3-89', '一次性用品', 'ของใช้แบบใช้ครั้งเดียวในครัว', 3, 'cat-2-26', 10],
  ]
  for (const row of toAdd) {
    await dbRun(
      'INSERT INTO categories (id, name, nameTh, level, parentId, sortOrder) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
      row
    )
  }
  console.log('✅ 厨具三级类目已补齐')
}

/**
 * 为所有没有三级子类目的二级类目补一个“其他”三级（INSERT OR IGNORE）。
 * 同时补充一批常见细分三级（用于提升可选性）。
 */
async function addMissingLevel3FallbacksV14() {
  // 1) 自动补“其他”
  const level2 = await dbAll<{ id: string; name: string }>(
    `SELECT id, name FROM categories WHERE level = 2 ORDER BY sortOrder, name`
  )
  for (const c of level2) {
    const row = await dbGet<{ c: number }>(
      `SELECT COUNT(*) as c FROM categories WHERE level = 3 AND parentId = ?`,
      [c.id]
    )
    const has = Number(row?.c ?? 0) > 0
    if (has) continue
    const id = `cat-3-auto-${c.id}`
    await dbRun(
      'INSERT INTO categories (id, name, nameTh, level, parentId, sortOrder) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
      [id, '其他', null, 3, c.id, 999]
    )
  }

  // 2) 常用细分补充（尽量通用，避免空洞；可后续按平台再细化）
  const toAdd = [
    // 家纺
    ['cat-3-90', '床品套件', 'ชุดเครื่องนอน', 3, 'cat-2-22', 1],
    ['cat-3-91', '被子', 'ผ้าห่ม', 3, 'cat-2-22', 2],
    ['cat-3-92', '枕头', 'หมอน', 3, 'cat-2-22', 3],
    ['cat-3-93', '毛巾浴巾', 'ผ้าเช็ดตัว', 3, 'cat-2-22', 4],
    // 家具
    ['cat-3-94', '沙发', 'โซฟา', 3, 'cat-2-23', 1],
    ['cat-3-95', '床', 'เตียง', 3, 'cat-2-23', 2],
    ['cat-3-96', '桌椅', 'โต๊ะและเก้าอี้', 3, 'cat-2-23', 3],
    ['cat-3-97', '收纳柜', 'ตู้เก็บของ', 3, 'cat-2-23', 4],
    // 家装建材
    ['cat-3-98', '灯具', 'โคมไฟ', 3, 'cat-2-25', 1],
    ['cat-3-99', '五金工具', 'เครื่องมือช่าง', 3, 'cat-2-25', 2],
    ['cat-3-100', '卫浴', 'ห้องน้ำ', 3, 'cat-2-25', 3],
    ['cat-3-101', '装饰材料', 'วัสดุตกแต่ง', 3, 'cat-2-25', 4],
    // 数码配件
    ['cat-3-102', '耳机音响', 'หูฟัง/ลำโพง', 3, 'cat-2-29', 1],
    ['cat-3-103', '数据线', 'สายข้อมูล', 3, 'cat-2-29', 2],
    ['cat-3-104', '充电器', 'ที่ชาร์จ', 3, 'cat-2-29', 3],
    ['cat-3-105', '存储设备', 'อุปกรณ์จัดเก็บข้อมูล', 3, 'cat-2-29', 4],
    // 智能设备
    ['cat-3-106', '智能手表', 'สมาร์ทวอทช์', 3, 'cat-2-30', 1],
    ['cat-3-107', '智能家居', 'สมาร์ทโฮม', 3, 'cat-2-30', 2],
    ['cat-3-108', '智能穿戴', 'อุปกรณ์สวมใส่', 3, 'cat-2-30', 3],
    // 办公设备
    ['cat-3-109', '打印机', 'เครื่องพิมพ์', 3, 'cat-2-31', 1],
    ['cat-3-110', '投影仪', 'โปรเจคเตอร์', 3, 'cat-2-31', 2],
    ['cat-3-111', '办公耗材', 'อุปกรณ์สิ้นเปลืองสำนักงาน', 3, 'cat-2-31', 3],
    // 运动装备
    ['cat-3-112', '瑜伽健身', 'โยคะ/ฟิตเนส', 3, 'cat-2-33', 1],
    ['cat-3-113', '球类运动', 'กีฬาแบบลูกบอล', 3, 'cat-2-33', 2],
    ['cat-3-114', '跑步装备', 'อุปกรณ์วิ่ง', 3, 'cat-2-33', 3],
    // 户外用品
    ['cat-3-115', '登山徒步', 'เดินป่า', 3, 'cat-2-34', 1],
    ['cat-3-116', '露营', 'แค้มป์ปิ้ง', 3, 'cat-2-34', 2],
    ['cat-3-117', '旅行用品', 'อุปกรณ์ท่องเที่ยว', 3, 'cat-2-34', 3],
    // 汽车用品
    ['cat-3-118', '车载电器', 'อุปกรณ์ไฟฟ้ารถยนต์', 3, 'cat-2-35', 1],
    ['cat-3-119', '清洁养护', 'ดูแล/ทำความสะอาดรถ', 3, 'cat-2-35', 2],
    ['cat-3-120', '内饰用品', 'อุปกรณ์ตกแต่งภายใน', 3, 'cat-2-35', 3],
    // 汽车配件
    ['cat-3-121', '轮胎轮毂', 'ยาง/ล้อ', 3, 'cat-2-36', 1],
    ['cat-3-122', '灯泡雨刷', 'ไฟ/ที่ปัดน้ำฝน', 3, 'cat-2-36', 2],
    ['cat-3-123', '维修配件', 'อะไหล่ซ่อมบำรุง', 3, 'cat-2-36', 3],
    // 绿植/园艺用品
    ['cat-3-124', '室内绿植', 'ไม้ประดับในบ้าน', 3, 'cat-2-38', 1],
    ['cat-3-125', '多肉盆栽', 'ไม้อวบน้ำ', 3, 'cat-2-38', 2],
    ['cat-3-126', '花盆花土', 'กระถาง/ดิน', 3, 'cat-2-39', 1],
    ['cat-3-127', '园艺工具', 'เครื่องมือทำสวน', 3, 'cat-2-39', 2],
    // 宠物用品
    ['cat-3-128', '猫砂猫砂盆', 'ทรายแมว/กระบะ', 3, 'cat-2-47', 1],
    ['cat-3-129', '宠物清洁', 'ทำความสะอาดสัตว์เลี้ยง', 3, 'cat-2-47', 2],
    ['cat-3-130', '宠物玩具', 'ของเล่นสัตว์เลี้ยง', 3, 'cat-2-47', 3],
    // 玩具（亲子生活）
    ['cat-3-131', '益智玩具', 'ของเล่นเสริมทักษะ', 3, 'cat-2-18', 1],
    ['cat-3-132', '积木拼图', 'บล็อก/จิ๊กซอว์', 3, 'cat-2-18', 2],
    ['cat-3-133', '毛绒玩具', 'ตุ๊กตา', 3, 'cat-2-18', 3],
    // 教育培训
    ['cat-3-134', '线上课程', 'คอร์สออนไลน์', 3, 'cat-2-21', 1],
    ['cat-3-135', '教辅资料', 'สื่อการเรียน', 3, 'cat-2-21', 2],
    // 香水
    ['cat-3-136', '女士香水', 'น้ำหอมผู้หญิง', 3, 'cat-2-9', 1],
    ['cat-3-137', '男士香水', 'น้ำหอมผู้ชาย', 3, 'cat-2-9', 2],
    // 美发护发
    ['cat-3-138', '洗发护发', 'แชมพู/ครีมนวด', 3, 'cat-2-10', 1],
    ['cat-3-139', '造型工具', 'อุปกรณ์จัดแต่งทรง', 3, 'cat-2-10', 2],
    // 个人护理
    ['cat-3-140', '身体护理', 'ดูแลผิวกาย', 3, 'cat-2-11', 1],
    ['cat-3-141', '口腔护理', 'ดูแลช่องปาก', 3, 'cat-2-11', 2],
    ['cat-3-142', '剃须脱毛', 'โกนหนวด/กำจัดขน', 3, 'cat-2-11', 3],
  ]
  for (const row of toAdd) {
    await dbRun(
      'INSERT INTO categories (id, name, nameTh, level, parentId, sortOrder) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
      row
    )
  }
  console.log('✅ 缺失三级已补齐（含“其他”兜底 + 常用细分）')
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
