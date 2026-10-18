import { useEffect, useRef } from 'react'
import { NavLink, type NavLinkProps } from 'react-router-dom'
import { entryOf } from './featureRegistry'
import { preloadFeatureEntry } from './featurePreload'
import type { FeatureManifest } from './types'

const HOVER_INTENT_MS = 120

type Props = Omit<NavLinkProps, 'to'> & { feature: FeatureManifest }

/** 明确导航意图才预加载，避免首屏同时下载全部工具。 */
export function FeatureLink({ feature, onPointerEnter, onPointerLeave, onFocus, onTouchStart, ...props }: Props) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cancel = () => { clearTimeout(timer.current); timer.current = undefined }
  useEffect(() => () => clearTimeout(timer.current), [])
  const preload = () => {
    cancel()
    void preloadFeatureEntry(feature).catch(error => console.warn(`[navigation] ${feature.id} 预加载失败，点击后可重试`, error))
  }
  return <NavLink {...props} to={entryOf(feature)}
    onPointerEnter={event => { onPointerEnter?.(event); if (!event.defaultPrevented && event.pointerType !== 'touch') { cancel(); timer.current = setTimeout(preload, HOVER_INTENT_MS) } }}
    onPointerLeave={event => { onPointerLeave?.(event); cancel() }}
    onFocus={event => { onFocus?.(event); if (!event.defaultPrevented) preload() }}
    onTouchStart={event => { onTouchStart?.(event); if (!event.defaultPrevented) preload() }} />
}
