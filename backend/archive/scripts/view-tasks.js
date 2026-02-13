// 查看所有待办任务
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, '..', 'data.db');
const db = new sqlite3.Database(dbPath);

console.log('📂 数据库路径:', dbPath);

db.all(
  `SELECT id, title, status, userId, storeId, createdAt 
   FROM tasks 
   WHERE status = 'pending' 
   ORDER BY createdAt DESC 
   LIMIT 30`,
  [],
  (err, rows) => {
    if (err) {
      console.error('❌ 错误:', err);
      db.close();
      return;
    }
    
    console.log(`\n📊 共 ${rows.length} 个pending任务：\n`);
    rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.title}`);
      console.log(`   ID: ${row.id}`);
      console.log(`   User: ${row.userId}, Store: ${row.storeId}`);
      console.log(`   Created: ${row.createdAt}\n`);
    });
    
    // 按标题分组统计
    const titleCount = {};
    rows.forEach(row => {
      titleCount[row.title] = (titleCount[row.title] || 0) + 1;
    });
    
    console.log('📊 标题统计：');
    Object.entries(titleCount)
      .sort((a, b) => b[1] - a[1])
      .forEach(([title, count]) => {
        if (count > 1) {
          console.log(`❌ "${title}" - ${count} 次`);
        } else {
          console.log(`✅ "${title}" - ${count} 次`);
        }
      });
    
    db.close();
  }
);
