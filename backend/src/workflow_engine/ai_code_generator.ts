/**
 * AI 代码生成服务
 * 支持调用 OpenAI API 或 Cursor API 生成代码
 * 如果未配置 AI，则使用模板生成（降级方案）
 */

interface AIConfig {
  provider: 'openai' | 'cursor' | 'none'
  apiKey?: string
  baseUrl?: string
  model?: string
}

interface CodeGenerationRequest {
  prompt: string
  context: {
    industryPractices?: string
    userReport?: string
    abSuggestions?: string
    roundLabel: string
  }
}

interface GeneratedCode {
  files: { path: string; content: string }[]
  summary: string
}

/** 获取 AI 配置（从环境变量） */
function getAIConfig(): AIConfig {
  const provider = (process.env.AI_CODE_PROVIDER || 'none').toLowerCase() as 'openai' | 'cursor' | 'none'
  return {
    provider,
    apiKey: process.env.AI_API_KEY,
    baseUrl: process.env.AI_BASE_URL,
    model: process.env.AI_MODEL || (provider === 'openai' ? 'gpt-4' : 'claude-3'),
  }
}

/** 调用 OpenAI API 生成代码 */
async function callOpenAI(config: AIConfig, request: CodeGenerationRequest): Promise<GeneratedCode> {
  if (!config.apiKey) throw new Error('AI_API_KEY 未配置')
  
  // 使用 Node.js 内置 https 模块（兼容性更好）
  const https = require('https')
  const url = require('url')
  
  return new Promise((resolve, reject) => {
    const apiUrl = config.baseUrl || 'https://api.openai.com/v1/chat/completions'
    const parsedUrl = url.parse(apiUrl)
    
    const postData = JSON.stringify({
      model: config.model || 'gpt-4',
      messages: [
        {
          role: 'system',
          content: '你是一位资深全栈工程师，擅长根据业务需求生成高质量、可直接部署的代码。请严格按照要求生成代码文件，每个文件用 ```语言:路径\n代码\n``` 格式标注。',
        },
        {
          role: 'user',
          content: request.prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 4000,
    })

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Length': Buffer.byteLength(postData),
      },
    }

    const req = https.request(options, (res: any) => {
      let data = ''
      res.on('data', (chunk: Buffer) => { data += chunk.toString() })
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`OpenAI API 错误: ${res.statusCode} - ${data}`))
          return
        }
        try {
          const json = JSON.parse(data)
          const content = json.choices?.[0]?.message?.content || ''
          resolve(parseAICodeResponse(content, request.context.roundLabel))
        } catch (err: any) {
          reject(new Error(`解析 AI 响应失败: ${err?.message}`))
        }
      })
    })

    req.on('error', (err: Error) => reject(err))
    req.write(postData)
    req.end()
  })
}

/** 调用 Cursor API（如果可用）或降级到模板 */
async function callCursorOrFallback(config: AIConfig, request: CodeGenerationRequest): Promise<GeneratedCode> {
  // Cursor API 可能需要特殊配置，这里先降级到模板
  // 未来可以扩展支持 Cursor 的 API
  return generateTemplateCode(request)
}

/** 解析 AI 返回的代码（从 markdown code blocks 提取） */
function parseAICodeResponse(content: string, roundLabel: string): GeneratedCode {
  const files: { path: string; content: string }[] = []
  const codeBlockRegex = /```(?:(\w+):)?([^\n]+)\n([\s\S]*?)```/g
  let match

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const [, lang, filePath, code] = match
    if (filePath && code) {
      files.push({ path: filePath.trim(), content: code.trim() })
    }
  }

  // 如果没有解析到文件，尝试提取整个内容作为单个文件
  if (files.length === 0 && content.trim()) {
    files.push({ path: 'generated_code.txt', content: content.trim() })
  }

  return {
    files: files.length > 0 ? files : generateTemplateCode({ prompt: '', context: { roundLabel } }).files,
    summary: `AI 生成 ${files.length} 个文件`,
  }
}

