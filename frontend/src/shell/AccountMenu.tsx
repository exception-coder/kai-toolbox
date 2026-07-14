import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Check, FlaskConical, LogIn, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logout, useAuth } from '@/lib/auth'
import { LoginDialog } from '@/components/auth/LoginDialog'
import { useMockMode } from './useMockMode'
import { pathHasMock } from './featureRegistry'
import {
  THEME_ACCENTS,
  THEME_MODES,
  loadTheme,
  setTheme,
  type ThemeAccent,
  type ThemeMode,
} from './theme'
import { BrandEditor } from './BrandEditor'

/**
 * 侧栏左下角的账号菜单——统一承载「我是谁 / 如何配置」的低频入口。
 *
 * 心智模型：左侧导航负责「去哪」、顶栏搜索负责「找什么」、内容区负责「做什么」、这里负责「我是谁/配置」。
 * 收纳：外观主题（明暗+主色+品牌）、Mock 联调开关、退出登录。这些原先散在顶栏，现集中到一处、向上弹出。
 * 折叠态只显示头像；未登录时降级为登录入口。
 */
export function AccountMenu({ collapsed }: { collapsed?: boolean }) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 主题：明暗模式 + 主色，读一次本地态，切换即落盘生效（与 ThemeMenu 同源 theme.ts）。
  const [mode, setMode] = useState<ThemeMode>('system')
  const [accent, setAccent] = useState<ThemeAccent>('indigo')
  useEffect(() => {
    const s = loadTheme()
    setMode(s.mode)
    setAccent(s.accent)
  }, [])
  const pickMode = (m: ThemeMode) => { setMode(m); setTheme({ mode: m, accent }) }
  const pickAccent = (a: ThemeAccent) => { setAccent(a); setTheme({ mode, accent: a }) }

  // Mock 联调开关：仅当前模块支持 mock 或已全局开启时出现（避免点了 404 / 被困无法关闭）。
  const { enabled: mock, toggle: toggleMock } = useMockMode()
  const { pathname } = useLocation()
  const showMock = pathHasMock(pathname) || mock

  // 点菜单外部关闭。
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // 未登录：页脚降级为登录入口。
  if (!user) {
    return (
      <div className="border-t p-2">
        <button
          type="button"
          onClick={() => setShowLogin(true)}
          title="登录"
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors hover:bg-[var(--color-sidebar-accent)]',
            collapsed && 'justify-center px-0'
          )}
        >
          <LogIn className="h-4 w-4 shrink-0" />
          {!collapsed && <span>登录</span>}
        </button>
        <LoginDialog open={showLogin} onClose={() => setShowLogin(false)} onSuccess={() => qc.clear()} />
      </div>
    )
  }

  const roleLabel = user.roles?.[0] ?? ''

  return (
    <div ref={ref} className="relative border-t p-2">
      {open && (
        <div className="absolute bottom-full left-2 z-50 mb-2 w-64 rounded-xl border bg-[var(--color-popover)] p-3 text-[var(--color-popover-foreground)] shadow-xl">
          {/* 身份头 */}
          <div className="mb-3 flex items-center gap-2.5 border-b px-1 pb-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-semibold text-[var(--color-primary-foreground)]">
              {user.username.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{user.username}</div>
              <div className="truncate text-[11px] text-[var(--color-muted-foreground)]">{user.roles.join(' · ')}</div>
            </div>
          </div>

          {/* 外观：明暗模式 */}
          <div className="mb-1 text-xs font-medium text-[var(--color-muted-foreground)]">明暗模式</div>
          <div className="mb-3 flex flex-col">
            {THEME_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => pickMode(m.id)}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-[var(--color-muted)]"
              >
                <span>{m.label}</span>
                {mode === m.id && <Check className="size-4 text-[var(--color-primary)]" />}
              </button>
            ))}
          </div>

          {/* 外观：主色 */}
          <div className="mb-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">主色</div>
          <div className="mb-3 flex flex-wrap gap-2">
            {THEME_ACCENTS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => pickAccent(a.id)}
                title={a.label}
                aria-label={a.label}
                className={cn(
                  'size-7 rounded-full border-2 transition-transform hover:scale-110',
                  accent === a.id ? 'border-[var(--color-foreground)]' : 'border-transparent'
                )}
                style={{ background: a.swatch }}
              />
            ))}
          </div>

          {/* 应用品牌（名称/副标题） */}
          <div className="border-t pt-3">
            <BrandEditor />
          </div>

          {/* Mock 联调开关（上下文相关时出现） */}
          {showMock && (
            <div className="mt-1 border-t pt-2">
              <button
                type="button"
                onClick={() => { toggleMock(); qc.clear() }}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-[var(--color-muted)]"
                title={mock ? '关闭 mock，恢复真实接口' : '开启 mock，使用本地模拟数据'}
              >
                <span className="flex items-center gap-2">
                  <FlaskConical className={cn('size-4', mock && 'text-amber-500')} />
                  Mock 数据
                </span>
                <span className={cn('text-xs', mock ? 'font-medium text-amber-500' : 'text-[var(--color-muted-foreground)]')}>
                  {mock ? '已开启' : '关闭'}
                </span>
              </button>
            </div>
          )}

          {/* 退出登录 */}
          <div className="mt-1 border-t pt-2">
            <button
              type="button"
              onClick={() => { setOpen(false); logout(); qc.clear() }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-red-600 hover:bg-red-500/10 dark:text-red-400"
            >
              <LogOut className="size-4" />
              退出登录
            </button>
          </div>
        </div>
      )}

      {/* 触发器：头像 + 用户名/角色（折叠态只留头像） */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${user.username}（${user.roles.join(', ')}）`}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors hover:bg-[var(--color-sidebar-accent)]',
          open && 'bg-[var(--color-sidebar-accent)]',
          collapsed && 'justify-center px-0'
        )}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-semibold text-[var(--color-primary-foreground)]">
          {user.username.slice(0, 1).toUpperCase()}
        </span>
        {!collapsed && (
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate font-medium">{user.username}</span>
            {roleLabel && (
              <span className="block truncate text-[11px] text-[var(--color-muted-foreground)]">{roleLabel}</span>
            )}
          </span>
        )}
      </button>
    </div>
  )
}
