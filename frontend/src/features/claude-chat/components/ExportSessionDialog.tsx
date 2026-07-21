import { useRef, useState, type CSSProperties } from 'react'
import { AlertTriangle, FileDown, FileText, FileType, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatItem } from '../types'
import { buildExportFilename, exportSessionAsDocx, exportSessionAsPdf, filterExportableItems } from '../lib/sessionExporter'
import { Markdown } from './Markdown'

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
 * PDF 依赖一个真实渲染出来的"打印视图"节点（图片/mermaid 需要先渲染完成才能截图），
 * 因此弹窗里始终挂载一份不可见的打印视图（移到屏幕外，而非 display:none，
 * 否则无法参与布局、html-to-image 截不到内容）。
 */
export function ExportSessionDialog({ items, sessionTitle, onClose }: Props) {
  const [busy, setBusy] = useState<'pdf' | 'docx' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'pdf' | 'docx' | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  const exportable = filterExportableItems(items)
  const imageCount = exportable
    .filter(it => it.kind === 'user')
    .reduce((sum, it) => sum + (it.attachments?.filter(a => a.mime?.startsWith('image/')).length ?? 0), 0)

  const handlePdf = async () => {
    setError(null)
    setDone(null)
    setBusy('pdf')
    try {
      const node = printRef.current
      if (!node) throw new Error('打印视图未就绪')
      await exportSessionAsPdf(node, buildExportFilename(sessionTitle, 'pdf'))
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
      await exportSessionAsDocx(exportable, sessionTitle, buildExportFilename(sessionTitle, 'docx'))
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
          <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
            共 {exportable.length} 条消息{imageCount > 0 ? `，含 ${imageCount} 张图片` : ''}。
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
              disabled={busy !== null || exportable.length === 0}
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
              disabled={busy !== null || exportable.length === 0}
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
        </div>
      </div>

      {/* 打印视图：移到屏幕外但保留正常布局（display:none 不参与布局，html-to-image 截不到），
          仅用于 PDF 截图；Word 导出直接从 items 数据构建，不依赖这份 DOM。 */}
      <div
        ref={printRef}
        className="fixed left-0 top-0 -z-10 w-[800px] -translate-x-[9999px] bg-white px-8 py-6 text-black"
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
        aria-hidden
      >
        <h1 className="mb-1 text-xl font-semibold">{sessionTitle || 'Vibe Coding 会话记录'}</h1>
        <p className="mb-6 text-xs text-gray-500">导出时间：{new Date().toLocaleString('zh-CN')}</p>
        <div className="flex flex-col gap-4">
          {exportable.map(item => (
            <div key={item.id}>
              {item.kind === 'user' ? (
                <div className="flex flex-col items-end">
                  <div className="mb-1 text-xs text-gray-500">用户{item.ts ? ` · ${new Date(item.ts).toLocaleString('zh-CN')}` : ''}</div>
                  {item.attachments && item.attachments.filter(a => a.mime?.startsWith('image/')).length > 0 && (
                    <div className="mb-1.5 flex max-w-[85%] flex-wrap justify-end gap-1.5">
                      {item.attachments.filter(a => a.url && a.mime?.startsWith('image/')).map((a, i) => (
                        <img key={i} src={a.url} alt={a.name} className="max-h-72 max-w-full rounded-lg border border-gray-200" />
                      ))}
                    </div>
                  )}
                  {(item.displayText ?? item.text).trim() && (
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-blue-600 px-4 py-2 text-white">
                      {item.displayText ?? item.text}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-start">
                  <div className="mb-1 text-xs text-gray-500">Claude{item.ts ? ` · ${new Date(item.ts).toLocaleString('zh-CN')}` : ''}</div>
                  <div className="max-w-[95%] rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2">
                    <Markdown text={item.text} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
