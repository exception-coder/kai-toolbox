import { lazy, type ComponentType } from 'react'

/** 预加载和首次渲染共用同一请求；预加载失败不污染尚未渲染的 lazy 状态。 */
export function preloadable<T extends ComponentType<any>>(loader: () => Promise<{ default: T }>) {
  let pending: Promise<{ default: T }> | undefined
  const preload = () => {
    pending ??= Promise.resolve().then(loader).catch(error => { pending = undefined; throw error })
    return pending
  }
  return Object.assign(lazy(preload), { preload })
}
