import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { graphFreshness } from './freshness.js'
import { resolveSpecs, checkReadiness, confirmResolution } from './service.js'
import { intakeRequirements, resolveWithModel, validateRecommendations } from './semantic.js'
import { hash, statePath } from './storage.js'
import { resolutionMetrics } from './metrics.js'

const base = '### Requirement: Visibility\n<!-- requirement-id: visibility -->\nSystem SHALL show samples to sales.\n\n#### Scenario: Query\n- WHEN sales query\n- THEN show samples'
function setup(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge semantic '))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  execFileSync('git', ['init', '-q'], { cwd: root, windowsHide: true })
  const write = (name: string, text: string) => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }
  write('openspec/config.yaml', 'schema: spec-driven')
  write('openspec/specs/sample/spec.md', base)
  write('openspec/changes/test/tasks.md', '- [ ] Implement')
  const input = { project: root, changeId: 'test', requestId: 'test', sessionId: 'host-session',
    requirements: [{ externalId: 'r1', text: 'System shows samples to sales', atomic: true as const }], timeoutMs: 100 }
  return { root, write, input }
}
function recommendation() { return { decision: { itemId: 'r1', classification: 'MODIFIED' as const, capabilityId: 'sample', requirementId: 'visibility',
  reason: 'Restrict existing visibility to received samples.', requirement: base.replace('show samples', 'show received samples') },
  confidence: 0.96, runnerUpConfidence: 0.4, ambiguous: false,
  evidence: [{ capabilityId: 'sample', requirementId: 'visibility', quote: 'System SHALL show samples to sales.' }] } }

