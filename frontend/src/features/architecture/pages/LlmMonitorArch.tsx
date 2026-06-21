import { Link } from 'react-router-dom'
import {
  ArrowLeft, Activity, Layers, ShieldCheck, Boxes, Network,
  Database, Server, Repeat, CheckCircle2, AlertTriangle, Gauge,
  Cpu, Code2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Section, HFlow, VFlow, InfoCard, GuardCard,
} from '../components/arch-ui'
import { TechArchitectureMap, type TechArchitectureMapProps } from '../components/TechArchitectureMap'
import { StakeholderArchitectureViews, type StakeholderArchitectureViewsProps } from '../components/StakeholderArchitectureViews'
import { TopologyMap, type TopoNode, type TopoEdge } from '../components/TopologyMap'

/* ──────────────────────────────────────────
   数据
────────────────────────────────────────── */

const lmStakeholderViews: StakeholderArchitectureViewsProps = {
  title: '面向不同角色的架构视图',
  summary: '领导先看监控能解决什么问题，总监看覆盖范围和收益，研发再看装饰器洋葱与 OTel 推送细节。',
  capabilities: [
    { title: 'Token 计量', items: ['每次 LLM 调用', 'input/output/total', '估算标记'] },
    { title: '成本核算', items: ['单价×用量', '元/百万 token', '无价目表则 0'] },
    { title: '调用链路追踪', items: ['每次 attempt 一行', '故障转移可见', '耗时/错误/模型'] },
    { title: '配额限流', items: ['per-tier 日配额', '软阈值告警', '硬限拒绝'] },
    { title: 'Studio 镜像', items: ['可选 OTLP 推送', 'Java+Python 统一视图', '零代码侵入'] },
    { title: '实时仪表盘', items: ['KPI 卡', '趋势图/维度图', '慢调用排行'] },
  ],
  value: {
    center: 'LLM 网关监控',
    top: '可观测性从零到齐备',
    left: '全工具自动覆盖',
    right: '成本可量化',
    bottom: '配额可控 / 故障可追',
  },
  business: {
    actors: ['AI 秘书', '访客分析', '其他 LLM 工具'],
    platform: 'toolbox-llm 共享网关',
    capabilities: ['token 计量', '调用追踪', '配额限流', 'Studio 镜像'],
    outcomes: ['成本透明', '故障快速定位', '额度可控'],
  },
  layers: [
    { title: '消费方（各 LLM 工具）', items: ['ai-secretary AiServices', 'visitor-analysis sidecar', '其他工具'] },
    { title: '网关装饰器层', items: ['QuotaGuardChatModel', 'RoutingChatModel', 'LlmMonitorListener'] },
    { title: '采集 & 存储层', items: ['LlmMetricsRecorder', 'LlmMetricsRegistry', 'SQLite llm_call_log'] },
    { title: '查询 & 展示层', items: ['LlmMonitorService', '/api/llm/monitor/**', 'llm-monitor 仪表盘'] },
    { title: '可选镜像层', items: ['AgentScopeStudioExporter', 'AgentScope Studio :3000', 'OTLP HTTP/JSON'] },
  ],
  c4: [
    { level: 'Context', audience: '领导 / 老板', items: ['LLM 工具', 'LLM 网关监控', '成本 / 可观测性'] },
    { level: 'Container', audience: '总监 / 架构师', items: ['toolbox-llm 网关', 'SQLite', 'llm-monitor', 'AgentScope Studio（可选）'] },
    { level: 'Component', audience: '开发', items: ['QuotaGuardChatModel', 'LlmMonitorListener', 'LlmMetricsRecorder', 'AgentScopeStudioExporter'] },
    { level: 'Code', audience: '程序员', items: ['LlmCallEvent', 'LlmCallLogRepository', 'LlmMonitorController', 'MonitorProperties'] },
  ],
  chain: [
    { layer: '消费方 / LLM 工具', color: 'blue', items: ['ai-secretary Capturer/Recall/Profile', '访客分析 Python sidecar', '其他 LLM 工具'] },
    { layer: 'ChatModelRouter.forTier()', color: 'violet', items: ['按档位取路由模型', 'tier=capture/recall/*'] },
    { layer: '配额闸门（QuotaGuardChatModel）', color: 'orange', items: ['查滚动窗口水位', '软阈值 WARN', '硬限拒绝 + 落 quota_blocked'], note: '超限不进路由，不触发故障转移' },
    { layer: '路由层（RoutingChatModel）', color: 'violet', items: ['权重随机选主成员', '429/失败熔断退避', '故障转移到下一成员'] },
    { layer: '采集层（LlmMonitorListener）', color: 'emerald', items: ['onRequest: 记 t0/attempt', 'onResponse: 取 TokenUsage', 'onError: 捕获异常'], note: 'LangChain4j 原生 SPI，零侵入' },
    { layer: '模型调用', color: 'slate', items: ['OpenAiChatModel', 'OpenAI 兼容端点', '本地 Ollama / 远端 DeepSeek 等'] },
    { layer: '异步落库 & 计数', color: 'rose', items: ['LlmMetricsRecorder 有界队列', 'SQLite llm_call_log', 'LlmMetricsRegistry 内存水位'] },
    { layer: '查询 & 展示', color: 'blue', items: ['llm-monitor 仪表盘（内嵌 toolbox）', '/api/llm/monitor/**', 'KPI / 趋势 / 配额 / 追踪'] },
    { layer: 'AgentScope Studio（可选镜像）', color: 'amber', items: ['AgentScopeStudioExporter', 'OTLP HTTP/JSON', 'Studio :3000 可视化'], note: '配 agent-scope-studio-url 开启；Python sidecar 侧通过 AgentScope SDK 自动上报' },
  ],
  deps: [
    {
      category: '采集框架', color: 'emerald',
      items: [
        { name: 'LangChain4j ChatModelListener', note: 'onRequest/onResponse/onError 原生 SPI，零侵入业务代码' },
        { name: 'Java 21 虚拟线程', note: 'LlmMetricsRecorder 用虚拟线程批量写 SQLite' },
      ],
    },
    {
      category: '存储', color: 'rose',
      items: [
        { name: 'SQLite WAL', note: 'llm_call_log 表，SchemaInitializer 自动建表' },
        { name: 'JdbcTemplate', note: '批量写 + GROUP BY 聚合查询，无 ORM 依赖' },
      ],
    },
    {
      category: 'AgentScope Studio（可选）', color: 'amber',
      items: [
        { name: 'OTLP HTTP/JSON', note: 'Java 内置 HttpClient 手拼，零新 Maven 依赖' },
        { name: 'AgentScope Studio :3000', note: '独立 Node.js 进程，npm install -g @agentscope/studio' },
      ],
    },
  ],
}

