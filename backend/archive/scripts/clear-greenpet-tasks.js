// 清空greenpet的待办任务
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, '..', 'data.db');
const db = new sqlite3.Database(dbPath);

// 1. 获取greenpet店铺ID
db.get('SELECT id FROM stores WHERE name = ?', ['greenpet'], (err, store) => {
  if (err) {
    console.error('查询店铺失败:', err);
    db.close();
    return;
  }
  
  if (!store) {
    console.log('❌ 未找到greenpet店铺');
    db.close();
    return;
  }
  
  console.log(`📦 找到店铺: ${store.id}`);
  
  // 2. 查询该店铺的待办任务数量
  db.get('SELECT COUNT(*) as count FROM tasks WHERE storeId = ? AND status = "pending"', [store.id], (err, result) => {
    if (err) {
      console.error('查询任务数量失败:', err);
      db.close();
      return;
    }
    
    const count = result.count;
    console.log(`📋 待办任务数量: ${count}`);
    
    if (count === 0) {
      console.log('✅ 没有待办任务需要清空');
      db.close();
      return;
    }
    
    // 3. 删除该店铺的待办任务
    db.run('DELETE FROM tasks WHERE storeId = ? AND status = "pending"', [store.id], function(err) {
      if (err) {
        console.error('删除任务失败:', err);
      } else {
        console.log(`✅ 已清空 ${this.changes} 个待办任务`);
      }
      db.close();
    });
  });
});
