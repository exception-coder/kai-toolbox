import { PROJECT_DIRECTORY_BLOCKS, type ConfigBlockView } from '@/features/config-center/public-api'

export interface DirectoryField {
  name: string
  label: string
  kind: 'path' | 'paths' | 'prefixes' | 'duration'
  fallback: string
  help: string
  optional?: boolean
  scale?: number
}

export interface DirectorySection {
  id: string
  title: string
  fields: DirectoryField[]
}

const scanFields = (scope: string): DirectoryField[] => [
  { name: 'hidden-prefixes', label: `${scope}隐藏前缀`, kind: 'prefixes', fallback: '.\n_',
    help: '每行一个目录名前缀，匹配的子目录不参与扫描。留空表示不按前缀隐藏。' },
  { name: 'cache-ttl-seconds', label: `${scope}扫描缓存（秒）`, kind: 'duration', fallback: '5',
    help: '正整数。缓存期间复用扫描结果，较短时间可更快发现目录变化。' },
]

export const DIRECTORY_SECTIONS: DirectorySection[] = [
  { id: PROJECT_DIRECTORY_BLOCKS.workspace, title: '工作区目录', fields: [
    { name: 'roots', label: '工作区目录', kind: 'paths', fallback: '',
      help: '每行一个绝对路径。供本地项目发现、模块工作区、AI 会话及项目上下文查询使用。' },
    ...scanFields('工作区'),
  ] },
  { id: PROJECT_DIRECTORY_BLOCKS.projects, title: '默认项目目录', fields: [
    { name: 'root', label: '默认项目目录', kind: 'path', fallback: '',
      help: '用于默认项目列表与本地文件操作。需要用于 AI 会话的目录，也请加入上方工作区目录。' },
    ...scanFields('默认项目'),
  ] },
  { id: PROJECT_DIRECTORY_BLOCKS.managed, title: '托管业务源码目录', fields: [
    { name: 'root', label: '托管业务源码目录', kind: 'path', fallback: '', optional: true,
      help: 'Forge 托管的源码位置，自动纳入工作区。留空使用用户目录下的 .kai-toolbox/sources；保存不会创建或搬移文件。' },
    { name: 'command-timeout-ms', label: '托管 Git 命令超时（秒）', kind: 'duration', fallback: '600', scale: 1000,
      help: '单次克隆、拉取和更新允许的最长时间，必须为正整数秒。' },
  ] },
]

export function directoryValues(block: ConfigBlockView, key: string): string[] {
  const direct = block.entries.find(entry => entry.key === key)
  if (direct) return direct.type === 'list'
    ? direct.values ?? (direct.value ? direct.value.split('\n') : [])
    : direct.value ? [direct.value] : []
  return block.entries.filter(entry => entry.key.startsWith(`${key}[`))
    .sort((a, b) => Number(a.key.match(/\[(\d+)\]$/)?.[1]) - Number(b.key.match(/\[(\d+)\]$/)?.[1]))
    .map(entry => entry.value ?? '').filter(Boolean)
}

export function directoryDraft(block: ConfigBlockView, section: DirectorySection): Record<string, string> {
  return Object.fromEntries(section.fields.map(field => {
    const key = `${block.id}.${field.name}`
    const present = block.entries.some(entry => entry.key === key || entry.key.startsWith(`${key}[`))
    const value = present ? directoryValues(block, key).join('\n') : field.fallback
    return [field.name, present && field.scale && value ? String(Number(value) / field.scale) : value]
  }))
}

export function directoryUpdate(section: DirectorySection, initial: Record<string, string>, draft: Record<string, string>) {
  const overrides: Record<string, string> = {}
  const replacePrefixes: string[] = []
  for (const field of section.fields) {
    if (initial[field.name] === draft[field.name]) continue
    const key = `${section.id}.${field.name}`
    const values = [...new Set(draft[field.name].split('\n').map(value => value.trim()).filter(Boolean))]
    if (field.kind === 'duration') {
      const value = Number(draft[field.name])
      if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647 / (field.scale ?? 1)) {
        throw new Error(`${field.label}请填写有效的正整数`)
      }
      overrides[key] = String(value * (field.scale ?? 1))
    } else {
      if (field.kind === 'path' && (values.length > 1 || (!field.optional && values.length !== 1))) {
        throw new Error('请填写一个完整的本地目录')
      }
      if ((field.kind === 'path' || field.kind === 'paths') && values.some(value => !/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(value))) {
        throw new Error('请填写绝对路径，例如 D:/Projects')
      }
      if (field.kind === 'paths' || field.kind === 'prefixes') {
        replacePrefixes.push(key)
        if (!values.length) overrides[key] = ''
        values.forEach((value, index) => { overrides[`${key}[${index}]`] = value })
      } else {
        overrides[key] = values[0] ?? ''
      }
    }
  }
  return { overrides, replacePrefixes }
}
