/**
 * 关键业务结构化日志（请求 id、userId、storeId、耗时），便于排查与后续接入 APM。
 */

export interface RequestLogFields {
  event: string
  requestId: string
  userId?: string
  storeId?: string
  durationMs: number
  error?: string
}

export function logRequest(fields: RequestLogFields): void {
  console.log(JSON.stringify({ ...fields, ts: new Date().toISOString() }))
}
