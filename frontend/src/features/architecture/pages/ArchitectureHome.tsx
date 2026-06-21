import { Link } from 'react-router-dom'
import type { ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'
import { Workflow, BotMessageSquare, Gauge, Users, ArrowRight, UserSearch, Activity } from 'lucide-react'
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
  {
    to: '/tools/architecture/team-vibe-coding',
    icon: Users,
    title: '团队 Vibe Coding 落地规范（方法论）',
    desc: '把研发从「人写代码」升级为「人定义需求 / AI 生产 / 人验收」：五大核心原则、SDD 规格驱动流水线、五大支柱、多 Agent 流水线、关键选型取舍、带可度量门槛的路线图、反模式护栏。核心是用确定性护栏关住 LLM 的不确定性。',
    tags: ['SDD 规格驱动', '确定性优先', '多 Agent 流水线', '知识库 RAG'],
    ready: true,
  },
  {
    to: '/tools/architecture/visitor-analysis',
    icon: UserSearch,
    title: '访客分析（确定性优先 + AgentScope 灰区判别）',
    desc: '前台访客身份实时判别：客户库/竞品名单命中即定论（高置信无 LLM），灰区交 Python AgentScope sidecar 做一次结构化输出，Java 端代码裁决（枚举校验+置信度阈值）后落库。五张表 + SSE 阶段进度 + 软降级。',
    tags: ['确定性优先', 'Python sidecar', 'AgentScope 集成点', 'deterministic-first'],
    ready: true,
  },
  {
    to: '/tools/architecture/llm-monitor',
    icon: Activity,
    title: 'LLM 网关监控（对标 AgentScope 可观测性）',
    desc: '在共享网关以装饰器洋葱实现零侵入监控：LangChain4j ChatModelListener 采集、SQLite 持久化、内置仪表盘；可选镜像到 AgentScope Studio。内置 llm-monitor 仪表盘 vs 可选 Studio 的定位对比。',
    tags: ['LangChain4j SPI', 'SQLite', 'AgentScope Studio（可选）', 'OTel OTLP'],
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