test('high confidence generates idempotent draft but never bypasses explicit confirmation', async t => {
  const { input, root } = setup(t)
  let calls = 0
  const provider = async () => { calls++; return { recommendations: [recommendation()] } }
  const result = await resolveWithModel(input, provider)
  assert.equal(result.semantic?.status, 'RANKED'); assert.equal(result.semantic?.drafts.length, 1)
  assert.equal(result.decisions, undefined); assert.throws(() => checkReadiness(input), /尚未完成/)
  assert.equal((await resolveWithModel(input, provider)).resolutionId, result.resolutionId); assert.equal(calls, 1)
  const binding = JSON.parse(fs.readFileSync(statePath(root, `session-${hash('host-session')}`), 'utf8'))
  assert.equal(binding.changeId, 'test')
})
test('close scores, uncertain requests and unsupported evidence cannot automatically draft', t => {
  const { input } = setup(t); const result = resolveSpecs(input)
  assert.equal(validateRecommendations(result, { recommendations: [{ ...recommendation(), runnerUpConfidence: 0.9 }] })[0].status, 'NEEDS_CONFIRMATION')
  assert.equal(validateRecommendations(result, { recommendations: [{ ...recommendation(), ambiguous: true }] })[0].status, 'NEEDS_CONFIRMATION')
  assert.throws(() => validateRecommendations(result, { recommendations: [{ ...recommendation(), evidence: [{ capabilityId: 'sample', requirementId: 'visibility', quote: 'invented evidence text' }] }] }), /逐字引用/)
})
test('new capabilities never automatically draft even with high model confidence', t => {
  const { input } = setup(t); const result = resolveSpecs(input); const item = recommendation()
  const decision = { ...item.decision, classification: 'NEW_CAPABILITY', capabilityId: 'supplier', requirementId: undefined }
  assert.equal(validateRecommendations(result, { recommendations: [{ ...item, decision }] })[0].status, 'NEEDS_CONFIRMATION')
})
test('deadline aborts provider and returns candidates for manual review', async t => {
  const { input } = setup(t); let signal: AbortSignal | undefined
  const result = await resolveWithModel(input, async (_, value) => { signal = value; return new Promise(() => {}) })
  assert.equal(signal?.aborted, true); assert.equal(result.semantic?.status, 'NEEDS_CONFIRMATION')
  assert.ok(result.items[0].candidates.length); assert.ok(result.warnings.some(w => w.includes('MODEL_TIMEOUT')))
})
test('model result cannot overwrite a newer active requirement batch', async t => {
  const { input } = setup(t)
  await assert.rejects(resolveWithModel(input, async () => {
    resolveSpecs({ ...input, requirements: [{ ...input.requirements[0], text: 'Delete sales visibility' }] })
    return { recommendations: [recommendation()] }
  }), /模型运行期间/)
})
test('freshness validates bytes even when timestamps are unchanged and rejects deleted/escaping sources', t => {
  const { root, write } = setup(t); const content = 'export const sample = 1'
  write('src/sample.ts', content)
  write('graphify-out/manifest.json', JSON.stringify({ 'src/sample.ts': { ast_hash: createHash('md5').update(content).digest('hex') } }))
  assert.equal(graphFreshness(root, ['src/sample.ts']).status, 'VERIFIED_SOURCES')
  const stat = fs.statSync(path.join(root, 'src/sample.ts')); write('src/sample.ts', content.replace('1', '2'))
  fs.utimesSync(path.join(root, 'src/sample.ts'), stat.atime, stat.mtime)
  assert.equal(graphFreshness(root, ['src/sample.ts']).status, 'STALE')
  assert.equal(graphFreshness(root, ['src/missing.ts', '../escape.ts']).status, 'STALE')
})
test('write and staged commit scope must be covered by a confirmed file binding', t => {
  const { input, root, write } = setup(t); const result = resolveSpecs(input)
  confirmResolution({ ...input, resolutionId: result.resolutionId, actor: 'test', implementationFiles: ['src/ok.ts'], decisions: [
    { itemId: 'r1', classification: 'NO_SPEC_CHANGE', reason: 'Restore existing behavior without modifying requirements.' },
  ] })
  assert.equal(checkReadiness({ ...input, files: ['src/ok.ts'] }).allowed, true)
  assert.throws(() => checkReadiness({ ...input, files: ['src/other.ts'] }), /未绑定/)
  write('src/other.ts', 'export const unexpected = true')
  execFileSync('git', ['add', 'src/other.ts'], { cwd: root, windowsHide: true })
  assert.throws(() => checkReadiness({ ...input, operation: 'BEFORE_COMMIT' }), /未绑定/)
})
test('model intake preserves original source references and rejects invented quotes', async () => {
  const text = '增加样衣淘汰原因；调整卡片间距'
  const good = await intakeRequirements({ text }, async () => ({ items: [
    { text: '增加样衣淘汰原因', sourceQuote: '增加样衣淘汰原因', terms: ['样衣'] },
    { text: '调整卡片间距', sourceQuote: '调整卡片间距', terms: ['卡片'] },
  ] }))
  assert.equal(good.requirements.length, 2); assert.equal(good.originalText, text)
  await assert.rejects(intakeRequirements({ text }, async () => ({ items: [{ text: 'fabricated', sourceQuote: 'fabricated', terms: [] }] })), /原文追踪/)
})

test('quality metrics distinguish unlabeled decisions from confirmed corrections', async t => {
  const { input, root } = setup(t)
  assert.equal(resolutionMetrics({ project: root }).existingTop3Recall, null)
  const result = await resolveWithModel(input, async () => ({ recommendations: [recommendation()] }))
  assert.equal(resolutionMetrics({ project: root }).automaticMappingAgreement, null)
  confirmResolution({ ...input, resolutionId: result.resolutionId, actor: 'reviewer', decisions: [{
    itemId: 'r1', classification: 'NO_SPEC_CHANGE', capabilityId: 'sample', requirementId: 'visibility', reason: 'Existing behavior already meets the requirement; no Delta needed.',
  }] })
  const metrics = resolutionMetrics({ project: root })
  assert.equal(metrics.corrections, 1); assert.equal(metrics.existingTop3Recall, 1)
  assert.equal(metrics.automaticMappingAgreement, 0); assert.equal(metrics.automaticEvidenceCoverage, 1)
  assert.equal(metrics.automaticNewCapability, 0)
})
