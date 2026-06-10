import { Link } from 'react-router-dom'
import {
  ArrowLeft, BotMessageSquare, Layers, Radio, ShieldCheck, LifeBuoy, Boxes, Network,
  Cpu, Database, Server, Repeat, Workflow, Plug, SplitSquareHorizontal, KeyRound, Gauge,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Section, HFlow, VFlow, InfoCard, DecisionCard, GuardCard, type Decision } from '../components/arch-ui'

const decisions: Decision[] = [
  {
    topic: 'Web 并发模型',
    chosen: { name: 'Spring MVC + Java 21 虚拟线程', reason: '阻塞式简洁写法拿到高并发；虚拟线程 park 时卸载载体 OS 线程，长连接挂起几乎零成本' },
    rejected: [
      { name: 'Spring WebFlux（Reactor）', reason: '本场景无强背压/复杂流编排需求；全链路非阻塞 + 调试断裂 + 响应式驱动的心智与改造成本不划算' },
    ],
  },
  {
    topic: '跨语言桥接',
    chosen: { name: 'Java ⇄ Node sidecar（WebSocket）', reason: 'Claude Agent SDK 是 Node 的，用独立进程承载；Java 经 WS 指挥，进程隔离 + 事件化协议' },
    rejected: [{ name: 'Java 直接调 SDK', reason: 'SDK 无 Java 版；JNI/重写都不现实' }],
  },
  {
    topic: 'sidecar 连接模型',
    chosen: { name: '单 WS 多路复用（按 sessionId 路由）', reason: '连接生命周期 / 重连恢复极简；单用户并发极低，队头阻塞代价可忽略（被串行的只是 KB 级文本帧）' },
    fallback: { name: '每会话独立连接 / HTTP·2 多 stream', reason: '真要高并发隔离时的升档路径' },
  },
  {
    topic: '产品内 AI 写操作粒度',
    chosen: { name: '实体级 + 按 id 幂等（MCP 工具）', reason: '爆炸半径锁死单实体，AI 幻觉只影响它显式要改的那一条；非整份覆盖' },
    rejected: [{ name: '整份覆盖（一个大 save）', reason: 'AI 须每次完美重述全量，一处幻觉即整体静默损坏' }],
  },
  {
    topic: '上下文持久化',
    chosen: { name: 'sdkSessionId + SDK 磁盘 transcript', reason: '记忆下沉磁盘、句柄存 SQLite；sidecar 进程近乎无状态，可随意重启而对话不丢' },
    rejected: [{ name: 'Java 侧自存全量对话', reason: '与 SDK 的会话状态双写易漂移，重复造轮子' }],
  },
]

const guards: { tag: string; risk: string; guard: string }[] = [
  { tag: '①', risk: '锁屏 / 弱网，浏览器 WS 断', guard: 'AI 仍在服务端跑；重连 attach{seq} → 按 seq 回放缓冲 + 客户端去重' },
  { tag: '②', risk: 'sidecar 进程崩 / 被杀', guard: 'CAS 去重的后台自动重连 + 用 sdkSessionId resume 续接，惰性恢复兜底' },
  { tag: '③', risk: '断连过久，事件被环形缓冲淘汰', guard: 'lastEventSeq 早于最旧 seq → 下发 replayGap 提示，而非静默缺失' },
  { tag: '④', risk: '断线瞬间用户点发送，消息丢', guard: 'pendingSends 队列暂存，重连 attach 后先回放再补发' },
  { tag: '⑤', risk: '工具权限需人确认', guard: 'canUseTool 回调挂起 Promise → 前端决策 → 回灌 resolve（跨三进程）' },
  { tag: '⑥', risk: '同步接口想用异步 Agent', guard: 'CompletableFuture 把事件流折叠为同步阻塞调用，虚拟线程承载等待' },
]

