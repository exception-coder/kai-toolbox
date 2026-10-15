import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Loader2 } from 'lucide-react'
import { http } from '@/lib/api'
import { downloadConsultDocument } from '../consultDocuments'
import { ConsultDocumentPreview } from './ConsultDocumentPreview'

interface ConsultDocument {
  id: string
  name: string
  format: 'docx' | 'xlsx' | 'pptx'
  bytes: number
  storagePath: string
  downloadUrl: string
}

/** 在原咨询及归档中找回产物；没有文档时不占据聊天空间。 */
export function ConsultDocuments({ sessionId, running = false }: { sessionId: string; running?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const query = useQuery({
    queryKey: ['consult-documents', sessionId, running],
    queryFn: () => http<ConsultDocument[]>(`/fore-consult/sessions/${encodeURIComponent(sessionId)}/documents`),
    refetchInterval: running ? 5000 : false,
  })
  async function download(file: ConsultDocument) {
    setBusy(file.id)
    setError(null)
    try { await downloadConsultDocument(file.downloadUrl, file.name) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '下载失败，请重试') }
    finally { setBusy(null) }
  }
  if (query.isError) return <div className="flex items-center gap-3 py-2 text-xs text-slate-500">
    文档列表读取失败
    <button type="button" className="min-h-11 underline" onClick={() => void query.refetch()}>重试</button>
  </div>
  if (!query.data?.length) return null
  return <section aria-label="生成的文档" className="border-t border-slate-200 pt-3 text-sm text-slate-700">
    <details open>
      <summary className="cursor-pointer text-xs font-medium text-slate-500">生成的文档 · {query.data.length}</summary>
      <ul className="mt-1 divide-y divide-slate-100">
        {query.data.map(file => <li key={file.id} className="min-w-0 py-1">
          <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words font-medium">{file.name}</p>
            <p className="text-[11px] text-slate-500">{Math.max(1, Math.round(file.bytes / 1024))} KB · {file.format.toUpperCase()}</p>
            <details className="text-[11px] text-slate-500">
              <summary className="cursor-pointer py-1">保存位置</summary>
              <p className="break-all pb-1">服务端用户目录 / {file.storagePath}</p>
            </details>
          </div>
          <button type="button" className="flex min-h-11 shrink-0 items-center gap-1 rounded-md px-3 hover:bg-slate-100 disabled:opacity-50"
            aria-label={`下载 ${file.name}`} disabled={busy !== null} onClick={() => void download(file)}>
            {busy === file.id ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}下载
          </button>
          </div>
          <ConsultDocumentPreview key={`${sessionId}:${file.id}`} sessionId={sessionId} id={file.id} name={file.name} />
        </li>)}
      </ul>
    </details>
    {error && <div role="alert" className="flex items-center gap-2 py-2 text-xs text-red-700">
      <span>{error}，可再次点击下载。</span>
      <button type="button" className="min-h-11 shrink-0 underline" onClick={() => void query.refetch()}>刷新列表</button>
    </div>}
  </section>
}
