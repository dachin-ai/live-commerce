# 程序工程师 AI 代码生成配置

## 概述

程序工程师角色支持调用 AI 服务（OpenAI/Cursor）生成实际代码和部署包，而不是仅输出占位文本。

## 配置方式

### 1. 环境变量配置（`.env` 文件）

在 `backend/` 目录下创建或编辑 `.env` 文件：

```bash
# AI 代码生成配置（可选）
# 如果不配置，程序工程师将使用模板生成代码

# 选择 AI 提供商: openai | cursor | none（默认：none，使用模板）
AI_CODE_PROVIDER=openai

# AI API Key（必需，如果启用了 AI）
AI_API_KEY=sk-xxxxxxxxxxxxx

# AI API Base URL（可选，OpenAI 默认: https://api.openai.com/v1/chat/completions）
AI_BASE_URL=https://api.openai.com/v1/chat/completions

# AI 模型（可选，OpenAI 默认: gpt-4）
AI_MODEL=gpt-4
```

### 2. 配置示例

**使用 OpenAI:**
```bash
AI_CODE_PROVIDER=openai
AI_API_KEY=sk-xxxxxxxxxxxxx
AI_MODEL=gpt-4
```

**使用 Cursor（当前降级到模板，未来可扩展）:**
```bash
AI_CODE_PROVIDER=cursor
AI_API_KEY=your-cursor-api-key
```

**不使用 AI（使用模板）:**
```bash
# 不设置或设置为 none
AI_CODE_PROVIDER=none
```

## 工作流程

1. **程序工程师执行时**：
   - 读取上游产出：行业最佳实践.json、用户体验测试报告.md、AB测试建议.md
   - 检查 AI 配置（环境变量）
   - 如果配置了 AI：
     - 构建 prompt（包含上游产出内容）
     - 调用 AI API 生成代码
     - 解析 AI 返回的代码文件
   - 如果未配置 AI：
     - 使用模板生成代码（基于上游产出的结构化模板）
   - 将生成的代码文件写入 `outputs/第N轮迭代/部署包/`

2. **生成的文件**：
   - `技术实施方案.md`：技术方案文档
   - `部署包/apply_config.sh`：配置更新脚本
   - `部署包/deploy.sh`：部署脚本
   - `部署包/ab_test_config.json`：A/B 测试配置（如果有 A/B 建议）
   - `部署包/README.md`：部署说明

## AI Prompt 设计

程序工程师会构建如下 prompt 发送给 AI：

```
作为全栈工程师，请根据以下业务需求生成可直接部署的代码和配置：

## 业务背景
轮次: 第N轮迭代

## 行业最佳实践
[从 行业最佳实践.json 读取]

## 用户体验测试报告
[从 用户体验测试报告.md 读取]

## A/B 测试建议
[从 AB测试建议.md 读取]

## 要求
1. 生成配置更新脚本（apply_config.sh）
2. 生成部署脚本（deploy.sh）
3. 如有 A/B 测试需求，生成 ab_test_config.json
4. 生成 README.md 说明文档
5. 代码应可直接运行，包含错误处理
```

AI 返回的代码会从 markdown code blocks 中解析，格式：
````
```bash:部署包/deploy.sh
#!/bin/bash
...
```
````

## 降级方案（模板生成）

如果 AI 未配置或调用失败，程序工程师会使用模板生成：

- **配置脚本**：基于行业最佳实践中的 recommendations 生成配置项
- **部署脚本**：标准化的部署流程（备份、应用配置、重启服务）
- **A/B 测试配置**：如果上游有 A/B 建议，生成对应的 JSON 配置

模板生成的代码虽然不如 AI 生成灵活，但保证可用性和一致性。

## 验证

1. **检查配置**：
   ```bash
   cd backend
   # 查看环境变量（不显示敏感信息）
   echo $AI_CODE_PROVIDER
   ```

2. **执行工作流**：
   - 在工作流页面点击「立即执行一轮」
   - 查看程序工程师的产出
   - 如果配置了 AI，查看后端日志中的 `[AI代码生成]` 信息

3. **查看生成的文件**：
   - 打开 `outputs/第N轮迭代/部署包/`
   - 检查生成的脚本和配置文件

## 注意事项

- **API Key 安全**：不要将 `.env` 文件提交到版本控制
- **成本控制**：AI API 调用会产生费用，建议设置合理的 token 限制
- **错误处理**：如果 AI 调用失败，会自动降级到模板生成，不影响工作流执行
- **Cursor API**：当前 Cursor API 支持为占位，未来可扩展

## 未来扩展

- [ ] 支持 Cursor API 集成
- [ ] 支持本地 LLM（如 Ollama）
- [ ] 代码质量检查与格式化
- [ ] 多语言支持（Python、TypeScript 等）
- [ ] 增量更新（基于上一轮部署包）
