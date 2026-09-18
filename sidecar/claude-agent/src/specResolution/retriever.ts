import fs from 'node:fs'
import { hash, safePath } from './storage.js'
import type { Candidate, Unit } from './contracts.js'
import { graphFreshness } from './freshness.js'

export function tokens(text: string): string[] {
  const words = text.normalize('NFKC').toLowerCase().match(/[a-z0-9_./-]+|[\p{Script=Han}]+/gu) || []
  return [...new Set(words.flatMap(word => /\p{Script=Han}/u.test(word)
    ? (word.length < 2 ? [word] : Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2))) : [word]))]
}
type GraphNode = { id: string; label?: string; source_file?: string; source_location?: string }
type GraphData = { nodes: GraphNode[]; links?: Array<{ source: string; target: string }> }
const graphCache = new Map<string, { key: string; graph: GraphData }>()
export function graphEvidence(root: string, query: string, changedFiles: string[]): { status: string; evidence: string[]; terms: string[]; revision?: string; reasons?: string[] } {
  const file = safePath(root, 'graphify-out/graph.json')
  if (!fs.existsSync(file)) return { status: 'MISSING', evidence: [] as string[], terms: [] as string[] }
  try {
    const stat = fs.statSync(file); const key = `${stat.mtimeMs}:${stat.size}`
    let cached = graphCache.get(root)
    if (!cached || cached.key !== key) {
      if (graphCache.size >= 4) graphCache.clear()
      cached = { key, graph: readGraph(file) }; graphCache.set(root, cached)
    }
    const graph = cached.graph; const terms = tokens(query)
    const seeds = graph.nodes.filter(node => changedFiles.includes(node.source_file || '')
      || terms.some(term => (node.label || '').toLowerCase().includes(term))).slice(0, 12)
    const ids = new Set(seeds.map(node => node.id))
    const seedIds = new Set(ids)
    for (const link of graph.links || []) if (seedIds.has(link.source) || seedIds.has(link.target)) {
      if (ids.size >= 60) break
      ids.add(link.source); ids.add(link.target)
    }
    const selected = graph.nodes.filter(node => ids.has(node.id) && node.source_file).slice(0, 20)
    const freshness = graphFreshness(root, [...selected.map(node => node.source_file!), ...changedFiles])
    return { ...freshness, evidence: selected.map(node => `${node.label}: ${node.source_file}:${node.source_location || ''}`),
      terms: freshness.status === 'VERIFIED_SOURCES' ? selected.flatMap(node => tokens(`${node.label} ${node.source_file}`)).slice(0, 80) : [] }
  } catch (error) { return { status: `UNAVAILABLE: ${error instanceof Error ? error.message : String(error)}`, evidence: [], terms: [] } }
}
function readGraph(file: string): GraphData {
  const stat = fs.statSync(file)
  if (stat.size > 128 * 1024 * 1024) throw new Error('graph exceeds 128 MiB')
  const graph = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as GraphData
  if (!Array.isArray(graph.nodes) || graph.nodes.length > 300000) throw new Error('invalid graph nodes')
  return graph
}
export function retrieve(units: Unit[], text: string, terms: string[], graphTerms: string[]): Candidate[] {
  const query = tokens(`${text} ${terms.join(' ')}`)
  return units.map(unit => {
    const body = new Set(tokens(unit.content)); const title = new Set(tokens(`${unit.capabilityId} ${unit.title}`))
    const matches = query.filter(term => body.has(term) || title.has(term))
    const score = matches.reduce((sum, term) => sum + (title.has(term) ? 3 : 1), 0)
    const graphMatches = graphTerms.filter(term => body.has(term) || title.has(term)).slice(0, 5)
    return { ...unit, score: score + (score > 0 ? graphMatches.length * 0.1 : 0),
      evidence: [`SPEC_TEXT: ${unit.specPath}:${unit.line}`, `MATCHED_TERMS: ${matches.join(', ')}`,
        ...(graphMatches.length ? [`GRAPH_SOURCE_MATCH: ${graphMatches.join(', ')}`] : [])] }
  }).filter(unit => unit.score > 0).sort((a, b) => b.score - a.score || hash(a.specPath + a.title).localeCompare(hash(b.specPath + b.title))).slice(0, 5)
}
