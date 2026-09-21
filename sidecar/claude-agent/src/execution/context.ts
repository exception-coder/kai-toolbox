import { folders, hash, locked, safePath, saveJson, statePath } from '../specResolution/storage.js'
import { indexSpecs } from '../specResolution/indexer.js'
import { graphEvidence, retrieve } from '../specResolution/retriever.js'
import { discoverExecutionSchema, resolveContextSchema } from './contracts.js'
import { inputFingerprint, projectContext } from './repository.js'

export type Discovery = ReturnType<typeof buildDiscovery>
function buildDiscovery(input: ReturnType<typeof resolveContextSchema.parse>, root: string, branch: string) {
  for (const file of input.files) safePath(root, file)
  const index = indexSpecs(root)
  const graph = graphEvidence(root, input.request, input.files)
  const changes = folders(root, 'openspec/changes').filter(name => name !== 'archive')
  const candidates = retrieve(index.units, input.request, input.terms, graph.terms)
  const sourceRevision = inputFingerprint(root, input.files)
  const discoveryId = `ed_${hash(JSON.stringify({ input, root, branch, revision: index.revision, sourceRevision, changes, graph })).slice(0, 32)}`
  return { ...input, project: root, branch, discoveryId, specRevision: index.revision, sourceRevision, candidates, activeChanges: changes, graph }
}
/** Candidate exploration is read-only; a saved discovery is only needed before assessment. */
export function resolveContext(raw: unknown) {
  const input = resolveContextSchema.parse(raw)
  const { root, branch } = projectContext(input.project, false)
  const discovery = buildDiscovery(input, root, branch)
  return { protocolVersion: 2, ...discovery,
    implementationCandidates: discovery.graph.evidence,
    gaps: [...(discovery.graph.status === 'VERIFIED_SOURCES' ? [] : [`GRAPH_${discovery.graph.status}`]),
      ...(discovery.candidates.length ? [] : ['SPEC_CANDIDATES_EMPTY'])],
    actions: ['候选不是结论；阅读原文与调用链。控制点、修改位置明确且无关键未知时停止探索。',
      '实施前使用精确 files 调用 discover_execution，再提交具名影响判断；只读咨询到此结束。'] }
}
export function discoverExecution(raw: unknown) {
  const input = discoverExecutionSchema.parse(raw); const { root, branch } = projectContext(input.project)
  const discovery = buildDiscovery(input, root, branch)
  locked(root, () => saveJson(statePath(root, discovery.discoveryId), discovery))
  return { ...discovery, actions: ['读取候选原文及活跃 change；Graphify 缺失/过期时定向读源码。审阅后 assess_execution；检索未命中不能证明新能力。'] }
}