const lmTopoNodes: TopoNode[] = [
  { id: 'consumer', label: '消费方 AiServices',   sub: 'ai-secretary / visitor-analysis…', type: 'service',  x: 50, y: 8  },
  { id: 'router',   label: 'ChatModelRouter',    sub: 'forTier()',                         type: 'api',      x: 50, y: 22 },
  { id: 'quota',    label: 'QuotaGuardChatModel', sub: '配额闸门',                          type: 'service',  x: 50, y: 38 },
  { id: 'routing',  label: 'RoutingChatModel',   sub: '路由+熔断',                          type: 'service',  x: 50, y: 54 },
  { id: 'model',    label: 'OpenAiChatModel',    sub: 'OpenAI 兼容端点',                    type: 'external', x: 30, y: 70 },
  { id: 'listener', label: 'LlmMonitorListener', sub: 'LangChain4j SPI',                   type: 'ai',       x: 70, y: 70 },
  { id: 'recorder', label: 'LlmMetricsRecorder', sub: '异步队列+虚拟线程',                  type: 'service',  x: 70, y: 84 },
  { id: 'sqlite',   label: 'SQLite',             sub: 'llm_call_log',                      type: 'db',       x: 50, y: 92 },
  { id: 'dashboard',label: 'llm-monitor 仪表盘', sub: '内嵌 toolbox',                       type: 'ui',       x: 20, y: 92 },
  { id: 'studio',   label: 'AgentScope Studio',  sub: ':3000（可选）',                      type: 'monitor',  x: 90, y: 84 },
]

