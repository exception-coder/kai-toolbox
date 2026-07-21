import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { AlertTriangle, FileDown, FileText, FileType, ImageIcon, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatItem } from '../types'
import { buildExportFilename, exportSessionAsDocx, exportSessionAsPdf, filterExportableItems, PAGE_H_PX, PAGE_W_PX, type ExportableItem } from '../lib/sessionExporter'
import { Markdown } from './Markdown'

/** 消息列表里的一句预览摘要：单行、去换行、截断，用于勾选列表里认出是哪条消息。 */
function previewText(item: ExportableItem): string {
  const raw = item.kind === 'user' ? (item.displayText ?? item.text) : item.text
  const flat = raw.replace(/\s+/g, ' ').trim()
  if (flat) return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat
  if (item.kind === 'user' && item.attachments?.some(a => a.mime?.startsWith('image/'))) return '[仅图片，无文字]'
  return '（空）'
}

interface Props {
  items: ChatItem[]
  sessionTitle: string
  onClose: () => void
}

/**
 * 会话导出弹窗：导出为 PDF（截图打印视图 → jsPDF 分页）/ Word（docx 库直接从消息数据构建）。
 * 只导出用户提问 + assistant 回复（含图片附件），过滤掉工具调用/系统状态等内部过程——
 * 场景是发给非技术同事/领导看"问了什么、AI 回了什么"。
 *
 * 支持在导出前勾选/排除某些消息（比如一条发错的话、一张不想给领导看的截图）——只作用于
 * 这一次导出的数据快照，不改动真实会话历史（历史是 Claude Code SDK 自己管的 JSONL 文件，
 * 从中间删消息有弄坏 resume 的风险，见 sessionExporter.ts 的相关说明；导出时排除则完全不碰它）。
 *
 * PDF 依赖一个真实渲染出来的"打印视图"节点（图片/mermaid 需要先渲染完成才能截图），
 * 因此弹窗里始终挂载一份不可见的打印视图（移到屏幕外，而非 display:none，
 * 否则无法参与布局、html-to-image 截不到内容）。
 */
