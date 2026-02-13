// 清理重复待办任务的Node.js脚本
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, '..', 'data.db');
const db = new sqlite3.Database(dbPath);

console.log('📂 数据库路径:', dbPath);

// 查看重复任务
function viewDuplicates() {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT title, status, userId, storeId, COUNT(*) as count
      FROM tasks
      WHERE status = 'pending'
      GROUP BY title, status, userId, IFNULL(storeId, 'NULL')
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `;
    
    db.all(sql, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// 删除重复任务，只保留最新的一条
function cleanDuplicates() {
  return new Promise((resolve, reject) => {
    const sql = `
      DELETE FROM tasks
      WHERE id NOT IN (
        SELECT id FROM (
          SELECT id, 
                 ROW_NUMBER() OVER (
                   PARTITION BY title, status, userId, IFNULL(storeId, 'NULL')
                   ORDER BY createdAt DESC
                 ) as rn
          FROM tasks
          WHERE status = 'pending'
        ) t
        WHERE rn = 1
      )
      AND status = 'pending'
    `;
    
    db.run(sql, [], function(err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

// 主函数
async function main() {
  try {
    console.log('\n📊 查看重复任务...');
    const duplicates = await viewDuplicates();
    
    if (duplicates.length === 0) {
      console.log('✅ 没有发现重复任务');
      db.close();
      return;
    }
    
    console.log(`\n❌ 发现 ${duplicates.length} 组重复任务：`);
    duplicates.forEach((row, index) => {
      console.log(`${index + 1}. "${row.title}" - 重复 ${row.count} 次 (userId: ${row.userId}, storeId: ${row.storeId})`);
    });
    
    console.log('\n🧹 开始清理重复任务（保留最新的一条）...');
    const deletedCount = await cleanDuplicates();
    console.log(`✅ 成功删除 ${deletedCount} 个重复任务`);
    
    console.log('\n📊 再次检查...');
    const remainingDuplicates = await viewDuplicates();
    if (remainingDuplicates.length === 0) {
      console.log('✅ 所有重复任务已清理完成');
    } else {
      console.log(`⚠️  还有 ${remainingDuplicates.length} 组重复任务`);
    }
    
    db.close();
  } catch (error) {
    console.error('❌ 错误:', error);
    db.close();
    process.exit(1);
  }
}

main();
