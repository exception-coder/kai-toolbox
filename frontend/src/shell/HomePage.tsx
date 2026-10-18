import { Link } from 'react-router-dom'
import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { LoginDialog } from '@/components/auth/LoginDialog'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { entryOf, features } from './featureRegistry'
import { hasFeatureAccess } from './access'
import { useAccessContext } from './permission'
import { useVisibleFeatures } from './menuVisibility'
import { BrandLogo } from './BrandLogo'
import { useBrand } from './brand'

function WorkspaceLogin() {
  const queryClient = useQueryClient()
  const [showLogin, setShowLogin] = useState(false)
  const loginButtonRef = useRef<HTMLButtonElement>(null)
  return (
    <section aria-labelledby="workspace-login-title" className="mb-8 border-y py-6">
      <h2 id="workspace-login-title" className="text-base font-medium">登录工作台</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted-foreground)]">
        登录后查看可用功能，再选择要进入的模块。
      </p>
      <Button ref={loginButtonRef} className="mt-4 min-h-11" onClick={() => setShowLogin(true)}>登录</Button>
      <LoginDialog open={showLogin} onClose={() => setShowLogin(false)} onSuccess={() => queryClient.clear()} returnFocusRef={loginButtonRef} />
    </section>
  )
}

export function HomePage() {
  const { user } = useAuth()
  const { brand } = useBrand()
  const access = useAccessContext()
  // 按角色/权限码过滤首页入口卡片，再按「菜单配置」软隐藏过滤，与侧边栏一致。chrome（管理页）不进首页。
  const allowed = features.filter(f => !f.chrome && hasFeatureAccess(f, access))
  const visible = useVisibleFeatures(allowed)
  const vibe = visible.find(f => f.id === 'claude-chat')
  const remaining = visible.filter(f => f.id !== 'claude-chat')

  const first = vibe ? [vibe] : remaining.slice(0, 1)
  const later = vibe ? remaining : remaining.slice(1)
  const renderFeature = (f: (typeof visible)[number]) => {
    const Icon = f.icon
    return (
      <Link key={f.id} to={entryOf(f)} className="group">
        <Card className="h-full transition-shadow group-hover:shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-[var(--color-primary)]" />
                {f.name}
              </span>
              <ArrowRight className="h-4 w-4 text-[var(--color-muted-foreground)] transition-transform group-hover:translate-x-0.5" />
            </CardTitle>
            {f.description && <CardDescription>{f.description}</CardDescription>}
          </CardHeader>
          <CardContent className="text-xs text-[var(--color-muted-foreground)]">
            {f.group ?? '通用'}
          </CardContent>
        </Card>
      </Link>
    )
  }
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex items-center gap-3">
        <BrandLogo className="h-7 w-7" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{brand.appName}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">{brand.tagline}</p>
        </div>
      </div>

      {!user && <WorkspaceLogin />}

      {user && visible.length === 0 ? (
        <div className="rounded-md border border-dashed bg-[var(--color-card)] p-10 text-center text-sm text-[var(--color-muted-foreground)]">
          暂无可用功能，请联系管理员确认模块权限与菜单配置。
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {first.map(renderFeature)}
          {later.map(renderFeature)}
        </div>
      )}
    </div>
  )
}
