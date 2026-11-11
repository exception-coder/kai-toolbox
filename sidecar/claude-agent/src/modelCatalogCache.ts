import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { normalizeCodexHome, type CodexReasoningEffort } from './codexEngine.js'
import type { CodexModelInfo } from './codexAppServer.js'

/*
 * 模型目录缓存：Claude 按 provider 分别缓存 supportedModels，Codex 读取本地 models_cache.json。
 * 从 sessionManager 拆出，供会话启动、切换与模型同步复用。
 */

// Claude 模型清单按 provider 分别缓存：官方 supportedModels 与各第三方网关 /v1/models 是不同清单，
// 绝不能共用一份全局缓存（否则官方刷新/官方↔三方互切会把对方清单覆盖，前端显示错 provider 的模型）。
// key = provider 标识（'official' 或网关 baseUrl），供该 provider 的会话 start/resume/switch 即时重发。
export const claudeModelsByProvider = new Map<string, unknown[]>()
let claudeWarmStarted = false

/** provider 缓存 key：官方登录用 'official'，第三方网关用其 baseUrl（去空白）。 */
export function providerKey(apiBaseUrl?: string): string {
  return apiBaseUrl?.trim() || 'official'
}

/** 查询官方模型时的干净环境：剔除 shell 可能预置的 ANTHROPIC 网关变量，保证问的是官方而非三方。 */
export function officialModelsEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.ANTHROPIC_BASE_URL
  delete env.ANTHROPIC_AUTH_TOKEN
  delete env.ANTHROPIC_API_KEY
  return env
}

export function isCodexReasoningEffort(value: unknown): value is CodexReasoningEffort {
  return typeof value === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(value)
}

export function loadCodexModels(sessionCodexHome?: string): CodexModelInfo[] {
  try {
    const codexHome = normalizeCodexHome(sessionCodexHome)
      ?? normalizeCodexHome(process.env.CODEX_HOME)
      ?? join(homedir(), '.codex')
    const raw = JSON.parse(readFileSync(join(codexHome, 'models_cache.json'), 'utf8')) as {
      models?: Array<{
        slug?: string
        display_name?: string
        description?: string
        visibility?: string
        default_reasoning_level?: string
        supported_reasoning_levels?: Array<{ effort?: string }>
        additional_speed_tiers?: string[]
      }>
    }
    return (raw.models ?? []).flatMap((model) => {
      const value = model.slug?.trim()
      if (!value || model.visibility !== 'list') return []
      return [{
        value,
        displayName: model.display_name?.trim() || value,
        description: model.description ?? '',
        reasoningEfforts: (model.supported_reasoning_levels ?? [])
          .map((level) => level.effort)
          .filter(isCodexReasoningEffort),
        defaultReasoningEffort: isCodexReasoningEffort(model.default_reasoning_level)
          ? model.default_reasoning_level
          : null,
        fastSupported: (model.additional_speed_tiers ?? []).includes('fast'),
        isDefault: false,
      }]
    })
  } catch (error) {
    console.warn('[sidecar] 读取 Codex 模型缓存失败:', error instanceof Error ? error.message : String(error))
    return []
  }
}

/**
 * 建一次性 query 仅发控制请求 supportedModels 取模型清单，拿到即 abort，绝不跑对话轮次。
 * 这是「向 claude 原生二进制问一次当前支持的模型」的底层动作——Claude Code 会自更新，
 * 二进制在磁盘上升级后支持的模型会变（如新增 Sonnet 5），故本函数每次都真实重新询问。
 */
export async function queryClaudeModels(env?: NodeJS.ProcessEnv): Promise<unknown[] | null> {
  const ac = new AbortController()
  const safeCwd = process.env.USERPROFILE || process.env.HOME || process.cwd()
  try {
    const q = query({
      prompt: 'warmup',
      // 传 env 时问的是该 provider（网关或官方）的模型清单；不传则沿用进程环境。
      options: { cwd: safeCwd, permissionMode: 'default', abortController: ac, ...(env ? { env } : {}) },
    } as never)
    const fn = (q as { supportedModels?: () => Promise<unknown> }).supportedModels
    if (typeof fn !== 'function') return null
    const models = await fn.call(q)
    return Array.isArray(models) ? models : null
  } finally {
    ac.abort() // 取消一次性 query，绝不真正处理 warmup 这轮
  }
}

/**
 * 启动预热：取一次模型清单填充全局缓存，消除「sidecar 重启后首次进会话、未发消息 → 模型组空」的冷启动窗口。
 * 失败静默（首轮对话仍会再取）。
 */
export async function prewarmClaudeModels(): Promise<void> {
  if (claudeModelsByProvider.has('official') || claudeWarmStarted) return
  claudeWarmStarted = true
  try {
    const models = await queryClaudeModels(officialModelsEnv())
    if (models) {
      claudeModelsByProvider.set('official', models)
      console.log(`[sidecar] 预热官方 Claude 模型清单：${models.length} 个`)
    }
  } catch (e) {
    console.warn('[sidecar] 预热 Claude 模型失败（首轮对话会再取）：', e instanceof Error ? e.message : String(e))
  }
}

/**
 * 强制重新询问指定 provider 的支持模型并刷新其缓存（无视既有缓存）。用于「主动同步」按钮与定时同步。
 * key/env 决定问的是官方还是某网关——各 provider 独立缓存，互不覆盖。成功返回清单，失败返回 null（保留旧缓存）。
 */
export async function refreshClaudeModels(key: string, env?: NodeJS.ProcessEnv): Promise<unknown[] | null> {
  try {
    const models = await queryClaudeModels(env)
    if (models) {
      claudeModelsByProvider.set(key, models)
      console.log(`[sidecar] 刷新模型清单[${key}]：${models.length} 个`)
      return models
    }
    console.warn(`[sidecar] 刷新模型[${key}]：未取到清单，保留旧缓存`)
    return null
  } catch (e) {
    console.warn(`[sidecar] 刷新模型[${key}]失败（保留旧缓存）：`, e instanceof Error ? e.message : String(e))
    return null
  }
}
