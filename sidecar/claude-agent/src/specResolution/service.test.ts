import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { resolveSpecs, confirmResolution, checkReadiness, refreshIndex } from './service.js'
import { parseUnits } from './indexer.js'
import { drafts } from './decisions.js'
import type { Decision } from './contracts.js'
import { saveJson } from './storage.js'

const base = '### Requirement: 样衣可见范围\n<!-- requirement-id: sample-visibility -->\n系统 SHALL 允许销售查看样衣。\n\n#### Scenario: 销售查询\n- WHEN 销售查询\n- THEN 返回样衣\n'
function fixture(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge specs '))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  execFileSync('git', ['init', '-q'], { cwd: root, windowsHide: true })
  const write = (file: string, content: string) => { const full = path.join(root, file); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, content) }
  write('openspec/config.yaml', 'schema: spec-driven\ncontext: test\n')
  write('openspec/specs/sample/spec.md', '# Sample\n## Requirements\n' + base)
  write('openspec/changes/restrict-sample/tasks.md', '- [ ] Implement\n')
  const input = { project: root, changeId: 'restrict-sample', requestId: 'task',
    requirements: [{ externalId: 'r1', text: '销售只能查看已入库样衣', atomic: true as const, terms: ['样衣', '销售'] }] }
  return { root, write, input }
}
test('recall full Chinese requirement, idempotency, confirmed delta and stale content', t => {
  const { input, write } = fixture(t)
  const resolution = resolveSpecs(input)
  assert.equal(resolution.items[0].candidates[0].requirementId, 'sample-visibility')
  assert.equal(resolution.items[0].candidates[0].content, base.trim())
  assert.equal(resolveSpecs(input).resolutionId, resolution.resolutionId)
  assert.throws(() => checkReadiness(input), /尚未完成/)
  const decision: Decision = { itemId: 'r1', classification: 'MODIFIED', capabilityId: 'sample', requirementId: 'sample-visibility',
    reason: '收紧既有销售可见范围，完整保留查询场景。', requirement: base.replace('允许销售查看', '仅允许销售查看已入库') }
  const confirmed = confirmResolution({ ...input, resolutionId: resolution.resolutionId, actor: 'test Agent', decisions: [decision] })
  assert.throws(() => checkReadiness(input), /Delta/)
  write('openspec/changes/restrict-sample/' + confirmed.drafts[0].path, confirmed.drafts[0].content)
  assert.equal(checkReadiness(input).allowed, true)
  confirmResolution({ ...input, resolutionId: resolution.resolutionId, actor: 'test Agent', decisions: [decision] })
  assert.equal(resolveSpecs(input).audit.length, 1)
  write('openspec/specs/sample/spec.md', base.replace('允许销售', '允许授权销售'))
  assert.throws(() => checkReadiness(input), /正式规格已变化/)
})
test('NO_SPEC_CHANGE creates no delta; new batch invalidates old confirmation', t => {
  const { input } = fixture(t); const result = resolveSpecs(input)
  confirmResolution({ ...input, resolutionId: result.resolutionId, actor: 'Agent', decisions: [
    { itemId: 'r1', classification: 'NO_SPEC_CHANGE', reason: '恢复原样衣查询场景，不改变既有业务规则。', capabilityId: 'sample', requirementId: 'sample-visibility' },
  ] })
  assert.equal(checkReadiness(input).allowed, true)
  resolveSpecs({ ...input, requirements: [{ ...input.requirements[0], text: '新增淘汰原因' }] })
  assert.throws(() => checkReadiness(input), /尚未完成/)
  assert.throws(() => confirmResolution({ ...input, resolutionId: result.resolutionId, actor: 'Agent', decisions: [] }))
})
test('parallel modifications and duplicate delta are denied', t => {
  const { input, write } = fixture(t); const result = resolveSpecs(input)
  const decision: Decision = { itemId: 'r1', classification: 'MODIFIED', capabilityId: 'sample', requirementId: 'sample-visibility', reason: '新增限制，保持原需求身份和完整场景。', requirement: base }
  confirmResolution({ ...input, resolutionId: result.resolutionId, actor: 'Agent', decisions: [decision] })
  write('openspec/changes/restrict-sample/specs/sample/spec.md', drafts([decision])[0].content)
  write('openspec/changes/parallel/specs/sample/spec.md', drafts([decision])[0].content)
  assert.throws(() => checkReadiness(input), /并行 change/)
  write('openspec/changes/restrict-sample/specs/sample/spec.md', drafts([decision])[0].content + '\n' + base)
  assert.throws(() => checkReadiness(input), /重复 Requirement/)
})
test('new capability needs explicit decision and existing capability cannot be NEW_CAPABILITY', t => {
  const { input } = fixture(t); const result = resolveSpecs(input)
  assert.throws(() => confirmResolution({ ...input, resolutionId: result.resolutionId, actor: 'Agent', decisions: [
    { itemId: 'r1', classification: 'NEW_CAPABILITY', capabilityId: 'sample', reason: '测试已有能力不能重复创建为新能力。', requirement: base },
  ] }), /Capability/)
  assert.throws(() => resolveSpecs({ ...input, changeId: '../escape' }))
  assert.throws(() => resolveSpecs({ ...input, requirements: [{ ...input.requirements[0], atomic: false }] }))
})
test('stable ID survives rename; fenced headings do not become requirements', () => {
  const first = parseUnits(base, 'sample', 'spec.md')[0]
  const renamed = parseUnits(base.replace('样衣可见范围', '销售样衣范围'), 'sample', 'spec.md')[0]
  assert.equal(first.requirementId, renamed.requirementId)
  assert.equal(parseUnits('```md\n' + base + '\n```\n' + base, 'sample', 'spec.md').length, 1)
})
test('Graphify one-hop evidence is explicit and never asserts freshness', t => {
  const { input, write } = fixture(t)
  write('graphify-out/graph.json', JSON.stringify({ nodes: [
    { id: '1', label: '销售样衣查询', source_file: 'src/sample.ts', source_location: 'L5' },
    { id: '2', label: 'SampleService', source_file: 'src/service.ts', source_location: 'L9' },
  ], links: [{ source: '1', target: '2' }] }))
  const result = resolveSpecs(input)
  assert.equal(result.graph.status, 'UNVERIFIED')
  assert.ok(result.graph.evidence.some(value => value.includes('src/service.ts:L9')))
})
test('batch routes additions and removals to separate capabilities; refresh works after archive', t => {
  const { input, root, write } = fixture(t)
  const requirements = Array.from({ length: 12 }, (_, i) => ({ externalId: `r${i + 1}`, text: `新增样衣规则 ${i + 1}`, atomic: true as const }))
  const result = resolveSpecs({ ...input, requirements })
  assert.equal(result.items.length, 12)
  const decisions: Decision[] = requirements.map((item, i) => ({ itemId: item.externalId,
    classification: i === 11 ? 'NEW_CAPABILITY' : 'ADDED', capabilityId: i === 11 ? 'supplier' : 'sample',
    reason: '这是独立新增的行为规则，已有 Requirement 未覆盖。',
    requirement: `### Requirement: Rule ${i + 1}\nSystem SHALL record rule ${i + 1}.\n\n#### Scenario: Save\n- WHEN saved\n- THEN recorded` }))
  const confirmed = confirmResolution({ ...input, resolutionId: result.resolutionId, actor: 'Agent', decisions })
  assert.equal(confirmed.drafts.length, 2)
  for (const draft of confirmed.drafts) write(`openspec/changes/restrict-sample/${draft.path}`, draft.content)
  assert.equal(checkReadiness(input).allowed, true)
  fs.renameSync(path.join(root, 'openspec/changes/restrict-sample'), path.join(root, 'openspec/changes/archived-sample'))
  assert.equal(refreshIndex({ project: root }).requirements, 1)
})
test('REMOVED requires reason and migration; invalid targets and partial deltas cannot pass', t => {
  const { input, write } = fixture(t); const result = resolveSpecs(input)
  const decision: Decision = { itemId: 'r1', classification: 'REMOVED', capabilityId: 'sample', requirementId: 'sample-visibility',
    reason: '根据已确定需求撤销销售样衣访问能力。', requirement: '### Requirement: 样衣可见范围\n**Reason**: retired\n**Migration**: none' }
  const confirmed = confirmResolution({ ...input, resolutionId: result.resolutionId, actor: 'Agent', decisions: [decision] })
  write('openspec/changes/restrict-sample/' + confirmed.drafts[0].path, confirmed.drafts[0].content)
  assert.equal(checkReadiness(input).allowed, true)
  assert.throws(() => confirmResolution({ ...input, resolutionId: result.resolutionId, actor: 'Agent', decisions: [{ ...decision, requirementId: 'unknown' }] }), /不存在/)
  assert.throws(() => confirmResolution({ ...input, resolutionId: result.resolutionId, actor: 'Agent', decisions: [{ ...decision, classification: 'MODIFIED', requirement: '### Requirement: 样衣可见范围\n系统 SHALL 查询' }] }), /Scenario/)
})
test('oversized audit records fail before publication', t => {
  const { root } = fixture(t)
  const file = path.join(root, 'large.json')
  assert.throws(() => saveJson(file, { text: 'x'.repeat(4 * 1024 * 1024) }), /4 MiB/)
  assert.equal(fs.existsSync(file), false)
})
