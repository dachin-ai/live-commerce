-- 为 tasks 表添加岗位字段
-- 用途：标记任务的负责岗位（运营、主播、或两者）

ALTER TABLE tasks ADD COLUMN assignedRole TEXT; -- 岗位：'operator'（运营）、'anchor'（主播）、'both'（两者）、null（未指定）

-- 更新说明：执行后需对新生成的任务自动打标，旧任务的 assignedRole 为 null
