/** 将 id-ID 覆盖层与 en-US 基础合并，未翻译的键沿用英文 */
export function deepMergeLocale<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
  const out = { ...base } as T
  for (const k of Object.keys(override) as (keyof T)[]) {
    const bv = base[k]
    const ov = override[k]
    if (
      ov &&
      typeof ov === 'object' &&
      !Array.isArray(ov) &&
      bv &&
      typeof bv === 'object' &&
      !Array.isArray(bv)
    ) {
      (out as Record<string, unknown>)[k as string] = deepMergeLocale(
        bv as Record<string, unknown>,
        ov as Record<string, unknown>
      )
    } else if (ov !== undefined) {
      (out as Record<string, unknown>)[k as string] = ov as unknown
    }
  }
  return out
}
