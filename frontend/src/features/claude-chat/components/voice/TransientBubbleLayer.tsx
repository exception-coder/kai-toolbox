import { useEffect, useRef, useState } from 'react'

const BUBBLE_TTL = 4000

/** 监听一个文本，文本变化即「弹出」并在 TTL 后淡出；返回当前要显示的文本与可见态。 */
function useTransient(text: string | null): { text: string; shown: boolean } | null {
  const [shownText, setShownText] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const t = text?.trim()
    if (!t) return
    setShownText(t)
    setVisible(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setVisible(false), BUBBLE_TTL)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [text])

  if (!shownText) return null
  return { text: shownText, shown: visible }
}

/**
 * 鱼身弹出·瞬态气泡：最近 1 条用户转写（下方）+ 1 条 AI 回复（上方），
 * 弹出停留 BUBBLE_TTL 后淡出，不显示历史列表。
 */
export function TransientBubbleLayer({ userText, aiText }: { userText: string | null; aiText: string | null }) {
  const user = useTransient(userText)
  const ai = useTransient(aiText)

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between px-6 py-[18%]">
      <div className="flex max-w-[88%] justify-center">
        {ai && (
          <div
            className={`max-h-[28vh] overflow-hidden rounded-2xl bg-white/12 px-4 py-2.5 text-center text-sm leading-relaxed text-white/95 backdrop-blur-md transition-all duration-500 [overflow-wrap:anywhere] ${ai.shown ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0'}`}
          >
            {ai.text}
          </div>
        )}
      </div>
      <div className="flex max-w-[88%] justify-center">
        {user && (
          <div
            className={`rounded-2xl bg-[var(--color-primary)]/85 px-4 py-2 text-center text-sm text-[var(--color-primary-foreground)] transition-all duration-500 [overflow-wrap:anywhere] ${user.shown ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
          >
            {user.text}
          </div>
        )}
      </div>
    </div>
  )
}
