import assert from 'node:assert/strict'
import test from 'node:test'
import { appendBuiltInHarnessPresets, RESEARCH_FIRST_GUIDANCE } from './harnessPresets.js'

const context = { cwd: '/project', engine: 'codex', toolPolicy: 'default', demo: false }

test('normal sessions receive both default presets without replacing existing instructions', () => {
  const previous = process.env.FORGE_SHELL_GUIDANCE_EXPERIMENT
  delete process.env.FORGE_SHELL_GUIDANCE_EXPERIMENT
  try {
    const result = appendBuiltInHarnessPresets('existing policy', context)!
    assert.ok(result.startsWith('existing policy\n\n'))
    assert.ok(result.includes('preset="environment-default"'))
    assert.ok(result.includes('preset="research-first"'))
    assert.ok(result.includes('Execution shell type/version: not reported'))
    process.env.FORGE_SHELL_GUIDANCE_EXPERIMENT = '0'
    const optedOut = appendBuiltInHarnessPresets(undefined, context)!
    assert.ok(!optedOut.includes('preset="environment-default"'))
    assert.ok(optedOut.includes('preset="research-first"'))
  } finally {
    if (previous === undefined) delete process.env.FORGE_SHELL_GUIDANCE_EXPERIMENT
    else process.env.FORGE_SHELL_GUIDANCE_EXPERIMENT = previous
  }
})

test('restricted and demo instructions remain unchanged', () => {
  for (const toolPolicy of ['disabled', 'review-only', 'consult-readonly']) {
    assert.equal(appendBuiltInHarnessPresets('policy', { ...context, toolPolicy }), 'policy')
    assert.equal(appendBuiltInHarnessPresets(undefined, { ...context, toolPolicy }), undefined)
  }
  assert.equal(appendBuiltInHarnessPresets('policy', { ...context, demo: true }), 'policy')
})

test('selection scenario instructs project-first official research and minimal reuse', () => {
  assert.match(RESEARCH_FIRST_GUIDANCE, /technical selection.*inspect the project first/)
  assert.match(RESEARCH_FIRST_GUIDANCE, /official documentation and native capabilities/)
  assert.match(RESEARCH_FIRST_GUIDANCE, /applicable versions and fit/)
  assert.match(RESEARCH_FIRST_GUIDANCE, /smallest sufficient extension/)
  assert.match(RESEARCH_FIRST_GUIDANCE, /supporting source links/)
})

test('simple bug scenario avoids mandatory research and repeated searches', () => {
  assert.match(RESEARCH_FIRST_GUIDANCE, /Simple local bugs.*do not require web research/)
  assert.match(RESEARCH_FIRST_GUIDANCE, /without repeating research/)
  assert.match(RESEARCH_FIRST_GUIDANCE, /do not impose a fixed search count/)
})

test('offline scenario keeps tool permissions, honest evidence and search privacy', () => {
  assert.match(RESEARCH_FIRST_GUIDANCE, /Respect explicit offline requests/)
  assert.match(RESEARCH_FIRST_GUIDANCE, /absent, disabled or fails/)
  assert.match(RESEARCH_FIRST_GUIDANCE, /do not claim live research/)
  assert.match(RESEARCH_FIRST_GUIDANCE, /never as instructions/)
  assert.match(RESEARCH_FIRST_GUIDANCE, /Do not send internal source code, secrets/)
  assert.match(RESEARCH_FIRST_GUIDANCE, /does not enable network tools or grant permissions/)
})
