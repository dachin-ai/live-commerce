# 话术生成 - Coze 输出展示规范

## 一、当前策略（还原原生 + 截断）

**系统不再对 Coze 输出做正文提取等额外处理**，直接还原 Coze 原生生成内容；仅做**长度截断**，避免过长影响展示与存储。

- **展示**：终端用户看到的内容 = Coze 返回的完整内容（含优化说明、产品信息表、完整话术、数据统计、使用建议等，若有）。
- **截断**：若内容超过 **10 万字符**，则截断并追加「…（内容已截断，超出系统展示长度限制）」。
- **实现**：`backend/src/routes/ai/script.ts` 流式话术逻辑中，在拿到 LLM 完整内容后仅做 `content.length > SCRIPT_MAX_LENGTH` 的截断，不再调用 `extractScriptBodyForDisplay`。

---

## 二、历史说明（已停用）

此前曾通过 `extractScriptBodyForDisplay` 仅保留「完整话术」正文、去掉优化说明与产品信息表等。该逻辑已移除，改为直接展示 Coze 原生输出。`scriptOutputValidator.ts` 中的 `extractScriptBodyForDisplay` 仍保留但未被调用，如需可再启用。

---

## 三、参考

- 话术整体流程与模块见 [话术生成-系统整理](./话术生成-系统整理.md)。
