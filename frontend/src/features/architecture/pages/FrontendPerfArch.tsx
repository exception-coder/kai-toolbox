import { Link } from 'react-router-dom'
import {
  ArrowLeft, Gauge, Layers, SplitSquareHorizontal, Database, ShieldCheck,
  Boxes, Code2, Zap, FileCode, Globe, AlertTriangle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Section, HFlow, VFlow, InfoCard, DecisionCard, GuardCard, CodeBlock, type Decision } from '../components/arch-ui'
import { TechArchitectureMap, type TechArchitectureMapProps } from '../components/TechArchitectureMap'
import { StakeholderArchitectureViews, type StakeholderArchitectureViewsProps } from '../components/StakeholderArchitectureViews'

const decisions: Decision[] = [
  {
    topic: '工具页加载方式',
    chosen: { name: 'React.lazy + 动态 import（路由级分割）', reason: '首页只下载 shell + 各 manifest 元数据；某工具的代码进入该路由时才加载，首屏从约 17MB 降到 542KB' },
    rejected: [{ name: '顶层直 import 页面组件', reason: 'eager glob 会把 36 个工具全部静态依赖（Mermaid/CodeMirror/xterm…）打进同一首包，首屏每次都要 parse+execute 十几 MB' }],
  },
  {
    topic: 'manifest 收集时机',
    chosen: { name: 'manifest 仍 eager，仅页面组件 lazy', reason: '侧边栏 / 首页需要图标 + 名称 + 分组即时可用；这些极轻，不拆。只把重的页面组件挪到按需 chunk' },
    rejected: [{ name: '整个 feature 都懒加载', reason: '菜单会等所有 chunk 下载完才出现，且后端宕机时菜单也渲染不出，违反「菜单与后端解耦」约定' }],
  },
  {
    topic: 'hash 资源缓存',
    chosen: { name: 'Cache-Control: max-age=1y, immutable', reason: 'Vite 产物文件名带内容 hash，内容变则名变，可安全永久缓存：第二次打开 0 请求直接命中本地' },
    rejected: [{ name: '统一 no-cache', reason: '每个资源每次都发校验请求，浪费 RTT；hash 资源根本不需要校验' }],
  },
  {
    topic: 'index.html 缓存',
    chosen: { name: 'Cache-Control: no-cache（校验式）', reason: '入口文件无 hash，必须每次校验：没变回 304（几乎不传输），有新构建立刻拿到新入口→引用新 hash 资源，自动更新' },
    rejected: [{ name: '长缓存 index.html', reason: '发了新版本用户仍吃旧入口，永远更新不了' }],
  },
]

const guards: { tag: string; risk: string; guard: string }[] = [
  { tag: '①', risk: '缓存了为何还慢？', guard: '缓存只省「下载」，省不掉每次打开都要 parse+execute 的 JS——所以根因是分割而非缓存' },
  { tag: '②', risk: 'lazy 后菜单变慢/丢失', guard: 'manifest（图标+元数据）保持 eager，只有页面组件 lazy；菜单不依赖任何 chunk 下载' },
  { tag: '③', risk: 'lazy 组件渲染报错', guard: 'App.tsx 用 <Suspense> 包裹路由元素，chunk 下载期间显示 PageLoading 兜底' },
  { tag: '④', risk: '发新版用户吃旧缓存', guard: 'index.html no-cache 必校验；hash 资源名随内容变，旧名自然失效，无需手动清缓存' },
  { tag: '⑤', risk: 'PWA SW 缓存住旧版本', guard: '当前 sw.js 故意 cache-less（只为满足可安装性），不接管资源缓存，避免「卡旧版」经典坑' },
  { tag: '⑥', risk: '新增工具回退成直 import', guard: 'CLAUDE.md 登记「路由组件必须 React.lazy」；codemod 已统一存量 35 个 manifest' },
]

