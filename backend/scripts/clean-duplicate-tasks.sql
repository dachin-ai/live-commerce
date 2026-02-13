-- 清理重复待办任务的SQL脚本
-- 目的：删除相同标题、相同状态、相同用户、相同店铺的重复任务，只保留最新的一条

-- ===================================================
-- 脚本1：查看重复任务（检查用）
-- ===================================================
SELECT 
  title,
  status,
  userId,
  storeId,
  COUNT(*) as count,
  GROUP_CONCAT(id) as task_ids,
  GROUP_CONCAT(createdAt) as created_dates
FROM tasks
WHERE status = 'pending'
GROUP BY title, status, userId, IFNULL(storeId, 'NULL')
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- ===================================================
-- 脚本2：删除重复任务，只保留最新的一条
-- ===================================================
DELETE FROM tasks
WHERE id NOT IN (
  -- 保留每组（title + status + userId + storeId）中最新的一条
  SELECT id FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY title, status, userId, IFNULL(storeId, 'NULL')
        ORDER BY createdAt DESC
      ) as rn
    FROM tasks
    WHERE status = 'pending'
  ) t
  WHERE rn = 1
)
AND status = 'pending';

-- ===================================================
-- 脚本3：验证清理结果（清理后应该没有重复）
-- ===================================================
SELECT 
  title,
  status,
  userId,
  storeId,
  COUNT(*) as count
FROM tasks
WHERE status = 'pending'
GROUP BY title, status, userId, IFNULL(storeId, 'NULL')
HAVING COUNT(*) > 1;

-- ===================================================
-- 使用说明
-- ===================================================
-- 1. 先运行脚本1，查看有哪些重复任务
-- 2. 确认后，运行脚本2，删除重复任务（只保留最新的）
-- 3. 运行脚本3，验证清理结果（应该返回空结果）

-- ===================================================
-- 注意事项
-- ===================================================
-- 1. 此脚本只删除status='pending'的重复任务
-- 2. 已完成的任务（status='completed'）不会被删除
-- 3. 保留策略：每组重复中，保留createdAt最新的一条
-- 4. 建议先在测试环境运行，确认无误后再在生产环境运行
-- 5. 运行前建议备份tasks表

-- ===================================================
-- 备份命令（可选）
-- ===================================================
-- CREATE TABLE tasks_backup AS SELECT * FROM tasks;
