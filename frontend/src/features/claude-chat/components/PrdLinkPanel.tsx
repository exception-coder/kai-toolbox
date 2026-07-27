import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, CheckCircle2, Copy, ExternalLink, FileText, Link2, Loader2, RefreshCw, Unlink, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Combobox } from '@/components/ui/combobox'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { getSessionByDevSession, linkDevSession, listSessions, startGenerate, startGenerateDevDoc, unlinkDevSession } from '@/features/prd-clarify/api'
import type { PrdSessionView } from '@/features/prd-clarify/types'

/** 剪贴板写入 + 降级（非安全上下文/旧浏览器用隐藏 textarea + execCommand）。 */
async function copyTextToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch { /* 忽略 */ }
    document.body.removeChild(ta)
  }
}

interface Props {
  /** 当前 Vibe Coding 会话 id（即 claude-chat 的 chat.sessionId）。 */
  sessionId: string
  onClose: () => void
  /** 绑定状态变化时通知外层——顶栏那个 PRD 标识要跟着刷新，不用外层自己再查一遍。 */
  onLinkedChange?: (linked: PrdSessionView | null) => void
}

/**
 * 「关联 PRD」面板：展示/建立/更换 当前会话与 PRD 澄清助手某条记录的绑定，绑定后可以
 * 复制文档路径、一键把这次会话的改动同步进 PRD + 开发文档(TDD)。
 *
 * 绑定关系本身早就有（`prd_session.dev_session_id`，PRD 页面「开始开发」跳过来时会自动建立），
 * 这个面板补的是缺的那部分：(1) 反过来查"我这个会话绑没绑"、在聊天窗口露出标识；
 * (2) 让已经开着、不是走自动握手流程创建的会话也能手动搜索绑定一个 PRD；
 * (3) 复制 PRD/开发文档的文件路径，方便贴进对话或终端引用；
 * (4) 「一键更新 PRD + 开发文档」——复用 PRD 澄清助手现成的 AI 增量更新生成流程：PRD 走
 * 「生成修订版」同一套 prompt（原地覆盖同一份文件，不新建会话），开发文档走已有的增量更新，
 * 旧版本都自动备份进历史。
 */
