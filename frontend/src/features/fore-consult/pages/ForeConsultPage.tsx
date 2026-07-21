import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, MessagesSquare, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { MultiSelect } from '@/components/ui/multi-select'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useChatRuntime } from '@/features/claude-chat/runtime/ChatRuntimeContext'
import type { ChatItem } from '@/features/claude-chat/types'
import {
  archiveConsult,
  deleteConsult,
  fetchProjectModules,
  linkDevSession,
  listConsults,
  listWorkspaces,
  startConsult,
  type ArchiveTurnItem,
  type ConsultSessionView,
} from '../api'

/**
 * 拼装投喂给复用的 Vibe Coding 悬浮会话的「业务系统咨询」约束提示词。
 * 面向业务人员答疑：直给结论、业务口吻、不铺代码细节，并要求末尾列出引用来源
 * （为后续「引用清单结构化回吐」预留抓手，本期先以自然语言呈现）。
 */
function buildConsultSeed(system: string, modules: string[], ask: string): string {
  const moduleLine = modules.length
    ? `聚焦模块：${modules.join('、')}。`
    : '（未锁定具体模块，面向整个系统。）'
  return [
    `关于「${system}」业务系统的咨询。${moduleLine}`,
    '问题：',
    ask.trim(),
    '',
    '回答对象是业务人员，不是来读代码的：先给一句话结论，再用业务语言分点说明「这个功能是做什么的 / 操作入口在哪 / 有哪些注意点」，最多 3~5 点。',
    '不要主动展开源码片段/文件路径/行号/数据库表结构这类实现细节，除非我明确追问。',
    '可以先用已挂载的 graphify 知识图谱、domain-knowledge 业务认知、cross-topology 跨项目拓扑等能力核对事实，但不要把「查了什么」的过程复述给我。',
    '回答末尾附一小节「引用来源」，分别列出你依据的：命中的前端菜单/页面路径、graphify 图谱节点、domain-knowledge 条目（没有就写「无」）。',
  ].join('\n')
}

/** 从 chat.items 抽取「用户问 → AI 答」成对轮次。question 取 displayText（用户原话），answer 合并该轮所有 assistant 文本。 */
function extractTurns(items: ChatItem[]): ArchiveTurnItem[] {
  const raw: Array<{ question: string; answerParts: string[] }> = []
  let cur: { question: string; answerParts: string[] } | null = null
  for (const it of items) {
    if (it.kind === 'user') {
      if (cur) raw.push(cur)
      cur = { question: it.displayText ?? it.text, answerParts: [] }
    } else if (it.kind === 'assistant' && cur) {
      if (it.text.trim()) cur.answerParts.push(it.text)
    }
  }
  if (cur) raw.push(cur)
  return raw.map((t, i) => ({
    turnIndex: i + 1,
    question: t.question,
    answer: t.answerParts.join('\n\n'),
  }))
}

