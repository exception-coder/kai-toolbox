import { useEffect, useMemo, useState } from 'react'
import { FileText, Loader2, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Combobox } from '@/components/ui/combobox'
import { listSessions, type PrdSessionView } from '@/features/prd-clarify/public-api'
import { createPrdDocumentFile } from '../lib/prdReference'

interface Props {
  /** 选好文档后回调，携带一个包装好文本内容的 File——调用方按普通附件上传路径处理即可。 */
  onPick: (file: File) => void
  onClose: () => void
}

/**
 * 「PRD 文档」快捷附加面板：搜索 PRD 澄清助手里已有的记录，一键把 PRD 需求文档或对应的
 * 开发文档内容附加进当前对话（复用现成的附件上传流程），直接针对文档内容提问——
 * PRD/开发文档本来就是本系统自己管理的数据，不该让用户自己出去找文件再传回来。
 */
export function PrdAttachPanel({ onPick, onClose }: Props) {
  const [sessions, setSessions] = useState<PrdSessionView[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [pickValue, setPickValue] = useState('')
  const [fetching, setFetching] = useState<'prd' | 'dev' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    listSessions()
      .then(list => setSessions(list))
      .catch(e => setLoadErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  const options = useMemo(
    () => sessions.map(s => ({ value: s.id, label: `${s.title || '（未命名）'}${s.project ? ` · ${s.project}` : ''}${s.module ? `/${s.module}` : ''}` })),
    [sessions],
  )
  const target = sessions.find(s => s.id === pickValue)

  const attach = async (kind: 'prd' | 'dev') => {
    if (!target) return
    setFetching(kind)
    setErr(null)
    try {
      const file = await createPrdDocumentFile(target, kind)
      onPick(file)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setFetching(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-16" onClick={onClose}>
      <div
        className="flex max-h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-xl border bg-[var(--color-card)] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="size-4 text-[var(--color-muted-foreground)]" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">附加核心规格 / 执行计划</span>
          <button type="button" onClick={onClose} className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]" aria-label="关闭">
            <X className="size-3.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading && (
            <div className="flex items-center gap-2 py-6 text-sm text-[var(--color-muted-foreground)]">
              <Loader2 className="size-4 animate-spin" />加载中…
            </div>
          )}
          {loadErr && <p className="text-xs text-[var(--color-destructive)]">加载规格列表失败：{loadErr}</p>}

          {!loading && !loadErr && (
            <>
              <p className="mb-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">搜索规格库里的需求</p>
              <Combobox
                value={pickValue}
                onChange={setPickValue}
                options={options}
                placeholder="搜索规格标题…"
                emptyText="没有匹配的规格"
                className="mb-3"
              />

              {target && (
                <div className="rounded-lg border bg-[var(--color-muted)]/40 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <FileText className="size-3.5 shrink-0 text-[var(--color-primary)]" />
                    <span className="min-w-0 flex-1 truncate">{target.title || '（未命名）'}</span>
                  </div>
                  {(target.project || target.module) && (
                    <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                      {target.project}{target.module ? ` / ${target.module}` : ''}
                    </p>
                  )}
                  <div className="mt-2.5 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => void attach('prd')}
                      disabled={!target.mdPath || fetching !== null}
                      title={!target.mdPath ? '核心规格尚未生成' : undefined}
                      className={cn(
                        'flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary-foreground)] hover:opacity-90',
                        (!target.mdPath || fetching !== null) && 'pointer-events-none opacity-50',
                      )}
                    >
                      {fetching === 'prd' ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
                      附加核心规格
                    </button>
                    <button
                      type="button"
                      onClick={() => void attach('dev')}
                      disabled={!target.devDocPath || fetching !== null}
                      title={!target.devDocPath ? '开发文档尚未生成' : undefined}
                      className={cn(
                        'flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-accent)]',
                        (!target.devDocPath || fetching !== null) && 'pointer-events-none opacity-50',
                      )}
                    >
                      {fetching === 'dev' ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
                      附加开发文档
                    </button>
                  </div>
                </div>
              )}
              {err && <p className="mt-2 text-xs text-[var(--color-destructive)]">附加失败：{err}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