const implBlocks = [
  {
    title: '路由级分割：manifest 里页面改 lazy（frontend/src/features/*/index.tsx）',
    lang: 'TSX',
    code: [
      '// ❌ 旧：顶层直 import → 该页所有依赖被打进首包',
      "// import { FormatterPage } from './pages/FormatterPage'",
      '',
      '// ✅ 新：动态 import → Vite/Rollup 自动拆成独立 chunk，按需加载',
      "const FormatterPage = lazy(() =>",
      "  import('./pages/FormatterPage').then((m) => ({ default: m.FormatterPage })))",
      '',
      '// 注意：<FormatterPage /> 这个 JSX 在「创建 manifest」时不会触发下载，',
      '// 只有 React 在 <Suspense> 下真正渲染它时，才去拉对应 chunk。',
      '// 所以 manifest（图标/名称/分组）依旧 eager、即时可用 → 侧边栏不受影响。',
      'const manifest: FeatureManifest = {',
      "  id: 'formatter', name: '格式化工具', icon: Braces, group: '内容工具',",
      "  routes: [{ path: '/tools/formatter', element: <FormatterPage /> }],",
      '}',
    ].join('\n'),
  },
  {
    title: 'Suspense 兜底：lazy 元素必须有边界（frontend/src/App.tsx）',
    lang: 'TSX',
    code: [
      'element={',
      '  <RouteGuard feature={f}>',
      '    {/* chunk 首次下载期间显示 PageLoading，一闪而过；首页/shell 不受影响 */}',
      '    <Suspense fallback={<PageLoading />}>{r.element}</Suspense>',
      '  </RouteGuard>',
      '}',
    ].join('\n'),
  },
  {
    title: '两级 HTTP 缓存（toolbox-starter · SpaFallbackConfig#addResourceHandlers）',
    lang: 'Java',
    code: [
      '// 1) 带内容 hash 的构建产物 → 永久 immutable：第二次打开 0 请求、直接命中本地',
      'registry.addResourceHandler("/assets/**")',
      '        .addResourceLocations(STATIC_LOCATIONS)',
      '        .setCacheControl(CacheControl.maxAge(365, TimeUnit.DAYS).cachePublic().immutable())',
      '        .resourceChain(true);',
      '',
      '// 2) 无 hash 的 index.html / favicon + SPA 路由兜底 → no-cache：',
      '//    每次发个极小校验请求；没变回 304，有新构建立刻拿到新入口→引用新 hash 资源',
      'registry.addResourceHandler("/**")',
      '        .addResourceLocations(STATIC_LOCATIONS)',
      '        .setCacheControl(CacheControl.noCache())',
      '        .resourceChain(true)',
      '        .addResolver(new SpaPathResourceResolver());',
    ].join('\n'),
  },
]

const frontendPerfTechMap: TechArchitectureMapProps = {
  title: '前端性能优化技术架构全景',
  subtitle: '从浏览器入口、Vite 构建产物、React.lazy 路由分割，到 Spring 静态资源缓存策略，一张图说明首页秒开的完整链路。',
  top: ['Browser / PWA', 'React Router', 'Vite / Rollup', 'Spring Static Resources'],
  clients: ['AppShell', 'featureRegistry', 'Lazy Route Component', 'Suspense Fallback', 'Hashed Assets'],
  left: ['首次打开', '二次打开', '移动端安装', '离线边界', '版本更新'],
  right: ['index.html', 'assets/*.js', 'assets/*.css', 'sw.js', 'manifest.json'],
  groups: [
    { title: '入口保轻', tone: 'orange', nodes: ['manifest eager', '图标/菜单即时', '页面组件 lazy', 'PageLoading 兜底'] },
    { title: '构建分包', tone: 'green', nodes: ['dynamic import', 'route chunk', 'vendor chunk', 'hash 文件名'] },
    { title: '浏览器缓存', tone: 'purple', nodes: ['immutable assets', 'index no-cache', '304 校验', '旧 hash 自然淘汰'] },
    { title: '服务端兜底', tone: 'cyan', nodes: ['SpaFallbackConfig', 'ResourceHandler', 'Cache-Control', 'SPA 路由回退'] },
  ],
  bottom: ['React.lazy', 'Suspense', 'HTTP Cache', 'ETag/304', 'Content Hash', 'PWA no-cache SW'],
  footer: 'FRONTEND PERF',
}

