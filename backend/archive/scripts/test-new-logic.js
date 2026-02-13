// 测试新的待办生成逻辑
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, '..', 'data.db');
const db = new sqlite3.Database(dbPath);

console.log('📂 数据库路径:', dbPath);
console.log('');

// 获取店铺信息
async function getStore() {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM stores WHERE name = ?`, ['greenpet'], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// 获取当前统计数据
async function getCurrentStats(storeId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM stats WHERE storeId = ? ORDER BY createdAt DESC LIMIT 1`,
      [storeId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

// 获取历史统计数据（用于计算历史平均值）
async function getHistoricalStats(storeId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM stats WHERE storeId = ? ORDER BY createdAt DESC LIMIT 5`,
      [storeId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

// 获取品类
async function getCategories(storeId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT c.name FROM categories c
       INNER JOIN store_categories sc ON c.id = sc.categoryId
       WHERE sc.storeId = ?`,
      [storeId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(r => r.name));
      }
    );
  });
}

// 模拟动态阈值计算
function calculateDynamicThresholds(currentStats, historicalStats, categories) {
  console.log('🔧 计算动态阈值...');
  
  const current = {
    gmv: currentStats.totalGMV || 0,
    duration: currentStats.totalDuration || 0,
    viewers: currentStats.totalViewers || 0,
    orders: currentStats.totalOrders || 0,
    interactions: currentStats.totalInteractions || 0,
  };
  
  const conversionRate = current.viewers > 0 ? (current.orders / current.viewers) * 100 : 0;
  const gmvPerHour = current.duration > 0 ? current.gmv / current.duration : 0;
  const interactionRate = current.viewers > 0 ? (current.interactions / current.viewers) * 100 : 0;
  const avgOrderValue = current.orders > 0 ? current.gmv / current.orders : 0;
  
  console.log(`   当前转化率: ${conversionRate.toFixed(2)}%`);
  console.log(`   当前GMV/小时: ¥${gmvPerHour.toFixed(2)}`);
  console.log(`   当前互动率: ${interactionRate.toFixed(2)}%`);
  console.log(`   当前客单价: ¥${avgOrderValue.toFixed(2)}`);
  
  // 计算历史平均值
  if (historicalStats.length > 1) {
    const historical = historicalStats.slice(1); // 排除最新一期
    const count = historical.length;
    
    const avgGMV = historical.reduce((sum, s) => sum + (s.totalGMV || 0), 0) / count;
    const avgDuration = historical.reduce((sum, s) => sum + (s.totalDuration || 0), 0) / count;
    const avgViewers = historical.reduce((sum, s) => sum + (s.totalViewers || 0), 0) / count;
    const avgOrders = historical.reduce((sum, s) => sum + (s.totalOrders || 0), 0) / count;
    const avgInteractions = historical.reduce((sum, s) => sum + (s.totalInteractions || 0), 0) / count;
    
    const avgConversionRate = avgViewers > 0 ? (avgOrders / avgViewers) * 100 : 0;
    const avgGMVPerHour = avgDuration > 0 ? avgGMV / avgDuration : 0;
    const avgInteractionRate = avgViewers > 0 ? (avgInteractions / avgViewers) * 100 : 0;
    const avgAOV = avgOrders > 0 ? avgGMV / avgOrders : 0;
    
    console.log('');
    console.log('📊 历史平均值:');
    console.log(`   历史转化率: ${avgConversionRate.toFixed(2)}%`);
    console.log(`   历史GMV/小时: ¥${avgGMVPerHour.toFixed(2)}`);
    console.log(`   历史互动率: ${avgInteractionRate.toFixed(2)}%`);
    console.log(`   历史客单价: ¥${avgAOV.toFixed(2)}`);
    
    console.log('');
    console.log('🎯 动态阈值（基于历史数据和行业基准）:');
    
    // 行业基准（宠物用品）
    const industryConversionRate = 3.8;
    const conversionMin = avgConversionRate > industryConversionRate 
      ? avgConversionRate * 0.9 
      : industryConversionRate * 0.8;
    const conversionTarget = Math.max(avgConversionRate * 1.1, industryConversionRate);
    
    console.log(`   转化率最低: ${conversionMin.toFixed(2)}% (${conversionRate.toFixed(2)}% ${conversionRate < conversionMin ? '❌ 低于阈值' : '✅ 达标'})`);
    console.log(`   转化率目标: ${conversionTarget.toFixed(2)}%`);
    
    const gmvPerHourMin = avgGMVPerHour > 0 ? avgGMVPerHour * 0.8 : 3000;
    const gmvPerHourTarget = avgGMVPerHour > 0 ? avgGMVPerHour * 1.2 : 5000;
    
    console.log(`   GMV/小时最低: ¥${gmvPerHourMin.toFixed(2)} (${gmvPerHour.toFixed(2)} ${gmvPerHour < gmvPerHourMin ? '❌ 低于阈值' : '✅ 达标'})`);
    console.log(`   GMV/小时目标: ¥${gmvPerHourTarget.toFixed(2)}`);
    
    const interactionMin = avgInteractionRate > 0 ? avgInteractionRate * 0.8 : 10;
    const interactionTarget = Math.max(avgInteractionRate * 1.2, 15);
    
    console.log(`   互动率最低: ${interactionMin.toFixed(2)}% (${interactionRate.toFixed(2)}% ${interactionRate < interactionMin ? '❌ 低于阈值' : '✅ 达标'})`);
    console.log(`   互动率目标: ${interactionTarget.toFixed(2)}%`);
  } else {
    console.log('');
    console.log('⚠️ 历史数据不足（需要至少2期数据），使用行业基准');
  }
}

