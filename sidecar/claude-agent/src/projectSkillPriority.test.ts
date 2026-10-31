import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { codexProjectSkillArgs, claudeProjectPlugins } from './projectSkillPriority.js'

function fixture(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-priority-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const project = path.join(root, 'project'), plugin = path.join(root, 'plugin')
  const local = path.join(project, '.agents/skills/openspec-auto/SKILL.md')
  const global = path.join(plugin, 'skills/openspec-auto/SKILL.md')
  for (const file of [local, global]) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'skill') }
  fs.mkdirSync(path.join(plugin, '.claude-plugin'))
  fs.writeFileSync(path.join(plugin, '.claude-plugin/plugin.json'), '{"name":"team-standards"}')
  fs.mkdirSync(path.join(plugin, 'scripts'))
  // A recording adapter verifies host inputs without duplicating the suite's provider policy.
  fs.writeFileSync(path.join(plugin, 'scripts/openspec-auto.mjs'), `
    import fs from 'node:fs';
    export function codexConfig(project,plugin,config,paths) {
      return {args:['-c',JSON.stringify({project,plugin,config,paths})]};
    }
    export function prepareClaude(project,plugin,output) {
      fs.mkdirSync(output); return {args:['--plugin-dir',output]};
    }
  `)
  return { project, plugin, local, global }
}

test('projects without a local task skill incur no native RPC startup cost', async t => {
  const { project, local } = fixture(t); fs.unlinkSync(local)
  assert.deepEqual(await codexProjectSkillArgs(project, async () => { throw new Error('unexpected RPC') }), [])
})

test('Codex passes effective disable settings and actual global paths to the installed adapter', async t => {
  const { project, plugin, global, local } = fixture(t)
  const config = [{ path: '/other/SKILL.md', enabled: false }]
  const args = await codexProjectSkillArgs(project, async method => method === 'skills/list'
    ? { data: [{ skills: [{ name: 'team-standards:openspec-auto', path: global }, { name: 'openspec-auto', path: local }] }] }
    : { config: { skills: { config } } })
  assert.deepEqual(JSON.parse(args[1]), { project, plugin, config, paths: [global] })
})

test('Codex never replaces unknown effective configuration', async t => {
  const { project, global } = fixture(t)
  await assert.rejects(codexProjectSkillArgs(project, async method => method === 'skills/list'
    ? { data: [{ skills: [{ name: 'openspec-auto', path: global }] }] } : {}), /SKILL_PRIORITY_CONFIG/)
})

test('an independent project does not require Team Standards for another publisher skill', async t => {
  const { project, plugin, global } = fixture(t)
  fs.writeFileSync(path.join(plugin, '.claude-plugin/plugin.json'), '{"name":"other-publisher"}')
  assert.deepEqual(await codexProjectSkillArgs(project, async method => method === 'skills/list'
    ? { data: [{ skills: [{ name: 'openspec-auto', path: global }] }] } : {}), [])
})

test('non-native project skills supply an explicit read instruction and preserve effective instructions', async t => {
  const { project, plugin, global, local } = fixture(t)
  fs.writeFileSync(path.join(plugin, 'scripts/openspec-auto.mjs'), `
    import fs from 'node:fs';
    const selection={provider:'project',nativeDiscovery:false,skillPath:${JSON.stringify(local)}};
    export function codexConfig(){return {...selection,args:[]}};
    export function prepareClaude(project,plugin,output){fs.mkdirSync(output);return {...selection,args:['--plugin-dir',output]}};
  `)
  let instruction = '', previous = ''
  await codexProjectSkillArgs(project, async method => method === 'skills/list'
    ? { data: [{ skills: [{ name: 'openspec-auto', path: global }] }] }
    : { config: { developer_instructions: 'existing policy' } }, (next, effective) => {
      instruction = next; previous = effective
    })
  assert.ok(instruction.includes(JSON.stringify(local)))
  assert.equal(previous, 'existing policy')
  const result = await claudeProjectPlugins(project, [{ type: 'local', path: plugin }])
  t.after(result.cleanup)
  assert.equal(result.instruction, instruction)
})

test('Claude projects only Team Standards, preserves other plugins and cleans temporary projection', async t => {
  const { project, plugin, global } = fixture(t)
  const other = { type: 'local' as const, path: path.join(project, 'other') }
  const result = await claudeProjectPlugins(project, [{ type: 'local', path: plugin }, other])
  assert.equal(result.plugins[1], other)
  const projected = result.plugins[0].path
  assert.notEqual(projected, plugin)
  assert.ok(fs.existsSync(projected))
  result.cleanup()
  assert.equal(fs.existsSync(projected), false)
  assert.equal(fs.readFileSync(global, 'utf8'), 'skill', 'installed source is not mutated')
})