const frontendPerfStakeholderViews: StakeholderArchitectureViewsProps = {
  title: '面向不同角色的架构视图',
  summary: '领导先看体验价值和交付收益，总监看性能治理路径，研发再看代码分割、缓存策略和构建细节。',
  capabilities: [
    { title: '首页秒开', items: ['首屏资源变小', '等待时间变短'] },
    { title: '按需加载', items: ['进入工具才下载', '菜单即时可用'] },
    { title: '重复打开更快', items: ['资源本地缓存', '入口自动校验'] },
    { title: '版本自动更新', items: ['新包自动生效', '旧包自然淘汰'] },
    { title: '移动端体验', items: ['可安装', '低等待'] },
    { title: '交付可控', items: ['新增工具不拖慢首页', '规则可复用'] },
  ],
  value: {
    center: '前端性能治理',
    top: '用户打开更快',
    left: '研发扩展不拖慢首页',
    right: '发布更新更稳定',
    bottom: '等待与投诉下降',
  },
  business: {
    actors: ['用户', '开发者', '运维'],
    platform: 'kai-toolbox 前端',
    capabilities: ['首页秒开', '工具按需加载', '缓存自动更新'],
    outcomes: ['体验提升', '迭代更快', '维护成本下降'],
  },
  layers: [
    { title: '用户体验层', items: ['首页', '工具页', '移动端安装'] },
    { title: '前端能力层', items: ['路由分割', '懒加载', '加载兜底', '菜单独立'] },
    { title: '交付基础层', items: ['构建产物', '静态资源服务', '缓存策略', '版本更新'] },
  ],
  c4: [
    { level: 'Context', audience: '领导 / 老板', items: ['用户', '工具平台', '更快打开'] },
    { level: 'Container', audience: '总监 / 架构师', items: ['浏览器', 'React 前端', '静态资源服务'] },
    { level: 'Component', audience: '开发', items: ['featureRegistry', 'React.lazy', 'Suspense', '缓存配置'] },
    { level: 'Code', audience: '程序员', items: ['index.tsx', 'App.tsx', 'SpaFallbackConfig'] },
  ],
  chain: [
    { layer: '用户 / 业务入口', color: 'blue', items: ['浏览器（PC / 手机）', '首次访问', '重复访问'], note: '重复访问走缓存' },
    { layer: '静态资源服务层', color: 'slate', items: ['nginx / Spring Boot 静态托管', 'index.html（no-cache）', 'hash 资产（immutable）'] },
    { layer: '浏览器缓存层', color: 'emerald', items: ['Service Worker（仅可安装壳）', 'HTTP 缓存（Cache-Control）', 'hash 命中即不下载'] },
    { layer: 'React 应用层', color: 'violet', items: ['App.tsx 路由分发', 'featureRegistry（eager 元数据）', 'Suspense 加载兜底'] },
    { layer: '代码分割层', color: 'orange', items: ['React.lazy（每个 feature）', 'Vite chunk 分割', '工具页按需加载（路由触发）'] },
    { layer: '构建产物层', color: 'rose', items: ['Vite 构建', 'hash 文件名', 'frontend/dist → BOOT-INF/static'] },
  ],
  deps: [
    {
      category: '构建工具', color: 'orange',
      items: [
        { name: 'Vite 6', note: '构建 + 开发代理，chunk 分割输出 hash 文件名' },
        { name: 'TypeScript / tsc', note: '类型检查门禁，构建前强制通过' },
      ],
    },
    {
      category: '运行时框架', color: 'violet',
      items: [
        { name: 'React 19 + React Router v7', note: 'lazy/Suspense 路由分割基础' },
        { name: 'TanStack Query v5', note: '数据请求缓存层' },
      ],
    },
    {
      category: '静态托管', color: 'slate',
      items: [
        { name: 'Spring Boot（生产）', note: 'BOOT-INF/classes/static，fat jar 内嵌' },
        { name: 'Vite dev server（开发）', note: ':5173 代理 /api 到 :8080' },
      ],
    },
  ],
}