export function ForeConsultPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { chat, activate, setFloating, setMinimized } = useChatRuntime()

  const [system, setSystem] = useState('')
  const [moduleTags, setModuleTags] = useState<string[]>([])
  const [ask, setAsk] = useState('')
  const [activeConsultId, setActiveConsultId] = useState<string | null>(null)

  // 待投喂队列（chat 懒启动时挂起，可用后由 deliver 发出），并回写关联的会话 id。
  const pendingRef = useRef<{ cwd: string; seed: string; displayText: string; consultId: string } | null>(null)

  const { data: workspaces } = useQuery({ queryKey: ['workspaces'], queryFn: listWorkspaces })

  const projects = useMemo<Array<{ name: string; path: string }>>(() => {
    const seen = new Set<string>()
    const out: Array<{ name: string; path: string }> = []
    for (const root of workspaces?.roots ?? []) {
      for (const d of root.dirs ?? []) {
        if (seen.has(d.name)) continue
        seen.add(d.name)
        out.push({ name: d.name, path: d.path })
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  }, [workspaces])

  const systemPath = useMemo(() => projects.find((p) => p.name === system)?.path ?? '', [projects, system])

  const { data: modulesData } = useQuery({
    queryKey: ['fore-consult-modules', systemPath],
    queryFn: () => fetchProjectModules(systemPath),
    enabled: !!systemPath,
  })
  const moduleOptions = useMemo(
    () => (modulesData?.modules ?? []).map((m) => ({ label: m.name, value: m.name })),
    [modulesData],
  )

  const { data: history } = useQuery({ queryKey: ['fore-consult-sessions'], queryFn: listConsults })

  // chat 懒启动完成后把挂起的投喂发出去（复用 ForgeBotTrigger 的 deliver 模式）。
  const deliver = useCallback(() => {
    const p = pendingRef.current
    if (!chat || !p) return
    pendingRef.current = null
    chat.open(p.cwd, undefined, undefined, 'claude')
    chat.send(p.seed, undefined, p.displayText)
    setFloating(true)
    setMinimized(false)
    // 会话 id 异步产生，稍后回写关联（失败不阻断）。
    setTimeout(() => {
      const sid = chat.sessionId
      if (sid) linkDevSession(p.consultId, sid).catch(() => {})
    }, 1500)
  }, [chat, setFloating, setMinimized])
  useEffect(() => {
    if (chat && pendingRef.current) deliver()
  }, [chat, deliver])

  const startMutation = useMutation({
    mutationFn: async () => {
      // 系统可自由输入（不在扫描列表里也允许），此时 systemPath 为空，回退到输入的系统名，
      // 保证「拉起会话的 cwd」与「归档的 systemSourcePath」始终一致，不出现空 cwd 与记录不符。
      const cwd = systemPath || system.trim()
      const seed = buildConsultSeed(system.trim(), moduleTags, ask)
      const created = await startConsult({
        systemName: system.trim(),
        systemSourcePath: cwd,
        moduleNames: moduleTags,
        promptSnapshot: seed,
      })
      return { created, seed, cwd }
    },
    onSuccess: ({ created, seed, cwd }) => {
      setActiveConsultId(created.sessionId)
      pendingRef.current = { cwd, seed, displayText: ask.trim(), consultId: created.sessionId }
      if (chat) deliver()
      else activate()
      setAsk('')
      qc.invalidateQueries({ queryKey: ['fore-consult-sessions'] })
    },
  })

  // 离开页面再回来时组件重挂载会丢失 activeConsultId，但悬浮会话仍在跑——
  // 据当前 chat.sessionId 从历史里找回仍 PENDING 的会话，恢复「结束并归档」按钮，避免归档入口消失。
  useEffect(() => {
    const sid = chat?.sessionId
    if (activeConsultId || !sid) return
    const pending = (history ?? []).find((s) => s.archiveStatus === 'PENDING' && s.devSessionId === sid)
    if (pending) setActiveConsultId(pending.sessionId)
  }, [history, chat, activeConsultId])

  const archiveMutation = useMutation({
    mutationFn: async () => {
      if (!activeConsultId) return null
      const items = chat?.items ?? []
      return archiveConsult(activeConsultId, {
        rawReferenceJson: JSON.stringify(items),
        parseStatus: 'NONE',
        turns: extractTurns(items),
      })
    },
    onSuccess: () => {
      setActiveConsultId(null)
      qc.invalidateQueries({ queryKey: ['fore-consult-sessions'] })
    },
  })

  const onDelete = async (s: ConsultSessionView) => {
    const ok = await confirm({
      title: '删除咨询记录',
      description: `删除「${s.systemName}」的咨询会话及其全部问答轮次，不可恢复。`,
      variant: 'destructive',
    })
    if (!ok) return
    await deleteConsult(s.sessionId)
    if (activeConsultId === s.sessionId) setActiveConsultId(null)
    qc.invalidateQueries({ queryKey: ['fore-consult-sessions'] })
  }

  // 有咨询进行中时禁止再开新会话：新会话会 chat.open() 清空共享的 chat.items，
  // 令上一段未归档的对话永久丢失。必须先「结束并归档」当前会话。
  const canStart = !!system.trim() && !!ask.trim() && !startMutation.isPending && !activeConsultId

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-center gap-3">
        <MessagesSquare className="size-6 text-[var(--color-primary)]" />
        <div>
          <h1 className="text-lg font-semibold">业务系统咨询</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            选定业务系统与模块，用 Vibe Coding 会话以业务口吻答疑，结束后归档问答与引用来源。
          </p>
        </div>
      </header>

      <section className="flex flex-col gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">业务系统</span>
            <Combobox
              id="fore-consult-system"
              value={system}
              onChange={(v) => { setSystem(v); setModuleTags([]) }}
              options={projects.map((p) => ({ label: p.name, value: p.name }))}
              placeholder="选择或输入系统名"
              emptyText="无匹配系统，可直接输入"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">模块（可多选，可选）</span>
            <MultiSelect
              id="fore-consult-modules"
              value={moduleTags}
              onChange={setModuleTags}
              options={moduleOptions}
              placeholder={system ? '下拉勾选或输入模块名' : '先选择业务系统'}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">咨询问题</span>
          <textarea
            rows={4}
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder="用业务语言描述你想问的问题，如：采购退货单在哪里录入？退货后库存怎么回冲？"
            className="w-full resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
          />
        </label>

        <div className="flex items-center gap-3">
          <Button onClick={() => startMutation.mutate()} disabled={!canStart}>
            {startMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            开始咨询
          </Button>
          {activeConsultId && (
            <Button
              variant="outline"
              onClick={() => archiveMutation.mutate()}
              disabled={archiveMutation.isPending}
            >
              {archiveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              结束并归档
            </Button>
          )}
          {activeConsultId && (
            <span className="text-xs text-[var(--color-muted-foreground)]">
              咨询进行中——在右下悬浮窗继续追问，问完点「结束并归档」保存本次问答（归档后才能开启新咨询）。
            </span>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-[var(--color-muted-foreground)]">历史咨询</h2>
        {(history ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted-foreground)]">
            暂无咨询记录
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(history ?? []).map((s) => (
              <li
                key={s.sessionId}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{s.systemName}</span>
                    {s.moduleNames.length > 0 && (
                      <span className="truncate text-xs text-[var(--color-muted-foreground)]">
                        · {s.moduleNames.join('、')}
                      </span>
                    )}
                    <ArchiveBadge status={s.archiveStatus} />
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                    {s.turns.length} 轮问答 · {new Date(s.createdAt).toLocaleString()}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => onDelete(s)} aria-label="删除">
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function ArchiveBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PENDING: { label: '进行中', cls: 'bg-amber-500/15 text-amber-600' },
    SUCCESS: { label: '已归档', cls: 'bg-emerald-500/15 text-emerald-600' },
    FAILED: { label: '归档失败', cls: 'bg-red-500/15 text-red-600' },
  }
  const it = map[status] ?? { label: status, cls: 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]' }
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${it.cls}`}>{it.label}</span>
}
