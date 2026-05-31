import { useState } from 'react'
import { MonitorCog, Play, Server } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { HostPicker } from '@/components/host-picker'
import type { ScanSourceType, StartScanPayload } from '../types'

interface ScanFormProps {
  onStart: (payload: StartScanPayload) => void
  disabled?: boolean
}

/**
 * 磁盘扫描入口表单。
 *
 * <p>之前内嵌了一整套 SSH 主机增删改 UI；现已外提到全局的「主机管理」模块，
 * 这里只剩一个 {@link HostPicker} 下拉框。
 */
export function ScanForm({ onStart, disabled }: ScanFormProps) {
  const [sourceType, setSourceType] = useState<ScanSourceType>('LOCAL_WINDOWS')
  const [path, setPath] = useState('')
  const [sshHostId, setSshHostId] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = path.trim()
    if (!trimmed) return
    if (sourceType === 'SSH' && !sshHostId) return
    onStart({
      path: trimmed,
      sourceType,
      sshHostId: sourceType === 'SSH' ? sshHostId : null,
    })
  }

  const canStart = path.trim() && (sourceType === 'LOCAL_WINDOWS' || sshHostId)

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={sourceType === 'LOCAL_WINDOWS' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSourceType('LOCAL_WINDOWS')}
              disabled={disabled}
            >
              <MonitorCog />
              本地 Windows
            </Button>
            <Button
              type="button"
              variant={sourceType === 'SSH' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSourceType('SSH')}
              disabled={disabled}
            >
              <Server />
              远端 SSH 主机
            </Button>
          </div>

          {sourceType === 'SSH' && (
            <div className="rounded-md border bg-[var(--color-muted)]/20 p-3">
              <HostPicker value={sshHostId} onChange={setSshHostId} />
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={path}
              onChange={e => setPath(e.target.value)}
              placeholder={
                sourceType === 'SSH'
                  ? '输入远程目录，例如 /var/log 或 /data'
                  : '输入本地目录绝对路径，例如 D:\\Users\\zhang'
              }
              className="flex-1"
              disabled={disabled}
            />
            <Button type="submit" disabled={disabled || !canStart}>
              <Play />
              开始扫描
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
