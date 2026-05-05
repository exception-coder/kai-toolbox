import { useRef, useState } from 'react'
import { Send, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Peer } from '../types'

interface FileSenderProps {
  peers: Peer[]
  onSend: (peerDeviceId: string, file: File) => void
  onBroadcast: (file: File) => void
}

const SOFT_LIMIT_BYTES = 1024 * 1024 * 1024 // 1GB

export function FileSender({ peers, onSend, onBroadcast }: FileSenderProps) {
  const [target, setTarget] = useState<string>('all')
  const inputRef = useRef<HTMLInputElement>(null)

  const handlePicked = (file: File) => {
    if (file.size > SOFT_LIMIT_BYTES) {
      const ok = confirm(`文件 ${(file.size / (1 << 30)).toFixed(2)} GB 较大，浏览器内存可能不足，确定继续吗？`)
      if (!ok) return
    }
    if (target === 'all') onBroadcast(file)
    else onSend(target, file)
  }

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="font-medium mb-3">发送文件</h3>
        {peers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            房间里暂时只有自己，等其他人加入后再发送。
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">目标</label>
              <select
                value={target}
                onChange={e => setTarget(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="all">全员（{peers.length} 人）</option>
                {peers.map(p => (
                  <option key={p.deviceId} value={p.deviceId}>{p.nickname}</option>
                ))}
              </select>
            </div>
            <div>
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handlePicked(file)
                  e.target.value = ''
                }}
              />
              <Button onClick={() => inputRef.current?.click()} className="w-full">
                {target === 'all' ? <Send className="mr-1 h-4 w-4" /> : <Upload className="mr-1 h-4 w-4" />}
                选择文件并发送
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
