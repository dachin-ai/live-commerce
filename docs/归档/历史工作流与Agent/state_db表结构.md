# 共享状态库（state.db）表结构

## 路径

- 库文件：`data/shared_state/state.db`
- 与业务库 `backend/data.db` 分离，便于备份与迁移。

## 表结构

### 1. articles（去重）

用于跨轮次/跨角色去重（如 URL、问题 ID 等）。

| 列名 | 类型 | 说明 |
|------|------|------|
| url | TEXT | 主键，唯一标识（如 URL 或业务 key） |
| created_at | TEXT | 创建时间，默认 datetime('now') |

### 2. cursors（游标）

用于记录同步位置、当前轮次、角色下标等。

| 列名 | 类型 | 说明 |
|------|------|------|
| name | TEXT | 主键，游标名称（如 last_round_id、round_1_role_index） |
| value | TEXT | 游标值（数值会以字符串存储，写入时需在 int32 安全范围内） |
| updated_at | TEXT | 更新时间 |

常用游标示例：

- `last_round_id`：最近一轮的 round_id（如 round_1）
- `round_{roundId}_role_index`：该轮当前执行到的角色下标（0~4）
- `round_{roundId}_store_id`：该轮关联的店铺 ID（可选）
- `round_{roundId}_task_ids`：该轮关联的任务 ID 列表（逗号分隔）

### 3. checkpoints（检查点）

用于断点续跑与状态查询。

| 列名 | 类型 | 说明 |
|------|------|------|
| round_id | TEXT | 轮次 ID（如 round_1），主键之一 |
| role_id | TEXT | 角色 ID（planner / industry_expert / senior_user / engineer / novice），主键之一 |
| status | TEXT | 状态：pending / completed / failed |
| payload | TEXT | 可选 JSON，如 outputPaths、error 等 |
| updated_at | TEXT | 更新时间 |

主键：`(round_id, role_id)`。

## 数值约束

- 所有自增、计数、游标数值需控制在 **int32 安全范围**内：`-2147483648 ~ 2147483647`，避免序列化或存储异常（如历史 "invalid int 32: 4294967295"）。
- state_manager 提供 `clampInt32(n)` 及写入游标时的安全处理。

## 初始化

- 由 `state_manager.initStateDatabase()` 在首次触发工作流或应用启动时执行，创建上述三张表（若不存在）。
