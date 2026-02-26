/**
 * 导出 categories 表为 INSERT OR IGNORE 语句，用于同步到服务器
 * 用法：cd backend && node scripts/export-categories.js > categories_export.sql
 * 列名与 db.ts 一致：id, name, nameTh, level, parentId, sortOrder
 */
const sqlite3 = require('sqlite3')
const path = require('path')
const dbPath = path.join(__dirname, '..', 'data.db')
const db = new sqlite3.Database(dbPath)

db.all('SELECT * FROM categories ORDER BY id', (err, rows) => {
  if (err) {
    console.error(err)
    process.exit(1)
  }
  rows.forEach((r) => {
    const name = String(r.name || '').replace(/'/g, "''")
    const nameTh = String(r.nameTh || r.name_th || '').replace(/'/g, "''")
    const parent = (r.parentId ?? r.parent_id) == null ? 'NULL' : `'${r.parentId || r.parent_id}'`
    const sort = r.sortOrder ?? r.sort_order ?? 0
    console.log(
      `INSERT OR IGNORE INTO categories (id,name,nameTh,level,parentId,sortOrder) VALUES ('${r.id}','${name}','${nameTh}',${r.level},${parent},${sort});`
    )
  })
  db.close()
})
