import { useEffect, useState } from 'react'
import { Grab, Hand } from 'lucide-react'

export interface GestureFlash {
  kind: 'grab' | 'open'
  id: number
}

/**
 * 手势识别的帅气动效反馈：识别到「抓握」或「展开」时，屏幕中央爆一个带涟漪的图标 + 文案，
 * ~1s 自动消失。纯展示层（pointer-events-none，不挡操作），挂在 ChatRuntime 顶层，任意页面可见。
 */
export function GestureFlourish({ flash, onDone }: { flash: GestureFlash | null; onDone: () => void }) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (!flash) return
    setShown(false)
    const rin = requestAnimationFrame(() => setShown(true)) // 下一帧触发入场过渡
    const tOut = setTimeout(() => setShown(false), 750)      // 先淡出
    const tDone = setTimeout(onDone, 1000)                    // 再卸载
    return () => { cancelAnimationFrame(rin); clearTimeout(tOut); clearTimeout(tDone) }
  }, [flash, onDone])

  if (!flash) return null
  const grab = flash.kind === 'grab'
  const ring = grab ? 'bg-violet-500' : 'bg-emerald-500'
  const label = grab ? '抓握 · 弹出悬浮窗' : '展开 · 返回 Vibe Coding'

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center">
      <div className={`flex flex-col items-center gap-3 transition-all duration-300 ${shown ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}>
        <div className="relative flex size-28 items-center justify-center">
          {/* 涟漪 */}
          <span className={`absolute inset-0 rounded-full ${ring} opacity-30 animate-ping`} />
          <span className={`absolute inset-2 rounded-full ${ring} opacity-20 animate-ping`} style={{ animationDelay: '150ms' }} />
          {/* 主体圆 */}
          <span className={`relative flex size-20 items-center justify-center rounded-full ${ring} text-white shadow-2xl`}>
            {grab ? <Grab className="size-10" /> : <Hand className="size-10" />}
          </span>
        </div>
        <span className="rounded-full bg-black/70 px-3 py-1 text-sm font-medium text-white shadow-lg backdrop-blur">
          {label}
        </span>
      </div>
    </div>
  )
}
