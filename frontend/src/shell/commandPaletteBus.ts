// Command Palette（Ctrl/⌘+K）的全局开关：解耦触发方（顶栏按钮/任意处）与面板组件。
// 面板组件自身监听 Ctrl/⌘+K；此处只提供「程序化打开」的事件通道给触发按钮用。
const EVENT = 'forge:open-command-palette'

/** 程序化打开命令面板（顶栏搜索触发器 / 其它入口调用）。 */
export function openCommandPalette() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT))
}

/** 订阅「请求打开」事件；返回取消订阅函数。仅命令面板组件使用。 */
export function onOpenCommandPalette(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(EVENT, cb)
  return () => window.removeEventListener(EVENT, cb)
}
