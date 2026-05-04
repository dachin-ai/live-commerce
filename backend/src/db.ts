/**
 * db.ts — Schema + Seed + Audit 层
 * 连接层已迁移至 ./database/connection.ts
 * 此文件保持向后兼容，所有现有 import 路径无需修改。
 */
import crypto from 'crypto'
import {
  getDatabase,
  dbRun,
  dbGet,
  dbAll,
  dbTransaction,
} from './database/connection'



export async function initDatabase() {
  // 创建任务表
  await dbRun(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'pending',
      createdAt TEXT NOT NULL DEFAULT NOW()
    )
  `)
  
  // 检查并添加userId和storeId字段（如果不存在）
  try {
    await dbRun(`ALTER TABLE tasks ADD COLUMN userId TEXT`)
  } catch (err: any) {
    if (!err?.message?.includes('duplicate column') && !err?.message?.includes('already exists')) {
      console.warn('添加userId字段时出错:', err?.message)
    }
  }
  try {
    await dbRun(`ALTER TABLE tasks ADD COLUMN storeId TEXT`)
  } catch (err: any) {
    if (!err?.message?.includes('duplicate column') && !err?.message?.includes('already exists')) {
      console.warn('添加storeId字段时出错:', err?.message)
    }
  }
  try {
    await dbRun(`ALTER TABLE tasks ADD COLUMN aiFeature TEXT`)
  } catch (err: any) {
    if (!err?.message?.includes('duplicate column') && !err?.message?.includes('already exists')) {
      console.warn('添加aiFeature字段时出错:', err?.message)
    }
  }
  try {
    await dbRun(`ALTER TABLE tasks ADD COLUMN source TEXT`)
  } catch (err: any) {
    if (!err?.message?.includes('duplicate column') && !err?.message?.includes('already exists')) {
      console.warn('添加source字段时出错:', err?.message)
    }
  }
  try {
    await dbRun(`ALTER TABLE tasks ADD COLUMN updatedAt TEXT`)
  } catch (err: any) {
    if (!err?.message?.includes('duplicate column') && !err?.message?.includes('already exists')) {
      console.warn('添加tasks.updatedAt时出错:', err?.message)
    }
  }
  try {
    await dbRun(`ALTER TABLE tasks ADD COLUMN title_i18n TEXT`)
  } catch (err: any) {
    if (!err?.message?.includes('duplicate column') && !err?.message?.includes('already exists')) {
      console.warn('添加tasks.title_i18n时出错:', err?.message)
    }
  }
  try {
    await dbRun(`ALTER TABLE tasks ADD COLUMN description_i18n TEXT`)
  } catch (err: any) {
    if (!err?.message?.includes('duplicate column') && !err?.message?.includes('already exists')) {
      console.warn('添加tasks.description_i18n时出错:', err?.message)
    }
  }
  try {
    await dbRun(`ALTER TABLE tasks ADD COLUMN assignedRole TEXT`)
  } catch (err: any) {
    if (!err?.message?.includes('duplicate column') && !err?.message?.includes('already exists')) {
      console.warn('添加tasks.assignedRole时出错:', err?.message)
    }
  }
  try {
    await dbRun(`ALTER TABLE tasks ADD COLUMN estimatedDays TEXT`)
  } catch (err: any) {
    if (!err?.message?.includes('duplicate column') && !err?.message?.includes('already exists')) {
      console.warn('添加tasks.estimatedDays时出错:', err?.message)
    }
  }
  try {
    await dbRun(`ALTER TABLE tasks ADD COLUMN category TEXT`)
  } catch (err: any) {
    if (!err?.message?.includes('duplicate column') && !err?.message?.includes('already exists')) {
      console.warn('添加tasks.category时出错:', err?.message)
    }
  }
  try {
    await dbRun(`ALTER TABLE tasks ADD COLUMN responsible TEXT`)
  } catch (err: any) {
    if (!err?.message?.includes('duplicate column') && !err?.message?.includes('already exists')) {
      console.warn('添加tasks.responsible时出错:', err?.message)
    }
  }
  try {
    await dbRun(`ALTER TABLE tasks ADD COLUMN weekStart TEXT`)
  } catch (err: any) {
    if (!err?.message?.includes('duplicate column') && !err?.message?.includes('already exists')) {
      console.warn('添加tasks.weekStart时出错:', err?.message)
    }
  }

  // 回填历史任务 weekStart（避免按周筛选时“查不到旧数据”）
  // weekStart 定义：自然周周一（UTC）YYYY-MM-DD
  try {
    const rows = await dbAll<{ id: string; createdAt: string | null; weekStart?: string | null }>(
      `SELECT id, createdAt, weekStart FROM tasks WHERE weekStart IS NULL OR weekStart = ''`
    )
    if (Array.isArray(rows) && rows.length > 0) {
      const toWeekStartUtcMonday = (iso: string) => {
        const d = new Date(iso)
        if (Number.isNaN(d.getTime())) return null
        // getUTCDay(): 0=Sun..6=Sat. Monday start.
        const day = d.getUTCDay()
        const diffToMonday = day === 0 ? -6 : 1 - day
        d.setUTCDate(d.getUTCDate() + diffToMonday)
        const y = d.getUTCFullYear()
        const m = String(d.getUTCMonth() + 1).padStart(2, '0')
        const dd = String(d.getUTCDate()).padStart(2, '0')
        return `${y}-${m}-${dd}`
      }
      let updated = 0
      for (const r of rows) {
        const createdAt = r.createdAt ? String(r.createdAt) : ''
        const ws = createdAt ? toWeekStartUtcMonday(createdAt) : null
        if (!ws) continue
        await dbRun(`UPDATE tasks SET weekStart = ? WHERE id = ?`, [ws, r.id])
        updated++
      }
      if (updated > 0) console.log(`🗓️ 已回填 tasks.weekStart: ${updated} 条`)
    }
  } catch (err: any) {
    // 不阻断启动：例如 tasks 表尚不存在、或旧库不支持该查询
    console.warn('回填tasks.weekStart失败(可忽略):', err?.message)
  }

  // 创建用户表
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      createdAt TEXT NOT NULL DEFAULT NOW(),
      updatedAt TEXT,
      lastLoginAt TEXT
    )
  `)
  try {
    await dbRun(`ALTER TABLE users ADD COLUMN updatedAt TEXT`)
  } catch (err: any) {
    if (!err?.message?.includes('duplicate column') && !err?.message?.includes('already exists')) {
      console.warn('添加users.updatedAt时出错:', err?.message)
    }
  }
  try {
    await dbRun(`ALTER TABLE users ADD COLUMN language TEXT`)
  } catch (err: any) {
    if (!err?.message?.includes('duplicate column') && !err?.message?.includes('already exists')) {
      console.warn('添加users.language时出错:', err?.message)
    }
  }

  // 创建用户会话表（用于长期记忆功能）
  await dbRun(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expiresAt TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT NOW(),
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `)

  // 找回密码令牌表
  await dbRun(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      email TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT NOW(),
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `)

  // 找回密码验证码表（邮箱验证码）
  await dbRun(`
    CREATE TABLE IF NOT EXISTS password_reset_codes (
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT NOW()
    )
  `)
  try {
    await dbRun('CREATE INDEX IF NOT EXISTS idx_reset_codes_email ON password_reset_codes(email)')
  } catch (_) {}

  // 新 IP 首次登录是否已看过教程（按 IP 哈希记录，用于前端仅在新 IP 首次登录时展示教程）
  await dbRun(`
    CREATE TABLE IF NOT EXISTS tutorial_seen_ips (
      ipHash TEXT PRIMARY KEY,
      seenAt TEXT NOT NULL DEFAULT NOW()
    )
  `)

  // 创建用户偏好设置表（长期记忆功能）
  await dbRun(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL UNIQUE,
      preferences TEXT NOT NULL DEFAULT '{}',
      updatedAt TEXT NOT NULL DEFAULT NOW(),
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `)

  // 用户反馈表（站内问题反馈/功能建议，管理员可查看）
  await dbRun(`
    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      userId TEXT,
      type TEXT NOT NULL DEFAULT 'problem',
      subject TEXT NOT NULL,
      content TEXT NOT NULL,
      contact TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      createdAt TEXT NOT NULL DEFAULT NOW(),
      updatedAt TEXT,
      replyContent TEXT,
      replyAt TEXT,
      imageUrls TEXT,
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `)
  try {
    await dbRun('CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status)')
    await dbRun('CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(type)')
    await dbRun('CREATE INDEX IF NOT EXISTS idx_feedback_createdAt ON feedback(createdAt)')
  } catch (_) {}
  try {
    await dbRun('ALTER TABLE feedback ADD COLUMN replyContent TEXT')
  } catch (_) {}
  try {
    await dbRun('ALTER TABLE feedback ADD COLUMN replyAt TEXT')
  } catch (_) {}
  try {
    await dbRun('ALTER TABLE feedback ADD COLUMN imageUrls TEXT')
  } catch (_) {}

  // 创建版本更新日志表
  await dbRun(`
    CREATE TABLE IF NOT EXISTS version_logs (
      id TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'feature',
      createdAt TEXT NOT NULL DEFAULT NOW()
    )
  `)

  // 站内信（版本更新、反馈回复、系统通知等）
  await dbRun(`
    CREATE TABLE IF NOT EXISTS in_app_messages (
      id TEXT PRIMARY KEY,
      userId TEXT,
      type TEXT NOT NULL DEFAULT 'system',
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      linkUrl TEXT,
      readAt TEXT,
      createdAt TEXT NOT NULL DEFAULT NOW(),
      extra TEXT,
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `)
  try {
    await dbRun('CREATE INDEX IF NOT EXISTS idx_in_app_messages_userId ON in_app_messages(userId)')
    await dbRun('CREATE INDEX IF NOT EXISTS idx_in_app_messages_createdAt ON in_app_messages(createdAt)')
  } catch (_) {}

  // 补录：将已有反馈回复写入站内信（避免重复）
  try {
    const feedbacks = await dbAll(
      "SELECT id, userId, subject, replyContent, replyAt FROM feedback WHERE replyContent IS NOT NULL AND replyContent != ''"
    ) as { id: string; userId: string | null; subject: string; replyContent: string; replyAt: string | null }[]
    for (const row of feedbacks) {
      if (!row.userId) continue
      const needle = `%"feedbackId":"${row.id}"%`
      const existing = await dbGet('SELECT id FROM in_app_messages WHERE type = ? AND extra LIKE ?', ['feedback_reply', needle])
      if (existing) continue
      const msgId = crypto.randomUUID()
      const title = `反馈回复：${(row.subject || '').slice(0, 50)}`
      const extra = JSON.stringify({ feedbackId: row.id })
      const createdAt = row.replyAt || new Date().toISOString()
      await dbRun(
        `INSERT INTO in_app_messages (id, userId, type, title, content, linkUrl, createdAt, extra)
         VALUES (?, ?, 'feedback_reply', ?, ?, '/messages', ?, ?)`,
        [msgId, row.userId, title, row.replyContent, createdAt, extra]
      )
    }
  } catch (_) {}

  // 创建产品分类表
  await dbRun(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      nameTh TEXT,
      level INTEGER NOT NULL DEFAULT 1,
      parentId TEXT,
      sortOrder INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT NOW(),
      FOREIGN KEY (parentId) REFERENCES categories(id)
    )
  `)

  // 创建商店表（扩展字段）
  await dbRun(`
    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      nameTh TEXT,
      description TEXT,
      platform TEXT,
      userId TEXT,
      region TEXT,
      currency TEXT DEFAULT 'CNY',
      currencySymbol TEXT DEFAULT '¥',
      minPrice REAL,
      maxPrice REAL,
      targetAudience TEXT,
      brandPositioning TEXT,
      brandStrategy TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      createdAt TEXT NOT NULL DEFAULT NOW(),
      updatedAt TEXT,
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `)
  try {
    await dbRun(`ALTER TABLE stores ADD COLUMN updatedAt TEXT`)
  } catch (err: any) {
    if (!err?.message?.includes('duplicate column') && !err?.message?.includes('already exists')) {
      console.warn('添加stores.updatedAt时出错:', err?.message)
    }
  }

  // 用户-店铺多对多可见表（一个店铺可被多人查看）
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

  // 创建商店分类关联表
  await dbRun(`
    CREATE TABLE IF NOT EXISTS store_categories (
      id TEXT PRIMARY KEY,
      storeId TEXT NOT NULL,
      categoryId TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT NOW(),
      FOREIGN KEY (storeId) REFERENCES stores(id),
      FOREIGN KEY (categoryId) REFERENCES categories(id),
      UNIQUE(storeId, categoryId)
    )
  `)

  // 创建素材表
  await dbRun(`
    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'video',
      url TEXT,
      storeId TEXT,
      description TEXT,
      createdAt TEXT NOT NULL DEFAULT NOW(),
      FOREIGN KEY (storeId) REFERENCES stores(id)
    )
  `)

  // 素材表扩展字段（直播录屏分析：优秀案例/问题片段）
  const materialCols = ['userId', 'title', 'content', 'videoId', 'tags', 'rating', 'metadata']
  for (const col of materialCols) {
    try {
      const def = col === 'userId' ? 'TEXT' : col === 'rating' ? 'REAL' : 'TEXT'
      await dbRun(`ALTER TABLE materials ADD COLUMN ${col} ${def}`)
    } catch (err: any) {
      if (!err?.message?.includes('duplicate column') && !err?.message?.includes('already exists')) {
        console.warn(`添加 materials.${col} 时出错:`, err?.message)
      }
    }
  }

  // 直播录屏视频表
  await dbRun(`
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      shopId TEXT,
      sessionId TEXT,
      fileName TEXT NOT NULL,
      fileKey TEXT NOT NULL,
      videoUrl TEXT NOT NULL,
      fileSize INTEGER DEFAULT 0,
      contentType TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      description TEXT,
      createdAt TEXT NOT NULL DEFAULT NOW(),
      deletedAt TEXT,
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (shopId) REFERENCES stores(id)
    )
  `)
  try {
    await dbRun('CREATE INDEX IF NOT EXISTS idx_videos_userId ON videos(userId)')
    await dbRun('CREATE INDEX IF NOT EXISTS idx_videos_shopId ON videos(shopId)')
    await dbRun('CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status)')
    await dbRun('CREATE INDEX IF NOT EXISTS idx_materials_videoId ON materials(videoId)')
  } catch (_) {}

  // 创建统计数据表
  await dbRun(`
    CREATE TABLE IF NOT EXISTS stats (
      id TEXT PRIMARY KEY,
      storeId TEXT,
      date TEXT,
      totalGMV REAL DEFAULT 0,
      totalDuration REAL DEFAULT 0,
      totalViewers INTEGER DEFAULT 0,
      activeViewers INTEGER DEFAULT 0,
      totalInteractions INTEGER DEFAULT 0,
      totalOrders INTEGER DEFAULT 0,
      completedOrders INTEGER DEFAULT 0,
      averageDailyDuration REAL DEFAULT 0,
      rounds INTEGER DEFAULT 0,
      averageConversionRate REAL DEFAULT 0,
      averageDurationPerRound REAL DEFAULT 0,
      gmvPerHour REAL DEFAULT 0,
      averageDurationPerDay REAL DEFAULT 0,
      roundsPerDay REAL DEFAULT 0,
      likes INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0,
      follows INTEGER DEFAULT 0,
      productViews INTEGER DEFAULT 0,
      productClicks INTEGER DEFAULT 0,
      clickThroughRate REAL DEFAULT 0,
      interactionRate REAL DEFAULT 0,
      updatedAt TEXT,
      createdAt TEXT NOT NULL DEFAULT NOW(),
      FOREIGN KEY (storeId) REFERENCES stores(id)
    )
  `)

  // 添加缺失的字段（如果表已存在）
  const statsColumns = [
    'completedOrders', 'averageDailyDuration', 'rounds', 'averageConversionRate',
    'averageDurationPerRound', 'gmvPerHour', 'averageDurationPerDay', 'roundsPerDay', 'updatedAt',
    'likes', 'comments', 'shares', 'follows', 'productViews', 'productClicks', 'clickThroughRate', 'interactionRate'
  ]
  const statsIntegerCols = new Set(['completedOrders', 'rounds', 'likes', 'comments', 'shares', 'follows', 'productViews', 'productClicks'])
  for (const col of statsColumns) {
    try {
      if (statsIntegerCols.has(col)) {
        await dbRun(`ALTER TABLE stats ADD COLUMN ${col} INTEGER DEFAULT 0`)
      } else if (col === 'updatedAt') {
        await dbRun(`ALTER TABLE stats ADD COLUMN ${col} TEXT`)
      } else {
        await dbRun(`ALTER TABLE stats ADD COLUMN ${col} REAL DEFAULT 0`)
      }
    } catch (err: any) {
      if (!err?.message?.includes('duplicate column') && !err?.message?.includes('already exists')) {
        console.warn(`添加stats表字段${col}时出错:`, err?.message)
      }
    }
  }

  // 创建数据导入记录表
  await dbRun(`
    CREATE TABLE IF NOT EXISTS data_imports (
      id TEXT PRIMARY KEY,
      storeId TEXT NOT NULL,
      platform TEXT NOT NULL,
      fileName TEXT NOT NULL,
      recordCount INTEGER DEFAULT 0,
      statsId TEXT,
      createdAt TEXT NOT NULL DEFAULT NOW(),
      FOREIGN KEY (storeId) REFERENCES stores(id),
      FOREIGN KEY (statsId) REFERENCES stats(id)
    )
  `)

  // ── TikTok / TT 数据导入体系 ────────────────────────────────────────────

  // 导入批次记录表
  await dbRun(`
    CREATE TABLE IF NOT EXISTS tt_imports (
      id          TEXT PRIMARY KEY,
      storeId     TEXT NOT NULL,
      dataType    TEXT NOT NULL,  -- live_sessions | ad_sessions | store_products | product_details
      dateFrom    TEXT,
      dateTo      TEXT,
      fileName    TEXT NOT NULL,
      recordCount INTEGER DEFAULT 0,
      currency    TEXT DEFAULT 'IDR',
      importedBy  TEXT NOT NULL,
      importedAt  TEXT NOT NULL DEFAULT NOW(),
      FOREIGN KEY (storeId) REFERENCES stores(id)
    )
  `)

  // 直播数据明细
  await dbRun(`
    CREATE TABLE IF NOT EXISTS tt_live_sessions (
      id                  TEXT PRIMARY KEY,
      importId            TEXT NOT NULL,
      storeId             TEXT NOT NULL,
      dateFrom            TEXT,
      dateTo              TEXT,
      name                TEXT,
      startTime           TEXT,
      durationSeconds     INTEGER DEFAULT 0,
      grossRevenue        REAL DEFAULT 0,
      directGmv           REAL DEFAULT 0,
      itemsSold           INTEGER DEFAULT 0,
      customers           INTEGER DEFAULT 0,
      avgPrice            REAL DEFAULT 0,
      ordersPaid          INTEGER DEFAULT 0,
      gmvPer1kShows       REAL DEFAULT 0,
      gmvPer1kViews       REAL DEFAULT 0,
      views               INTEGER DEFAULT 0,
      viewers             INTEGER DEFAULT 0,
      peakViewers         INTEGER DEFAULT 0,
      newFollowers        INTEGER DEFAULT 0,
      avgViewDurationSec  INTEGER DEFAULT 0,
      likes               INTEGER DEFAULT 0,
      comments            INTEGER DEFAULT 0,
      shares              INTEGER DEFAULT 0,
      productImpressions  INTEGER DEFAULT 0,
      productClicks       INTEGER DEFAULT 0,
      ctr                 REAL DEFAULT 0,
      ctor                REAL DEFAULT 0,
      currency            TEXT DEFAULT 'IDR',
      -- 衍生指标（导入时自动计算）
      gmvPerHour          REAL DEFAULT 0,    -- 时效：每小时成交额
      revenuePerViewer    REAL DEFAULT 0,    -- 人均贡献 GMV
      orderCvr            REAL DEFAULT 0,    -- 下单转化率（百分比）
      engagementRate      REAL DEFAULT 0,    -- 互动率（百分比）
      FOREIGN KEY (importId) REFERENCES tt_imports(id) ON DELETE CASCADE,
      FOREIGN KEY (storeId) REFERENCES stores(id)
    )
  `)

  // 迁移: 为已存在的 tt_live_sessions 表补充衍生列（IF NOT EXISTS 防止重复添加）
  const liveColumns: Record<string, string> = {
    gmvPerHour: 'REAL DEFAULT 0',
    revenuePerViewer: 'REAL DEFAULT 0',
    orderCvr: 'REAL DEFAULT 0',
    engagementRate: 'REAL DEFAULT 0',
  }
  const existingLiveCols = await dbAll<{ name: string }>(`SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'tt_live_sessions'`, [])
  const existingLiveColNames = existingLiveCols.map(c => c.name)
  for (const [col, def] of Object.entries(liveColumns)) {
    if (!existingLiveColNames.includes(col)) {
      await dbRun(`ALTER TABLE tt_live_sessions ADD COLUMN ${col} ${def}`).catch(() => {})
    }
  }

  // 直播广告消耗明细
  await dbRun(`
    CREATE TABLE IF NOT EXISTS tt_ad_sessions (
      id                  TEXT PRIMARY KEY,
      importId            TEXT NOT NULL,
      storeId             TEXT NOT NULL,
      dateFrom            TEXT,
      dateTo              TEXT,
      liveName            TEXT,
      launchedTime        TEXT,
      status              TEXT,
      campaignName        TEXT,
      campaignId          TEXT,
      adType              TEXT DEFAULT 'live',        -- live | video
      advertiserType      TEXT DEFAULT 'self',        -- self | influencer
      contentType         TEXT DEFAULT 'live_room',   -- live_room | short_video
      cost                REAL DEFAULT 0,
      netCost             REAL DEFAULT 0,
      skuOrders           INTEGER DEFAULT 0,
      skuOrdersShop       INTEGER DEFAULT 0,
      costPerOrder        REAL DEFAULT 0,
      grossRevenue        REAL DEFAULT 0,
      grossRevenueShop    REAL DEFAULT 0,
      roi                 REAL DEFAULT 0,
      liveViews           INTEGER DEFAULT 0,
      costPerLiveView     REAL DEFAULT 0,
      views10s            INTEGER DEFAULT 0,
      costPer10sView      REAL DEFAULT 0,
      liveFollows         INTEGER DEFAULT 0,
      currency            TEXT DEFAULT 'IDR',
      FOREIGN KEY (importId) REFERENCES tt_imports(id) ON DELETE CASCADE,
      FOREIGN KEY (storeId) REFERENCES stores(id)
    )
  `)

  // TikTok 短视频数据明细
  await dbRun(`
    CREATE TABLE IF NOT EXISTS tt_video_sessions (
      id                  TEXT PRIMARY KEY,
      importId            TEXT NOT NULL,
      storeId             TEXT NOT NULL,
      dateFrom            TEXT,
      dateTo              TEXT,
      creatorName         TEXT,
      creatorId           TEXT,
      videoInfo           TEXT,
      videoId             TEXT,
      publishedAt         TEXT,
      products            TEXT,
      videoViews          INTEGER DEFAULT 0,
      likes               INTEGER DEFAULT 0,
      comments            INTEGER DEFAULT 0,
      shares              INTEGER DEFAULT 0,
      newFollowers        INTEGER DEFAULT 0,
      videoToLiveClicks   INTEGER DEFAULT 0,
      productImpressions  INTEGER DEFAULT 0,
      productClicks       INTEGER DEFAULT 0,
      uniqueCustomers     INTEGER DEFAULT 0,
      orders              INTEGER DEFAULT 0,
      itemsSold           INTEGER DEFAULT 0,
      grossRevenue        REAL DEFAULT 0,
      gpm                 REAL DEFAULT 0,
      attributedGmv       REAL DEFAULT 0,
      ctr                 REAL DEFAULT 0,
      videoToLiveRate     REAL DEFAULT 0,
      videoFinishRate     REAL DEFAULT 0,
      clickToOrderRate    REAL DEFAULT 0,
      mark                TEXT,
      currency            TEXT DEFAULT 'IDR',
      FOREIGN KEY (importId) REFERENCES tt_imports(id) ON DELETE CASCADE,
      FOREIGN KEY (storeId) REFERENCES stores(id)
    )
  `)

  // 店铺商品数据（汇总，含曝光/点击/转化漏斗）
  await dbRun(`
    CREATE TABLE IF NOT EXISTS tt_store_products (
      id                TEXT PRIMARY KEY,
      importId          TEXT NOT NULL,
      storeId           TEXT NOT NULL,
      dateFrom          TEXT,
      dateTo            TEXT,
      productId         TEXT,
      productName       TEXT,
      viewers           INTEGER DEFAULT 0,
      views             INTEGER DEFAULT 0,
      uniqueClicks      INTEGER DEFAULT 0,
      clicks            INTEGER DEFAULT 0,
      skuOrders         INTEGER DEFAULT 0,
      customers         INTEGER DEFAULT 0,
      addToCartUsers    INTEGER DEFAULT 0,
      clicksAddToCart   INTEGER DEFAULT 0,
      gmv               REAL DEFAULT 0,
      viewToPaidRate    REAL DEFAULT 0,
      viewToClickRate   REAL DEFAULT 0,
      clickToCartRate   REAL DEFAULT 0,
      clickToPaidRate   REAL DEFAULT 0,
      cartToPaidRate    REAL DEFAULT 0,
      contentGmv        REAL DEFAULT 0,
      currency          TEXT DEFAULT 'IDR',
      FOREIGN KEY (importId) REFERENCES tt_imports(id) ON DELETE CASCADE,
      FOREIGN KEY (storeId) REFERENCES stores(id)
    )
  `)

  // 产品销售明细（按产品成交汇总，无漏斗数据）
  await dbRun(`
    CREATE TABLE IF NOT EXISTS tt_product_details (
      id            TEXT PRIMARY KEY,
      importId      TEXT NOT NULL,
      storeId       TEXT NOT NULL,
      dateFrom      TEXT,
      dateTo        TEXT,
      productId     TEXT,
      productName   TEXT,
      totalRevenue  REAL DEFAULT 0,
      commission    REAL DEFAULT 0,
      unitsSold     INTEGER DEFAULT 0,
      currency      TEXT DEFAULT 'IDR',
      FOREIGN KEY (importId) REFERENCES tt_imports(id) ON DELETE CASCADE,
      FOREIGN KEY (storeId) REFERENCES stores(id)
    )
  `)

  // TT 数据表索引（逐条执行，node-pg 不支持多语句）
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_tt_live_storeId ON tt_live_sessions(storeId)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_tt_live_date ON tt_live_sessions(dateFrom, dateTo)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_tt_live_importId ON tt_live_sessions(importId)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_tt_ad_storeId ON tt_ad_sessions(storeId)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_tt_ad_date ON tt_ad_sessions(dateFrom, dateTo)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_tt_sp_storeId ON tt_store_products(storeId)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_tt_sp_productId ON tt_store_products(productId)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_tt_pd_storeId ON tt_product_details(storeId)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_tt_pd_productId ON tt_product_details(productId)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_tt_imports_storeId ON tt_imports(storeId)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_tt_vs_storeId ON tt_video_sessions(storeId)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_tt_vs_date ON tt_video_sessions(dateFrom, dateTo)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_tt_vs_videoId ON tt_video_sessions(videoId)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_tt_vs_importId ON tt_video_sessions(importId)`)

  // 目标管理表 (BI 模块)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS tt_targets (
      id          TEXT PRIMARY KEY,
      storeId     TEXT NOT NULL,
      month       TEXT NOT NULL,         -- YYYY-MM
      metric      TEXT NOT NULL,         -- 'gmv' | 'orders' | 'adSpend' | 'roi' | 'sessions'
      targetValue REAL DEFAULT 0,
      isAiGenerated INTEGER DEFAULT 0,  -- 1=AI一键生成基线
      note        TEXT,
      createdAt   TEXT NOT NULL DEFAULT NOW(),
      UNIQUE(storeId, month, metric),
      FOREIGN KEY (storeId) REFERENCES stores(id)
    )
  `)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_tt_targets_store_month ON tt_targets(storeId, month);`)

  // 迁移: tt_store_products 增加 weekTag（自然周标记）和 channelType（渠道预留）
  const spCols = await dbAll<{ name: string }>(`SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'tt_store_products'`, [])
  const spColNames = spCols.map(c => c.name)
  if (!spColNames.includes('weekTag')) {
    await dbRun(`ALTER TABLE tt_store_products ADD COLUMN weekTag TEXT`).catch(() => {})
  }
  if (!spColNames.includes('channelType')) {
    await dbRun(`ALTER TABLE tt_store_products ADD COLUMN channelType TEXT DEFAULT 'ALL'`).catch(() => {})
  }

  // 迁移: tt_product_details 增加 channelType（与 store_products 保持一致，支持渠道归属标注）
  const pdMigCols = await dbAll<{ name: string }>(`SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'tt_product_details'`, [])
  const pdMigColNames = pdMigCols.map(c => c.name)
  if (!pdMigColNames.includes('channelType')) {
    await dbRun(`ALTER TABLE tt_product_details ADD COLUMN channelType TEXT DEFAULT 'ALL'`).catch(() => {})
  }


  // 创建索引（逐条执行，node-pg 不支持多语句）
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_tasks_userId ON tasks(userId)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_tasks_storeId ON tasks(storeId)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_stores_status ON stores(status)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_stores_userId ON stores(userId)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_materials_storeId ON materials(storeId)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_stats_storeId ON stats(storeId)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_stats_date ON stats(date)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_stats_storeId_date ON stats(storeId, date)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_categories_parentId ON categories(parentId)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_store_categories_storeId ON store_categories(storeId)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_store_categories_categoryId ON store_categories(categoryId)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_user_store_access_userId ON user_store_access(userId)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_user_store_access_storeId ON user_store_access(storeId)`)

  // 创建复合索引用于加速去重查询（title + status + userId + storeId）
  // 注意：不使用UNIQUE约束，因为SQLite对NULL的处理比较特殊，多个NULL被认为是不同的
  // 去重逻辑在应用层面实现（backend/src/routes/ai.ts）
  try {
    await dbRun(`
      CREATE INDEX IF NOT EXISTS idx_tasks_dedup 
      ON tasks(title, status, userId, storeId)
    `)
    console.log('✅ 创建任务去重索引成功')
  } catch (err: any) {
    console.warn('创建任务去重索引失败:', err?.message)
  }

  // 插入示例用户（带密码）
  const existingUsers = await dbGet<{ count: number }>('SELECT COUNT(*) as count FROM users')
  if (existingUsers && existingUsers.count == 0) {
    // 默认密码都是 123456，实际使用时应该让用户首次登录修改
    const bcrypt = require('bcryptjs')
    const adminPassword = bcrypt.hashSync('123456', 10)
    const userPassword = bcrypt.hashSync('123456', 10)

    const sampleUsers = [
      ['user-1', 'Admin User', 'admin@example.com', adminPassword, 'admin', 'active'],
      ['user-2', '运营专员', 'operator@example.com', userPassword, 'operator', 'active'],
      ['user-3', '主播测试', 'anchor@example.com', userPassword, 'operator', 'active'],
      ['user-4', '运营测试1', 'operator1@test.com', userPassword, 'operator', 'active'],
      ['user-5', '运营测试2', 'operator2@test.com', userPassword, 'operator', 'active'],
      ['user-6', '运营测试3', 'operator3@test.com', userPassword, 'operator', 'active'],
      ['user-7', '运营测试4', 'operator4@test.com', userPassword, 'operator', 'active'],
      ['user-8', '运营测试5', 'operator5@test.com', userPassword, 'operator', 'active'],
      ['user-9', '经理示例', 'manager@example.com', userPassword, 'manager', 'active'],
    ]

    for (const user of sampleUsers) {
      await dbRun(
        'INSERT INTO users (id, name, email, password, role, status) VALUES (?, ?, ?, ?, ?, ?)',
        user
      )
      // 创建用户偏好设置
      await dbRun(
        'INSERT INTO user_preferences (id, userId, preferences) VALUES (?, ?, ?)',
        [crypto.randomUUID(), user[0], '{}']
      )
    }
  }

  // 插入示例版本日志
  const existingLogs = await dbGet<{ count: number }>('SELECT COUNT(*) as count FROM version_logs')
  if (existingLogs && existingLogs.count == 0) {
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

  // 插入抖音电商三级分类（对标抖店/抖音电商官方类目：一级=行业大类，二三级=细分类目，与抖店后台「行业资质」类目体系一致）
  const existingCategories = await dbGet<{ count: number }>('SELECT COUNT(*) as count FROM categories')
  if (existingCategories && existingCategories.count == 0) {
    // 一级分类（对标抖店/抖音电商，覆盖八大行业及常见一级类目，尽量全面）
    const level1Categories = [
      ['cat-1-1', '服饰鞋包', 'เสื้อผ้าและกระเป๋า', 1, null, 1],
      ['cat-1-2', '美妆个护', 'ความงามและดูแลส่วนบุคคล', 1, null, 2],
      ['cat-1-3', '食品健康', 'อาหารและสุขภาพ', 1, null, 3],
      ['cat-1-4', '亲子生活', 'แม่และเด็กและชีวิต', 1, null, 4],
      ['cat-1-5', '家居家电', 'ของใช้ในบ้านและเครื่องใช้ไฟฟ้า', 1, null, 5],
      ['cat-1-6', '3C数码', 'อิเล็กทรอนิกส์', 1, null, 6],
      ['cat-1-7', '运动户外', 'กีฬาและกิจกรรมกลางแจ้ง', 1, null, 7],
      ['cat-1-8', '汽车', 'ยานยนต์', 1, null, 8],
      ['cat-1-9', '鲜花园艺', 'ดอกไม้และสวน', 1, null, 9],
      ['cat-1-10', '珠宝文玩', 'เครื่องประดับและของสะสม', 1, null, 10],
      ['cat-1-11', '文化娱乐', 'วัฒนธรรมและความบันเทิง', 1, null, 11],
      ['cat-1-12', '宠物生活', 'สัตว์เลี้ยง', 1, null, 12],
      ['cat-1-13', '母婴', 'แม่และเด็ก', 1, null, 13],
      ['cat-1-14', '医药保健', 'ยาและสุขภาพ', 1, null, 14],
      ['cat-1-15', '虚拟商品', 'สินค้าเสมือน', 1, null, 15],
      ['cat-1-16', '本地生活', 'ชีวิตประจำวัน', 1, null, 16],
      ['cat-1-17', '农资绿植', 'เกษตรและไม้ประดับ', 1, null, 17],
      ['cat-1-18', '玩乐潮玩', 'ของเล่นและคอลเลกชัน', 1, null, 18],
    ]

    for (const cat of level1Categories) {
      await dbRun(
        'INSERT INTO categories (id, name, nameTh, level, parentId, sortOrder) VALUES (?, ?, ?, ?, ?, ?)',
        cat
      )
    }

    // 二级分类（对标抖店二级类目：与抖店后台类目树一致）
    const level2Categories = [
      // 服饰鞋包（抖店：女装/男装/服饰内衣/鞋靴/箱包皮具/配饰）
      ['cat-2-1', '女装', 'เสื้อผ้าผู้หญิง', 2, 'cat-1-1', 1],
      ['cat-2-2', '男装', 'เสื้อผ้าผู้ชาย', 2, 'cat-1-1', 2],
      ['cat-2-3', '内衣', 'ชุดชั้นใน', 2, 'cat-1-1', 3],
      ['cat-2-4', '鞋靴', 'รองเท้า', 2, 'cat-1-1', 4],
      ['cat-2-5', '箱包皮具', 'กระเป๋าและหนัง', 2, 'cat-1-1', 5],
      ['cat-2-6', '配饰', 'เครื่องประดับ', 2, 'cat-1-1', 6],
      // 美妆个护（抖店：面部护肤/香水彩妆/美妆工具/个人护理等）
      ['cat-2-7', '面部护肤', 'ดูแลผิวหน้า', 2, 'cat-1-2', 1],
      ['cat-2-8', '彩妆', 'เครื่องสำอาง', 2, 'cat-1-2', 2],
      ['cat-2-9', '香水', 'น้ำหอม', 2, 'cat-1-2', 3],
      ['cat-2-10', '美发护发', 'ดูแลผม', 2, 'cat-1-2', 4],
      ['cat-2-11', '个人护理', 'ดูแลส่วนบุคคล', 2, 'cat-1-2', 5],
      // 食品健康
      ['cat-2-12', '休闲零食', 'ขนมขบเคี้ยว', 2, 'cat-1-3', 1],
      ['cat-2-13', '生鲜', 'อาหารสด', 2, 'cat-1-3', 2],
      ['cat-2-14', '茶饮', 'ชาและเครื่องดื่ม', 2, 'cat-1-3', 3],
      ['cat-2-15', '酒类', 'เครื่องดื่มแอลกอฮอล์', 2, 'cat-1-3', 4],
      ['cat-2-16', '保健食品', 'อาหารเสริม', 2, 'cat-1-3', 5],
      // 亲子生活
      ['cat-2-17', '童装', 'เสื้อผ้าเด็ก', 2, 'cat-1-4', 1],
      ['cat-2-18', '玩具', 'ของเล่น', 2, 'cat-1-4', 2],
      ['cat-2-19', '孕产用品', 'ของใช้แม่และเด็ก', 2, 'cat-1-4', 3],
      ['cat-2-20', '喂养用品', 'อุปกรณ์การให้อาหาร', 2, 'cat-1-4', 4],
      ['cat-2-21', '教育培训', 'การศึกษา', 2, 'cat-1-4', 5],
      // 家居家电
      ['cat-2-22', '家纺', 'ผ้าปูที่นอน', 2, 'cat-1-5', 1],
      ['cat-2-23', '家具', 'เฟอร์นิเจอร์', 2, 'cat-1-5', 2],
      ['cat-2-24', '家电', 'เครื่องใช้ไฟฟ้า', 2, 'cat-1-5', 3],
      ['cat-2-25', '家装建材', 'วัสดุก่อสร้าง', 2, 'cat-1-5', 4],
      ['cat-2-26', '厨具', 'เครื่องครัว', 2, 'cat-1-5', 5],
      // 3C数码
      ['cat-2-27', '手机', 'โทรศัพท์มือถือ', 2, 'cat-1-6', 1],
      ['cat-2-28', '电脑', 'คอมพิวเตอร์', 2, 'cat-1-6', 2],
      ['cat-2-29', '数码配件', 'อุปกรณ์เสริม', 2, 'cat-1-6', 3],
      ['cat-2-30', '智能设备', 'อุปกรณ์อัจฉริยะ', 2, 'cat-1-6', 4],
      ['cat-2-31', '办公设备', 'อุปกรณ์สำนักงาน', 2, 'cat-1-6', 5],
      // 运动户外
      ['cat-2-32', '运动服饰', 'เสื้อผ้ากีฬา', 2, 'cat-1-7', 1],
      ['cat-2-33', '运动装备', 'อุปกรณ์กีฬา', 2, 'cat-1-7', 2],
      ['cat-2-34', '户外用品', 'อุปกรณ์กลางแจ้ง', 2, 'cat-1-7', 3],
      ['cat-2-69', '休闲与室外休闲设备', 'อุปกรณ์สันทนาการและกลางแจ้ง', 2, 'cat-1-7', 4],
      // 汽车
      ['cat-2-35', '汽车用品', 'ของใช้รถยนต์', 2, 'cat-1-8', 1],
      ['cat-2-36', '汽车配件', 'อะไหล่รถยนต์', 2, 'cat-1-8', 2],
      // 鲜花园艺
      ['cat-2-37', '鲜花', 'ดอกไม้', 2, 'cat-1-9', 1],
      ['cat-2-38', '绿植', 'ไม้ประดับ', 2, 'cat-1-9', 2],
      ['cat-2-39', '园艺用品', 'อุปกรณ์ทำสวน', 2, 'cat-1-9', 3],
      // 珠宝文玩
      ['cat-2-40', '珠宝', 'เครื่องประดับมีค่า', 2, 'cat-1-10', 1],
      ['cat-2-41', '文玩', 'ของสะสม', 2, 'cat-1-10', 2],
      ['cat-2-42', '艺术品', 'งานศิลปะ', 2, 'cat-1-10', 3],
      // 文化娱乐
      ['cat-2-43', '图书', 'หนังสือ', 2, 'cat-1-11', 1],
      ['cat-2-44', '文具', 'เครื่องเขียน', 2, 'cat-1-11', 2],
      ['cat-2-45', '乐器', 'เครื่องดนตรี', 2, 'cat-1-11', 3],
      // 宠物生活
      ['cat-2-46', '宠物食品', 'อาหารสัตว์เลี้ยง', 2, 'cat-1-12', 1],
      ['cat-2-47', '宠物用品', 'ของใช้สัตว์เลี้ยง', 2, 'cat-1-12', 2],
      ['cat-2-48', '宠物服务', 'บริการสัตว์เลี้ยง', 2, 'cat-1-12', 3],
      // 母婴
      ['cat-2-49', '奶粉辅食', 'นมและอาหารเด็ก', 2, 'cat-1-13', 1],
      ['cat-2-50', '纸尿裤', 'ผ้าอ้อม', 2, 'cat-1-13', 2],
      ['cat-2-51', '婴童用品', 'ของใช้เด็ก', 2, 'cat-1-13', 3],
      ['cat-2-52', '孕产用品', 'ของใช้แม่และเด็ก', 2, 'cat-1-13', 4],
      // 医药保健
      ['cat-2-53', '医疗器械', 'อุปกรณ์การแพทย์', 2, 'cat-1-14', 1],
      ['cat-2-54', '保健用品', 'ผลิตภัณฑ์สุขภาพ', 2, 'cat-1-14', 2],
      ['cat-2-55', '营养滋补', 'อาหารเสริมและบำรุง', 2, 'cat-1-14', 3],
      // 虚拟商品
      ['cat-2-56', '游戏充值', 'เติมเกม', 2, 'cat-1-15', 1],
      ['cat-2-57', '卡券会员', 'บัตรและสมาชิก', 2, 'cat-1-15', 2],
      ['cat-2-58', '数字内容', 'เนื้อหาดิจิทัล', 2, 'cat-1-15', 3],
      // 本地生活
      ['cat-2-59', '餐饮美食', 'อาหารและเครื่องดื่ม', 2, 'cat-1-16', 1],
      ['cat-2-60', '丽人美发', 'ความงามและผม', 2, 'cat-1-16', 2],
      ['cat-2-61', '休闲娱乐', 'ความบันเทิง', 2, 'cat-1-16', 3],
      ['cat-2-62', '生活服务', 'บริการชีวิต', 2, 'cat-1-16', 4],
      // 农资绿植
      ['cat-2-63', '农资农具', 'อุปกรณ์เกษตร', 2, 'cat-1-17', 1],
      ['cat-2-64', '种子种苗', 'เมล็ดและต้นกล้า', 2, 'cat-1-17', 2],
      ['cat-2-65', '绿植盆栽', 'ไม้กระถาง', 2, 'cat-1-17', 3],
      // 玩乐潮玩
      ['cat-2-66', '盲盒手办', 'ของสะสมและฟิกเกอร์', 2, 'cat-1-18', 1],
      ['cat-2-67', '模型玩具', 'โมเดลและของเล่น', 2, 'cat-1-18', 2],
      ['cat-2-68', '卡牌桌游', 'การ์ดและบอร์ดเกม', 2, 'cat-1-18', 3],
    ]

    for (const cat of level2Categories) {
      await dbRun(
        'INSERT INTO categories (id, name, nameTh, level, parentId, sortOrder) VALUES (?, ?, ?, ?, ?, ?)',
        cat
      )
    }

    // 三级分类（对标抖店三级类目：与抖店商品发布时可选细分类一致）
    const level3Categories = [
      // 女装
      ['cat-3-1', '连衣裙', 'ชุดเดรส', 3, 'cat-2-1', 1],
      ['cat-3-2', 'T恤', 'เสื้อยืด', 3, 'cat-2-1', 2],
      ['cat-3-3', '衬衫', 'เสื้อเชิ้ต', 3, 'cat-2-1', 3],
      ['cat-3-4', '外套', 'เสื้อคลุม', 3, 'cat-2-1', 4],
      ['cat-3-5', '裤子', 'กางเกง', 3, 'cat-2-1', 5],
      ['cat-3-6', '半身裙', 'กระโปรง', 3, 'cat-2-1', 6],
      // 男装
      ['cat-3-7', 'T恤', 'เสื้อยืด', 3, 'cat-2-2', 1],
      ['cat-3-8', '衬衫', 'เสื้อเชิ้ต', 3, 'cat-2-2', 2],
      ['cat-3-9', '外套', 'เสื้อคลุม', 3, 'cat-2-2', 3],
      ['cat-3-10', '裤子', 'กางเกง', 3, 'cat-2-2', 4],
      // 面部护肤
      ['cat-3-11', '洁面', 'ทำความสะอาด', 3, 'cat-2-7', 1],
      ['cat-3-12', '精华', 'เซรั่ม', 3, 'cat-2-7', 2],
      ['cat-3-13', '面霜', 'ครีม', 3, 'cat-2-7', 3],
      ['cat-3-14', '面膜', 'มาส์กหน้า', 3, 'cat-2-7', 4],
      ['cat-3-15', '眼霜', 'ครีมรอบดวงตา', 3, 'cat-2-7', 5],
      ['cat-3-16', '爽肤水', 'โทนเนอร์', 3, 'cat-2-7', 6],
      // 彩妆
      ['cat-3-17', '口红', 'ลิปสติก', 3, 'cat-2-8', 1],
      ['cat-3-18', '粉底', 'รองพื้น', 3, 'cat-2-8', 2],
      ['cat-3-19', '眼影', 'อายแชโดว์', 3, 'cat-2-8', 3],
      ['cat-3-20', '睫毛膏', 'มาสคาร่า', 3, 'cat-2-8', 4],
      ['cat-3-21', '腮红', 'บลัชออน', 3, 'cat-2-8', 5],
      // 休闲零食
      ['cat-3-22', '坚果', 'ถั่ว', 3, 'cat-2-12', 1],
      ['cat-3-23', '膨化食品', 'ขนมขบเคี้ยว', 3, 'cat-2-12', 2],
      ['cat-3-24', '糖果', 'ลูกอม', 3, 'cat-2-12', 3],
      ['cat-3-25', '饼干', 'คุกกี้', 3, 'cat-2-12', 4],
      ['cat-3-26', '肉脯', 'เนื้อแห้ง', 3, 'cat-2-12', 5],
      // 生鲜
      ['cat-3-27', '水果', 'ผลไม้', 3, 'cat-2-13', 1],
      ['cat-3-28', '蔬菜', 'ผัก', 3, 'cat-2-13', 2],
      ['cat-3-29', '海鲜', 'อาหารทะเล', 3, 'cat-2-13', 3],
      ['cat-3-30', '肉禽蛋', 'เนื้อและไข่', 3, 'cat-2-13', 4],
      // 茶饮
      ['cat-3-31', '茶叶', 'ชา', 3, 'cat-2-14', 1],
      ['cat-3-32', '咖啡', 'กาแฟ', 3, 'cat-2-14', 2],
      ['cat-3-33', '饮料', 'เครื่องดื่ม', 3, 'cat-2-14', 3],
      // 酒类
      ['cat-3-34', '白酒', 'เหล้าขาว', 3, 'cat-2-15', 1],
      ['cat-3-35', '葡萄酒', 'ไวน์', 3, 'cat-2-15', 2],
      ['cat-3-36', '啤酒', 'เบียร์', 3, 'cat-2-15', 3],
      // 童装
      ['cat-3-37', '女童装', 'เสื้อผ้าเด็กหญิง', 3, 'cat-2-17', 1],
      ['cat-3-38', '男童装', 'เสื้อผ้าเด็กชาย', 3, 'cat-2-17', 2],
      ['cat-3-39', '婴儿装', 'เสื้อผ้าเด็กทารก', 3, 'cat-2-17', 3],
      // 家电
      ['cat-3-40', '大家电', 'เครื่องใช้ไฟฟ้าขนาดใหญ่', 3, 'cat-2-24', 1],
      ['cat-3-41', '生活电器', 'เครื่องใช้ในชีวิตประจำวัน', 3, 'cat-2-24', 2],
      ['cat-3-42', '厨房电器', 'เครื่องใช้ในครัว', 3, 'cat-2-24', 3],
      // 厨具（补齐三级类目：支持常见厨具细分，便于选到“厨具”下三级）
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
      // 手机
      ['cat-3-43', '智能手机', 'สมาร์ทโฟน', 3, 'cat-2-27', 1],
      ['cat-3-44', '手机壳', 'เคสโทรศัพท์', 3, 'cat-2-27', 2],
      ['cat-3-45', '手机膜', 'ฟิล์มหน้าจอ', 3, 'cat-2-27', 3],
      ['cat-3-46', '充电配件', 'อุปกรณ์ชาร์จ', 3, 'cat-2-27', 4],
      // 电脑
      ['cat-3-47', '笔记本', 'โน้ตบุ๊ค', 3, 'cat-2-28', 1],
      ['cat-3-48', '台式机', 'เดสก์ท็อป', 3, 'cat-2-28', 2],
      ['cat-3-49', '平板', 'แท็บเล็ต', 3, 'cat-2-28', 3],
      // 运动服饰
      ['cat-3-50', '运动T恤', 'เสื้อยืดกีฬา', 3, 'cat-2-32', 1],
      ['cat-3-51', '运动裤', 'กางเกงกีฬา', 3, 'cat-2-32', 2],
      ['cat-3-52', '运动鞋', 'รองเท้ากีฬา', 3, 'cat-2-32', 3],
      ['cat-3-53', '运动外套', 'เสื้อคลุมกีฬา', 3, 'cat-2-32', 4],
      // 休闲与室外休闲设备
      ['cat-3-77', '骑行用品', 'อุปกรณ์ขี่จักรยาน', 3, 'cat-2-69', 1],
      ['cat-3-78', '露营装备', 'อุปกรณ์แค้มป์', 3, 'cat-2-69', 2],
      ['cat-3-79', '垂钓用品', 'อุปกรณ์ตกปลา', 3, 'cat-2-69', 3],
      // 鲜花
      ['cat-3-54', '鲜花束', 'ช่อดอกไม้', 3, 'cat-2-37', 1],
      ['cat-3-55', '干花', 'ดอกไม้แห้ง', 3, 'cat-2-37', 2],
      ['cat-3-56', '永生花', 'ดอกไม้ถาวร', 3, 'cat-2-37', 3],
      // 珠宝
      ['cat-3-57', '黄金', 'ทอง', 3, 'cat-2-40', 1],
      ['cat-3-58', '钻石', 'เพชร', 3, 'cat-2-40', 2],
      ['cat-3-59', '翡翠', 'หยก', 3, 'cat-2-40', 3],
      ['cat-3-60', '银饰', 'เครื่องประดับเงิน', 3, 'cat-2-40', 4],
      // 图书
      ['cat-3-61', '文学', 'วรรณกรรม', 3, 'cat-2-43', 1],
      ['cat-3-62', '童书', 'หนังสือเด็ก', 3, 'cat-2-43', 2],
      ['cat-3-63', '教辅', 'หนังสือเรียน', 3, 'cat-2-43', 3],
      ['cat-3-64', '经管', 'ธุรกิจและการจัดการ', 3, 'cat-2-43', 4],
      // 宠物食品
      ['cat-3-65', '猫粮', 'อาหารแมว', 3, 'cat-2-46', 1],
      ['cat-3-66', '狗粮', 'อาหารสุนัข', 3, 'cat-2-46', 2],
      ['cat-3-67', '宠物零食', 'ขนมสัตว์เลี้ยง', 3, 'cat-2-46', 3],
      // 奶粉辅食
      ['cat-3-68', '婴幼儿奶粉', 'นมผงเด็ก', 3, 'cat-2-49', 1],
      ['cat-3-69', '辅食', 'อาหารเสริมเด็ก', 3, 'cat-2-49', 2],
      // 游戏充值
      ['cat-3-70', '游戏点卡', 'บัตรเติมเกม', 3, 'cat-2-56', 1],
      ['cat-3-71', '游戏道具', 'ไอเทมเกม', 3, 'cat-2-56', 2],
      // 餐饮美食
      ['cat-3-72', '团购套餐', 'เซ็ตอาหาร', 3, 'cat-2-59', 1],
      ['cat-3-73', '代金券', 'คูปอง', 3, 'cat-2-59', 2],
      // 盲盒手办
      ['cat-3-74', '盲盒', 'กล่องเซอร์ไพรส์', 3, 'cat-2-66', 1],
      ['cat-3-75', '手办', 'ฟิกเกอร์', 3, 'cat-2-66', 2],
      ['cat-3-76', '潮玩', 'ของเล่นเทรนด์', 3, 'cat-2-66', 3],
    ]

    for (const cat of level3Categories) {
      await dbRun(
        'INSERT INTO categories (id, name, nameTh, level, parentId, sortOrder) VALUES (?, ?, ?, ?, ?, ?)',
        cat
      )
    }
  }

  // 插入示例商店
  const existingStores = await dbGet<{ count: number }>('SELECT COUNT(*) as count FROM stores')
  if (existingStores && existingStores.count == 0) {
    const sampleStores = [
      {
        id: 'store-1',
        name: '旗舰店',
        nameTh: 'ร้านค้าหลัก',
        description: '主要销售渠道',
        platform: '抖音',
        userId: 'user-1',
        region: '北京',
        currency: 'CNY',
        currencySymbol: '¥',
        minPrice: 100,
        maxPrice: 1000,
        targetAudience: '25-45岁女性',
        brandPositioning: '中高端品牌',
        brandStrategy: '作为旗舰店，建议建立高端品牌形象，通过专业的直播团队、优质的商品和卓越的服务提升品牌价值。',
        status: 'active'
      },
      {
        id: 'store-2',
        name: '专营店',
        nameTh: 'ร้านค้าเฉพาะ',
        description: '特色商品专营',
        platform: '快手',
        userId: 'user-1',
        region: '曼谷',
        currency: 'THB',
        currencySymbol: '฿',
        minPrice: 50,
        maxPrice: 500,
        targetAudience: '18-35岁年轻人',
        brandPositioning: '时尚潮流',
        brandStrategy: '作为专营店，建议建立年轻化品牌形象，通过时尚的商品、有趣的直播内容和互动活动吸引年轻消费者。',
        status: 'active'
      },
    ]

    for (const store of sampleStores) {
      await dbRun(
        'INSERT INTO stores (id, name, nameTh, description, platform, userId, region, currency, currencySymbol, minPrice, maxPrice, targetAudience, brandPositioning, brandStrategy, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          store.id,
          store.name,
          store.nameTh,
          store.description,
          store.platform,
          store.userId,
          store.region,
          store.currency,
          store.currencySymbol,
          store.minPrice,
          store.maxPrice,
          store.targetAudience,
          store.brandPositioning,
          store.brandStrategy,
          store.status
        ]
      )
    }
  }

  // 插入示例任务
  const existingTasks = await dbGet<{ count: number }>('SELECT COUNT(*) as count FROM tasks')
  if (existingTasks && existingTasks.count == 0) {
    const sampleTasks = [
      {
        id: crypto.randomUUID(),
        title: '优化直播标题',
        description: '根据数据分析优化直播标题以提高点击率',
        priority: 'urgent',
        status: 'pending',
        userId: 'user-1',
        storeId: null
      },
      {
        id: crypto.randomUUID(),
        title: '分析热门商品',
        description: '分析最近7天的热门商品数据',
        priority: 'normal',
        status: 'pending',
        userId: 'user-1',
        storeId: null
      },
      {
        id: crypto.randomUUID(),
        title: '生成运营报告',
        description: '生成本周的运营数据报告',
        priority: 'normal',
        status: 'pending',
        userId: 'user-1',
        storeId: null
      },
    ]

    for (const task of sampleTasks) {
      await dbRun(
        'INSERT INTO tasks (id, title, description, priority, status, userId, storeId) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [task.id, task.title, task.description, task.priority, task.status, task.userId, task.storeId]
      )
    }
  }

  // 操作审计表（对标淘宝/字节等电商：关键操作可追溯，便于合规与排查）
  await dbRun(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      userId TEXT,
      action TEXT NOT NULL,
      entityType TEXT NOT NULL,
      entityId TEXT,
      details TEXT,
      ipAddress TEXT,
      createdAt TEXT NOT NULL DEFAULT NOW(),
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `)
  try {
    await dbRun('CREATE INDEX IF NOT EXISTS idx_audit_log_userId ON audit_log(userId)')
    await dbRun('CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entityType, entityId)')
    await dbRun('CREATE INDEX IF NOT EXISTS idx_audit_log_createdAt ON audit_log(createdAt)')
  } catch (_) {}

  // 系统配置表（如话术 LLM 的 URL/API Key，由管理员在后台配置并共享给全体用户）
  await dbRun(`
    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT NOT NULL DEFAULT NOW()
    )
  `)

  // 多套 AI 工具配置表（终端用户可选择使用哪一套）
  await dbRun(`
    CREATE TABLE IF NOT EXISTS llm_tools (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'coze_agent',
      url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      model TEXT,
      features TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT NOW(),
      updatedAt TEXT NOT NULL DEFAULT NOW()
    )
  `)
  // 为已有表补齐新增列（兼容已有数据库）
  try { await dbRun(`ALTER TABLE llm_tools ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'coze_agent'`) } catch (_) {}
  try { await dbRun(`ALTER TABLE llm_tools ADD COLUMN IF NOT EXISTS features TEXT`) } catch (_) {}
  try { await dbRun(`ALTER TABLE llm_tools ADD COLUMN IF NOT EXISTS isActive INTEGER NOT NULL DEFAULT 1`) } catch (_) {}
  // 若表为空且存在旧版单套配置，迁移为第一套工具
  const countRow = await dbGet<{ c: number }>('SELECT COUNT(*) as c FROM llm_tools')
  if (countRow && countRow.c == 0) {
    const urlRow = await dbGet<{ value: string }>('SELECT value FROM system_config WHERE key = ?', ['script_llm_url'])
    const keyRow = await dbGet<{ value: string }>('SELECT value FROM system_config WHERE key = ?', ['script_llm_api_key'])
    const modelRow = await dbGet<{ value: string }>('SELECT value FROM system_config WHERE key = ?', ['script_llm_model'])
    const url = urlRow?.value?.trim()
    const apiKey = keyRow?.value?.trim()
    if (url && apiKey) {
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      await dbRun(
        'INSERT INTO llm_tools (id, name, url, api_key, model, sort_order, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, '默认 LLM', url, apiKey, (modelRow?.value?.trim()) || null, 0, now, now]
      )
      await dbRun(
        "INSERT INTO system_config (key, value, updatedAt) VALUES ('llm_tool_default_id', ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updatedAt = ?",
        [id, now, id, now]
      )
      console.log('✅ 已从旧版 script_llm_* 迁移为第一套 AI 工具')
    }
  }

  console.log('✅ 数据库初始化完成')
}

/**
 * 操作审计日志（对标淘宝/字节等：关键操作可追溯）
 * @param params.userId 操作用户 ID（可选）
 * @param params.action 操作类型：create | update | delete | login | export 等
 * @param params.entityType 实体类型：user | store | task | stats | config 等
 * @param params.entityId 实体 ID（可选）
 * @param params.details 详情 JSON 字符串（可选）
 * @param params.ipAddress 请求 IP（可选）
 */
export async function logAudit(params: {
  userId?: string
  action: string
  entityType: string
  entityId?: string
  details?: string
  ipAddress?: string
}): Promise<void> {
  const id = crypto.randomUUID()
  const { userId, action, entityType, entityId, details, ipAddress } = params
  await dbRun(
    `INSERT INTO audit_log (id, userId, action, entityType, entityId, details, ipAddress) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId ?? null, action, entityType, entityId ?? null, details ?? null, ipAddress ?? null]
  )
}

// 导出 Promise 版本的数据库操作方法，兼容所有现有 import 路径
// 连接层实现已移至 ./database/connection.ts
export { getDatabase, dbRun, dbGet, dbAll, dbTransaction } from './database/connection'