const lmTopoEdges: TopoEdge[] = [
  { from: 'consumer', to: 'router',    label: 'forTier()' },
  { from: 'router',   to: 'quota',     label: '' },
  { from: 'quota',    to: 'routing',   label: '' },
  { from: 'routing',  to: 'model',     label: '选中成员' },
  { from: 'model',    to: 'listener',  label: 'SPI回调' },
  { from: 'listener', to: 'recorder',  label: '异步提交' },
  { from: 'recorder', to: 'sqlite',    label: 'JDBC批写' },
  { from: 'sqlite',   to: 'dashboard', label: 'SQL聚合查询' },
  { from: 'recorder', to: 'studio',    label: 'OTLP', dashed: true },
]

const lmTechMap: TechArchitectureMapProps = {
  title: 'LLM 网关监控技术架构全景',
  subtitle: '装饰器洋葱在 ChatModelRouter 和池成员之间插入配额与采集，对消费方和 RoutingChatModel 完全透明。',
  top: ['ai-secretary', 'visitor-analysis', '其他 LLM 工具', 'ChatModelRouter'],
  clients: ['QuotaGuardChatModel（per tier）', 'RoutingChatModel（per tier）', 'LlmMonitorListener（per 池成员）'],
  left: ['token 计量', '成本核算', '配额告警', '调用追踪', '实时仪表盘'],
  right: ['本地 Ollama', '远端 DeepSeek', 'AgentScope Studio :3000', '其他 OpenAI 兼容'],
  groups: [
    { title: '配额层', tone: 'orange', nodes: ['QuotaGuardChatModel', '滚动窗口水位', '软阈值 WARN', '硬限拒绝'] },
    { title: '路由层', tone: 'blue', nodes: ['RoutingChatModel', '权重随机选主', '熔断退避', '故障转移'] },
    { title: '采集层', tone: 'green', nodes: ['LlmMonitorListener', 'onRequest/Response/Error', 'LlmCallEvent', 'LangChain4j SPI'] },
    { title: '持久化层', tone: 'purple', nodes: ['LlmMetricsRecorder', 'SQLite llm_call_log', 'LlmMetricsRegistry', 'AgentScopeStudioExporter'] },
  ],
  bottom: ['JDBC', 'OTLP HTTP/JSON', 'REST /api/llm/monitor/**', 'llm-monitor React', 'SQLite WAL', 'OTel Span'],
  footer: 'LLM GATEWAY MONITOR',
}

/* ──────────────────────────────────────────
   页面
────────────────────────────────────────── */

