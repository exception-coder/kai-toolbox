import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowUp, ChevronRight, Folder } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { browseWorkingDirectory, listDirectoryRoots } from '../api/workingDirectories'

export function WorkingDirectoryPicker({ initialPath, onSelect, onCancel }: {
  initialPath: string
  onSelect: (path: string) => void
  onCancel: () => void
}) {
  const [path, setPath] = useState(initialPath.trim())
  const roots = useQuery({ queryKey: ['working-directory-roots'], queryFn: listDirectoryRoots, retry: false })
  const listing = useQuery({ queryKey: ['working-directory', path], queryFn: () => browseWorkingDirectory(path), retry: false })
  const current = listing.data
  const root = roots.data?.find(value => (current?.path ?? path).toLowerCase().startsWith(value.toLowerCase())) ?? ''
  return (
    <section aria-label="浏览工作目录" className="mt-3 min-w-0 space-y-3 border-y py-3">
      <p className="text-xs text-[var(--color-muted-foreground)]">浏览 Forge 所在电脑的目录，选用后沿用原有路径记忆。</p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="vibe-directory-drive" className="text-xs">盘符 / 根目录</label>
        <select id="vibe-directory-drive" className="h-10 min-w-24 rounded-md border bg-[var(--color-background)] px-2 text-sm"
          value={root} onChange={event => setPath(event.target.value)} disabled={!roots.data?.length}>
          <option value="" disabled>{roots.isPending ? '加载中…' : '选择盘符'}</option>
          {roots.data?.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        <Button variant="outline" disabled={!current?.parent || listing.isFetching} onClick={() => current?.parent && setPath(current.parent)}>
          <ArrowUp className="size-4" />上一级
        </Button>
      </div>
      <p className="break-all text-xs" aria-label="当前浏览目录">{(current?.path ?? path) || '用户主目录'}</p>
      {roots.isError && <p role="alert" className="text-xs text-[var(--color-destructive)]">盘符加载失败。<button type="button" className="underline" onClick={() => void roots.refetch()}>重试盘符</button></p>}
      {listing.isPending || listing.isFetching ? <p role="status" className="py-3 text-sm text-[var(--color-muted-foreground)]">正在读取目录…</p>
        : listing.isError ? <div role="alert" className="space-y-2 text-sm"><p>{listing.error.message}</p><Button variant="outline" onClick={() => void listing.refetch()}>重试目录</Button><p className="text-xs">可以切换盘符，或收起后直接输入目录路径。</p></div>
        : <div className="max-h-64 overflow-y-auto overscroll-contain" aria-label="子目录">
          {current?.directories.length === 0 && <p className="py-3 text-sm text-[var(--color-muted-foreground)]">没有可进入的子目录，可以选用当前目录。</p>}
          {current?.directories.map(directory => <button type="button" key={directory.path}
            onClick={() => setPath(directory.path)} className="flex min-h-11 w-full items-center gap-2 border-b px-1 py-2 text-left text-sm hover:bg-[var(--color-muted)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]">
            <Folder className="size-4 shrink-0" /><span className="min-w-0 flex-1 break-all">{directory.name}</span><ChevronRight className="size-4 shrink-0" />
          </button>)}
        </div>}
      {current?.truncated && <p role="status" className="text-xs text-[var(--color-muted-foreground)]">目录较多，仅列出其中 500 个；可收起后直接填写完整路径。</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!current || listing.isFetching || listing.isError} onClick={() => current && onSelect(current.path)}>使用此目录</Button>
        <Button variant="ghost" onClick={onCancel}>收起</Button>
      </div>
    </section>
  )
}
