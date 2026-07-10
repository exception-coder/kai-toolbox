import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ListChecks, Rocket, RotateCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listOnboard, listWorkspaces } from '../api'
import type { OnboardStage, OnboardView } from '../types'

interface Props {
  /**
   * 拉起一个 Vibe Coding 会话并投喂触发语，让 yoooni-onboard-pipeline skill 接管。
   * seed=投喂给会话的第一句话；cwd=会话工作目录（skill 在此 clone/定位项目）。
   */
  onLaunch: (seed: string, cwd: string) => void
  onClose: () => void
}

/** 单阶段徽章：✓ done / · pending / — skipped，配色区分；title 给关卡说明。 */
function StageBadge({ s }: { s: OnboardStage }) {
  const done = s.status === 'done'
  const skipped = s.status === 'skipped'
  const mark = done ? '✓' : skipped ? '—' : '·'
  const cls = done
    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    : skipped
      ? 'border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'
      : 'border-[var(--color-border)] text-[var(--color-muted-foreground)]'
  // 去掉序号前缀的圈号，徽章里用纯文字更紧凑
  const label = s.name.replace(/^[①②③④⑤⑥]\s*/, '')
  return (
    <span
      title={`${s.name}\n[${s.auto}] 关卡：${s.gate}${s.at ? `\n完成于 ${s.at}` : ''}`}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] leading-none ${cls}`}
    >
      <span className="font-mono">{mark}</span>
      {label}
    </span>
  )
}

function buildNewSeed(name: string, repos: string[], root: string): string {
  const lines = repos.map(r => `  - ${r}`).join('\n')
  const sysPart = name ? `系统「${name}」` : '新系统'
  return [
    `用 yoooni-onboard-pipeline 初始化${sysPart}。`,
    `仓库（git url 或本地路径）：`,
    lines,
    `工作区父目录：${root}`,
    `请从 pipeline.mjs plan 开始，逐阶段过关卡（每过一关用 pipeline.mjs mark 标记），需要我拍板的地方停下来问我。`,
  ].join('\n')
}

function buildResumeSeed(v: OnboardView): string {
  return [
    `继续系统「${v.system}」的 yoooni-onboard-pipeline 初始化。`,
    `先 pipeline.mjs status --name ${v.system} 看进度，从未完成的阶段接着走，到关卡停下来问我。`,
  ].join('\n')
}

/**
 * 项目初始化流水线（yoooni-onboard-pipeline）入口：
 * 上半镜像已有 onboard 状态（六阶段进度，后端只读状态文件），下半新建一次初始化。
 * 「开始 / 继续」都不是后端跑流水线，而是开一个 Vibe Coding 会话把 skill 拉起来——
 * 机械步骤自动跑、判断点设人工关卡（红线：不无人值守）。
 */
export function OnboardPipelinePanel({ onLaunch, onClose }: Props) {
  const { data: list = [], isLoading } = useQuery({ queryKey: ['claude-chat-onboard'], queryFn: listOnboard, staleTime: 3000 })
  const { data: workspaces } = useQuery({ queryKey: ['claude-chat-workspaces'], queryFn: listWorkspaces, staleTime: 5000 })
  const roots = (workspaces?.roots ?? []).filter(r => r.exists)

  const [name, setName] = useState('')
  const [reposText, setReposText] = useState('')
  const [root, setRoot] = useState('')

  useEffect(() => {
    if (!root && roots.length > 0) setRoot(roots[0].root)
  }, [roots, root])

  const repos = reposText.split('\n').map(s => s.trim()).filter(Boolean)
  const canStart = repos.length > 0 && root.length > 0

  const start = () => {
    if (!canStart) return
    onLaunch(buildNewSeed(name.trim(), repos, root), root)
  }

  const resume = (v: OnboardView) => {
    // 续跑工作目录：优先该系统首个本地仓所在父目录，无则工作区根兜底
    const localRepo = v.repos.find(r => r.exists && !/^https?:|^git@/.test(r.path))
    const cwd = localRepo ? localRepo.path : (root || roots[0]?.root || '')
    onLaunch(buildResumeSeed(v), cwd)
  }

  return (
    <div className="border-b px-3 py-3 text-sm">
      <div className="mb-2 flex items-center gap-2">
        <ListChecks className="size-4 text-[var(--color-primary)]" />
        <span className="font-medium">项目初始化流水线</span>
        <button type="button" onClick={onClose} aria-label="关闭" className="ml-auto rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]">
          <X className="size-4" />
        </button>
      </div>

      {/* 已有 onboard 进度镜像 */}
      {isLoading ? (
        <p className="text-xs text-[var(--color-muted-foreground)]">读取进度中…</p>
      ) : list.length > 0 ? (
        <div className="mb-3 space-y-2">
          {list.map(v => (
            <div key={v.system} className="rounded-md border p-2">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{v.system}</span>
                <span className="rounded bg-[var(--color-muted)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)]">
                  {v.separated ? '前后端分离' : (v.repos.length > 1 ? '多仓' : '单仓')}
                </span>
                <Button size="sm" variant="outline" className="ml-auto h-7 gap-1 px-2 text-xs" onClick={() => resume(v)}>
                  <RotateCw className="size-3.5" />继续
                </Button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {v.stages.map(s => <StageBadge key={s.id} s={s} />)}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* 新建初始化 */}
      <label className="text-xs text-[var(--color-muted-foreground)]">系统名（可空，留空由 plan 从首个仓库名推断）</label>
      <Input value={name} onChange={e => setName(e.target.value)} placeholder="如 korepos / 芋道" className="mt-1" />

      <label className="mt-3 block text-xs text-[var(--color-muted-foreground)]">仓库（每行一个 git 远端地址或本地路径，可多仓前后端）</label>
      <textarea
        value={reposText}
        onChange={e => setReposText(e.target.value)}
        rows={3}
        placeholder={'https://github.com/owner/backend.git\nhttps://github.com/owner/frontend.git'}
        className="mt-1 w-full resize-y rounded-md border bg-[var(--color-background)] px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
      />

      <label className="mt-3 block text-xs text-[var(--color-muted-foreground)]">工作区父目录（与新建会话一致，待 clone 项目落到这里）</label>
      {roots.length === 0 ? (
        <p className="mt-1 text-xs text-[var(--color-destructive)]">未配置可用工作区根（toolbox.claude-chat.workspace.roots）。</p>
      ) : (
        <select
          value={root}
          onChange={e => setRoot(e.target.value)}
          className="mt-1 h-9 w-full rounded-md border bg-[var(--color-background)] px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        >
          {roots.map(r => <option key={r.root} value={r.root}>{r.root}</option>)}
        </select>
      )}

      <div className="mt-3">
        <Button size="sm" disabled={!canStart} onClick={start} className="gap-1">
          <Rocket className="size-4" />开始初始化
        </Button>
      </div>
      <p className="mt-2 text-[10px] text-[var(--color-muted-foreground)]">
        「开始 / 继续」会开一个 Claude 会话拉起 yoooni-onboard-pipeline：拉取→画像→知识图谱→编码 profile→聚合→拓扑。
        机械步骤自动跑，需判断处（模块切分、技术栈、编码、是否登记拓扑）停下来问你——不做无人值守。
      </p>
    </div>
  )
}