export function VibeCodingArch() {
  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-6">
      {/* 标题 */}
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BotMessageSquare className="h-6 w-6 text-[var(--color-primary)]" />
            <h1 className="text-2xl font-bold tracking-tight">Vibe Coding · 架构与实现</h1>
            <Badge variant="secondary">实现原理</Badge>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/tools/architecture" className="inline-flex shrink-0 items-center gap-1.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
              <ArrowLeft className="h-3.5 w-3.5" /> 返回合集
            </Link>
            <Link to="/tools/claude-chat" className="inline-flex shrink-0 items-center gap-1.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
              <BotMessageSquare className="h-3.5 w-3.5" /> 去使用
            </Link>
          </div>
        </div>
        <p className="max-w-3xl text-sm text-[var(--color-muted-foreground)]">
          把 <b className="text-[var(--color-foreground)]">Claude Code / Codex 编码 Agent</b> 封装成移动端可用的实时编码助手，并把 Agent 能力下沉为产品内 AI 功能。
          技术栈 <b className="text-[var(--color-foreground)]">Java 21（虚拟线程）+ Spring Boot 多模块 + Node sidecar(Claude Agent SDK) + React 19</b>。
          核心难点：把「异步 / 长连接 / 有状态 / 含人机交互」的 Agent 工业级桥接到 Web，并在弱网 / 进程崩溃下保证会话不丢、多端一致。
        </p>
      </header>

      {/* 整体架构 */}
      <Section icon={Layers} title="整体架构（三层 + 两条 WebSocket）" subtitle="Java 自己不跑 AI——真正调 Claude 的是独立 Node 进程；Java 经 WS 指挥它">
        <Card>
          <CardContent className="p-4">
            <VFlow
              steps={[
                { icon: Network, title: '手机 / 浏览器 · React', desc: 'useClaudeChatSocket（重连 / 回放）', tone: 'primary' },
                { icon: Server, title: 'Java 后端 · ClaudeChatService', desc: 'WS① 会话状态机 + 事件环形缓冲 + viewers + SidecarClient(单连接·按 sessionId 路由)' },
                { icon: Workflow, title: 'Node sidecar · SessionManager', desc: 'WS② 跑 Claude Agent SDK 的 query() 异步事件流' },
                { icon: Cpu, title: 'Claude / Codex', desc: '底层模型；上下文落 SDK 磁盘 transcript', tone: 'accent' },
              ]}
            />
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <InfoCard icon={Plug} title="WS① 浏览器↔Java" detail="你点的、你看的" />
              <InfoCard icon={Plug} title="WS② Java↔sidecar" detail="仅 127.0.0.1，单连接多路复用" />
              <InfoCard icon={Database} title="SQLite" detail="会话元数据 + sdkSessionId（句柄）" />
            </div>
          </CardContent>
        </Card>
      </Section>

      {/* 流式 + 权限交互 */}
      <Section icon={Radio} title="流式输出 + 工具权限交互" subtitle="模型吐字 → sidecar 翻译 → Java 转发 → 浏览器追加，三跳全程流式；权限是跨三进程的挂起 Promise">
        <Card>
          <CardContent className="space-y-3 p-4">
            <HFlow
              steps={[
                { icon: Cpu, title: 'Claude 吐 token' },
                { icon: Workflow, title: 'sidecar 事件化 assistantDelta', tone: 'muted' },
                { icon: Server, title: 'Java 原样转发' },
                { icon: Network, title: '前端逐字追加', tone: 'primary' },
              ]}
            />
            <HFlow
              steps={[
                { icon: ShieldCheck, title: 'Claude 要用危险工具' },
                { icon: ShieldCheck, title: 'canUseTool 挂起 Promise → permissionRequest', tone: 'primary' },
                { icon: Network, title: '前端弹框，用户决策' },
                { icon: Repeat, title: 'decision 回灌 → resolve 放行', tone: 'accent' },
              ]}
            />
            <p className="text-xs text-[var(--color-muted-foreground)]">
              「等用户决策」= 一个跨三进程、靠 reqId 配对的<b className="text-[var(--color-foreground)]">挂起 Promise</b>；你点同意那一刻才 resolve、Claude 才继续。
            </p>
          </CardContent>
        </Card>
      </Section>

      {/* 双链路断线恢复 */}
      <Section icon={LifeBuoy} title="双链路断线韧性（可用性核心）" subtitle="两条 WS 是两个独立失效域，恢复路径互不替代">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold"><Plug className="h-4 w-4 text-[var(--color-primary)]" /> WS① 浏览器断（便宜）</div>
              <VFlow steps={[
                { title: 'AI 仍在服务端跑，只是没人看', tone: 'muted' },
                { title: '前端重连 → attach{lastEventSeq}' },
                { title: 'seq 有序回放 + 客户端去重 + replayGap 兜底 + pendingSends 补发', tone: 'accent' },
              ]} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold"><Server className="h-4 w-4 text-[var(--color-destructive)]" /> WS② sidecar 崩（难点）</div>
              <VFlow steps={[
                { title: '会话置 INTERRUPTED + emit SIDECAR_DOWN', tone: 'danger' },
                { title: 'onSidecarDown：CAS 去重，起后台重连循环' },
                { title: 'ensureStarted 重拉进程 + ensureConnected 重连' },
                { title: '用 sdkSessionId resume 续接上下文', tone: 'accent' },
              ]} />
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* 跨进程不丢上下文 + 异步折叠同步 */}
      <Section icon={KeyRound} title="跨进程不丢上下文 + 异步折叠为同步" subtitle="身份解耦让 sidecar 可随意重启；Future + 虚拟线程让产品功能像调普通函数一样用 Agent">
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoCard icon={Network} title="sessionId（短期路由身份）" detail="当前运行中，浏览器↔Java↔sidecar 三方路由用" />
          <InfoCard icon={KeyRound} title="sdkSessionId（长期记忆句柄）" detail="跨重启续接；真实对话上下文落在 SDK 磁盘 transcript" />
        </div>
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="text-sm font-medium">一次性 headless：把异步事件流「折叠」成同步阻塞调用</div>
            <HFlow steps={[
              { title: 'oneShot{requestId, system, user}' },
              { icon: Gauge, title: '虚拟线程 future.get() park 挂起', desc: '不占 OS 线程', tone: 'primary' },
              { title: 'WS 回调累积 delta，result 时 future.complete' },
              { title: 'unpark 唤醒 → 返回全文', tone: 'accent' },
            ]} />
            <p className="text-xs text-[var(--color-muted-foreground)]">
              park 非自旋（<code>LockSupport.park</code>，睡死不占 CPU）；虚拟线程 park 时卸载载体 OS 线程，几十个并发等待也不吃 OS 线程——所以敢写成「同步阻塞」。
            </p>
          </CardContent>
        </Card>
      </Section>

      {/* 多路复用权衡 */}
      <Section icon={SplitSquareHorizontal} title="单连接多路复用 + 队头阻塞权衡" subtitle="一条 WS② 承载所有会话，按 sessionId 路由">
        <Card>
          <CardContent className="space-y-2 p-4">
            <HFlow steps={[
              { icon: Boxes, title: '会话 1 / 2 / N', desc: '各自的事件' },
              { icon: Plug, title: '单 WS② 连接（按 sessionId 复用）', tone: 'primary' },
              { icon: Workflow, title: 'sidecar 按 sessionId 分发' },
            ]} />
            <p className="text-xs text-[var(--color-muted-foreground)]">
              取舍：单连接有队头阻塞，但<b className="text-[var(--color-foreground)]">被串行的只是 KB 级文本帧</b>，真正耗时的 LLM 生成是事件循环上的独立异步流、<b className="text-[var(--color-foreground)]">并发不受影响</b>；单用户并发极低 → 用可忽略代价换连接 / 重连的极简。
            </p>
          </CardContent>
        </Card>
      </Section>

      {/* 选型决策 */}
      <Section icon={Boxes} title="关键技术选型与取舍" subtitle="每个决策列出 ✓ 选用 · 降级备选 · ✗ 被筛除（置灰 + 原因）">
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {decisions.map(d => <DecisionCard key={d.topic} d={d} />)}
        </div>
      </Section>

      {/* 健壮性清单 */}
      <Section icon={ShieldCheck} title="健壮性（抗造）清单 → 落点" subtitle="弱网 / 崩溃 / 人机交互下的边界，光跑 demo 看不出来">
        <div className="grid gap-3 sm:grid-cols-2">
          {guards.map(g => <GuardCard key={g.tag} {...g} />)}
        </div>
      </Section>
    </div>
  )
}
