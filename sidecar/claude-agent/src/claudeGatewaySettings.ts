import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Options } from '@anthropic-ai/claude-agent-sdk'

type JsonObject = Record<string, unknown>
const object = (value: unknown): value is JsonObject => Boolean(value && typeof value === 'object' && !Array.isArray(value))

export function claudeSettingSources(baseUrl: string | undefined): Options['settingSources'] {
  return baseUrl ? ['project', 'local'] : undefined
}

function readOptionalJson(file: string): JsonObject {
  if (!fs.existsSync(file)) return {}
  try {
    const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (object(value)) return value
  } catch { /* Return a recoverable error without exposing file contents or credentials. */ }
  throw new Error(`CLAUDE_USER_CONFIG_INVALID: 无法读取 ${path.basename(file)}；修复个人配置后重试会话`)
}

/** Explicit allowlist: user env/model/router are never copied into a gateway session. */
export function claudeGatewayUserCapabilities(home = os.homedir()): Pick<Options, 'plugins' | 'mcpServers'> {
  const settings = readOptionalJson(path.join(home, '.claude', 'settings.json'))
  const installed = readOptionalJson(path.join(home, '.claude', 'plugins', 'installed_plugins.json'))
  const global = readOptionalJson(path.join(home, '.claude.json'))
  const enabled = settings.enabledPlugins
  if (enabled !== undefined && !object(enabled)) throw new Error('CLAUDE_USER_CONFIG_INVALID: enabledPlugins 格式无效')
  const entries = installed.plugins
  if (entries !== undefined && !object(entries)) throw new Error('CLAUDE_USER_CONFIG_INVALID: 已安装插件目录格式无效')
  const plugins: NonNullable<Options['plugins']> = []
  const seenPaths = new Set<string>()
  for (const [name, active] of Object.entries(enabled ?? {})) {
    if (active !== true) continue
    const candidates = (entries as JsonObject | undefined)?.[name]
    if (!Array.isArray(candidates)) throw new Error(`CLAUDE_PLUGIN_UNAVAILABLE: 已启用插件 ${name} 未安装；修复插件后重试`)
    const candidate = candidates.find(item => object(item) && item.scope === 'user' && typeof item.installPath === 'string')
    if (!candidate || !object(candidate) || typeof candidate.installPath !== 'string'
      || !path.isAbsolute(candidate.installPath) || !fs.existsSync(candidate.installPath))
      throw new Error(`CLAUDE_PLUGIN_UNAVAILABLE: 已启用插件 ${name} 的个人安装目录不可用；修复插件后重试`)
    const real = fs.realpathSync(candidate.installPath)
    if (!seenPaths.has(real)) { plugins.push({ type: 'local', path: real }); seenPaths.add(real) }
  }
  const rawServers = global.mcpServers
  if (rawServers !== undefined && !object(rawServers)) throw new Error('CLAUDE_USER_CONFIG_INVALID: 个人 MCP 配置格式无效')
  const mcpServers: NonNullable<Options['mcpServers']> = {}
  for (const [name, value] of Object.entries(rawServers ?? {})) {
    if (!object(value) || value.disabled === true) continue
    if (value.type === 'http' || value.type === 'sse') {
      if (typeof value.url !== 'string' || !/^https?:\/\//.test(value.url))
        throw new Error(`CLAUDE_MCP_INVALID: ${name} 地址无效；修复个人 MCP 后重试`)
      mcpServers[name] = { type: value.type, url: value.url,
        ...(object(value.headers) && Object.values(value.headers).every(item => typeof item === 'string')
          ? { headers: value.headers as Record<string, string> } : {}) }
    } else if ((value.type === undefined || value.type === 'stdio') && typeof value.command === 'string'
      && (value.args === undefined || Array.isArray(value.args) && value.args.every(item => typeof item === 'string'))
      && (value.env === undefined || object(value.env) && Object.values(value.env).every(item => typeof item === 'string'))) {
      mcpServers[name] = { type: 'stdio', command: value.command,
        ...(value.args ? { args: value.args as string[] } : {}),
        ...(value.env ? { env: value.env as Record<string, string> } : {}) }
    } else throw new Error(`CLAUDE_MCP_INVALID: ${name} 配置无效；修复个人 MCP 后重试`)
  }
  return { plugins, mcpServers }
}
