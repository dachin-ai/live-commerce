# 视频分析 API 入参标准化

参考《视频分析API集成指南》完成 API 入参标准化，便于与 LLM（Coze Agent 等）对接。

## 标准化参数

### 1. 平台（platform）

| 代码 | 名称 |
|-----|------|
| `tiktok` | TikTok |
| `douyin` | 抖音 |
| `youtube` | YouTube |
| `instagram` | Instagram |
| `facebook` | Facebook |
| `twitter` | Twitter |
| `other` | 其他 |

**默认值**：`tiktok`

### 2. 地区（country）

| 代码 | 名称 |
|-----|------|
| `us` | 美国 |
| `cn` | 中国 |
| `uk` | 英国 |
| `jp` | 日本 |
| `kr` | 韩国 |
| `de` | 德国 |
| `fr` | 法国 |
| `br` | 巴西 |
| `id` | 印度尼西亚 |
| `th` | 泰国 |
| `vn` | 越南 |
| `other` | 其他 |

**默认值**：`cn`

### 3. 视频类型（video_type，可选）

| 代码 | 名称 |
|-----|------|
| `live_stream` | 直播流 |
| `recorded` | 录制视频 |
| `short` | 短视频 (< 60秒) |
| `long` | 长视频 (> 5分钟) |
| `replay` | 回放 |

**不传或空**：自动识别

### 4. 分析重点（analysis_focus，可选）

自由文本，例如：话术风格、互动情况、销售策略等。

## 接口说明

### POST /api/videos/upload-video

**请求体**（multipart/form-data）：

| 字段 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| `file` | File | ✅ | 视频文件 |
| `storeId` | string | ❌ | 店铺 ID |
| `sessionId` | string | ❌ | 场次 ID |
| `platform` | string | ❌ | 平台代码，默认 `tiktok` |
| `country` | string | ❌ | 地区代码，默认 `cn` |
| `videoType` | string | ❌ | 视频类型代码 |
| `analysisFocus` | string | ❌ | 分析重点 |

**后端处理**：

- 使用 `normalizeVideoAnalysisParams()` 标准化入参
- 无效值会被替换为默认值
- 标准化后的参数会传入 `videoAnalysisService.analyzeVideo()` 并写入 LLM 用户消息

## 代码位置

- **常量定义**：`backend/src/constants/videoAnalysisParams.ts`
- **前端选项**：`frontend/src/constants/videoAnalysisParams.ts`
- **路由**：`backend/src/routes/videos.ts`
- **分析服务**：`backend/src/services/videoAnalysisService.ts`
- **上传表单**：`frontend/src/components/AIFeatures.tsx`（录屏分析页）

## 与 LLM 入参格式的对应

LLM 文档中的 `user content` 格式：

```
请分析这个视频：{video_url}
平台：{platform}
国家：{country}
视频类型：{video_type}（可选）

重点关注：{analysis_focus}（可选）
```

本系统通过 `buildUserMessageContent()` 构建上述格式，保证与 Coze Agent 等 LLM 的入参规范一致。

## Coze 视频分析支持

当「视频分析」功能配置的 LLM URL 为 Coze 时（`coze.site` 或 `api.coze.com`），系统会自动使用 Coze API 格式调用：

- **coze.site 发布站点**：使用 legacy 体 `content.query.prompt`，需配置 `COZE_PROJECT_ID` 或 `COZE_VIDEO_PROJECT_ID`（可选，有默认值）
- **api.coze.com Open API**：使用 `bot_id`、`user_id`、`additional_messages`，需配置环境变量 `COZE_VIDEO_BOT_ID`

配置步骤：
1. 管理员 → LLM 配置 → 功能映射，将「视频分析」指向包含 Coze 地址的工具
2. 工具 URL 填写 Coze 发布站点（如 `https://xxx.coze.site`）或 `https://api.coze.com/open_api/v2`
3. 若为 api.coze.com，在 `backend/.env` 中设置 `COZE_VIDEO_BOT_ID=你的视频分析 Bot ID`