/** 模板生成代码（降级方案，当 AI 未配置时使用） */
function generateTemplateCode(request: CodeGenerationRequest): GeneratedCode {
  const { context } = request
  const practices = context.industryPractices ? JSON.parse(context.industryPractices).practices || [] : []
  const abItems = context.abSuggestions?.match(/^\d+\.\s+(.+)$/gm) || []

  // 生成配置更新脚本
  const configScript = `# 配置更新脚本 - ${context.roundLabel}
# 基于行业最佳实践生成

${practices.map((p: any) => `# ${p.area}: ${p.recommendation}`).join('\n')}

# 应用配置
echo "应用配置更新..."
# TODO: 实现具体配置逻辑
`

  // 生成 A/B 测试配置（如果有 A/B 建议）
  const abConfig = abItems.length > 0
    ? `# A/B 测试配置 - ${context.roundLabel}
{
  "tests": [
${abItems.map((item, i) => `    {
      "id": "test_${i + 1}",
      "name": "${item.replace(/^\d+\.\s+/, '')}",
      "traffic_split": 0.5,
      "status": "pending"
    }`).join(',\n')}
  ]
}
`
    : ''

  // 生成部署脚本
  const deployScript = `#!/bin/bash
# 部署脚本 - ${context.roundLabel}
# 生成时间: ${new Date().toISOString()}

set -e

echo "开始部署..."

# 1. 备份当前配置
echo "备份当前配置..."
cp -r config config.backup.$(date +%Y%m%d_%H%M%S)

# 2. 应用新配置
echo "应用新配置..."
${configScript.includes('TODO') ? '# bash apply_config.sh' : 'bash apply_config.sh'}

# 3. 重启服务
echo "重启服务..."
# systemctl restart your-service || docker-compose restart

echo "部署完成！"
`

  const files: { path: string; content: string }[] = [
    { path: 'apply_config.sh', content: configScript },
    { path: 'deploy.sh', content: deployScript },
  ]

  if (abConfig) {
    files.push({ path: 'ab_test_config.json', content: abConfig })
  }

  files.push({
    path: 'README.md',
    content: `# 部署包 - ${context.roundLabel}

生成时间: ${new Date().toISOString()}

## 文件说明

- \`apply_config.sh\`: 配置更新脚本
- \`deploy.sh\`: 部署脚本
${abConfig ? '- `ab_test_config.json`: A/B 测试配置\n' : ''}

## 使用说明

1. 检查配置: \`bash apply_config.sh --dry-run\`
2. 执行部署: \`bash deploy.sh\`

## 注意事项

- 部署前请先备份
- 建议在测试环境验证后再部署到生产环境
`,
  })

  return {
    files,
    summary: `模板生成 ${files.length} 个文件（${context.industryPractices ? '基于行业方案' : '基础模板'}）`,
  }
}

/** 主入口：基于上游产出生成代码 */
export async function generateCodeFromUpstream(request: CodeGenerationRequest): Promise<GeneratedCode> {
  const config = getAIConfig()

  // 构建 prompt
  const prompt = `作为全栈工程师，请根据以下业务需求生成可直接部署的代码和配置：

## 业务背景
轮次: ${request.context.roundLabel}

${request.context.industryPractices ? `## 行业最佳实践
${request.context.industryPractices}

请基于以上实践方案，生成相应的配置文件和脚本。` : ''}

${request.context.userReport ? `## 用户体验测试报告
${request.context.userReport}

请根据测试结论优化代码实现。` : ''}

${request.context.abSuggestions ? `## A/B 测试建议
${request.context.abSuggestions}

请生成 A/B 测试的配置文件和集成代码。` : ''}

## 要求
1. 生成配置更新脚本（apply_config.sh）
2. 生成部署脚本（deploy.sh）
3. 如有 A/B 测试需求，生成 ab_test_config.json
4. 生成 README.md 说明文档
5. 代码应可直接运行，包含错误处理

请用以下格式输出每个文件：
\`\`\`语言:文件路径
代码内容
\`\`\`
`

  try {
    if (config.provider === 'openai' && config.apiKey) {
      console.log('[AI代码生成] 使用 OpenAI API')
      return await callOpenAI(config, { ...request, prompt })
    } else if (config.provider === 'cursor' && config.apiKey) {
      console.log('[AI代码生成] 使用 Cursor API（降级到模板）')
      return await callCursorOrFallback(config, { ...request, prompt })
    } else {
      console.log('[AI代码生成] AI 未配置，使用模板生成')
      return generateTemplateCode({ ...request, prompt })
    }
  } catch (err: any) {
    console.error('[AI代码生成] 失败，降级到模板:', err?.message)
    return generateTemplateCode({ ...request, prompt })
  }
}
