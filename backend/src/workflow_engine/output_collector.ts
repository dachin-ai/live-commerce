import path from 'path'
import fs from 'fs'
import type { RoleOutput } from './types'

/** Project root: backend/src/workflow_engine -> ../../.. */
const OUTPUTS_ROOT = path.join(__dirname, '../../../outputs')

/** Get directory for a round: outputs/第N轮迭代/ or outputs/round_{id}/ */
export function getRoundOutputDir(roundLabel: string): string {
  const dir = path.join(OUTPUTS_ROOT, roundLabel)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** Write a single file under round output dir */
export function writeRoundFile(roundLabel: string, relativePath: string, content: string): string {
  const dir = getRoundOutputDir(roundLabel)
  const fullPath = path.join(dir, relativePath)
  const parent = path.dirname(fullPath)
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true })
  fs.writeFileSync(fullPath, content, 'utf-8')
  return relativePath
}

/** Collect role output into round dir and return paths for manifest */
export function collectRoleOutput(roundLabel: string, output: RoleOutput): { path: string; written: boolean }[] {
  const results: { path: string; written: boolean }[] = []
  for (const f of output.files) {
    try {
      const rel = writeRoundFile(roundLabel, f.path, f.content)
      results.push({ path: rel, written: true })
    } catch (e) {
      results.push({ path: f.path, written: false })
    }
  }
  return results
}

export interface ManifestEntry {
  roleId: string
  files: string[]
  summary?: string
  collectedAt: string
}

export interface RoundManifest {
  roundLabel: string
  entries: ManifestEntry[]
  updatedAt: string
}

/** Read or create manifest for a round */
function getManifestPath(roundLabel: string): string {
  return path.join(getRoundOutputDir(roundLabel), 'manifest.json')
}

export function readManifest(roundLabel: string): RoundManifest | null {
  const p = getManifestPath(roundLabel)
  if (!fs.existsSync(p)) return null
  try {
    const raw = fs.readFileSync(p, 'utf-8')
    return JSON.parse(raw) as RoundManifest
  } catch {
    return null
  }
}

export function appendToManifest(roundLabel: string, output: RoleOutput, collectedPaths: string[]): void {
  const now = new Date().toISOString()
  let manifest: RoundManifest = readManifest(roundLabel) || {
    roundLabel,
    entries: [],
    updatedAt: now,
  }
  manifest.entries = manifest.entries.filter((e) => e.roleId !== output.roleId)
  manifest.entries.push({
    roleId: output.roleId,
    files: collectedPaths,
    summary: output.summary,
    collectedAt: now,
  })
  manifest.updatedAt = now
  const manifestPath = getManifestPath(roundLabel)
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
}

/** List round labels by scanning outputs directory */
export function listRoundLabels(): string[] {
  if (!fs.existsSync(OUTPUTS_ROOT)) return []
  const entries = fs.readdirSync(OUTPUTS_ROOT, { withFileTypes: true })
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()
}

/** 读取当轮或指定轮次下某文件的内容，供角色联动使用；路径需在轮次目录内，防穿越 */
export function readRoundFileContent(roundLabel: string, relativePath: string): string | null {
  const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '')
  if (safePath.includes('..')) return null
  const dir = getRoundOutputDir(roundLabel)
  const fullPath = path.join(dir, safePath)
  if (!path.resolve(fullPath).startsWith(path.resolve(dir))) return null
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    // 文件不存在时返回 null，不抛出错误（允许角色在没有上游产出时也能执行）
    return null
  }
  try {
    return fs.readFileSync(fullPath, 'utf-8')
  } catch (err) {
    console.warn(`读取产出文件失败: ${roundLabel}/${relativePath}`, err)
    return null
  }
}

/** 根据当前轮次标签得到上一轮标签，如 第2轮迭代 -> 第1轮迭代；无上一轮则返回 null */
export function getPreviousRoundLabel(roundLabel: string): string | null {
  const match = roundLabel.match(/^第(\d+)轮迭代$/)
  if (!match) return null
  const n = parseInt(match[1], 10)
  if (n <= 1) return null
  return `第${n - 1}轮迭代`
}
