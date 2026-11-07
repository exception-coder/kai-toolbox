import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

/** Read fresh project-owned text; no global repository, inheritance or generated index. */
export async function readProjectKnowledge(root: string, action: string, args: Record<string, unknown>,
  authorizePath?: (path: string) => Promise<void>) {
  if (!root) throw new Error('当前咨询未定位授权项目，请先使用source_projects')
  if (args.project != null) throw new Error('项目选择使用knowledge_query顶层project候选ID，不接受旧知识库project key')
  const base = realpathSync(root)
  const entries: string[] = []
  let visited = 0
  let truncated = false
  function visit(file: string, depth: number) {
    if (++visited > 3000 || entries.length >= 300 || depth > 12) { truncated = true; return }
    try {
      const stat = lstatSync(file)
      if (stat.isSymbolicLink()) return
      const real = realpathSync(file)
      if (real !== base && !real.startsWith(base + sep)) return
      if (stat.isDirectory()) {
        for (const child of readdirSync(file).sort()) {
          if (visited >= 3000 || entries.length >= 300) { truncated = true; break }
          visit(join(file, child), depth + 1)
        }
      } else if (/\.(md|ya?ml)$/i.test(file) && stat.size <= 256_000) entries.push(file)
    } catch { /* Missing optional knowledge is reported below. */ }
  }
  for (const source of ['docs/INDEX.md', 'docs/domain', 'openspec/specs']) visit(resolve(base, source), 0)
  const requested = typeof args.path === 'string' ? args.path : typeof args.id === 'string' ? args.id : ''
  const terms = String(args.query ?? args.question ?? args.menuName ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean)
  const read = ['get_knowledge', 'get_spec_candidate'].includes(action)
  if (read && !requested) throw new Error('请传入检索返回的相对文件path或id')
  const results: { path: string; content: string; truncated: boolean }[] = []
  let chars = 0
  for (const file of entries) {
    const name = relative(base, file).replaceAll('\\', '/')
    if (read && name !== requested) continue
    await authorizePath?.(name)
    const content = readFileSync(file, 'utf8')
    if (!read && terms.length && !terms.some(term => (name + '\n' + content).toLowerCase().includes(term))) continue
    const excerpt = content.slice(0, read ? 24_000 : 3000)
    if (chars + excerpt.length > 30_000 || results.length >= 20) { truncated = true; break }
    results.push({ path: name, content: excerpt, truncated: excerpt.length < content.length })
    chars += excerpt.length
  }
  return { status: results.length ? 'OK' : 'NO_EVIDENCE', evidenceSource: 'PROJECT_FILES', results, truncated,
    message: '当前授权项目原文；YAML归属/可信度随原文保留，历史资料不代表当前DDL。截断文件可用source_read分段读取；缺口不回退其他项目。' }
}