// 模拟异常检测
function detectAnomalies(currentStats, historicalStats) {
  console.log('');
  console.log('🔍 异常检测...');
  
  if (historicalStats.length < 2) {
    console.log('   ⚠️ 历史数据不足，无法进行异常检测');
    return [];
  }
  
  const current = {
    gmv: currentStats.totalGMV || 0,
    viewers: currentStats.totalViewers || 0,
    orders: currentStats.totalOrders || 0,
    interactions: currentStats.totalInteractions || 0,
  };
  
  const historical = historicalStats.slice(1);
  const count = historical.length;
  
  const avgGMV = historical.reduce((sum, s) => sum + (s.totalGMV || 0), 0) / count;
  const avgViewers = historical.reduce((sum, s) => sum + (s.totalViewers || 0), 0) / count;
  const avgOrders = historical.reduce((sum, s) => sum + (s.totalOrders || 0), 0) / count;
  const avgInteractions = historical.reduce((sum, s) => sum + (s.totalInteractions || 0), 0) / count;
  
  const anomalies = [];
  
  // GMV突变检测（下降超过50%）
  if (avgGMV > 0 && current.gmv < avgGMV * 0.5) {
    const change = ((current.gmv / avgGMV - 1) * 100).toFixed(1);
    anomalies.push({
      type: 'gmv_drop',
      severity: 'critical',
      change: `${change}%`,
      description: `GMV突然下降${Math.abs(Number(change))}%`
    });
  }
  
  // 观看人数突变检测（下降超过40%）
  if (avgViewers > 0 && current.viewers < avgViewers * 0.6) {
    const change = ((current.viewers / avgViewers - 1) * 100).toFixed(1);
    anomalies.push({
      type: 'viewers_drop',
      severity: 'high',
      change: `${change}%`,
      description: `观看人数突然下降${Math.abs(Number(change))}%`
    });
  }
  
  if (anomalies.length > 0) {
    console.log(`   ⚠️ 发现${anomalies.length}个异常:`);
    anomalies.forEach(a => {
      console.log(`      - [${a.severity.toUpperCase()}] ${a.type}: ${a.description} (${a.change})`);
    });
  } else {
    console.log('   ✅ 未发现异常');
  }
  
  return anomalies;
}

// 判断店铺阶段
function getStoreStage(gmv, duration) {
  const sessions = Math.max(1, Math.floor(duration / 2));
  
  if (gmv < 10000 || sessions < 10) {
    return {
      stage: 'cold_start',
      name: '冷启动期',
      focus: ['流量获取', '数据积累', '店铺基础搭建'],
    };
  } else if (gmv < 100000) {
    return {
      stage: 'growth',
      name: '成长期',
      focus: ['转化率提升', '客单价优化', '复购率培养'],
    };
  } else {
    return {
      stage: 'mature',
      name: '成熟期',
      focus: ['品牌建设', '私域运营', '供应链优化'],
    };
  }
}

// 主测试函数
async function runTest() {
  try {
    const store = await getStore();
    if (!store) {
      console.log('❌ 未找到greenpet店铺');
      db.close();
      return;
    }
    
    console.log('📦 店铺信息:');
    console.log(`   名称: ${store.name}`);
    console.log(`   平台: ${store.platform}`);
    console.log(`   区域: ${store.region}`);
    console.log('');
    
    const categories = await getCategories(store.id);
    console.log(`📂 品类: ${categories.join(', ')}`);
    console.log('');
    
    const currentStats = await getCurrentStats(store.id);
    if (!currentStats) {
      console.log('❌ 未找到统计数据');
      db.close();
      return;
    }
    
    console.log('📊 当前统计数据:');
    console.log(`   GMV: ¥${currentStats.totalGMV}`);
    console.log(`   时长: ${currentStats.totalDuration} 小时`);
    console.log(`   观看: ${currentStats.totalViewers} 人`);
    console.log(`   订单: ${currentStats.totalOrders} 单`);
    console.log(`   互动: ${currentStats.totalInteractions} 次`);
    console.log('');
    
    const historicalStats = await getHistoricalStats(store.id);
    
    // 判断店铺阶段
    const stage = getStoreStage(currentStats.totalGMV, currentStats.totalDuration);
    console.log(`🏪 店铺阶段: ${stage.name} (${stage.stage})`);
    console.log(`   关注重点: ${stage.focus.join(', ')}`);
    console.log('');
    
    // 计算动态阈值
    calculateDynamicThresholds(currentStats, historicalStats, categories);
    
    // 异常检测
    const anomalies = detectAnomalies(currentStats, historicalStats);
    
    console.log('');
    console.log('✅ 测试完成！');
    console.log('');
    console.log('📌 预期任务生成类型:');
    if (anomalies.length > 0) {
      console.log('   1. ⚠️ 异常任务（来源：anomaly）');
    }
    console.log(`   2. 📊 阶段任务（来源：stage，阶段：${stage.name}）`);
    console.log('   3. 🎯 阈值任务（来源：threshold，基于动态阈值）');
    console.log('   4. 🎉 节日任务（来源：event，如果有即将到来的节日）');
    console.log('');
    console.log('💡 下一步: 在前端点击"智能生成"，验证任务是否符合预期');
    
    db.close();
  } catch (error) {
    console.error('❌ 错误:', error);
    db.close();
  }
}

runTest();