export function FrontendPerfArch() {
  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-6">
      {/* 标题 */}
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Gauge className="h-6 w-6 text-[var(--color-primary)]" />
            <h1 className="text-2xl font-bold tracking-tight">前端性能优化 · 架构与实现</h1>
            <Badge variant="secondary">实现原理</Badge>
          </div>
          <Link to="/tools/architecture" className="inline-flex shrink-0 items-center gap-1.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <ArrowLeft className="h-3.5 w-3.5" /> 返回合集
          </Link>
        </div>
        <p className="max-w-3xl text-sm text-[var(--color-muted-foreground)]">
          目标：<b className="text-[var(--color-foreground)]">首页秒开 + 内容没变就走缓存</b>。
          手段分两层——<b className="text-[var(--color-foreground)]">路由级代码分割（React.lazy）</b>砍掉首屏要 parse 的 JS 体量，
          <b className="text-[var(--color-foreground)]">两级 HTTP 缓存</b>让重复打开免下载。
          关键认知：<b className="text-[var(--color-foreground)]">缓存只省下载、省不掉 parse+execute</b>，所以首页慢的根因是「没分割」而非「没缓存」。
        </p>
      </header>

      <StakeholderArchitectureViews {...frontendPerfStakeholderViews} />

      <TechArchitectureMap {...frontendPerfTechMap} />

      {/* 问题定位 */}
      <Section icon={AlertTriangle} title="问题定位：缓存了为何还卡 5 秒" subtitle="featureRegistry 用 import.meta.glob({eager:true}) 启动即加载全部 36 个 manifest，而每个 manifest 顶层直 import 页面组件">
        <Card>
          <CardContent className="space-y-3 p-4">
            <HFlow
              steps={[
                { icon: FileCode, title: 'eager glob 全部 index.tsx', desc: '36 个 manifest' },
                { icon: Boxes, title: '每个顶层直 import 页面', desc: '连带全部依赖', tone: 'danger' },
                { icon: Layers, title: '打进同一超大首包', desc: '约 17MB JS', tone: 'danger' },
                { icon: Gauge, title: '每次打开都 parse+execute', desc: '卡约 5s', tone: 'danger' },
              ]}
            />
            <p className="text-xs text-[var(--color-muted-foreground)]">
              缓存能消掉的是 <b className="text-[var(--color-foreground)]">⬇ 下载时间</b>；消不掉的是 <b className="text-[var(--color-foreground)]">🧠 解析+编译+执行十几 MB JS</b> 的 CPU 开销——5 秒就花在这里，所以光加缓存不解决问题。
            </p>
          </CardContent>
        </Card>
      </Section>

      {/* 路由级代码分割 */}
      <Section icon={SplitSquareHorizontal} title="手段一：路由级代码分割（React.lazy）" subtitle="把页面组件挪到按需 chunk，首页只留 shell + 轻量 manifest">
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoCard icon={FileCode} title="变更前 · 首屏 JS" detail="≈ 17 MB（36 工具全打进首包，每次都要嚼一遍）" />
              <InfoCard icon={Zap} title="变更后 · 首屏 JS" detail="542 KB（gzip ~175KB），约 1/30；其余 ~16.5MB 拆成按需 chunk" />
            </div>
            <VFlow
              steps={[
                { icon: Globe, title: '打开首页', desc: '只加载 shell + 各 manifest 的图标/元数据（侧边栏即时可用）', tone: 'primary' },
                { icon: SplitSquareHorizontal, title: '进入某工具路由', desc: 'React 在 <Suspense> 下渲染 lazy 组件，才去拉它那一个 chunk' },
                { icon: Zap, title: '该工具显示', desc: '只下载这一个工具的代码，一闪而过', tone: 'accent' },
              ]}
            />
            <p className="text-xs text-[var(--color-muted-foreground)]">
              落地用一次性 codemod 把 35 个 manifest 的页面 import 统一改 lazy；<code>&lt;Page /&gt;</code> 在创建 manifest 时不触发下载，故 manifest 仍 eager、菜单不受影响。
            </p>
          </CardContent>
        </Card>
      </Section>

      {/* 两级 HTTP 缓存 */}
      <Section icon={Database} title="手段二：两级 HTTP 缓存" subtitle="hash 资源永久缓存、index.html 校验式缓存——「没变走缓存、更新自动失效」两头兼顾">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold"><Zap className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> /assets/** （带 hash）</div>
              <VFlow steps={[
                { title: 'Cache-Control: max-age=1y, immutable', tone: 'accent' },
                { title: '第二次打开 0 请求，直接命中本地' },
                { title: '内容变→文件名变→天然失效', tone: 'muted' },
              ]} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold"><Globe className="h-4 w-4 text-[var(--color-primary)]" /> index.html / SPA 兜底</div>
              <VFlow steps={[
                { title: 'Cache-Control: no-cache（仍缓存，但必校验）', tone: 'primary' },
                { title: '没变→304，几乎不传输（极快）' },
                { title: '有新构建→立刻拿到新入口→引用新 hash 资源', tone: 'accent' },
              ]} />
            </CardContent>
          </Card>
        </div>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          仅作用于打包 jar 的静态服务（生产）；dev 用 Vite(:5173) 自带 HMR/缓存，不走这套。
        </p>
      </Section>

      {/* PWA 现状 */}
      <Section icon={ShieldCheck} title="PWA 现状：可安装，但故意不接管缓存" subtitle="manifest + 图标 + sw.js + 注册都齐了，安装提示要 HTTPS（Vite mkcert 满足；jar 走 HTTP 不满足）">
        <div className="grid gap-3 sm:grid-cols-3">
          <InfoCard icon={ShieldCheck} title="可安装性已满足" detail="manifest(standalone+maskable 图标) + 注册的 sw.js + 安全上下文" />
          <InfoCard icon={AlertTriangle} title="sw.js 故意 cache-less" detail="fetch 为空操作，只为满足 Chrome 安装检测，不缓存资源" />
          <InfoCard icon={Globe} title="为何不接管缓存" detail="避免 SW「卡住旧版本」经典坑；当前由 HTTP 缓存负责，更可控" />
        </div>
      </Section>

      {/* 选型决策 */}
      <Section icon={Boxes} title="关键技术选型与取舍" subtitle="每个决策列出 ✓ 选用 · ✗ 被筛除（置灰 + 原因）">
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {decisions.map(d => <DecisionCard key={d.topic} d={d} />)}
        </div>
      </Section>

      {/* 健壮性 / 易踩坑清单 */}
      <Section icon={ShieldCheck} title="认知与易踩坑清单 → 落点" subtitle="性能优化里那些「看起来该快却没快 / 改完反而出问题」的边界">
        <div className="grid gap-3 sm:grid-cols-2">
          {guards.map(g => <GuardCard key={g.tag} {...g} />)}
        </div>
      </Section>

      {/* 代码实现简化版 */}
      <Section icon={Code2} title="代码实现简化版" subtitle="精简示意 + 逐行注释；右上角可一键复制">
        <div className="space-y-3">
          {implBlocks.map(b => <CodeBlock key={b.title} {...b} />)}
        </div>
      </Section>
    </div>
  )
}
