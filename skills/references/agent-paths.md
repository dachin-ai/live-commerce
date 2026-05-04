# Agent 记忆与配置路径速查

> 不同 AI Agent 平台的记忆系统和配置文件位置速查表。

## 平台路径对照

| 平台 | 项目级配置 | 全局配置 | 记忆/上下文存储 |
|------|----------|---------|---------------|
| **Gemini (Antigravity)** | 无项目级 `.md` | `~/.gemini/antigravity/` | `~/.gemini/antigravity/brain/<conversation-id>/` |
| **Claude Code** | `<project>/CLAUDE.md` | `~/.claude/CLAUDE.md` | `~/.claude/projects/<hash>/memory/` |
| **Cursor** | `<project>/.cursor/rules` | `~/.cursor/rules/` | 内置对话历史 |
| **OpenAI Codex** | `<project>/AGENTS.md` | `~/.codex/AGENTS.md` | 对话内上下文 |
| **OpenCode** | `<project>/.opencode/` | `~/.opencode/` | `.opencode/memory/` |
| **Windsurf** | `<project>/.windsurfrules` | `~/.windsurf/rules/` | 内置 Cascade 记忆 |

## 本项目当前状态

| 项目 | 状态 | 位置 |
|------|------|------|
| **项目级 Agent 配置** | ❌ 不存在 | 建议创建 `CLAUDE.md` 或 `AGENTS.md` |
| **Skill 文件** | ✅ 已有 | `skills/SKILL洁癖.md` |
| **项目文档** | ✅ 110+ 文件 | `docs/` |
| **数据库文档** | ✅ 已有 | Antigravity brain 中的 `database_guide.md` |

## 本项目的 Agent 记忆注意事项

1. **当前使用 Gemini Antigravity**：记忆存储在 `~/.gemini/antigravity/brain/<conversation-id>/`
2. **Knowledge Items (KI)** 是持久化的跨会话知识，存储在 `~/.gemini/antigravity/knowledge/`
3. **docs/ 目录是最重要的知识载体**：由于项目未使用 CLAUDE.md，`docs/` 承担了项目级配置的职责
4. **如果将来切换到 Claude Code 或 Cursor**：需要创建对应的项目级配置文件，并将 docs/ 中的关键约定迁移过去
