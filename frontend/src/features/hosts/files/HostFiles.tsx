import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  Root as Dialog,
  Portal as DialogPortal,
  Overlay as DialogOverlay,
  Content as DialogContent,
  Title as DialogTitle,
  Description as DialogDescription,
  Close as DialogClose,
} from '@radix-ui/react-dialog'
import type { HostView } from '../types'
import { listFiles, readFile, uploadFile, type FileEntry } from './api'

export function HostFiles({
  host,
  onClose,
}: {
  host: HostView
  onClose: () => void
}) {
  const [path, setPath] = useState('.')
  const [input, setInput] = useState('.')
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [expected, setExpected] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const listing = useQuery({
    queryKey: ['host-files', host.id, path],
    queryFn: () => listFiles(host.id, path),
    retry: false,
  })
  const clearLocalFile = () => {
    setFile(null)
    if (fileInput.current) fileInput.current.value = ''
  }
  const resetTarget = () => {
    clearLocalFile()
    setName('')
    setExpected(undefined)
    setFeedback('')
    setError('')
  }
  const navigate = (next: string) => {
    setPath(next)
    setInput(next)
    resetTarget()
  }
  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败，请重试')
    } finally {
      setBusy(false)
    }
  }
  const remote = (entry: FileEntry) => `${listing.data!.path}/${entry.name}`
  const download = (entry: FileEntry) =>
    run(async () => {
      const data = await readFile(host.id, remote(entry))
      const url = URL.createObjectURL(data.blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = entry.name
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    })
  const prepareReplace = (entry: FileEntry) =>
    run(async () => {
      const data = await readFile(host.id, remote(entry))
      if (!data.sha256) throw new Error('没有获得远端摘要，无法确认替换')
      clearLocalFile()
      setName(entry.name)
      setExpected(data.sha256)
      setFeedback(`已核对 ${entry.name}；选择本地文件后点击“备份并替换”。`)
    })
  const upload = () =>
    run(async () => {
      if (!file || !listing.data) return
      if (file.size > 20 * 1024 * 1024)
        throw new Error('单个文件不能超过 20 MiB')
      const result = await uploadFile(
        host.id,
        listing.data.path,
        name || file.name,
        file,
        expected,
      )
      setFeedback(
        `已上传 ${result.path}${result.backup ? `；原文件备份：${result.backup}` : ''}`,
      )
      setExpected(undefined)
      clearLocalFile()
      setName('')
      await listing.refetch()
    })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 bg-black/30" />
        <DialogContent className="fixed left-1/2 top-1/2 z-50 grid max-h-[90dvh] w-[min(92vw,56rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border bg-[var(--color-background)] p-4 shadow-lg">
          <DialogClose asChild>
            <Button
              variant="ghost"
              className="justify-self-end"
              disabled={busy}
            >
              关闭
            </Button>
          </DialogClose>
          <header className="space-y-1">
            <DialogTitle>SFTP 文件 · {host.name}</DialogTitle>
            <DialogDescription>
              {host.username}@{host.host}:{host.port} · Linux / Windows ·
              单文件最多 20 MiB
            </DialogDescription>
          </header>
          <p className="text-xs text-muted-foreground">
            使用服务器返回的路径；Windows 可输入 C:/目录。SSH 密钥须先在 Forge
            服务账号的 ~/.ssh/known_hosts 中受信任。此处不执行远端命令。
          </p>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              navigate(input)
            }}
          >
            <input
              aria-label="远端目录"
              className="min-w-0 flex-1 rounded border bg-background px-3 py-2 font-mono text-sm"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
            />
            <Button disabled={busy || listing.isFetching}>打开目录</Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || listing.isFetching}
              onClick={() => void listing.refetch()}
            >
              刷新
            </Button>
          </form>
          <p className="break-all font-mono text-xs">
            {listing.data?.path ?? path}
          </p>
          {listing.isPending && <p role="status">正在连接并读取目录…</p>}
          {(error || listing.error) && (
            <p role="alert" className="text-sm text-destructive">
              {error || listing.error?.message}
              。目录与选择已保留，可修正后重试。
            </p>
          )}
          {feedback && (
            <p role="status" className="break-all text-sm">
              {feedback}
            </p>
          )}
          {listing.data?.truncated && (
            <p role="status">仅显示前 1000 项，请进入具体子目录。</p>
          )}
          <div className="max-h-72 overflow-auto border-y">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">名称</th>
                  <th className="p-2">大小</th>
                  <th className="p-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {listing.data?.entries.map((entry) => (
                  <tr key={entry.name} className="border-t">
                    <td className="max-w-64 break-all p-2">
                      {entry.directory
                        ? '目录 · '
                        : entry.link
                          ? '链接 · '
                          : ''}
                      {entry.name}
                    </td>
                    <td className="p-2 tabular-nums">{entry.size}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        {entry.directory && !entry.link ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => navigate(remote(entry))}
                          >
                            进入
                          </Button>
                        ) : (
                          !entry.link && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                onClick={() => void download(entry)}
                              >
                                下载
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => void prepareReplace(entry)}
                              >
                                准备替换
                              </Button>
                            </>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {listing.data?.entries.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                目录为空，可以上传新文件。
              </p>
            )}
          </div>
          <section className="space-y-3">
            <h3 className="text-sm font-medium">
              {expected
                ? '替换已核对的远端文件'
                : '上传新文件（不会覆盖同名文件）'}
            </h3>
            <label className="block text-sm">
              本地文件
              <input
                type="file"
                ref={fileInput}
                aria-label="本地文件"
                disabled={busy}
                className="mt-1 block max-w-full text-sm"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="block text-sm">
              远端文件名
              <input
                aria-label="远端文件名"
                disabled={busy || !!expected}
                value={name}
                placeholder={file?.name ?? '保留本地文件名'}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded border bg-background px-3 py-2"
              />
            </label>
            <div className="flex gap-2">
              <Button
                disabled={busy || !file || !listing.data || listing.isFetching}
                onClick={() => void upload()}
              >
                {busy ? '传输中…' : expected ? '备份并替换' : '上传新文件'}
              </Button>
              {expected && (
                <Button variant="ghost" disabled={busy} onClick={resetTarget}>
                  取消替换
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              替换会保留同目录 .forge-backup
              文件。网络中断导致结果不明时先刷新核对，勿直接重复覆盖。备份可下载，恢复时同样重新确认摘要。
            </p>
          </section>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  )
}
