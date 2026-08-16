import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Loader2, Rocket, Wrench, X } from 'lucide-react'
import { loadCodexHomePreference, saveCodexHomePreference } from '@/features/claude-chat/public-api'
import { navigateWithLaunchIntent } from '@/shell/launch-intent/api'
import type { ClarifyEngine } from './StartClarifyDialog'

export function StartDevDialog({
  title,
  sessionId,
  projectName,
  content,
  devDocContent,
  initialEngine,
  onClose,
}: {
  title: string
  sessionId: string
  projectName: string | null
  content: string           // PRD 内容（兜底）
  devDocContent?: string    // 开发文档内容（优先使用）
  initialEngine: ClarifyEngine
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [launching, setLaunching] = useState(false)
  const [engine, setEngine] = useState<ClarifyEngine>(initialEngine)
  const [codexHome, setCodexHome] = useState(loadCodexHomePreference)
  const [launchError, setLaunchError] = useState('')
  const agentName = engine === 'codex' ? 'Codex' : 'Claude Code'

  // 优先使用开发文档（有具体技术方案）；无开发文档时用 PRD + feature-dev 引导
  const hasDevDoc = !!(devDocContent && devDocContent.trim())

  /** 构建发给 Vibe Coding 的第一条消息 */
  const buildSeed = () => {
    if (hasDevDoc) {
      // Phase 1-4 全部完成（PRD 澄清 + 代码库探索 + 架构设计），直接从 Phase 5 实施
      return `请执行 /feature-dev:feature-dev，跳过已完成的阶段，从 Phase 5 开始：

## feature-dev 已完成阶段状态
- ✅ Phase 1 (Discovery) — 已完成：需求标题《${title}》
- ✅ Phase 2 (Codebase Exploration) — 已完成：见技术方案文档
- ✅ Phase 3 (Clarifying Q&A) — 已完成：经 AI 渐进澄清
- ✅ Phase 4 (Architecture Design) — 已完成：见下方技术方案文档

## 技术方案文档（Phase 4 产出）

${devDocContent}

---

## 执行指令
请从 **Phase 5 (Implementation)** 开始：
1. 严格按技术方案文档的「实现步骤（有序任务清单）」逐项执行，不跳过顺序
2. 执行「数据库变更」章节的 DDL/ALTER（幂等）
3. 实现「API 接口设计」章节的接口
4. 每完成一个任务项报告进度，有疑问先问再做
5. 全部任务完成后执行 **Phase 6 (Code Review)**

PRD_SESSION_ID: ${sessionId}`
    }

    // 无开发文档：Phase 1-3 完成，从 Phase 2 重新探索代码库开始
    return `请执行 /feature-dev:feature-dev，以下阶段已完成：

## feature-dev 已完成阶段状态
- ✅ Phase 1 (Discovery) — 已完成：见 PRD 文档
- ✅ Phase 3 (Clarifying Q&A) — 已完成：经 AI 渐进澄清
- ⬜ Phase 2 (Codebase Exploration) — 待执行
- ⬜ Phase 4 (Architecture Design) — 待执行
- ⬜ Phase 5 (Implementation) — 待执行

## PRD 文档（Phase 1+3 产出）

${content}

---

## 执行指令
请从 **Phase 2 (Codebase Exploration)** 开始：
1. 探索相关现有代码（Controller / Service / Repository / 前端组件）
2. Phase 4：设计技术方案（DB 变更 / API / 实现步骤清单）
3. Phase 5：按方案逐步实现，完成后将方案文档保存到 \`docs/design/\`
4. Phase 6：Code Review

PRD_SESSION_ID: ${sessionId}`
  }

  const handleLaunch = async () => {
    setLaunching(true)
    setLaunchError('')
    try {
      // 查询项目的 cwd（workspace 绝对路径）。关联项目支持多选（逗号/顿号分隔），
      // 但 Vibe Coding 会话只能打开一个工作目录，取第一个项目作为主项目来解析 cwd。
      let cwd = ''
      const primaryProjectName = projectName?.split(/[,，、]/)[0]?.trim() ?? ''
      if (primaryProjectName) {
        try {
          const res = await fetch('/api/claude-chat/workspaces', {
            headers: { Authorization: `Bearer ${localStorage.getItem('toolbox.auth.token') ?? ''}` },
          })
          if (res.ok) {
            const data = await res.json() as {
              roots: Array<{ exists: boolean; dirs: Array<{ name: string; path: string }> }>
            }
            for (const root of data.roots ?? []) {
              const found = root.dirs?.find(d => d.name === primaryProjectName)
              if (found) { cwd = found.path; break }
            }
          }
        } catch { /* cwd 解析失败时留空，让用户在工作台手动选 */ }
      }

      await navigateWithLaunchIntent(navigate, '/tools/claude-chat', {
        type: 'CHAT_OPEN_AND_SEND',
        cwd,
        seed: buildSeed(),
        prdSessionId: sessionId,
        engine,
        codexHome: engine === 'codex' ? (codexHome.trim() || undefined) : undefined,
      })
      if (engine === 'codex') saveCodexHomePreference(codexHome)
      onClose()
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : '无法创建开发会话交接')
    } finally {
      setLaunching(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <Rocket className="w-4 h-4 text-green-500" />
            <span className="font-semibold text-sm">开始开发 — {title}</span>
          </div>
          <button onClick={onClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 说明 */}
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-2">开发引擎</label>
            <div className="grid grid-cols-2 gap-2">
              {([['claude', 'Claude Code'], ['codex', 'Codex']] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setEngine(value)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    engine === value
                      ? 'border-green-500/50 bg-green-500/10 text-green-500'
                      : 'border-[var(--color-border)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/30'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {engine === 'codex' && (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/20 p-3">
              <label className="mb-1.5 block text-xs font-medium" htmlFor="prd-dev-codex-home">
                Codex Auth 目录
              </label>
              <input
                id="prd-dev-codex-home"
                value={codexHome}
                onChange={(event) => setCodexHome(event.target.value)}
                placeholder="%USERPROFILE%\.codex-account-yx"
                className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-input)] px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
                留空使用默认 %USERPROFILE%\.codex。不同目录可分别执行 codex login，从而让本次开发会话使用不同账号；不会修改项目工作目录。
              </p>
            </div>
          )}

          <p className="text-sm text-[var(--color-foreground)] leading-relaxed">
            点击「启动开发会话」，系统将自动：
          </p>
          {/* 携带文档类型提示 */}
          {hasDevDoc ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-purple-400">
              <Wrench className="w-3.5 h-3.5 flex-shrink-0" />
              <span>携带<strong className="mx-1">开发方案文档</strong>（含 DB 变更/API 设计/任务清单），{agentName} 可直接按方案实现，无需重新分析</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500">
              <FileText className="w-3.5 h-3.5 flex-shrink-0" />
              <span>携带 <strong className="mx-1">PRD</strong>，{agentName} 将先分析技术方案再实现。建议先生成「开发文档」后再开始开发。</span>
            </div>
          )}

          <div className="space-y-2 text-sm text-[var(--color-muted-foreground)]">
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-green-500/15 text-green-500 flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5">1</span>
              <span>在 <strong className="text-[var(--color-foreground)]">Vibe Coding</strong> 中打开
                {projectName ? <strong className="text-[var(--color-primary)] mx-1">{projectName}</strong> : '项目'} 工作目录
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-green-500/15 text-green-500 flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5">2</span>
              <span>自动发送{hasDevDoc ? <><strong className="text-purple-400 mx-1">开发方案文档</strong>，{agentName} 直接按清单实现</> : <><strong className="text-[var(--color-foreground)] mx-1">PRD + feature-dev 引导</strong>（代码探索→技术方案→实现）</>}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-green-500/15 text-green-500 flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5">3</span>
              <span>开发完成后，技术方案文档自动<strong className="text-[var(--color-foreground)]">关联回此 PRD</strong></span>
            </div>
          </div>
          {!projectName && (
            <p className="text-xs text-amber-500 bg-amber-500/10 rounded-lg px-3 py-2">
              ⚠ 未关联项目，打开工作台后需手动选择项目目录
            </p>
          )}
          {launchError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">
              {launchError}
            </p>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--color-border)]">
          <button onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
            取消
          </button>
          <button
            disabled={launching}
            onClick={handleLaunch}
            className="flex items-center gap-2 px-5 py-2 text-sm rounded-lg bg-green-600 text-white hover:opacity-90 disabled:opacity-50 font-medium"
          >
            {launching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
            启动开发会话
          </button>
        </div>
      </div>
    </div>
  )
}




// ───── 编辑器面板（Step EDITING） ─────
