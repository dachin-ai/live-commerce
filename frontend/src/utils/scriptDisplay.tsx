import type { ReactNode } from 'react'

/**
 * 将话术中的 ### / ## / --- 转为可读结构，避免整段当纯文本显示 Markdown 符号。
 * 流式输出时不用（避免半行标题闪烁）。
 */
export function renderScriptRichText(text: string): ReactNode {
  const raw = String(text ?? '')
  const lines = raw.split('\n')
  const nodes: ReactNode[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (trimmed.startsWith('### ')) {
      nodes.push(
        <h3 key={i} className="text-base font-semibold text-slate-900 mt-3 mb-1 first:mt-0">
          {trimmed.slice(4)}
        </h3>
      )
      continue
    }
    if (trimmed.startsWith('## ') && !trimmed.startsWith('### ')) {
      nodes.push(
        <h2 key={i} className="text-lg font-bold text-slate-900 mt-4 mb-2 first:mt-0">
          {trimmed.slice(3)}
        </h2>
      )
      continue
    }
    if (/^---+$|^\*{3,}$/.test(trimmed)) {
      nodes.push(<hr key={i} className="my-3 border-slate-200" />)
      continue
    }
    if (trimmed === '') {
      nodes.push(<div key={i} className="h-2" aria-hidden />)
      continue
    }
    nodes.push(
      <p key={i} className="my-0.5 whitespace-pre-wrap break-words text-slate-800">
        {line}
      </p>
    )
  }
  return <div className="script-rich-text font-sans">{nodes}</div>
}
