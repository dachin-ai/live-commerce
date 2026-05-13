/**
 * useToolResults — 工具结果存储管理 Hook
 * 负责：localStorage 持久化、按 toolId 读写结果、清空历史
 */

import { useState, useCallback } from 'react'
import type { ToolResultData, StoredToolResult } from '../components/ai/types'
import { TOOLS_RESULTS_STORAGE_KEY } from '../components/ai/types'

function loadToolsResults(): Record<string, StoredToolResult> {
  try {
    const raw = localStorage.getItem(TOOLS_RESULTS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, StoredToolResult>
    const filtered: Record<string, StoredToolResult> = {}
    for (const [k, v] of Object.entries(parsed)) {
      const d = v?.data as Record<string, unknown> | undefined
      if (d?.streaming) continue // 跳过流式生成中的结果
      filtered[k] = v
    }
    return filtered
  } catch {
    return {}
  }
}

export function useToolResults() {
  const [resultsByTool, setResultsByTool] = useState<Record<string, StoredToolResult>>(loadToolsResults)

  const setResultForTool = useCallback((toolId: string, value: ToolResultData | null) => {
    if (value === null) {
      setResultsByTool((prev) => {
        const next = { ...prev }
        delete next[toolId]
        try {
          localStorage.setItem(TOOLS_RESULTS_STORAGE_KEY, JSON.stringify(next))
        } catch {
          // ignore
        }
        return next
      })
    } else {
      setResultsByTool((prev) => {
        const next = { ...prev, [toolId]: value as StoredToolResult }
        const d = value.data as Record<string, unknown> | undefined
        if (!d?.streaming) {
          try {
            localStorage.setItem(TOOLS_RESULTS_STORAGE_KEY, JSON.stringify(next))
          } catch {
            // ignore
          }
        }
        return next
      })
    }
  }, [])

  const clearAllResults = useCallback(() => {
    setResultsByTool({})
    try {
      localStorage.removeItem(TOOLS_RESULTS_STORAGE_KEY)
    } catch {
      // ignore
    }
  }, [])

  const getResultForTool = useCallback(
    (toolId: string | undefined): ToolResultData | null => {
      if (!toolId) return null
      return (resultsByTool[toolId] ?? null) as ToolResultData | null
    },
    [resultsByTool]
  )

  return {
    resultsByTool,
    setResultForTool,
    clearAllResults,
    getResultForTool,
    hasResults: Object.keys(resultsByTool).length > 0,
  }
}
