import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Magnet, Upload, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { ApiError } from '@/lib/api'
import { magnetApi } from '../services/magnetApi'

type Mode = 'uri' | 'torrent'

export function NewMagnetForm() {
  const [mode, setMode] = useState<Mode>('uri')
  const [uri, setUri] = useState('')
  const [savePath, setSavePath] = useState('')
  const [torrentFile, setTorrentFile] = useState<File | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const qc = useQueryClient()

  const uriMutation = useMutation({
    mutationFn: () => magnetApi.addUri({
      uri: uri.trim(),
      savePath: savePath.trim() || undefined,
    }),
    onSuccess: res => {
      setUri('')
      setHint(res.resolvedByCache
        ? '⚡ 命中公共种子缓存,已跳过 DHT metadata,直接开始下载'
        : '已交给 aria2 走 DHT 解析(缓存未命中,可能要等几十秒到几分钟拉 metadata)')
      qc.invalidateQueries({ queryKey: ['magnet', 'tasks'] })
    },
  })

  const torrentMutation = useMutation({
    mutationFn: async () => {
      if (!torrentFile) throw new Error('请选择 .torrent 文件')
      const buf = await torrentFile.arrayBuffer()
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
      return magnetApi.addTorrent({
        contentBase64: b64,
        savePath: savePath.trim() || undefined,
      })
    },
    onSuccess: () => {
      setTorrentFile(null)
      setHint('已交给 aria2 开始下载')
      qc.invalidateQueries({ queryKey: ['magnet', 'tasks'] })
    },
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setHint(null)
    if (mode === 'uri') uriMutation.mutate()
    else torrentMutation.mutate()
  }

  const error = (uriMutation.error ?? torrentMutation.error) as ApiError | null
  const pending = uriMutation.isPending || torrentMutation.isPending

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex gap-2">
          <ModeTab current={mode} value="uri" onChange={setMode}
            title="磁力链接 / 直链" desc="magnet:?xt= / http(s):// / ftp://" />
          <ModeTab current={mode} value="torrent" onChange={setMode}
            title="种子文件" desc="上传本地 .torrent" />
        </div>

        <form className="space-y-3" onSubmit={submit}>
          {mode === 'uri' ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--color-muted-foreground)]">URI</label>
              <Input
                placeholder="magnet:?xt=urn:btih:... 或 https://example.com/file.zip"
                value={uri}
                onChange={e => setUri(e.target.value)}
                autoFocus
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--color-muted-foreground)]">.torrent 文件</label>
              <Input
                type="file"
                accept=".torrent,application/x-bittorrent"
                onChange={e => setTorrentFile(e.target.files?.[0] ?? null)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
              保存目录 <span className="opacity-60">（留空走默认目录 ~/Downloads/kai-toolbox-magnet）</span>
            </label>
            <Input
              placeholder="D:/Downloads/kai-toolbox-magnet"
              value={savePath}
              onChange={e => setSavePath(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" size="lg" className="shadow-md"
              disabled={pending || (mode === 'uri' ? !uri.trim() : !torrentFile)}>
              {mode === 'uri' ? <Magnet /> : <Upload />}
              {pending ? '提交中…' : '开始下载'}
            </Button>
            <span className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
              <Zap className="size-3.5" />
              磁力提交时先并发查公共种子缓存,命中即跳过 DHT metadata 阶段
            </span>
          </div>
        </form>

        {hint && !error && (
          <div className="rounded-md border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-2.5 text-xs text-[var(--color-foreground)]">
            {hint}
          </div>
        )}

        {error && (
          <div className="rounded-md border border-[var(--color-destructive)]/50 bg-[var(--color-destructive)]/10 p-3 text-sm text-[var(--color-destructive)]">
            {error.message}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface ModeTabProps {
  current: Mode
  value: Mode
  title: string
  desc: string
  onChange: (v: Mode) => void
}

function ModeTab({ current, value, title, desc, onChange }: ModeTabProps) {
  const checked = current === value
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={
        'flex flex-1 flex-col items-start gap-0.5 rounded-md border p-2.5 text-left transition-colors ' +
        (checked
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
          : 'hover:bg-[var(--color-accent)]')
      }
      aria-pressed={checked}
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="text-[11px] text-[var(--color-muted-foreground)]">{desc}</div>
    </button>
  )
}
