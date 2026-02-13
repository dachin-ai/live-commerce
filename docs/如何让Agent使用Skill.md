# 如何让 Agent 使用 Skill

您创建的 **模块测试流程 Skill**（`.cursor/skills/module-test-workflow/SKILL.md`）有时没有被 Agent 自动用到。下面说明原因和**可操作用法**。

---

## 一、为什么没有使用 Skill？

1. **Skill 是否被注入由 Cursor 决定**  
   Agent 拿到的上下文（包括哪些 Skill 被加载）由 Cursor 控制，而不是 Agent 自己“选择用不用”。  
   - Skill 的 **description** 用来帮助“何时应用”这个 Skill。  
   - 若 Cursor 没有把该 Skill 放进本次对话的上下文，Agent 就**看不到** Skill 内容，自然无法按 Skill 执行。

2. **项目 Skill 的加载方式**  
   - 项目 Skill 放在 `.cursor/skills/` 下。  
   - 是否加载、何时加载可能依赖：会话设置、描述匹配、或是否被显式引用。  
   - 没有在对话里**显式提到**该 Skill 时，有可能不会被注入。

3. **规则 vs Skill**  
   - 同流程已写在 **Cursor 规则** `.cursor/rules/module-test-workflow.mdc`（`alwaysApply: true`），规则是“始终应用”的。  
   - **Skill** 是另一套机制（描述匹配、或您显式引用），两者可能不同时出现在同一次对话里，所以会出现“按模块测试做了，但没用上 Skill”的情况。

**结论**：没使用 Skill 很可能是因为**这次对话里 Skill 没有被加载进上下文**，而不是 Agent 故意不用。要让 Agent 按 Skill 执行，需要**确保 Skill 内容进入上下文**。

---

## 二、如何才能使用 Skill？（推荐做法）

### 方法 1：用 @ 引用 Skill 文件（最可靠）

在对话里**直接 @ 该 Skill 文件**，Cursor 会把文件内容加入上下文，Agent 就会按里面的步骤执行：

- 输入例如：  
  **「@.cursor/skills/module-test-workflow/SKILL.md 按这个流程做模块 3 测试」**
- 或：  
  **「按模块测试，先读 @.cursor/skills/module-test-workflow/SKILL.md 再执行」**

这样 Agent 一定会先看到 Skill 内容，再按“步骤 1→2→3→4→5”执行。

### 方法 2：明确说出“用哪个 Skill”

在请求里**指名 Skill 名称或路径**，提示 Agent 去读该 Skill 再执行：

- 例如：  
  **「用 skill module-test-workflow 做」**  
- 或：  
  **「按 .cursor/skills/module-test-workflow 里的流程执行」**

Agent 会根据你的话去打开并遵循该 Skill。

### 方法 3：用触发词（依赖 Cursor 是否注入）

Skill 的 description 里写了：  
`Use when doing module testing, 按模块测试, MCP 测试前端, 模块报告, 人工终测...`

- 您可以说：  
  **「按模块测试」「用流程图逻辑」「MCP 测试前端」** 等。  
- 若 Cursor 根据这些词把该 Skill 注入了，Agent 就会用；**若没有注入，就不会用**。  
- 所以想**保证**用到 Skill，建议配合 **方法 1 或 2**。

### 方法 4：在 Cursor 设置里确认“项目 Skill”已启用（如支持）

- 打开 Cursor **设置**，查找与 **Skills**、**Agent**、**Project skills** 相关的选项。  
- 若有“使用项目中的 Skill”或类似开关，保持**开启**，以便项目下的 `.cursor/skills/` 被考虑加载。  
- 具体名称以您当前 Cursor 版本为准。

---

## 三、推荐用法总结

| 目的 | 建议用法 |
|------|----------|
| **确保这次就用上 Skill** | 在消息里 **@.cursor/skills/module-test-workflow/SKILL.md**，并说明要做的事（如「按这个流程做模块 3」）。 |
| **以后每次按流程都想起 Skill** | 每次说「按模块测试」时，顺带加一句 **「先读 skill module-test-workflow」** 或 **@ 该 Skill 文件**。 |
| **规则已经够用** | 同流程在 `.cursor/rules/module-test-workflow.mdc` 里且 `alwaysApply: true`，若您更依赖规则，可主要用规则；Skill 作为“可被 @ 引用的详细版”保留。 |

---

## 四、本项目里的 Skill 与规则

- **Skill**：`.cursor/skills/module-test-workflow/SKILL.md`  
  - 需要被**注入或 @ 引用**后，Agent 才会按其中步骤执行。
- **规则**：`.cursor/rules/module-test-workflow.mdc`  
  - 已设为 `alwaysApply: true`，理论上每次对话都会应用（具体以 Cursor 行为为准）。

若希望**每次“按模块测试”都严格按 Skill 执行**，最稳妥的方式是：  
在发请求时**加上 @.cursor/skills/module-test-workflow/SKILL.md**，这样 Agent 就一定会使用该 Skill。
