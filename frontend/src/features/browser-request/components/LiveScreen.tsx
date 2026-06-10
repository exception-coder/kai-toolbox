import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { sessions as api } from '../api'

/**
 * 实时画面：轮询会话浏览器的截图显示出来（移动端看不到桌面窗口也能看渲染图，如扫码二维码），
 * 点击图片 = 远程点触（归一化坐标发给后端→sidecar/manager 在视口对应位置点击）。
 * Phase A：截图轮询 + 点击；键盘输入后续再加。
 */
export function LiveScreen({ sessionId }: { sessionId: string }) {
  const [tick, setTick] = useState(() => Date.now())
  const [auto, setAuto] = useState(true)
  const [status, setStatus] = useState<string>('')

  useEffect(() => { setTick(Date.now()) }, [sessionId])
  useEffect(() => {
    if (!auto) return
    const t = setInterval(() => setTick(Date.now()), 1500)
    return () => clearInterval(t)
  }, [auto, sessionId])

  const src = `${api.screenshotUrl(sessionId)}&t=${tick}`

  const onClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const fx = (e.clientX - r.left) / r.width
    const fy = (e.clientY - r.top) / r.height
    api.click(sessionId, fx, fy)
      .then(() => setTimeout(() => setTick(Date.now()), 500))
      .catch(() => {})
  }

  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">
            实时画面 <span className="text-xs text-[var(--color-muted-foreground)]">（点图=远程点触）</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />
              自动刷新
            </label>
            <Button size="sm" variant="outline" onClick={() => setTick(Date.now())}>刷新</Button>
          </div>
        </div>
        <div className="flex justify-center overflow-hidden rounded border bg-black/5">
          <img
            src={src}
            alt="live"
            onClick={onClick}
            onError={() => setStatus('无画面：请确认会话已「打开」（免检测会话的浏览器窗口在桌面，这里看实时图）')}
            onLoad={() => setStatus('')}
            // 同时受列宽(max-w-full)与视口高(max-h-[70vh])约束、按比例缩放：窗口多大图多大、整帧完整、不出滚动条。
            // 不用 object-contain（会留黑边letterbox→点触坐标按 img rect 归一化会偏），让 img 盒子刚好等于渲染图。
            className="block h-auto max-h-[70vh] w-auto max-w-full cursor-crosshair select-none"
            draggable={false}
          />
        </div>
        {status && <div className="text-xs text-amber-600 dark:text-amber-400">{status}</div>}
      </CardContent>
    </Card>
  )
}
