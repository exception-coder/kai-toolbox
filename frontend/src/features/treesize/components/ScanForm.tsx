import { useState } from 'react'
import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'

interface ScanFormProps {
  onStart: (path: string) => void
  disabled?: boolean
}

export function ScanForm({ onStart, disabled }: ScanFormProps) {
  const [path, setPath] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = path.trim()
    if (!trimmed) return
    onStart(trimmed)
  }

  return (
    <Card>
      <CardContent className="p-4">
        <form onSubmit={submit} className="flex items-center gap-2">
          <Input
            value={path}
            onChange={e => setPath(e.target.value)}
            placeholder="输入要扫描的目录绝对路径，例如 D:\\Users\\zhang"
            className="flex-1"
            disabled={disabled}
          />
          <Button type="submit" disabled={disabled || !path.trim()}>
            <Play className="mr-1 h-4 w-4" />
            开始扫描
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
