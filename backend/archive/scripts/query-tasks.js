// 查询任务数据（包含店铺名称）
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, '..', 'data.db');
const db = new sqlite3.Database(dbPath);

db.all(
  `SELECT t.*, s.name as storeName 
   FROM tasks t 
   LEFT JOIN stores s ON t.storeId = s.id 
   WHERE t.status = 'pending' 
   LIMIT 3`,
  (err, rows) => {
    if (err) {
      console.error('查询失败:', err);
    } else {
      console.log('任务数据（带店铺名）:');
      rows.forEach(row => {
        console.log(`- ${row.title} (店铺: ${row.storeName || '无'})`);
      });
    }
    db.close();
  }
);
