import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

type SkillConfig = { path: string; enabled: boolean }
type Selection = { args: string[]; provider?: string; nativeDiscovery?: boolean; skillPath?: string }
type Adapter = {
  codexConfig(project: string, plugin: string, config: SkillConfig[], paths: string[]): Selection
  prepareClaude(project: string, plugin: string, output: string): Selection
}
type LocalPlugin = { type: 'local'; path: string }
type Rpc = (method: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>

function projectInstruction(selection: Selection): string {
  return selection.provider === 'project' && selection.nativeDiscovery === false && selection.skillPath
    ? `本项目的 openspec-auto 位于 ${JSON.stringify(selection.skillPath)}。开发任务先读取此项目 Skill；它未在当前宿主原生目录中，不重复使用全局同类入口。`
    : ''
}

export function hasProjectTaskSkill(project: string): boolean {
  return ['.agents/skills/openspec-auto/SKILL.md', '.claude/skills/openspec-auto/SKILL.md',
    '.agents/skill-providers.json'].some(file => fs.existsSync(path.join(project, file)))
}

// Only load an adapter shipped by an installed Team Standards plugin, never a project script.
async function adapter(plugin: string): Promise<Adapter> {
  const manifest = JSON.parse(fs.readFileSync(path.join(plugin, '.claude-plugin/plugin.json'), 'utf8'))
  if (manifest.name !== 'team-standards') throw new Error('SKILL_PRIORITY_ADAPTER: 插件身份不匹配')
  return import(pathToFileURL(path.join(plugin, 'scripts/openspec-auto.mjs')).href) as Promise<Adapter>
}

export async function codexProjectSkillArgs(project: string, rpc: Rpc,
  onInstruction?: (instruction: string, effectiveInstructions: string) => void): Promise<string[]> {
  if (!hasProjectTaskSkill(project)) return []
  const [listing, effective] = await Promise.all([
    rpc('skills/list', { cwds: [project], forceReload: true }),
    rpc('config/read', { cwd: project, includeLayers: false }),
  ])
  const paths: string[] = []
  for (const entry of (listing.data ?? []) as { skills?: { name: string; path: string; scope?: string }[] }[]) {
    for (const skill of entry.skills ?? []) {
      if (!(skill.name === 'openspec-auto' || skill.name.endsWith(':openspec-auto')) || !skill.path) continue
      const relative = path.relative(fs.realpathSync(project), fs.realpathSync(skill.path))
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) paths.push(skill.path)
    }
  }
  if (!paths.length) return []
  const plugin = paths.map(file => path.resolve(path.dirname(file), '../..')).find(root => {
    const manifest = path.join(root, '.claude-plugin/plugin.json')
    return fs.existsSync(manifest) && JSON.parse(fs.readFileSync(manifest, 'utf8')).name === 'team-standards'
  })
  // A project remains independent of Team Standards; other publishers own their adapters.
  if (!plugin) return []
  if (!fs.existsSync(path.join(plugin, 'scripts/openspec-auto.mjs'))) {
    throw new Error('SKILL_PRIORITY_ADAPTER: 请更新 Team Standards，当前插件缺少项目优先适配器')
  }
  const config = effective.config as { skills?: { config?: SkillConfig[] }; developer_instructions?: string } | undefined
  if (!config) throw new Error('SKILL_PRIORITY_CONFIG: 未取得有效 Codex 配置，不能覆盖未知启停项')
  const selection = (await adapter(plugin)).codexConfig(project, plugin, config.skills?.config ?? [], paths)
  onInstruction?.(projectInstruction(selection), config.developer_instructions ?? '')
  return selection.args
}

export async function claudeProjectPlugins(project: string, plugins: LocalPlugin[]) {
  const temporary: string[] = []
  const cleanup = () => {
    for (const directory of temporary) fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
  if (!hasProjectTaskSkill(project)) return { plugins, cleanup, instruction: '' }
  try {
    let instruction = ''
    const selected: LocalPlugin[] = []
    for (const plugin of plugins) {
      const manifest = path.join(plugin.path, '.claude-plugin/plugin.json')
      if (!fs.existsSync(manifest) || JSON.parse(fs.readFileSync(manifest, 'utf8')).name !== 'team-standards') {
        selected.push(plugin); continue
      }
      const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-skill-priority-'))
      temporary.push(parent)
      const result = (await adapter(plugin.path)).prepareClaude(project, plugin.path, path.join(parent, 'plugin'))
      instruction = projectInstruction(result)
      selected.push({ type: 'local', path: result.args[1] })
    }
    return { plugins: selected, cleanup, instruction }
  } catch (error) { cleanup(); throw error }
}
