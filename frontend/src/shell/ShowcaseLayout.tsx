import { Suspense, useLayoutEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { GripVertical, LayoutGrid } from 'lucide-react'
import { ThemeMenu } from './ThemeMenu'
import { featureAtPath } from './featureRegistry'
import { useChatRuntime } from '@/features/claude-chat/runtime/ChatRuntimeContext'

const DOCK_POS_KEY = 'showcase.dockPos'
const MARGIN = 12

type Pos = { x: number; y: number }

function loadPos(): Pos | null {
  try {
    const s = localStorage.getItem(DOCK_POS_KEY)
    return s ? (JSON.parse(s) as Pos) : null
  } catch {
    return null
  }
}

/**
 * 展示型外壳：脱离 AppShell（无 Sidebar / TopBar），整页 edge-to-edge 交给子页面。
 * 控件做成「可拖拽悬浮 dock」：默认右上角，按住左侧握把可拖到任意位置（避免遮挡页面自带顶栏），
 * 位置记忆在 localStorage。返回工作台 + 主题切换仍可正常点击（拖拽只走握把）。
 */
export function ShowcaseLayout() {
  const dockRef = useRef<HTMLDivElement>(null)
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null)
  const [pos, setPos] = useState<Pos | null>(loadPos)
  const [dragging, setDragging] = useState(false)
  // 聊天悬浮窗可见（已激活 + 展开）时，返回/主题已收进它的 header，本 dock 隐藏以免两组悬浮控件割裂；
  // 窗口关闭或最小化为气泡时，dock 回归兜底——保证展示页永远有路返回工作台 / 切主题。
  const { chat, floating, minimized } = useChatRuntime()
  const chatHostsControls = floating && !!chat && !minimized
  // 页面声明 hideDock 时完全隐藏悬浮坞（用于自带悬浮控件的沉浸式演示页）。
  const location = useLocation()
  const dockHidden = chatHostsControls || featureAtPath(location.pathname)?.hideDock === true

  // 首次（无记忆位置）按 dock 实际宽度落到右上角
  useLayoutEffect(() => {
    if (pos || !dockRef.current) return
    const r = dockRef.current.getBoundingClientRect()
    setPos({ x: window.innerWidth - r.width - MARGIN, y: MARGIN })
  }, [pos])

  const clamp = (x: number, y: number): Pos => {
    const r = dockRef.current?.getBoundingClientRect()
    const w = r?.width ?? 220
    const h = r?.height ?? 44
    return {
      x: Math.min(Math.max(8, x), window.innerWidth - w - 8),
      y: Math.min(Math.max(8, y), window.innerHeight - h - 8),
    }
  }

  const onGripDown = (e: React.PointerEvent) => {
    const r = dockRef.current?.getBoundingClientRect()
    if (!r) return
    dragOffset.current = { dx: e.clientX - r.left, dy: e.clientY - r.top }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onGripMove = (e: React.PointerEvent) => {
    if (!dragOffset.current) return
    setPos(clamp(e.clientX - dragOffset.current.dx, e.clientY - dragOffset.current.dy))
  }
  const onGripUp = (e: React.PointerEvent) => {
    if (!dragOffset.current) return
    dragOffset.current = null
    setDragging(false)
    e.currentTarget.releasePointerCapture(e.pointerId)
    const r = dockRef.current?.getBoundingClientRect()
    if (r) {
      try { localStorage.setItem(DOCK_POS_KEY, JSON.stringify({ x: r.left, y: r.top })) } catch { /* ignore */ }
    }
  }

  return (
    <div className="relative min-h-screen w-full bg-[var(--color-background)] text-[var(--color-foreground)]">
      {/* 可拖拽悬浮 dock（聊天悬浮窗接管控件、或页面声明 hideDock 时隐藏） */}
      {!dockHidden && (
      <div
        ref={dockRef}
        style={{ left: pos?.x ?? 0, top: pos?.y ?? 0, visibility: pos ? 'visible' : 'hidden' }}
        className={`fixed z-50 flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-background)]/80 p-1 shadow-lg backdrop-blur ${dragging ? 'select-none' : ''}`}
      >
        <button
          type="button"
          aria-label="拖动"
          title="按住拖动"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          className={`flex h-7 w-5 items-center justify-center rounded-full text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{ touchAction: 'none' }}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Link
          to="/"
          title="返回工作台"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          返回工作台
        </Link>
        <ThemeMenu />
      </div>
      )}

      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center text-sm text-[var(--color-muted-foreground)]">
            加载中…
          </div>
        }
      >
        <Outlet />
      </Suspense>
    </div>
  )
}
