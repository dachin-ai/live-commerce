# 话术规则配置

本目录下的 JSON 为话术生成功能的可配置规则，由功能代码在运行时加载。  
修改后需重启后端生效；也可通过 `GET/PUT /api/config/script-rules` 读取或更新（PUT 会写回本目录）。

- `platformCompliance.json`：各平台违规点（禁用词、慎用词、品类额外约束等）
- `audienceKeywords.json`：目标人群解析（关键词 → 称呼与痛点）
- `categoryPractices.json`：品类话术最佳实践
- `visualSegmentRules.json`：**可视化分段与本环节建议**
  - **原则**：根据**实际话术段落**抓取对应卖点，再按配置的「关键词→演示动作」设计本环节建议；不依赖固定列举。
  - `placeholderFallbacks`：占位符默认值（productName、features、promoCopy、targetAudience）
  - **`featureDemoHints`**：卖点关键词→演示动作。匹配来源为该段**话术正文** + 用户填写的产品特点；命中某条 keywords 时，本环节建议中会先给对应 suggestion（支持 `{productName}`、`{features}`）。**此处配置为实际依据**；代码内置的防水/不锈钢/静音/耐磨等仅为举例，实际使用请按业务话术在此配置对应关键词与动作。
  - `defaultPartColor`：未匹配到任何规则时的段落颜色
  - `rulesByType`：按话术类型覆盖分段规则（id、label、color、startMarker、visualAction、allowFeatureDemos）。缺省使用代码内置规则。

缺省时功能代码使用内置默认值，不影响运行。
