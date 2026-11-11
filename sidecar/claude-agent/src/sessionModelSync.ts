import { emitOpencodeModels } from './opencodeEngine.js'
import { listAntigravityModels } from './antigravityRuntime.js'
import { listCodexModels } from './codexAppServer.js'
import { listCopilotModels } from './copilotEngine.js'
import { listPiModels } from './piEngine.js'
import { listQwenModels } from './qwenEngine.js'
import { claudeModelsByProvider, loadCodexModels, officialModelsEnv, providerKey, refreshClaudeModels } from './modelCatalogCache.js'
import type { Session } from './sessionManager.js'

type Emit = (sessionId: string, event: Record<string, unknown>) => void

/**
 * 会话模型目录同步：按引擎拉取模型清单，Claude 按 provider 隔离缓存与广播，失败时保留已有结果并提示。
 * 从 SessionManager 拆出；会话表通过 getter 读取，审批默认配置由宿主回调完成。
 */
export class SessionModelSync {
  constructor(
    private readonly sessions: () => Map<string, Session>,
    private readonly emit: Emit,
    private readonly ensureReviewDefaults: (id: string, session: Session) => Promise<void>,
  ) {}

  /**
   * 同步模型清单，**严格按 provider 隔离**，绝不跨 provider 覆盖：
   * - 手动刷新（sessionId 非空）：问的是该会话自己的 provider（官方或其网关），只广播给同 provider 的 Claude 会话；
   * - 定时任务（sessionId 为 null）：只刷新官方，只广播给官方 Claude 会话。第三方按各自会话手动刷新。
   */
  async refresh(sessionId: string | null): Promise<void> {
    // 手动刷新：按触发会话的 provider 询问并只广播给同 provider
    if (sessionId) {
      const s = this.sessions().get(sessionId)
      if (s?.engine === 'pi' || s?.engine === 'copilot') {
        // Java owns gateway catalog queries; a native placeholder must not overwrite its result.
        if (s.apiBaseUrl) return
        const identity = [s.engine, s.apiBaseUrl, s.model, s.authToken]
        const isCurrent = () => this.sessions().get(sessionId) === s
          && identity.every((value, index) => value === [s.engine, s.apiBaseUrl, s.model, s.authToken][index])
        try {
          const models = await (s.engine === 'pi' ? listPiModels() : listCopilotModels())
          if (isCurrent()) this.emit(sessionId, { type: 'models', models, current: s.model ?? null })
        } catch (error) {
          if (isCurrent()) this.emit(sessionId, { type: 'warning', code: 'ENGINE_MODELS_UNAVAILABLE', message: error instanceof Error ? error.message : String(error) })
        }
        return
      }
      if (s?.engine === 'opencode') {
        if (s.apiBaseUrl) return
        const identity = [s.apiBaseUrl, s.authToken, s.model]
        await emitOpencodeModels(s.cwd, event => {
          if (this.sessions().get(sessionId) === s && s.engine === 'opencode'
            && identity.every((value, i) => value === [s.apiBaseUrl, s.authToken, s.model][i])) this.emit(sessionId, event)
        }, s.model)
        return
      }
      if (s?.engine === 'qwen') {
        await this.refreshQwenModels(sessionId, s)
        return
      }
      if (s?.engine === 'codex') {
        await this.refreshCodexModels(sessionId, s, true)
        return
      }
      if (s?.engine === 'deepseekHarness') {
        this.emit(sessionId, { type: 'models', models: [], current: null })
        return
      }
      if (s?.engine === 'antigravity') {
        try {
          const models = await listAntigravityModels()
          this.emit(sessionId, { type: 'models', models, current: s.model ?? null })
        } catch (error) {
          this.emit(sessionId, {
            type: 'warning',
            code: 'ANTIGRAVITY_MODEL_CATALOG_FALLBACK',
            message: `Antigravity 模型目录暂不可用，已保留当前模型：${error instanceof Error ? error.message : String(error)}`,
          })
        }
        return
      }
      if (s && s.engine === 'claude') {
        const key = providerKey(s.apiBaseUrl)
        const models = await refreshClaudeModels(key, s.providerEnv())
        if (!models) {
          this.emit(sessionId, { type: 'error', code: 'MODELS_REFRESH_FAILED', message: '同步模型清单失败，已保留上次结果（请确认 claude/网关 可用）' })
          return
        }
        for (const [id, sess] of this.sessions()) {
          if (sess.engine === 'claude' && providerKey(sess.apiBaseUrl) === key) {
            this.emit(id, { type: 'models', models, current: sess.model ?? null })
          }
        }
        return
      }
      // 会话不在/非 claude：按官方兜底刷新，仅回给触发者
      const models = await refreshClaudeModels('official', officialModelsEnv())
      if (models) this.emit(sessionId, { type: 'models', models, current: null })
      else this.emit(sessionId, { type: 'error', code: 'MODELS_REFRESH_FAILED', message: '同步模型清单失败，已保留上次结果' })
      return
    }
    // 定时任务：只刷新官方，只广播给官方 Claude 会话（第三方不受影响）
    const models = await refreshClaudeModels('official', officialModelsEnv())
    if (!models) return
    for (const [id, s] of this.sessions()) {
      if (s.engine === 'claude' && !s.apiBaseUrl) this.emit(id, { type: 'models', models, current: s.model ?? null })
    }
  }

