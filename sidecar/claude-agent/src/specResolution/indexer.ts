import fs from 'node:fs'
import { folders, hash, readText, safePath } from './storage.js'
import { requireCondition, type Unit } from './contracts.js'

/** Parse headings outside fenced examples; source excerpts retain complete requirement blocks. */
export function parseUnits(text: string, capabilityId: string, specPath: string): Unit[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const units: Unit[] = []
  let fence = ''; let section = ''; let start = -1; let title = ''; let unitSection = ''
  const finish = (end: number) => {
    if (start < 0) return
    const content = lines.slice(start, end).join('\n').trim()
    const explicit = content.match(/<!--\s*requirement-id:\s*([\w.-]+)\s*-->/i)?.[1]
    units.push({ capabilityId, requirementId: explicit || `title-${hash(title.toLowerCase()).slice(0, 20)}`,
      title, content, specPath, line: start + 1, section: unitSection, explicitId: Boolean(explicit),
      scenarios: content.split('\n').filter(line => /^#### Scenario:/.test(line)).map(line => line.slice(14).trim()) })
    start = -1
  }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const marker = line.match(/^\s*(`{3,}|~{3,})/)
    if (marker) { if (!fence) fence = marker[1]; else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = ''; continue }
    if (fence) continue
    if (/^#{1,2} /.test(line)) { finish(index); section = line.replace(/^#+ /, '').trim() }
    const heading = line.match(/^### Requirement:\s*(.+)$/)
    if (heading) { finish(index); start = index; title = heading[1].trim(); unitSection = section }
  }
  finish(lines.length)
  return units
}
export function indexSpecs(root: string, base = 'openspec/specs') {
  const units: Unit[] = []; const sources: Array<[string, string]> = []; const warnings: string[] = []
  for (const capability of folders(root, base)) {
    const relative = `${base}/${capability}/spec.md`; const file = safePath(root, relative)
    if (!fs.existsSync(file)) continue
    const text = readText(file); sources.push([relative, hash(text)])
    const parsed = parseUnits(text, capability, relative)
    requireCondition(new Set(parsed.map(unit => unit.requirementId)).size === parsed.length, 'SPEC_TARGET_CONFLICT', `重复 Requirement 身份：${relative}`)
    units.push(...parsed)
    if (parsed.some(unit => !unit.explicitId)) warnings.push(`DERIVED_ID: ${relative} 使用标题派生 ID；改名需重新解析`)
  }
  requireCondition(units.length <= 20000, 'INPUT_LIMIT', 'Requirement 数量超限')
  return { units, capabilities: sources.map(([file]) => file.split('/').at(-2)!), revision: hash(JSON.stringify(sources)), warnings }
}
