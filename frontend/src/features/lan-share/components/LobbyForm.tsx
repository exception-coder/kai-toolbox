import { useState } from 'react'
import { LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'

interface LobbyFormProps {
  defaultNickname: string
  onJoin: (roomId: string, nickname: string) => void
}

const ROOM_ID_REGEX = /^[a-zA-Z0-9_\-一-龥]{1,64}$/

export function LobbyForm({ defaultNickname, onJoin }: LobbyFormProps) {
  const [roomId, setRoomId] = useState('')
  const [nickname, setNickname] = useState(defaultNickname)
  const [error, setError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const r = roomId.trim()
    const n = nickname.trim()
    if (!ROOM_ID_REGEX.test(r)) {
      setError('房间号需 1-64 字符，仅允许字母/数字/下划线/中划线/中文')
      return
    }
    if (!n) {
      setError('昵称不能为空')
      return
    }
    setError(null)
    onJoin(r, n)
  }

  return (
    <div className="mx-auto max-w-md mt-12">
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4">加入房间</h2>
          <p className="text-sm text-muted-foreground mb-4">
            输入相同房间号的设备会被分到同一组，组内可互传文件。
          </p>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">房间号</label>
              <Input
                value={roomId}
                onChange={e => setRoomId(e.target.value)}
                placeholder="任意字符串，如 abc123 或 我的房间"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">昵称（房间内可见）</label>
              <Input
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                placeholder="例如 我的电脑"
                maxLength={32}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full">
              <LogIn className="mr-1 h-4 w-4" />
              加入
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
