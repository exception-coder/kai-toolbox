import { useEffect, useRef, useState } from 'react'

/**
 * 「进行时」措辞：模仿 Claude Code 在干活时轮换的那串 -ing 状态词（Orchestrating… / Sautéed…）。
 * 纯装饰、客户端轮换，与真实工作内容无关；计时是真实的。用中文语感的动词，配上「中…」读起来自然。
 */
const GERUNDS = [
  '思考', '运筹', '编排', '推敲', '拆解', '打磨', '琢磨', '梳理',
  '演算', '构思', '斟酌', '盘算', '钻研', '翻找', '捣鼓', '炮制',
  '熬煮', '雕琢', '筹谋', '捉摸', '拼装', '校对', '权衡', '组织',
]

/** 顺着上一个词往后取，避免连续重复（长度足够时保证换新词）。 */
function nextWord(prev: string): string {
  if (GERUNDS.length <= 1) return GERUNDS[0]
  let w = prev
  while (w === prev) w = GERUNDS[Math.floor(Math.random() * GERUNDS.length)]
  return w
}

/**
 * agent 干活时底部的动态状态：脉冲圆点 + 轮换的「XX 中…」措辞 + 已用秒数。
 * 每次挂载（running 变 true）重置计时；卸载即停。放在 MessageList 底部，主聊天/分屏/悬浮窗通用。
 */
export function ThinkingIndicator({ engineLabel = 'Claude', tokens = 0 }: { engineLabel?: string; tokens?: number }) {
  const [word, setWord] = useState(() => GERUNDS[Math.floor(Math.random() * GERUNDS.length)])
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())

  useEffect(() => {
    startRef.current = Date.now()
    setElapsed(0)
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000)
    const rot = setInterval(() => setWord(prev => nextWord(prev)), 3200)
    return () => { clearInterval(tick); clearInterval(rot) }
  }, [])

  return (
    <div className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
      <span className="inline-flex gap-0.5" aria-hidden>
        <span className="size-1.5 animate-bounce rounded-full bg-[var(--color-primary)] [animation-delay:-0.3s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-[var(--color-primary)] [animation-delay:-0.15s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-[var(--color-primary)]" />
      </span>
      <span>{engineLabel} {word}中…</span>
      {elapsed >= 2 && <span className="tabular-nums text-xs opacity-70">· {elapsed}s</span>}
      {tokens > 0 && <span className="tabular-nums text-xs opacity-70">· ↓ {tokens} tokens</span>}
    </div>
  )
}