export function LlmMonitorArch() {
  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-6">

      {/* 标题 */}
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-[var(--color-primary)]" />
            <h1 className="text-2xl font-bold tracking-tight">LLM 网关监控 · 实现原理</h1>
            <Badge variant="secondary">实现原理</Badge>
          </div>
          <Link
            to="/tools/architecture"
            className="inline-flex shrink-0 items-center gap-1.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> 返回合集
          </Link>
        </div>
        <p className="max-w-3xl text-sm text-[var(--color-muted-foreground)]">
          在共享 LLM 网关（toolbox-llm）以「<b className="text-[var(--color-foreground)]">装饰器洋葱 + 原生监听器</b>」实现零侵入可观测性，
          对标 AgentScope MonitorManager/tracing/quota/Studio 四块能力。
          所有走 ChatModelRouter 的工具（ai-secretary、访客分析…）自动获得 token/成本计量、
          调用链路追踪和配额保护，无需各自改造。
        </p>
      </header>

      <StakeholderArchitectureViews {...lmStakeholderViews} />

      <TopologyMap
        title="服务拓扑图 · 装饰器洋葱与采集路径"
        subtitle="节点 = 组件/存储；有向边 = 调用/事件流；虚线 = 可选路径（AgentScope Studio OTLP 镜像）"
        nodes={lmTopoNodes}
        edges={lmTopoEdges}
        height={400}
      />

      <TechArchitectureMap {...lmTechMap} />

      {/* 两套监控的定位 */}
      <Section
        icon={Gauge}
        title="两套监控的定位"
        subtitle="llm-monitor（内置）与 AgentScope Studio（可选镜像）各司其职，不是竞争关系。"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-blue-500/40 bg-blue-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Gauge className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                llm-monitor（内置）
                <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300">推荐默认</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="grid gap-1.5">
                {[
                  ['SQLite 持久化', '数据本地，不依赖外部服务'],
                  ['开箱即用', '随 toolbox 启动，无需额外配置'],
                  ['Java 侧全覆盖', '所有 ChatModelRouter 工具自动纳入'],
                  ['内嵌仪表盘', 'KPI 卡 / 趋势图 / 配额 / 慢调用排行'],
                  ['成本核算', '按配置单价计算，无价目表则 0'],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-start gap-2 rounded-lg border bg-[var(--color-card)] px-3 py-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                    <div className="min-w-0">
                      <span className="font-medium">{k}</span>
                      <span className="text-[var(--color-muted-foreground)]"> — {v}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Network className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                AgentScope Studio（可选镜像）
                <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">需配置</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="grid gap-1.5">
                {[
                  ['需单独启动', 'npm install -g @agentscope/studio，端口 :3000'],
                  ['Java+Python 统一视图', 'Java OTLP + Python AS SDK 同一 Studio'],
                  ['配置即开启', '设 agent-scope-studio-url 后自动推送'],
                  ['零代码侵入', 'AgentScopeStudioExporter 旁路，不影响主流程'],
                  ['OTel Span', '标准 OTLP 格式，可对接其他 OTel 后端'],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-start gap-2 rounded-lg border bg-[var(--color-card)] px-3 py-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="min-w-0">
                      <span className="font-medium">{k}</span>
                      <span className="text-[var(--color-muted-foreground)]"> — {v}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
                Python sidecar（访客分析）通过 AgentScope SDK 直接上报 Studio，无需经过 Java 侧 OTLP 导出器。
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5">
          <CardContent className="p-4 text-sm">
            <div className="font-semibold">定位总结</div>
            <p className="mt-1 text-[var(--color-muted-foreground)]">
              llm-monitor 是<b className="text-[var(--color-foreground)]">主监控</b>，所有 toolbox 内 LLM 调用数据的权威来源；
              Studio 是<b className="text-[var(--color-foreground)]">可选镜像</b>，提供 Java+Python 跨进程统一视图和 OTel trace 可视化。
              两者可同时运行，数据互补不冲突。
            </p>
          </CardContent>
        </Card>
      </Section>

      {/* 装饰器洋葱 */}
      <Section
        icon={Layers}
        title="装饰器洋葱（核心架构）"
        subtitle="三层装饰器依次包裹模型调用：配额闸门 → 路由+熔断 → 采集监听。对消费方完全透明。"
      >
        <Card>
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="text-xs text-[var(--color-muted-foreground)]">从外到内：每层只关心自己的职责，向内委托</div>
              <VFlow steps={[
                { title: 'QuotaGuardChatModel（最外层）', desc: '检查滚动窗口水位 → 超软阈值 WARN → 超硬限直接抛出，不进入路由', tone: 'danger' },
                { title: 'RoutingChatModel', desc: '权重随机选主成员 → 调用失败时熔断退避 → 故障转移到下一成员', tone: 'primary' },
                { title: 'OpenAiChatModel × 池成员（含 LlmMonitorListener）', desc: '每个池成员绑定 LangChain4j SPI Listener；onRequest 记 t0，onResponse 取 TokenUsage，onError 捕异常', tone: 'accent' },
              ]} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-orange-500/35 bg-orange-500/5 p-3">
                <div className="text-sm font-semibold text-orange-700 dark:text-orange-300">配额层要点</div>
                <ul className="mt-2 space-y-1.5 text-xs text-[var(--color-muted-foreground)]">
                  <li className="rounded border bg-[var(--color-card)] px-2 py-1.5">per-tier 日配额（可配 soft/hard 两阈值）</li>
                  <li className="rounded border bg-[var(--color-card)] px-2 py-1.5">滚动窗口水位存 LlmMetricsRegistry 内存</li>
                  <li className="rounded border bg-[var(--color-card)] px-2 py-1.5">超硬限落 quota_blocked 记录，前端可见</li>
                  <li className="rounded border bg-[var(--color-card)] px-2 py-1.5">超限不进路由，不触发故障转移计数</li>
                </ul>
              </div>
              <div className="rounded-xl border border-blue-500/35 bg-blue-500/5 p-3">
                <div className="text-sm font-semibold text-blue-700 dark:text-blue-300">路由层要点</div>
                <ul className="mt-2 space-y-1.5 text-xs text-[var(--color-muted-foreground)]">
                  <li className="rounded border bg-[var(--color-card)] px-2 py-1.5">权重随机：多成员按权重概率分流</li>
                  <li className="rounded border bg-[var(--color-card)] px-2 py-1.5">429/5xx 熔断：指数退避，自动恢复</li>
                  <li className="rounded border bg-[var(--color-card)] px-2 py-1.5">故障转移：主成员失败切下一个</li>
                  <li className="rounded border bg-[var(--color-card)] px-2 py-1.5">每次 attempt 对应 Listener 一条追踪记录</li>
                </ul>
              </div>
              <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/5 p-3">
                <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">采集层要点</div>
                <ul className="mt-2 space-y-1.5 text-xs text-[var(--color-muted-foreground)]">
                  <li className="rounded border bg-[var(--color-card)] px-2 py-1.5">LangChain4j SPI：无需改任何业务代码</li>
                  <li className="rounded border bg-[var(--color-card)] px-2 py-1.5">onResponse 取 TokenUsage（null 则字符估算）</li>
                  <li className="rounded border bg-[var(--color-card)] px-2 py-1.5">LlmCallEvent 异步提交有界队列</li>
                  <li className="rounded border bg-[var(--color-card)] px-2 py-1.5">Recorder 虚拟线程批量写 SQLite</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">洋葱装配示意（ChatModelRouter 初始化）</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <HFlow steps={[
              { title: '读配置', desc: 'MonitorProperties\nRoutingProperties', tone: 'muted' },
              { title: '建池成员', desc: 'OpenAiChatModel\n+ LlmMonitorListener', tone: 'accent' },
              { title: '包路由层', desc: 'RoutingChatModel\n(池成员列表)', tone: 'primary' },
              { title: '包配额层', desc: 'QuotaGuardChatModel\n(RoutingChatModel)', tone: 'danger' },
              { title: '注册 Router', desc: 'forTier(tier)\n→ 最外层装饰器', tone: 'muted' },
            ]} />
          </CardContent>
        </Card>
      </Section>

      {/* 确定性优先 */}
      <Section
        icon={Code2}
        title="确定性优先（LLM 不参与监控）"
        subtitle="所有计量、成本、估算全是代码；token 缺失走字符估算，不调 LLM。"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoCard
            icon={Cpu}
            title="Token 计量"
            detail="优先取 LangChain4j TokenUsage（模型直接返回）。Ollama/本地模型不回 token 时，用字符数 / 3.5 做估算，打上 estimated=true 标记。"
          />
          <InfoCard
            icon={Database}
            title="成本核算"
            detail="按配置文件里的 price-per-million-tokens × 实际 token 数计算。没有配置单价的模型成本字段写 0，不用 LLM 估算价格。"
          />
          <InfoCard
            icon={Repeat}
            title="调用链路追踪"
            detail="每次 attempt（包括故障转移）各记一行 llm_call_log，含模型名/耗时/错误原因。链路重建完全靠 SQL GROUP BY，无需 LLM。"
          />
          <InfoCard
            icon={ShieldCheck}
            title="配额水位"
            detail="LlmMetricsRegistry 在内存维护滚动窗口计数。读写全是原子操作（AtomicLong），不依赖 LLM 判断是否超限。"
          />
          <InfoCard
            icon={Boxes}
            title="聚合查询"
            detail="仪表盘所有 KPI（用量/成本/趋势/模型分布/慢调用排行）均由 JdbcTemplate GROUP BY 生成，零 LLM 调用。"
          />
          <InfoCard
            icon={Server}
            title="OTLP 推送"
            detail="AgentScopeStudioExporter 用 Java 内置 HttpClient 手拼 OTLP JSON，零新 Maven 依赖，推送失败只打 WARN 不影响主流程。"
          />
        </div>

        <Card className="border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5">
          <CardContent className="p-4 text-sm">
            <div className="font-semibold">原则落点</div>
            <p className="mt-1 text-[var(--color-muted-foreground)]">
              「<b className="text-[var(--color-foreground)]">LLM 提议，代码裁决</b>」在监控层体现为：监控系统本身<b className="text-[var(--color-foreground)]">不调用任何 LLM</b>。
              所有数字（token、成本、配额、耗时）都是精确计算或有界估算，
              不存在 LLM 能影响监控准确性的入口。
            </p>
          </CardContent>
        </Card>
      </Section>

      {/* 健壮性 */}
      <Section
        icon={ShieldCheck}
        title="健壮性清单"
        subtitle="采集/持久化/推送全部对主流程隔离，任何一环出错都不影响 LLM 调用本身。"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              tag: '①',
              risk: 'Listener 抛出异常',
              guard: 'LangChain4j SPI 捕获 Listener 内部异常，不向上传播；模型调用结果不受影响。',
            },
            {
              tag: '②',
              risk: 'LlmMetricsRecorder 队列满',
              guard: '有界阻塞队列满时丢弃最旧事件（offer 非 put），不反压业务线程，不阻塞模型调用。',
            },
            {
              tag: '③',
              risk: '配额超硬限',
              guard: '直接抛 QuotaExceededException，不进入路由层，也不触发故障转移计数，不影响其他 tier 的调用。',
            },
            {
              tag: '④',
              risk: 'Ollama / 本地模型不回 TokenUsage',
              guard: '字符估算（字符数 / 3.5）兜底，estimated=true 标记；成本按估算 token × 单价，有标记可识别。',
            },
            {
              tag: '⑤',
              risk: 'OTLP 推送失败（Studio 未启动）',
              guard: 'AgentScopeStudioExporter 推送失败只打 WARN，不抛异常；本地 SQLite 数据完整，仪表盘不受影响。',
            },
            {
              tag: '⑥',
              risk: 'SQLite 写入失败',
              guard: 'Recorder 批量写失败打 ERROR 日志；内存水位（LlmMetricsRegistry）不受影响，配额保护继续有效。',
            },
          ].map(g => (
            <GuardCard key={g.tag} {...g} />
          ))}
        </div>
      </Section>

      {/* 实测状态 */}
      <Section
        icon={CheckCircle2}
        title="当前实现状态"
        subtitle="已落地功能与近期规划。"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-emerald-500/40 bg-emerald-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                已完成
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm">
                {[
                  'Token 计量（含 Ollama 估算兜底）',
                  '成本核算（按配置单价）',
                  '调用链路追踪（每次 attempt 一行）',
                  '配额限流（soft WARN + hard 拒绝）',
                  'llm-monitor 内置仪表盘（KPI/趋势/配额/追踪）',
                  'AgentScope Studio OTLP 镜像（可选）',
                  'SchemaInitializer 自动建表（llm_call_log）',
                  'LangChain4j SPI 零侵入接入',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" />
                待完善
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm">
                {[
                  ['多工具归因', 'LlmCallContext 按需点亮——区分哪条记录来自哪个工具（当前统一 tool_id 未分列）'],
                  ['历史数据清理 TTL', 'llm_call_log 无自动清理，长期运行需手动 DELETE 或配 TTL 任务'],
                  ['仪表盘告警推送', '软阈值告警目前只写日志，尚未接入前端 Toast 或 Webhook'],
                  ['单价配置 UI', '成本核算单价目前只能改 application.yml，缺少运行时配置页面'],
                ].map(([title, detail]) => (
                  <li key={title} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div>
                      <span className="font-medium">{title}</span>
                      <span className="text-[var(--color-muted-foreground)]"> — {detail}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </Section>

    </div>
  )
}
