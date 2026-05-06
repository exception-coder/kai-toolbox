import { useState } from 'react'
import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'

interface ScanFormProps {
  onStart: (sourcePath: string, targetPath: string) => void
  disabled?: boolean
}

export function ScanForm({ onStart, disabled }: ScanFormProps) {
  const [source, setSource] = useState('')
  const [target, setTarget] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const s = source.trim()
    const t = target.trim()
    if (!s || !t) return
    onStart(s, t)
  }

  return (
    <Card>
      <CardContent className="p-4">
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
          <label className="flex flex-col gap-1 text-xs text-[var(--color-muted-foreground)]">
            源目录（递归遍历）
            <Input
              value={source}
              onChange={e => setSource(e.target.value)}
              placeholder="如 D:\\Users\\zhang\\Downloads"
              disabled={disabled}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--color-muted-foreground)]">
            目标目录（平铺到此）
            <Input
              value={target}
              onChange={e => setTarget(e.target.value)}
              placeholder="如 D:\\Users\\zhang\\Archive"
              disabled={disabled}
            />
          </label>
          <Button type="submit" disabled={disabled || !source.trim() || !target.trim()} className="md:self-end">
            <Play className="mr-1 h-4 w-4" />
            开始扫描
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