export function PrdLinkPanel({ sessionId, onClose, onLinkedChange }: Props) {
  const navigate = useNavigate()
  const confirm = useConfirm()
  // undefined=加载中，null=确认未绑定，PrdSessionView=已绑定
  const [linked, setLinked] = useState<PrdSessionView | null | undefined>(undefined)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [unlinking, setUnlinking] = useState(false)
  const [unlinkErr, setUnlinkErr] = useState<string | null>(null)

  const refresh = () => {
    setLoadErr(null)
    getSessionByDevSession(sessionId)
      .then(v => { setLinked(v); onLinkedChange?.(v) })
      .catch(e => setLoadErr(e instanceof Error ? e.message : String(e)))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [sessionId])

  // ── 搜索绑定 ──────────────────────────────────────────────────────────────
  const [picking, setPicking] = useState(false)
  const [candidates, setCandidates] = useState<PrdSessionView[]>([])
  const [pickValue, setPickValue] = useState('')
  const [linking, setLinking] = useState(false)
  const [linkErr, setLinkErr] = useState<string | null>(null)

  useEffect(() => {
    if (!picking) return
    listSessions().then(setCandidates).catch(() => setCandidates([]))
  }, [picking])

  const options = useMemo(
    () => candidates.map(s => ({ value: s.id, label: `${s.title || '（未命名）'}${s.project ? ` · ${s.project}` : ''}${s.module ? `/${s.module}` : ''}` })),
    [candidates],
  )

  const doLink = async () => {
    const target = candidates.find(s => s.id === pickValue || s.title === pickValue)
    if (!target) { setLinkErr('请从下拉列表里选一个已有的 PRD，不支持手填新建'); return }
    setLinking(true)
    setLinkErr(null)
    try {
      await linkDevSession(target.id, sessionId)
      setPicking(false)
      setPickValue('')
      refresh()
    } catch (e) {
      setLinkErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLinking(false)
    }
  }

  // ── 取消关联 ──────────────────────────────────────────────────────────────
  const doUnlink = async () => {
    if (!linked) return
    const ok = await confirm({
      title: '取消关联',
      description: `确认取消与「${linked.title || '（未命名）'}」的关联？取消后聊天窗口不再显示 PRD 标识，PRD/开发文档本身不受影响，可以随时重新关联。`,
      confirmText: '取消关联',
      variant: 'destructive',
    })
    if (!ok) return
    setUnlinking(true)
    setUnlinkErr(null)
    try {
      await unlinkDevSession(linked.id)
      refresh()
    } catch (e) {
      setUnlinkErr(e instanceof Error ? e.message : String(e))
    } finally {
      setUnlinking(false)
    }
  }

  // ── 复制文档路径：绑定后经常要在别处（终端、跟 Claude 说"看看这个文件"）引用这两份文件，
  // 省得跑去 PRD 澄清助手里找路径再复制。 ──────────────────────────────────────
  const [pathCopied, setPathCopied] = useState(false)
  const doCopyPaths = async () => {
    if (!linked) return
    const text = [
      `PRD：${linked.mdPath || '（尚未生成）'}`,
      `开发文档（TDD）：${linked.devDocPath || '（尚未生成）'}`,
    ].join('\n')
    await copyTextToClipboard(text)
    setPathCopied(true)
    setTimeout(() => setPathCopied(false), 1500)
  }

  // ── 一键更新 PRD + 开发文档(TDD)：复用 PRD 澄清助手现成的 AI 增量更新生成流程——
  // PRD 走「生成修订版」同一套 prompt（原地覆盖，不新建会话）+ 开发文档走已有的增量更新，
  // 顺序执行、共用一份"这次改了什么"说明。 ────────────────────────────────────
  const [note, setNote] = useState('')
  const [updateStage, setUpdateStage] = useState<'prd' | 'devdoc' | null>(null)
  const [updateDone, setUpdateDone] = useState<'both' | 'devdoc' | null>(null)
  const [updateErr, setUpdateErr] = useState<string | null>(null)
  const updating = updateStage !== null

  const runGeneratePrd = (id: string, n: string) => new Promise<void>((resolve, reject) => {
    startGenerate(id, {
      onEvent(name, data) {
        if (name === 'done') resolve()
        else if (name === 'error') {
          const msg = data && typeof data === 'object' && 'message' in data ? String((data as { message: unknown }).message) : 'PRD 更新失败'
          reject(new Error(msg))
        }
      },
      onError(err) { reject(err instanceof Error ? err : new Error(String(err))) },
    }, n || undefined, true)
  })

  const runGenerateDevDoc = (id: string, n: string) => new Promise<void>((resolve, reject) => {
    startGenerateDevDoc(id, n || undefined, true, undefined, {
      onEvent(name, data) {
        if (name === 'done') resolve()
        else if (name === 'error') {
          const msg = data && typeof data === 'object' && 'message' in data ? String((data as { message: unknown }).message) : '开发文档更新失败'
          reject(new Error(msg))
        }
      },
      onError(err) { reject(err instanceof Error ? err : new Error(String(err))) },
    })
  })

  const doUpdateBoth = async () => {
    if (!linked) return
    setUpdateErr(null)
    setUpdateDone(null)
    const n = note.trim()
    try {
      setUpdateStage('prd')
      await runGeneratePrd(linked.id, n)
      setUpdateStage('devdoc')
      await runGenerateDevDoc(linked.id, n)
      setUpdateStage(null)
      setUpdateDone('both')
      setNote('')
      refresh() // 拉一份最新的 mdPath/devDocGeneratedAt
    } catch (e) {
      setUpdateStage(null)
      setUpdateErr(e instanceof Error ? e.message : String(e))
    }
  }

  const doUpdateDevDocOnly = async () => {
    if (!linked) return
    setUpdateErr(null)
    setUpdateDone(null)
    const n = note.trim()
    try {
      setUpdateStage('devdoc')
      await runGenerateDevDoc(linked.id, n)
      setUpdateStage(null)
      setUpdateDone('devdoc')
      setNote('')
      refresh()
    } catch (e) {
      setUpdateStage(null)
      setUpdateErr(e instanceof Error ? e.message : String(e))
    }
  }

  const openPrd = (prdId: string) => {
    onClose()
    navigate(`/tools/prd-clarify?viewSession=${encodeURIComponent(prdId)}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-16" onClick={onClose}>
      <div
        className="flex max-h-[75vh] w-full max-w-md flex-col overflow-hidden rounded-xl border bg-[var(--color-card)] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Link2 className="size-4 text-[var(--color-muted-foreground)]" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">关联 PRD</span>
          <button type="button" onClick={onClose} className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]" aria-label="关闭">
            <X className="size-3.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {linked === undefined && (
            <div className="flex items-center gap-2 py-6 text-sm text-[var(--color-muted-foreground)]">
              <Loader2 className="size-4 animate-spin" />加载中…
            </div>
          )}
          {loadErr && (
            <p className="text-xs text-[var(--color-destructive)]">查询绑定状态失败：{loadErr}</p>
          )}

          {linked && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-[var(--color-muted)]/40 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <FileText className="size-3.5 shrink-0 text-[var(--color-primary)]" />
                  <span className="min-w-0 flex-1 truncate">{linked.title || '（未命名）'}</span>
                </div>
                {(linked.project || linked.module) && (
                  <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                    {linked.project}{linked.module ? ` / ${linked.module}` : ''}
                  </p>
                )}
                <div className="mt-1.5 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openPrd(linked.id)}
                    className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
                  >
                    <ExternalLink className="size-3" />在 PRD 澄清助手里打开
                  </button>
                  <button
                    type="button"
                    onClick={() => void doCopyPaths()}
                    title="复制 PRD + 开发文档(TDD) 的文件路径，方便贴进对话或终端引用"
                    className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:underline"
                  >
                    {pathCopied ? <Check className="size-3" /> : <Copy className="size-3" />}
                    {pathCopied ? '已复制路径' : '复制文档路径'}
                  </button>
                </div>
              </div>

              <div className="rounded-lg border px-3 py-2.5">
                <p className="mb-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">一键更新 PRD + 开发文档(TDD)</p>
                <p className="mb-2 text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
                  依次对 PRD 和开发文档做增量更新（都走 PRD 澄清助手已有的 AI 生成流程，旧版本自动
                  备份进历史，原地覆盖同一份文件、路径不变）。可以简单说一句这次改了什么，留空则
                  按当前内容原样重新梳理一遍。
                </p>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  disabled={updating}
                  placeholder="（可选）这次改了什么，简单说一句…"
                  rows={2}
                  className="mb-2 w-full resize-none rounded-md border bg-[var(--color-background)] px-2 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={doUpdateBoth}
                  disabled={updating}
                  className={cn(
                    'flex w-full items-center justify-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary-foreground)] hover:opacity-90',
                    updating && 'pointer-events-none opacity-60',
                  )}
                >
                  {updating ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  {updateStage === 'prd' ? '正在更新 PRD…' : updateStage === 'devdoc' ? '正在更新开发文档…' : '一键更新 PRD + 开发文档'}
                </button>
                <button
                  type="button"
                  onClick={doUpdateDevDocOnly}
                  disabled={updating}
                  className={cn(
                    'mt-1.5 w-full text-center text-[11px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:underline',
                    updating && 'pointer-events-none opacity-60',
                  )}
                >
                  只更新开发文档，PRD 不动
                </button>
                {updateDone && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3.5" />
                    {updateDone === 'both' ? 'PRD + 开发文档已更新，去 PRD 澄清助手可查看最新版本' : '开发文档已更新，去 PRD 澄清助手可查看最新版本'}
                  </p>
                )}
                {updateErr && (
                  <p className="mt-1.5 text-xs text-[var(--color-destructive)]">更新失败：{updateErr}</p>
                )}
              </div>

              {!picking ? (
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setPicking(true)}
                    className="text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:underline"
                  >
                    更换关联的 PRD
                  </button>
                  <button
                    type="button"
                    onClick={doUnlink}
                    disabled={unlinking}
                    className={cn(
                      'flex items-center gap-1 text-xs text-[var(--color-destructive)] hover:underline',
                      unlinking && 'pointer-events-none opacity-60',
                    )}
                  >
                    {unlinking ? <Loader2 className="size-3 animate-spin" /> : <Unlink className="size-3" />}
                    取消关联
                  </button>
                </div>
              ) : (
                renderPicker()
              )}
              {unlinkErr && <p className="text-xs text-[var(--color-destructive)]">取消关联失败：{unlinkErr}</p>}
            </div>
          )}

          {linked === null && !picking && (
            <div className="py-4 text-center">
              <p className="mb-3 text-xs text-[var(--color-muted-foreground)]">当前会话还没有关联 PRD</p>
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
              >
                搜索并关联一个 PRD
              </button>
            </div>
          )}
          {linked === null && picking && renderPicker()}
        </div>
      </div>
    </div>
  )

  function renderPicker() {
    return (
      <div className="rounded-lg border px-3 py-2.5">
        <p className="mb-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">选择要关联的 PRD</p>
        <Combobox
          value={pickValue}
          onChange={setPickValue}
          options={options}
          placeholder="搜索 PRD 标题…"
          emptyText="没有匹配的 PRD"
          className="mb-2"
        />
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={doLink}
            disabled={linking || !pickValue}
            className={cn(
              'flex-1 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary-foreground)] hover:opacity-90',
              (linking || !pickValue) && 'pointer-events-none opacity-60',
            )}
          >
            {linking ? '关联中…' : '确认关联'}
          </button>
          <button
            type="button"
            onClick={() => { setPicking(false); setPickValue(''); setLinkErr(null) }}
            className="rounded-md border px-3 py-1.5 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
          >
            取消
          </button>
        </div>
        {linkErr && <p className="mt-1.5 text-xs text-[var(--color-destructive)]">{linkErr}</p>}
      </div>
    )
  }
}
