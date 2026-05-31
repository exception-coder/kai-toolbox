import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { ApiError } from '@/lib/api'
import { downloaderApi } from '../services/downloaderApi'
import type { HttpEngineType } from '../types'

export function NewTaskForm() {
  const [url, setUrl] = useState('')
  const [savePath, setSavePath] = useState('')
  const [engine, setEngine] = useState<HttpEngineType>('JDK')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => downloaderApi.create({
      url: url.trim(),
      savePath: savePath.trim() || undefined,
      httpEngine: engine,
    }),
    onSuccess: () => {
      setUrl('')
      qc.invalidateQueries({ queryKey: ['downloader', 'tasks'] })
    },
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    mutation.mutate()
  }

  const error = mutation.error as ApiError | null

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--color-muted-foreground)]">下载链接</label>
            <Input
              type="url"
              placeholder="粘贴 HTTP/HTTPS 直链，例如 https://dl.feishu.cn/.../Lark-win32_x64-7.67.10-signed.exe"
              value={url}
              onChange={e => setUrl(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
              保存目录 <span className="opacity-60">（留空走 ~/Downloads/kai-toolbox）</span>
            </label>
            <Input
              type="text"
              placeholder="D:/Downloads/kai-toolbox"
              value={savePath}
              onChange={e => setSavePath(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
              HTTP 引擎 <span className="opacity-60">（对比测试用）</span>
            </label>
            <div className="flex gap-2">
              <EngineRadio current={engine} value="JDK" onChange={setEngine}
                title="JDK java.net.http"
                desc="原生零依赖 + 自写守门狗治 stalled" />
              <EngineRadio current={engine} value="OKHTTP" onChange={setEngine}
                title="OkHttp 4.12"
                desc="原生 readTimeout，无需守门狗；+2MB 依赖" />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Button
              type="submit"
              size="lg"
              className="shadow-md"
              disabled={!url.trim() || mutation.isPending}
            >
              <Download />
              {mutation.isPending ? '创建中…' : '开始下载'}
            </Button>
            <span className="text-xs text-[var(--color-muted-foreground)]">
              创建后会自动探测直连/代理速度，挑更快的链路分段并发下载
            </span>
          </div>
        </form>
        {error && (
          <div className="rounded-md border border-[var(--color-destructive)]/50 bg-[var(--color-destructive)]/10 p-3 text-sm text-[var(--color-destructive)]">
            创建失败：{error.message}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface EngineRadioProps {
  current: HttpEngineType
  value: HttpEngineType
  title: string
  desc: string
  onChange: (v: HttpEngineType) => void
}

function EngineRadio({ current, value, title, desc, onChange }: EngineRadioProps) {
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