export function ExportSessionDialog({ items, sessionTitle, onClose }: Props) {
  const [busy, setBusy] = useState<'pdf' | 'docx' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'pdf' | 'docx' | null>(null)
  const printRef = useRef<HTMLDivElement>(null)
  const pageWindowRef = useRef<HTMLDivElement>(null)

  const exportable = useMemo(() => filterExportableItems(items), [items])
  // 排除集：不改会话历史本身，只在导出这一份数据快照上做勾选/排除——最安全的"删消息"，
  // 因为压根不碰 SDK 自己管的 JSONL 会话文件，纯前端导出流程内部过滤。
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set())
  const selected = useMemo(() => exportable.filter(it => !excludedIds.has(it.id)), [exportable, excludedIds])
  const imageCount = selected
    .filter(it => it.kind === 'user')
    .reduce((sum, it) => sum + (it.attachments?.filter(a => a.mime?.startsWith('image/')).length ?? 0), 0)

  const toggleExclude = (id: string) => {
    setExcludedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const selectAll = () => setExcludedIds(new Set())
  const selectNone = () => setExcludedIds(new Set(exportable.map(it => it.id)))

  const handlePdf = async () => {
    setError(null)
    setDone(null)
    setBusy('pdf')
    try {
      const pageWindow = pageWindowRef.current
      const content = printRef.current
      if (!pageWindow || !content) throw new Error('打印视图未就绪')
      await exportSessionAsPdf(pageWindow, content, buildExportFilename(sessionTitle, 'pdf'))
      setDone('pdf')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const handleDocx = async () => {
    setError(null)
    setDone(null)
    setBusy('docx')
    try {
      await exportSessionAsDocx(selected, sessionTitle, buildExportFilename(sessionTitle, 'docx'))
      setDone('docx')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-16" onClick={onClose}>
      <div
        className="flex max-h-[75vh] w-full max-w-md flex-col overflow-hidden rounded-xl border bg-[var(--color-card)] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <FileDown className="size-4 text-[var(--color-muted-foreground)]" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">导出会话</span>
          <button type="button" onClick={onClose} className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]" aria-label="关闭">
            <X className="size-3.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <p className="text-xs leading-relaxed text-[var(--color-muted-foreground)]">
            导出仅保留用户提问与 AI 回复正文（含贴的图片），不包含工具调用等内部过程，
            适合发给同事/领导查看沟通结果。
          </p>
          {exportable.length > 0 && (
            <div className="mt-3 rounded-lg border">
              <div className="flex items-center justify-between border-b bg-[var(--color-muted)]/40 px-2.5 py-1.5">
                <span className="text-xs font-medium text-[var(--color-muted-foreground)]">
                  勾选要导出的消息（{selected.length}/{exportable.length}）
                </span>
                <div className="flex gap-1">
                  <button type="button" onClick={selectAll} className="rounded px-1.5 py-0.5 text-xs text-[var(--color-primary)] hover:bg-[var(--color-accent)]">全选</button>
                  <button type="button" onClick={selectNone} className="rounded px-1.5 py-0.5 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]">全不选</button>
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto p-1">
                {exportable.map(item => {
                  const checked = !excludedIds.has(item.id)
                  const imgN = item.kind === 'user' ? (item.attachments?.filter(a => a.mime?.startsWith('image/')).length ?? 0) : 0
                  return (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-[var(--color-accent)]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleExclude(item.id)}
                        className="mt-0.5 size-3.5 shrink-0 accent-[var(--color-primary)]"
                      />
                      <span className={cn(
                        'shrink-0 rounded px-1 py-0.5 text-[10px] font-medium',
                        item.kind === 'user' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                      )}>
                        {item.kind === 'user' ? '我' : 'AI'}
                      </span>
                      <span className={cn('min-w-0 flex-1 truncate', !checked && 'text-[var(--color-muted-foreground)] line-through')}>
                        {previewText(item)}
                      </span>
                      {imgN > 0 && (
                        <span className="flex shrink-0 items-center gap-0.5 text-[var(--color-muted-foreground)]">
                          <ImageIcon className="size-3" />{imgN}
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
            将导出 {selected.length} 条消息{imageCount > 0 ? `，含 ${imageCount} 张图片` : ''}。
          </p>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-xs text-[var(--color-destructive)]">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>导出失败：{error}</span>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              disabled={busy !== null || selected.length === 0}
              onClick={handlePdf}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                'hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-accent)]',
                busy !== null && 'pointer-events-none opacity-60',
              )}
            >
              {busy === 'pdf' ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <FileText className="size-4 shrink-0 text-rose-500" />}
              <span className="flex-1">
                <span className="block font-medium">导出为 PDF</span>
                <span className="block text-xs text-[var(--color-muted-foreground)]">按对话原样排版截图，视觉还原度最高{done === 'pdf' ? '· 已下载' : ''}</span>
              </span>
            </button>
            <button
              type="button"
              disabled={busy !== null || selected.length === 0}
              onClick={handleDocx}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                'hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-accent)]',
                busy !== null && 'pointer-events-none opacity-60',
              )}
            >
              {busy === 'docx' ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <FileType className="size-4 shrink-0 text-sky-500" />}
              <span className="flex-1">
                <span className="block font-medium">导出为 Word（.docx）</span>
                <span className="block text-xs text-[var(--color-muted-foreground)]">结构化文档，文字可编辑/复制{done === 'docx' ? '· 已下载' : ''}</span>
              </span>
            </button>
          </div>

          {exportable.length === 0 && (
            <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">当前会话没有可导出的问答内容。</p>
          )}
          {exportable.length > 0 && selected.length === 0 && (
            <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">已把所有消息都排除了，至少勾选一条才能导出。</p>
          )}
        </div>
      </div>

      {/* 打印视图：外层零尺寸 + overflow:hidden 把整块从页面上"隐形"；pageWindowRef 是固定
          "一页"大小（overflow:hidden）的窗口，真正截图的是它——PDF 逐页导出时会把内层内容
          节点整体上移一页高度、再对这个固定小窗口单独截一次图，画布尺寸恒定不随会话长度
          增长，避免长会话下单张巨图超出浏览器 canvas 上限导致的花屏/马赛克。
          内层内容节点自身不带任何 position/transform 位移样式（只在导出时临时打
          transform 位移，导出完立即复原）——同理，之前把偏移样式直接打在被截图节点自己
          身上时，克隆出来的画面连内容一起被搬走，PDF 整页空白，就是这个坑。 */}
      <div className="fixed left-0 top-0 h-0 w-0 overflow-hidden" aria-hidden>
        <div ref={pageWindowRef} style={{ width: PAGE_W_PX, height: PAGE_H_PX, overflow: 'hidden', background: '#ffffff' }}>
          <div
            ref={printRef}
            className="w-[800px] bg-white px-8 py-6 text-black"
            // 固定成浅色主题的 CSS 变量取值：Markdown 组件内部按 --color-* 变量上色，
            // 若不覆盖，导出内容会跟随当前 App 主题（暗色/纯黑/护眼）变化，白底页面上可能出现深色代码块背景等不协调效果。
            style={{
              '--color-background': 'oklch(0.98 0.005 255)',
              '--color-foreground': 'oklch(0.15 0.01 260)',
              '--color-card': 'oklch(1 0 0)',
              '--color-card-foreground': 'oklch(0.15 0.01 260)',
              '--color-muted': 'oklch(0.97 0.005 260)',
              '--color-muted-foreground': 'oklch(0.5 0.02 260)',
              '--color-border': 'oklch(0.92 0.005 260)',
              '--color-primary': 'oklch(0.55 0.21 277)',
            } as CSSProperties}
          >
            <h1 className="mb-1 text-xl font-semibold">{sessionTitle || 'Vibe Coding 会话记录'}</h1>
            <p className="mb-6 text-xs text-gray-500">导出时间：{new Date().toLocaleString('zh-CN')}</p>
            <div className="flex flex-col gap-4">
              {selected.map(item => (
                <div key={item.id}>
                  {item.kind === 'user' ? (
                    <div className="flex items-end justify-end gap-2">
                      <div className="flex max-w-[80%] flex-col items-end">
                        <div className="mb-1 text-xs text-gray-500">用户{item.ts ? ` · ${new Date(item.ts).toLocaleString('zh-CN')}` : ''}</div>
                        {item.attachments && item.attachments.filter(a => a.mime?.startsWith('image/')).length > 0 && (
                          <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
                            {item.attachments.filter(a => a.url && a.mime?.startsWith('image/')).map((a, i) => (
                              <img key={i} src={a.url} alt={a.name} className="max-h-72 max-w-full rounded-lg border border-gray-200" />
                            ))}
                          </div>
                        )}
                        {(item.displayText ?? item.text).trim() && (
                          <div className="whitespace-pre-wrap rounded-2xl bg-blue-600 px-4 py-2 text-white">
                            {item.displayText ?? item.text}
                          </div>
                        )}
                      </div>
                      <div className="mb-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">我</div>
                    </div>
                  ) : (
                    <div className="flex items-end gap-2">
                      <div className="mb-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">AI</div>
                      <div className="flex max-w-[85%] flex-col items-start">
                        <div className="mb-1 text-xs text-gray-500">Claude{item.ts ? ` · ${new Date(item.ts).toLocaleString('zh-CN')}` : ''}</div>
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2">
                          <Markdown text={item.text} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
