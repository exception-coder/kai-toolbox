import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { http } from '@/lib/api'

interface Preview {
  mimeType: string
  imageBase64: string
  kind: 'slides' | 'structure'
  notes: string[]
  page: number
  totalPages: number
}

/** 按需鉴权读取预览，不通过公开图片地址绕过咨询归属检查。 */
export function ConsultDocumentPreview({ sessionId, id, name }: { sessionId: string; id: string; name: string }) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [imageError, setImageError] = useState(false)
  const query = useQuery({
    queryKey: ['consult-document-preview', sessionId, id, page],
    enabled: open,
    retry: false,
    queryFn: async () => {
      const result = await http<Preview>(`/fore-consult/sessions/${encodeURIComponent(sessionId)}/documents/${id}/preview?page=${page}`)
      if (result.mimeType !== 'image/png' || !/^[A-Za-z0-9+/=]+$/.test(result.imageBase64)
        || result.imageBase64.length > 3_000_000) throw new Error('预览格式无效')
      return result
    },
  })
  function retry() { setImageError(false); void query.refetch() }
  return <details className="w-full min-w-0 text-xs text-slate-500" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="flex min-h-11 cursor-pointer items-center py-2 underline">预览 {name}</summary>
    {open && <div className="space-y-2 pb-3">
      {query.isPending && <p role="status">正在生成预览…</p>}
      {(query.isError || imageError) && <div role="alert">预览暂不可用，已生成文件仍可下载。
        <button type="button" className="ml-2 min-h-11 underline" onClick={retry}>重新加载预览</button>
      </div>}
      {query.data && !imageError && <>
        <p>{query.data.kind === 'slides' ? 'PPT 实际渲染' : '结构预览 · 最终排版请打开文件检查'}</p>
        <div className="max-h-[60dvh] overflow-auto rounded-lg border border-slate-200" tabIndex={0} aria-label={`${name}的预览图`}>
          <img src={`data:image/png;base64,${query.data.imageBase64}`} alt={`${name}预览`} className="h-auto w-full" onError={() => setImageError(true)} />
        </div>
        {query.data.notes.map((note, index) => <p key={index} className="leading-relaxed">{note}</p>)}
        {query.data.kind === 'slides' && query.data.totalPages > 4 && <div className="flex items-center gap-3">
          <button type="button" className="min-h-11 underline disabled:opacity-40" disabled={page === 1} onClick={() => setPage(page - 4)}>上一组</button>
          <span>{page}–{Math.min(page + 3, query.data.totalPages)} / {query.data.totalPages} 页</span>
          <button type="button" className="min-h-11 underline disabled:opacity-40" disabled={page + 4 > query.data.totalPages} onClick={() => setPage(page + 4)}>下一组</button>
        </div>}
      </>}
    </div>}
  </details>
}
