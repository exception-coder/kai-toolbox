import { useEffect, useState } from 'react'

/**
 * 原生全屏下浮层（对话框 / 抽屉 / 气泡）应该挂到哪个容器。
 *
 * <p>浏览器进入原生全屏后<b>只渲染全屏元素及其子树</b>。默认 portal 到 {@code document.body}
 * 的浮层会落在全屏元素外面，于是整个消失 —— 用户看到的现象是「点了没反应」：对话框其实已经
 * 打开，只是画在了看不见的地方，既点不到确认也点不到取消，{@code confirm()} 的 Promise
 * 就一直挂着，后续操作全部卡死。
 *
 * <p>把 Portal 容器切到 {@code document.fullscreenElement} 就能让浮层回到可见区域。
 * 非全屏时返回 {@code undefined}，Radix 自己回落到 {@code document.body}，行为不变。
 *
 * <p>这是个横切关注点而非某个页面的补丁：任何模块只要在全屏里弹确认框都会中招，
 * 所以统一在 ui 基础组件层修，业务代码无需感知。
 */
export function useFullscreenPortalContainer(): HTMLElement | undefined {
  const [container, setContainer] = useState<HTMLElement | undefined>(undefined)

  useEffect(() => {
    const sync = () => {
      const el = document.fullscreenElement
      // fullscreenElement 可能是 SVG 等非 HTMLElement，Radix 的 container 只收 HTMLElement
      setContainer(el instanceof HTMLElement ? el : undefined)
    }
    sync()
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  return container
}
