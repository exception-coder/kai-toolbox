import { useEffect, useRef } from 'react'
import Reveal from 'reveal.js'
import 'reveal.js/dist/reveal.css'
import '../styles/webppt-deck.css'
import { colors, typography, spacing, shape } from '../WebpptDesignTokens'
import type { Slide } from '../slidesContent'
import { SlideSection } from './SlideSection'

/** 把 WebpptDesignTokens 展开成 CSS 自定义属性，注入根节点 —— 样式文件里没有任何硬编码色值/字号。 */
const tokenCssVars: Record<string, string> = {
  '--wp-color-primary': colors.primary,
  '--wp-color-accent': colors.accent,
  '--wp-color-ink': colors.neutral[0],
  '--wp-color-ink-2': colors.neutral[1],
  '--wp-color-ink-3': colors.neutral[2],
  '--wp-color-line': colors.neutral[3],
  '--wp-color-surface': colors.neutral[4],
  '--wp-color-white': colors.neutral[5],
  '--wp-font-cn': typography.fontCn,
  '--wp-font-en': typography.fontEn,
  '--wp-fs-h1': `${typography.scale.h1}px`,
  '--wp-fs-h2': `${typography.scale.h2}px`,
  '--wp-fs-h3': `${typography.scale.h3}px`,
  '--wp-fs-body': `${typography.scale.body}px`,
  '--wp-fs-caption': `${typography.scale.caption}px`,
  '--wp-unit': `${spacing.baseUnit}px`,
  '--wp-radius-md': `${shape.radius.md}px`,
  '--wp-border-width': `${shape.borderWidth}px`,
}

export function WebpptDeck({ slides }: { slides: Slide[] }) {
  const deckRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!deckRef.current) return
    const deck = new Reveal(deckRef.current, {
      embedded: true,
      hash: false,
      width: 1280,
      height: 720,
      margin: 0.04,
      center: true,
      controls: true,
      progress: true,
      keyboard: true,
      // 断网/离线场景：reveal.js 本体已随构建产物本地打包（import 'reveal.js/dist/reveal.css'
      // + npm 依赖，非 CDN），不发起任何运行时网络请求。
    })

    // reveal.js 的 initialize() 是异步的，destroy() 在其真正 ready 之前调用是空操作
    // （内部有 ready 标记位守卫）。React 18/19 StrictMode 开发模式下 effect 会同步
    // 「挂载→清理→再挂载」一遍来测试幂等性，如果 cleanup 立刻调用 destroy()，会因为
    // 上面这个空操作特性而没有真正销毁，导致第二次挂载又在同一个 DOM 节点上创建一个
    // reveal.js 实例，两个实例并发抢同一份 DOM（.reveal.ready/.center 等 class），
    // 表现为页面整体空白（母版内容永远拿不到 present/ready 状态）。
    // 处理方式：把「是否需要销毁」的判定推迟到 initialize() 真正 resolve 之后再做，
    // 保证 destroy() 一定发生在实例已 ready 的状态下，才能真正生效。
    let disposed = false
    deck
      .initialize()
      .then(() => {
        if (disposed) {
          try {
            deck.destroy()
          } catch {
            /* 忽略销毁期报错，不影响页面其它部分 */
          }
        }
      })
      .catch((err) => {
        console.error('[webppt-governance-report] reveal.js 初始化失败', err)
      })

    return () => {
      disposed = true
    }
  }, [])

  return (
    <div className="webppt-deck-root h-screen w-full" style={tokenCssVars as React.CSSProperties}>
      <div className="reveal" ref={deckRef}>
        <div className="slides">
          {slides.map((slide) => (
            <SlideSection key={slide.id} slide={slide} />
          ))}
        </div>
      </div>
    </div>
  )
}
