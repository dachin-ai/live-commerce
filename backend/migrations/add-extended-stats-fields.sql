-- 为 stats 表添加扩展字段（评论、分享、点赞、商品曝光/点击等）
-- 用途：支持更详细的数据分析和 LLM 待办生成

-- 互动细分
ALTER TABLE stats ADD COLUMN likes INTEGER DEFAULT 0;
ALTER TABLE stats ADD COLUMN comments INTEGER DEFAULT 0;
ALTER TABLE stats ADD COLUMN shares INTEGER DEFAULT 0;
ALTER TABLE stats ADD COLUMN follows INTEGER DEFAULT 0;

-- 商品相关
ALTER TABLE stats ADD COLUMN productViews INTEGER DEFAULT 0; -- 商品曝光次数
ALTER TABLE stats ADD COLUMN productClicks INTEGER DEFAULT 0; -- 商品点击次数

-- 转化细分
ALTER TABLE stats ADD COLUMN clickThroughRate REAL DEFAULT 0; -- 点击率（已在 excelParser 解析）
ALTER TABLE stats ADD COLUMN interactionRate REAL DEFAULT 0; -- 互动率

-- 更新说明
-- 执行后需重新导入数据，旧数据的新字段将为 0/null
