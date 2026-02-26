/**
 * 复制文本到剪贴板，兼容 HTTP 等非安全上下文。
 * 先尝试 navigator.clipboard，失败则用 execCommand 回退。
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const s = String(text ?? '')
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(s)
      return true
    }
  } catch {
    // 非 HTTPS 等场景下可能失败，走回退
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = s
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