  async refreshQwenModels(id: string, session: Session): Promise<void> {
    try {
      const models = await listQwenModels(session.cwd)
      if (this.sessions().get(id) === session && session.engine === 'qwen') this.emit(id, { type: 'models', models, current: session.model ?? null })
    } catch (error) {
      if (this.sessions().get(id) === session && session.engine === 'qwen') {
        // A failed catalog must invalidate any model list carried over from another session or engine.
        this.emit(id, { type: 'models', models: [], current: session.model ?? null })
        this.emit(id, {
          type: 'warning', code: 'QWEN_MODELS_UNAVAILABLE',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  async refreshCodexModels(id: string, session: Session, reportFailure: boolean): Promise<void> {
    try {
      const models = await listCodexModels(session.codexHome)
      if (models.length === 0) throw new Error('Codex model/list 未返回可选模型')
      if (this.sessions().get(id) !== session || session.engine !== 'codex') return
      this.emit(id, { type: 'models', models, current: session.model ?? null })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[sidecar] Codex model/list 失败，保留缓存目录 session=${id}: ${message}`)
      if (reportFailure && this.sessions().get(id) === session) {
        this.emit(id, {
          type: 'error',
          code: 'MODELS_REFRESH_FAILED',
          message: '同步 Codex 模型清单失败，已保留本地缓存结果',
        })
      }
    }
  }

  /** 按会话当前 provider 即时重发已缓存的 models，让 resume/切会话/切 provider 立刻看到对应清单。
   *  无该 provider 缓存时不发（避免发错 provider 的旧清单）——首轮 runTurn 的 fetchModels 会补上。 */
  emitCachedModels(id: string, s: Session): void {
    if (s.engine === 'claude') {
      const cached = claudeModelsByProvider.get(providerKey(s.apiBaseUrl))
      if (cached) this.emit(id, { type: 'models', models: cached, current: s.model ?? null })
    } else if (s.engine === 'codex') {
      this.emit(id, { type: 'models', models: loadCodexModels(s.codexHome), current: s.model ?? null })
      if (s.toolPolicy === 'review-only') void this.ensureReviewDefaults(id, s)
      else void this.refreshCodexModels(id, s, false)
    } else if (s.engine === 'qwen') {
      void this.refreshQwenModels(id, s)
    } else if (s.engine === 'pi' || s.engine === 'copilot') {
      void this.refresh(id)
    } else if (s.engine === 'trae') {
      this.emit(id, { type: 'models', models: [], current: s.model ?? null })
    } else if (s.engine === 'antigravity') {
      void listAntigravityModels()
        .then(models => this.emit(id, { type: 'models', models, current: s.model ?? null }))
        .catch(error => console.warn(`[sidecar] Antigravity 模型目录暂不可用 session=${id}，保留当前选择：${error instanceof Error ? error.message : String(error)}`))
    }
  }
}
