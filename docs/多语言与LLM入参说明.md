# 多语言切换与 LLM 入参（locale / countryCode）

系统支持多语言切换，且**所有调用 LLM 的入口都会带上用户当前语言与国家编码**，以便 LLM 按对应语言与地区回复。

---

## 待办事项与语言（设计原则）

- **待办事项受「当前界面语言」控制**：用户点击「智能生成」时，前端会传入**当前选中的界面语言**（locale），后端 LLM **只按该语言生成一次**，不写多语言、不重复调用。
- **不增加 API 与响应时间**：单次生成 = 单语输出，与「为每种语言各生成一遍」或「一次生成多语言」相比，不浪费 token、不拉长响应；**功能好用优先于操作繁琐**。
- **切换语言后的表现**：已存在的待办保持生成时的语言；新点击「智能生成」时，将按**当前**界面语言生成新待办（例如切到 English 后再生成，得到英文标题与描述）。

---

## 一、前端

### 1. 语言状态与持久化

- **LanguageContext**（`frontend/src/contexts/LanguageContext.tsx`）：全局语言状态，持久化到 `localStorage`（key：`lvbcsym_locale`）。
- **可选值**：`zh-CN`（中文）、`en-US`（English）、`th-TH`（ไทย）。
- 侧栏语言下拉切换后立即生效，刷新页面仍保持所选语言。

### 2. 请求中如何带语言

- **智能生成待办**（`POST /api/ai/generate-tasks`）：请求 body 中固定带 `locale`、`countryCode`。前端在点击「智能生成」时**显式传入当前界面语言**（`TaskList` 通过 `useLanguage().locale`），确保待办与语言选项一致；未传时由 `services/ai.ts` 从 `localStorage` 的 `lvbcsym_locale` 读取并推导 `countryCode`。
- **话术生成**（`POST /api/ai/script`、`/api/ai/script/stream`）：请求 body 中已有 `language`（与 locale 一致），后端在构建 LLM 提示词时写入「回复语言与地区」。
- **通用请求头**：`api` 拦截器会设置 `Accept-Language` 为当前 `lvbcsym_locale`，供后端按需使用。

### 3. 国家/地区代码推导

前端与后端共用同一套从 locale 到 countryCode 的规则，例如：

- `zh-CN` → `CN`
- `en-US` → `US`
- `th-TH` → `TH`
- `vi-*` → `VN`，`id-*` → `ID`，`ms-*`/`my-*` → `MY`，`sg-*` → `SG`，`ph-*` → `PH`

---

## 二、后端（LLM 入参）

### 1. 智能待办生成

- **入口**：`POST /api/ai/generate-tasks` 的 body 支持 `locale`、`countryCode`（可选）；未传时默认 `zh-CN` / `CN`。
- **使用位置**：`generateIntelligentTodosWithLLM` 的 systemPrompt / userMessage 中会加入：
  - `【回复语言与地区】请使用以下语言回复：locale=xxx，国家/地区代码（countryCode）=xxx。任务标题与描述必须使用该语言书写。`
  - userMessage 首行：`【用户界面语言/地区】locale=xxx，countryCode=xxx`
- **异常分析 LLM**（`analyzeAnomaliesWithLLM`）：同样接收 `locale`、`countryCode`，并在提示词中要求按该语言输出。

### 2. 话术生成

- **入口**：`POST /api/ai/script`、`/api/ai/script/stream` 的 body 中已有 `language`（如 `zh-CN`、`en-US`、`th-TH`）。
- **使用位置**：`scriptResearch.ts` 的 `buildLLMSystemPrompt` / `buildLLMUserMessage` 中会加入：
  - systemPrompt：`【回复语言与地区】请使用以下语言输出话术正文：locale=xxx，countryCode=xxx。…`
  - userMessage 首行：`【用户界面语言/地区】locale=xxx，countryCode=xxx`

### 3. Bot / 第三方

- **入口**：`POST /api/ai/bot/generate-tasks` 的 body 支持 `locale`、`countryCode`（可选）；未传时默认 `zh-CN`。
- 与系统内智能生成使用同一套 `generateIntelligentTodosWithLLM`，故同样会按传入的 locale/countryCode 要求 LLM 用对应语言回复。

---

## 三、约定汇总

| 项       | 说明 |
|----------|------|
| **locale** | 用户界面语言，如 `zh-CN`、`en-US`、`th-TH`；请求 body 或前端 Context 使用。 |
| **countryCode** | 国家/地区代码，如 `CN`、`US`、`TH`；可由 locale 推导，也可由调用方显式传。 |
| **话术 body** | 使用字段名 `language`（与 locale 同义），后端会转成 locale/countryCode 写入 LLM 提示词。 |
| **持久化** | 前端仅持久化 `lvbcsym_locale`；countryCode 每次由 locale 推导，不单独存储。 |

---

*最后更新：2026-02*
