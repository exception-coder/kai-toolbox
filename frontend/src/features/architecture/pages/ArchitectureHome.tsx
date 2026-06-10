import { Link } from 'react-router-dom'
import type { ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'
import { Workflow, BotMessageSquare, Gauge, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type Entry = {
  to: string
  icon: ComponentType<LucideProps>
  title: string
  desc: string
  tags: string[]
  ready: boolean
}

// 各模块「实现原理 / 架构」HTML 深度页。新增模块 = 加一篇 page + 在此登记一条。
const entries: Entry[] = [
  {
    to: '/tools/architecture/vibe-coding',
    icon: BotMessageSquare,
    title: 'Vibe Coding（移动端 AI 编码 Agent）',
    desc: '把 Claude Code / Codex 封装成移动端实时编码助手：三层 + 双 WS、流式 + 权限交互、双链路断线韧性、跨进程不丢上下文、异步折叠同步、MVC+虚拟线程选型。',
    tags: ['Java 21 虚拟线程', 'Node sidecar', 'WebSocket/SSE', 'MCP'],
    ready: true,
  },
  {
    to: '/tools/architecture/frontend-perf',
    icon: Gauge,
    title: '前端性能优化（首页秒开）',
    desc: '首屏慢的根因是没分割而非没缓存：路由级 React.lazy 把首屏 JS 从约 17MB 降到 542KB；两级 HTTP 缓存（hash 资源 immutable + index.html no-cache）让重复打开免下载；PWA 可安装但故意不接管缓存。',
    tags: ['React.lazy 代码分割', 'Suspense', 'HTTP 缓存', 'PWA'],
    ready: true,
  },
]

export function ArchitectureHome() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Workflow className="h-6 w-6 text-[var(--color-primary)]" />
          <h1 className="text-2xl font-bold tracking-tight">实现原理 · 架构合集</h1>
        </div>
        <p className="max-w-3xl text-sm text-[var(--color-muted-foreground)]">
          各模块的<b className="text-[var(--color-foreground)]">架构与实现原理</b>可视化深度说明（HTML 页，非 markdown）。聚焦「为什么这么设计 + 怎么实现 + 关键取舍」。每个模块一篇，持续追加。
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {entries.map(e => (
          <Link key={e.to} to={e.to} className="group">
            <Card className="h-full transition-colors hover:border-[var(--color-primary)]/50">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                      <e.icon className="h-5 w-5" />
                    </div>
                    <span className="font-semibold">{e.title}</span>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)] transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="text-sm text-[var(--color-muted-foreground)]">{e.desc}</p>
                <div className="flex flex-wrap gap-1.5">
                  {e.tags.map(t => (
                    <Badge key={t} variant="outline" className="text-[11px]">{t}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}

        <Card className="h-full border-dashed">
          <CardContent className="flex h-full items-center justify-center p-4 text-center text-sm text-[var(--color-muted-foreground)]">
            更多模块（退款重构 / 简历优化 / 下载器 …）实现原理陆续补充
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
