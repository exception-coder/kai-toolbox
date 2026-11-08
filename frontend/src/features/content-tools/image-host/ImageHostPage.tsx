import { useEffect, useRef, useState } from 'react'
import { Copy, ImagePlus, Plus, RefreshCw, Settings2, Trash2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { listImageHosts, saveImageHost, deleteImageHost, recentImages, uploadImage, type HostProfile, type HostSave, type ImageReceipt } from './api'
import { ImageHostForm } from './ImageHostForm'

type Pending = { id: string; file: File; state: 'ready' | 'uncertain' }
const errorText = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试'
export function ImageHostPage({ active = true }: { embedded?: boolean; active?: boolean }) {
  const [profiles, setProfiles] = useState<HostProfile[]>([])
  const [selected, setSelected] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending[]>([])
  const [receipts, setReceipts] = useState<ImageReceipt[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const confirm = useConfirm()
  const input = useRef<HTMLInputElement>(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  async function refresh() {
    const [next, images] = await Promise.all([listImageHosts(), recentImages()])
    if (!alive.current) return
    setProfiles(next); setReceipts(images); setLoaded(true); setError('')
    setSelected(old => next.some(p => p.id === old) ? old : next.find(p => p.isDefault)?.id ?? next[0]?.id ?? '')
  }
  useEffect(() => { if (active && !loaded) void refresh().catch(e => { if (alive.current) setError(errorText(e)) }) }, [active, loaded])
  useEffect(() => { if (!notice) return; const timeout = window.setTimeout(() => setNotice(''), 3500); return () => window.clearTimeout(timeout) }, [notice])
  async function save(value: HostSave) {
    setBusy(true); setError('')
    try { const saved = await saveImageHost(editing === 'new' ? null : editing, value); await refresh(); setSelected(saved.id); setEditing(null); setNotice('图床配置已保存') }
    catch (e) { setError(errorText(e)); throw e }
    finally { setBusy(false) }
  }
  function addFiles(files: File[]) {
    if (busy) return
    const accepted = files.filter(f => ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(f.type) && f.size > 0 && f.size <= 10 * 1024 * 1024)
    if (accepted.length !== files.length) setError('只接受10MiB以内的 PNG、JPEG、GIF、WebP 图片，其他文件未加入')
    setPending(old => {
      const next = [...old, ...accepted.map(file => ({ id: crypto.randomUUID(), file, state: 'ready' as const }))]
      return next.slice(0,5)
    })
    if (pending.length + accepted.length > 5) setError('每批最多5张图片，请先完成当前批次')
  }
  async function upload() {
    if (!selected || busy) return
    setBusy(true); setError('')
    try {
      for (const item of pending.filter(p => p.state === 'ready')) {
        try {
          const receipt = await uploadImage(selected, item.file, item.id)
          setReceipts(old => [receipt, ...old.filter(r => r.requestId !== receipt.requestId)].slice(0,30))
          setPending(old => old.filter(p => p.id !== item.id))
        } catch (e) {
          setPending(old => old.map(p => p.id === item.id ? { ...p, state: 'uncertain' } : p))
          throw e
        }
      }
      setNotice('图片已上传，可复制 Markdown；请确认同事能访问图片链接')
    } catch (e) { setError(errorText(e)) }
    finally { setBusy(false) }
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setNotice('已复制') }
    catch { setError('剪贴板不可用，请选中下方文本手动复制') }
  }
  const successful = receipts.filter(r => r.state === 'SUCCESS')
  const profile = profiles.find(p => p.id === selected)
  return <div className="mx-auto max-w-5xl space-y-5 max-md:[&_button]:min-h-11 max-md:[&_button]:min-w-11 max-md:[&_input:not([type=checkbox])]:text-base max-md:[&_select]:text-base max-md:[&_label:has(input[type=checkbox])]:min-h-11">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Markdown 图床</h2><p className="mt-1 text-sm text-[var(--color-muted-foreground)]">配置存储、上传截图或绘图，复制可分享的图片引用。</p></div>
      <div className="flex gap-2"><Button variant="ghost" size="icon" disabled={busy} aria-label="刷新图床" onClick={() => void refresh().catch(e => setError(errorText(e)))}><RefreshCw /></Button><Button disabled={busy} onClick={() => setEditing('new')}><Plus />新增图床</Button></div></header>
    {error && <p role="alert" className="rounded-md border border-[var(--color-destructive)] p-3 text-sm text-[var(--color-destructive)]">{error}</p>}
    {notice && <p role="status" className="text-sm text-[var(--color-muted-foreground)]">{notice}</p>}
    {!loaded && !error && <p role="status">正在读取图床配置…</p>}
    {editing !== null && <ImageHostForm key={editing} profile={profiles.find(p => p.id === editing)} busy={busy} onSave={save} onClose={() => setEditing(null)} />}
    {loaded && profiles.length === 0 && editing === null && <div className="space-y-3 border-b pb-5"><p>还没有图床。先添加配置，再选择一张图片验证上传。</p><p className="text-sm text-[var(--color-muted-foreground)]">支持阿里云 OSS、GitHub，以及 S3 兼容的对象存储。其他常见服务还有腾讯 COS、七牛、又拍云、兰空图床和 WebDAV，当前未提供这些服务的专用适配器。</p><Button variant="outline" onClick={() => setEditing('new')}>配置第一套图床</Button></div>}
    {profiles.length > 0 && <>
      <div className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 space-y-1 text-sm">当前上传图床<select aria-label="当前上传图床" disabled={busy} className="block h-10 w-full min-w-0 rounded-md border bg-[var(--color-background)] px-3" value={selected} onChange={e => setSelected(e.target.value)}>{profiles.map(p => <option key={p.id} value={p.id}>{p.settings.name}{p.isDefault ? ' · 默认' : ''} · {p.settings.provider}</option>)}</select></label>
        <Button variant="outline" disabled={busy} aria-label="编辑当前图床" onClick={() => setEditing(selected)}><Settings2 />编辑</Button>
        <Button variant="ghost" disabled={busy} aria-label="删除当前图床" onClick={async () => {
          if (!profile || !await confirm({ title: `删除“${profile.settings.name}”配置？`, description: '仅移除本账号的连接配置，不删除远端图片和已有上传记录。', confirmText: '删除配置', variant: 'destructive' })) return
          setBusy(true); setError(''); try { await deleteImageHost(selected); await refresh(); setEditing(null); setNotice('配置已删除，远端图片保留') } catch(e) { setError(errorText(e)) } finally { setBusy(false) }
        }}><Trash2 /></Button></div>
      <section tabIndex={0} aria-label="图片上传区域" className="space-y-3 rounded-md border border-dashed p-4 focus-visible:outline-2 focus-visible:outline-[var(--color-ring)]"
        onPaste={e => { const files = Array.from(e.clipboardData.files); if (files.length) { e.preventDefault(); addFiles(files) } }}
        onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)) }}>
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="flex items-center gap-2 text-sm"><ImagePlus className="size-4" />在此粘贴截图、拖入图片，或选择文件</p><Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>选择图片</Button></div>
        <input ref={input} type="file" aria-label="选择要上传的图片" className="sr-only" accept="image/png,image/jpeg,image/gif,image/webp" multiple disabled={busy} onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
        <p className="text-xs text-[var(--color-muted-foreground)]">每批最多5张，每张10MiB。点击上传后才会发送到当前图床；请使用适合分享的图片。</p>
        {pending.map(p => <div key={p.id} className="flex min-w-0 items-center gap-2 border-t pt-2 text-sm"><span className="min-w-0 flex-1 break-all">{p.file.name} · {(p.file.size / 1024).toFixed(0)} KB{p.state === 'uncertain' && ' · 结果待核对，不会自动重试'}</span><Button variant="ghost" size="icon" disabled={busy} aria-label={`移除 ${p.file.name}`} onClick={() => setPending(old => old.filter(item => item.id !== p.id))}><X /></Button></div>)}
        <Button disabled={busy || !pending.some(p => p.state === 'ready')} onClick={() => void upload()}><Upload />{busy ? '处理中…' : `上传到${profile?.settings.name ?? '图床'}`}</Button>
      </section>
    </>}
    {receipts.length > 0 && <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">最近上传</h3><Button variant="outline" disabled={!successful.length} onClick={() => void copy(successful.map(r => r.markdown).join('\n\n'))}><Copy />复制本页 Markdown</Button></div>
      {receipts.map(r => <article key={r.requestId} className="space-y-2 border-t pt-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0 break-all text-sm">{r.fileName} · {r.state === 'SUCCESS' ? '已上传' : '结果待核对'}</span>{r.state === 'SUCCESS' && <div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => void copy(r.url)}>复制链接</Button><Button variant="outline" size="sm" onClick={() => void copy(r.markdown)}>复制 Markdown</Button></div>}</div>
        {r.state === 'SUCCESS' ? <textarea aria-label={`${r.fileName} Markdown`} readOnly value={r.markdown} className="block min-h-16 w-full resize-y rounded-md border bg-[var(--color-background)] p-2 font-mono text-xs" /> : <p className="break-all text-xs text-[var(--color-muted-foreground)]">请在存储端核对：{r.objectKey}。这不代表上传失败，不会自动重放。</p>}</article>)}
      <p className="text-xs text-[var(--color-muted-foreground)]">上传成功不代表外部可读；私有桶、防盗链、登录要求或存储服务限制可能影响同事查看。Forge 不会自动公开图片。</p>
    </section>}
  </div>
}
