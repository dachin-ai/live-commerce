/**
 * 话术 LLM 统一 Provider 接口与注册表
 * 用于：Coze、OpenAI 兼容、以及后续豆包/智谱/自定义等接入与定制，路由层仅依赖本接口。
 */

/** 当前内置 provider 标识；后续接入新 LLM 时可扩展（如 doubao、zhipu、custom） */
export type ScriptLLMProviderId = 'coze_agent' | 'openai' | string

/** 调用 Provider 时使用的配置（与 ScriptLLMConfig / LlmToolConfig 一致） */
export interface ScriptLLMProviderConfig {
  url: string
  apiKey: string
  model?: string
}

/** 流式/一次性调用的公共参数 */
export interface ScriptLLMProviderOptions {
  systemPrompt: string
  userMessage: string
  /** script=话术生成，todo=待办/异常分析 */
  taskType?: 'script' | 'todo'
  /** 仅话术：是否只发短用户消息（Coze 时由 Bot 在 answer 中直接输出话术，不依赖工具） */
  toolCallOnly?: boolean
  maxTokens?: number
  /** 一次性调用超时（毫秒） */
  timeoutMs?: number
  /** 内部用：Coze 流式统计是否跳过（callOnce 收集时设为 true） */
  skipStats?: boolean
}

/**
 * 话术 LLM Provider 接口
 * 新增 LLM 接入：实现本接口并调用 registerScriptLLMProvider(id, impl)；配置侧若支持该 id 即可选用。
 */
export interface IScriptLLMProvider {
  readonly id: ScriptLLMProviderId
  /** 流式生成，逐块 yield 正文 */
  stream(
    config: ScriptLLMProviderConfig,
    options: ScriptLLMProviderOptions
  ): AsyncGenerator<string, void, unknown>
  /** 一次性调用并返回完整正文；未实现时由调度层用 stream + 超时收集兜底 */
  callOnce?(
    config: ScriptLLMProviderConfig,
    options: ScriptLLMProviderOptions
  ): Promise<string>
}

const registry: Map<string, IScriptLLMProvider> = new Map()

/**
 * 注册 Provider，供后续其他 LLM 接入与定制
 * 例如：registerScriptLLMProvider('doubao', doubaoProvider)
 */
export function registerScriptLLMProvider(id: string, provider: IScriptLLMProvider): void {
  if (!id || !provider || provider.id !== id) {
    console.warn('[scriptLLMProvider] 无效注册，id 与 provider.id 需一致')
    return
  }
  registry.set(id, provider)
}

/**
 * 按 id 获取已注册的 Provider；id 通常来自 getLLMModesSync().script / .todo
 */
export function getScriptLLMProvider(id: string): IScriptLLMProvider | null {
  return registry.get(id) ?? null
}

/** 返回当前已注册的 provider id 列表（用于管理端展示或校验） */
export function listScriptLLMProviderIds(): string[] {
  return Array.from(registry.keys())
}
