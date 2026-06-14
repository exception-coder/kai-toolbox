import { Link } from 'react-router-dom'
import {
  ArrowLeft, Users, Sparkles, ListChecks, FileText, Layers, Bot, Boxes, Route, ShieldCheck,
  Wrench, ScrollText, BookOpen, GitMerge, Workflow, ClipboardCheck, Database, Cpu, Library, GitFork,
  Plug, Terminal, MousePointer2, PackageCheck, FileCode2, Blocks,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Section, HFlow, VFlow, InfoCard, DecisionCard, GuardCard, CodeBlock, type Decision } from '../components/arch-ui'

// 五大核心原则：把「买工具」纠正为「建工作流 + 用确定性关住 LLM 的不确定性」。
const principles: { icon: typeof Users; title: string; detail: string }[] = [
  { icon: Workflow, title: '工作流 > 工具', detail: '可复制的 SDD / Prompt 库 / 知识库 / 流水线，胜过人手一个 Cursor。买模型最容易，建工作流最难。' },
  { icon: FileText, title: '文档先行（SDD）', detail: 'Spec → Task → 生成 → Review → Merge。禁止「帮我写个登录」式裸提——先把输入/输出/异常写清，再让 AI 编码。' },
  { icon: ShieldCheck, title: '确定性优先（LLM-last）', detail: '能用程序固定/计算/校验的就别交给 LLM。LLM 输出一律当不可信入参，由代码校验+归一化——「LLM 提议，代码裁决」。' },
  { icon: Database, title: '知识下沉（RAG）', detail: 'AI 不懂公司代码就只是初级开发。把设计/接口/库表/规范/历史项目/故障复盘向量化供给，AI 才像老员工。' },
  { icon: ScrollText, title: '护栏即代码', detail: '规范不是躺在 wiki 里靠自觉，而是写成可执行的 hook / skill，在写码、提交时自动触发拦截。' },
]

// GPT 的 5 阶段重构为 5 个并行建设的能力支柱（capability，非纯线性）。
const pillars: { icon: typeof Users; title: string; detail: string }[] = [
  { icon: Wrench, title: '① 统一工具栈', detail: '主力 Cursor / Claude Code + 补全 Copilot + 本地 Ollama。统一模型版本、Prompt 规范、目录结构、编码规范——否则各自野蛮生长。' },
  { icon: FileText, title: '② SDD 规范', detail: 'Spec / Task 模板库 + 验收口径。需求先成文，再拆任务，最后才生成代码。' },
  { icon: BookOpen, title: '③ Prompt / 规范库', detail: '按语言/场景（java / vue / sql / test / review / arch）版本化共享；进一步固化为自动触发的 skill / 规则。' },
  { icon: Bot, title: '④ 多 Agent 流水线', detail: '架构 / 开发 / Review / QA 四类 Agent，各有明确的输入与输出契约，串成可复现流水线。' },
  { icon: Database, title: '⑤ 知识库 RAG', detail: '团队知识源向量化后供给 AI——最重要、也最被低估。决定 AI 是「通用初级」还是「懂业务的老员工」。' },
]

// 落地形态：把方法论沉淀成几个 repo / 插件，职责分离、互不污染。
const repoLayers: {
  tag: string; icon: typeof Users; name: string; count: string;
  has: string; not: string; who: string; real: string;
}[] = [
  {
    tag: '①', icon: ScrollText, name: '通用规范插件', count: '1 个 · 全员共享',
    has: '编码铁律、各语言规范、SDD 流程、文档/知识图谱/术语/反向索引的「方法论与模板」、commit/注释/bug 规范、配套 hook',
    not: '任何具体项目的业务知识——只放「怎么做」，不放「是什么」',
    who: '团队统一维护，一份装到每个项目',
    real: '即你已有的 team-standards 插件',
  },
  {
    tag: '②', icon: Database, name: '知识库项目集（集中式）', count: '1 个 · 统一管理',
    has: '各项目知识图谱 / ER / 术语 / 反向索引 / 画像 / bug 复盘，按「项目名」分目录集中存放',
    not: '通用规则（归①）、跨项目拓扑（归③）',
    who: '独立 repo、专人 + 方法论 skill 维护；业务项目同事不直接改，杜绝误触改乱',
    real: '一个独立 repo，内分 korepos/、kai-toolbox/… 子目录，经 MCP / 多根工作区载入工具',
  },
  {
    tag: '③', icon: GitFork, name: '跨项目拓扑库', count: '1 个 · 生态级',
    has: '≥2 个项目间的调用链、服务拓扑、跨项目数据流',
    not: '单项目内部知识（归②），别混进任何单项目库',
    who: '由 cross-project-locator 类 skill 维护',
    real: '即你已有的 kpay-pos-topology',
  },
  {
    tag: '④', icon: Sparkles, name: 'Prompt / Agent 资产库', count: '1 个 · 可选',
    has: '版本化 Prompt 模板、四类 Agent 工作流（架构/开发/Review/QA）、需求库',
    not: '项目业务知识（归②）',
    who: '团队沉淀，可并入①或独立成库',
    real: '方法论「五件套」里的 Prompt 库 + Agent 库 + 需求库',
  },
]

// 一份规范源 → 导出各编程工具吃的格式，同事用哪个工具都吃同一套。
const toolTargets: { icon: typeof Users; name: string; how: string }[] = [
  { icon: Bot, name: 'Claude Code', how: '装成 plugin：skill 自动触发 + hook 在提交期拦截（team-standards 现成形态）' },
  { icon: Terminal, name: 'Codex', how: '导出为 AGENTS.md / 项目根规则文件，作为统一上下文注入' },
  { icon: MousePointer2, name: 'Cursor', how: '同一份源导出为 .cursor/rules/*.mdc，规则随项目自动生效' },
]

// ②③ 这类纯知识 repo（非 plugin/skill）怎么载入工具——按需，不塞进业务项目仓库。
const kbLoad: { icon: typeof Users; name: string; how: string }[] = [
  { icon: Database, name: 'MCP 知识服务（最优）', how: '知识库做成 MCP server，Claude Code / Codex / Cursor 通吃；按「项目+问题」检索，按需取、不会一次读太多' },
  { icon: Boxes, name: '多根工作区', how: 'Cursor / VS Code 同时打开「业务项目 + 知识库」两个根，跨根索引与 @ 引用' },
  { icon: GitFork, name: 'git submodule 只读', how: '知识库作只读子模块挂进项目；源唯一在独立 repo，要改回源改，杜绝误触' },
]

function LayerRow({ k, v, tone }: { k: string; v: string; tone?: 'real' }) {
  return (
    <div className="flex gap-2">
      <span className={`w-16 shrink-0 font-medium ${tone === 'real' ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--color-foreground)]'}`}>{k}</span>
      <span className="min-w-0 text-[var(--color-muted-foreground)]">{v}</span>
    </div>
  )
}

const specTemplate = [
  '# 用户登录                # ← Spec：先成文，无 Spec 不生成代码',
  '',
  '## 输入',
  '- username: string       # 账号',
  '- password: string       # 明文，前端不落库',
  '',
  '## 输出',
  '- token: JWT             # 成功返回，有效期 2h',
  '',
  '## 异常（确定性分支，代码裁决，不靠 LLM 自由发挥）',
  '- 密码错误 → 401  AUTH_BAD_CREDENTIAL',
  '- 账号冻结 → 403  AUTH_FROZEN',
  '- 连续失败 5 次 → 锁定 15min',
  '',
  '## 验收',
  '- 单测覆盖三条异常分支 + 正常路径',
  '',
  '# 反例：「帮我写个登录功能」——无契约、无异常口径，效果差很多。',
].join('\n')

const decisions: Decision[] = [
  {
    topic: '规范的载体',
    chosen: { name: '可执行 hook / skill（写码时自动触发）', reason: '规范在编辑/提交瞬间拦截，不可绕过；规范即代码、可版本化、可演进' },
    rejected: [{ name: '静态 Markdown 文档', reason: '躺在 wiki 靠自觉，半年后没人看；新人不知道、老人不遵守' }],
  },
  {
    topic: '知识供给方式',
    chosen: { name: 'RAG 检索注入 + 项目画像', reason: '按需把相关设计/库表/历史代码喂给 AI；上下文精准、可随项目更新' },
    fallback: { name: '长 Prompt 全量塞', reason: '小项目临时可用，但易超窗、贵、检索不到细节' },
    rejected: [{ name: '微调专用模型', reason: '成本高、知识更新慢、跟不上代码演进；多数团队不划算' }],
  },
  {
    topic: 'Agent 编排',
    chosen: { name: '确定性脚本编排（流水线固定）', reason: '步骤、交接、校验点写死在程序里，可复现、可测试、可回归' },
    rejected: [{ name: '全靠模型自由编排', reason: '每次路径不同、不可复现，出问题难定位，无法纳入 CI' }],
  },
  {
    topic: 'AI 写操作粒度',
    chosen: { name: '实体级 + 按 id 幂等', reason: '爆炸半径锁死单条，AI 幻觉只影响它显式要改的那一条' },
    rejected: [{ name: '整份覆盖（一个大 save）', reason: 'AI 须每次完美重述全量，一处幻觉即整体静默损坏' }],
  },
]

// 项目个性化规范怎么承载——plugin 少而稳，个性化走项目内配置 + 就近覆盖。
const pluginShape: Decision = {
  topic: '项目个性化规范怎么承载',
  chosen: { name: '项目内配置 + 通用 plugin 消费（就近覆盖）', reason: '个性化是「配置数据」不是「新插件」；加项目零成本、通用层不动、扩展隔离' },
  fallback: { name: '领域 / 语言 plugin 叠加', reason: '仅当个性化是真正的「规则逻辑 / 检查」而非配置值时，才单独做一层可选 plugin' },
  rejected: [{ name: '每个项目一个 plugin', reason: 'N 项目 N 插件 → 分发 / 版本 / 安装爆炸；配置值不该用插件承载' }],
}

// 落地路线图：覆盖率是结果不是目标，每阶段用「能否复现」作可度量的退出门槛。
const roadmap: { tag: string; risk: string; guard: string }[] = [
  { tag: 'P1', risk: '1 月 · AI 辅助编码 · 覆盖 ~20%', guard: '收益：补全 / 生成单测 / 生成文档。退出门槛：全员工具就位 + Spec 模板跑通 1 个真实需求' },
  { tag: 'P2', risk: '2~3 月 · AI 参与开发 · ~50%', guard: '收益：CRUD / 接口 / 测试自动生成。退出门槛：Prompt 库 + 规范 skill 上线，新接口默认走 SDD' },
  { tag: 'P3', risk: '3~6 月 · Agent 开发模式 · ~70%', guard: '收益：需求 → 代码半自动。退出门槛：四 Agent 流水线打通 1 条完整业务线' },
  { tag: 'P4', risk: '6~12 月 · 企业级稳态', guard: '需求库 + Prompt 库 + 知识库 + Agent 库 + 规范 五件套；RAG 接入历史项目，Review 由 AI 首过、人复核' },
]

// 常见失败模式 → 确定性护栏。光看 demo 看不出来，落地半年才暴露。
const antiPatterns: { tag: string; risk: string; guard: string }[] = [
  { tag: '①', risk: '裸提「帮我写个登录」，效果差、返工多', guard: '强制 Spec 模板（输入/输出/异常/验收），无 Spec 不生成' },
  { tag: '②', risk: 'AI 不懂公司代码，凭空编出不存在的接口', guard: '知识库 RAG + 项目画像，检索注入真实上下文而非臆造' },
  { tag: '③', risk: '规范靠自觉，新人不知道、老人不遵守', guard: '写成 hook / skill，在写码/提交时自动触发拦截' },
  { tag: '④', risk: 'LLM 幻觉静默损坏数据 / 逻辑', guard: '代码校验+归一化（LLM 提议、代码裁决）+ 实体级幂等写' },
  { tag: '⑤', risk: '每人重复造 prompt 和轮子，风格不一', guard: '版本化共享 Prompt / 规范库，统一输出风格' },
  { tag: '⑥', risk: '覆盖率自评虚高，demo 好看上线翻车', guard: '用「能否复现 / 能否回归」度量，而非拍脑袋百分比' },
]

export function TeamVibeCoding() {
  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-6">
      {/* 标题 */}
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6 text-[var(--color-primary)]" />
            <h1 className="text-2xl font-bold tracking-tight">团队 Vibe Coding 落地规范</h1>
            <Badge variant="secondary">方法论</Badge>
          </div>
          <Link to="/tools/architecture" className="inline-flex shrink-0 items-center gap-1.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <ArrowLeft className="h-3.5 w-3.5" /> 返回合集
          </Link>
        </div>
        <p className="max-w-3xl text-sm text-[var(--color-muted-foreground)]">
          团队落地 Vibe Coding 的核心<b className="text-[var(--color-foreground)]">不是给每人装 Cursor</b>，而是建立一套可复制的工作流：
          <b className="text-[var(--color-foreground)]">SDD 规范 + Prompt 库 + 知识库 RAG + 多 Agent 流水线 + AI Review</b>，
          把研发从「人写代码」升级为「人定义需求 → AI 生产代码 → 人验收」。难点不在买模型，而在用<b className="text-[var(--color-foreground)]">确定性护栏</b>把 LLM 的不确定性关进笼子。
        </p>
      </header>

      {/* 心智转变 */}
      <Section icon={Sparkles} title="心智转变：人写代码 → 人定义需求 / AI 生产 / 人验收" subtitle="但「AI 写、人审」不等于放任——规范、Spec、知识库、自动护栏是 AI 的轨道">
        <Card>
          <CardContent className="space-y-3 p-4">
            <HFlow steps={[
              { icon: Cpu, title: '传统：人写代码', desc: 'AI 仅补全', tone: 'muted' },
              { icon: Sparkles, title: 'Vibe Coding', desc: '人定义需求 / AI 生产 / 人验收', tone: 'primary' },
            ]} />
            <p className="text-xs text-[var(--color-muted-foreground)]">
              关键纠偏：LLM 只在<b className="text-[var(--color-foreground)]">真正模糊</b>的理解判断处发挥，其余（流程、校验、契约、状态分支）一律交给确定性程序。
              LLM 的每一次输出都是<b className="text-[var(--color-foreground)]">不可信入参</b>，由代码校验后才采纳——这是整套规范的底色。
            </p>
          </CardContent>
        </Card>
      </Section>

      {/* 五大核心原则 */}
      <Section icon={ListChecks} title="五大核心原则" subtitle="区别于「堆工具」的系统性视角：先立原则，再落支柱">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {principles.map(p => <InfoCard key={p.title} icon={p.icon} title={p.title} detail={p.detail} />)}
        </div>
      </Section>

      {/* SDD 流水线 */}
      <Section icon={FileText} title="SDD：规格驱动开发流水线" subtitle="文档先行。每一步标注主导方——人 / 代码 / LLM，交接处都有裁决点">
        <Card>
          <CardContent className="space-y-3 p-4">
            <HFlow steps={[
              { icon: FileText, title: '需求', desc: '人', tone: 'primary' },
              { icon: ClipboardCheck, title: 'Spec 规格', desc: '人定义 + 模板约束' },
              { icon: ListChecks, title: 'Task 拆解', desc: '人 / 代码' },
              { icon: Bot, title: 'AI 生成', desc: 'LLM', tone: 'accent' },
              { icon: ShieldCheck, title: 'Review', desc: '静态检查 + AI + 人' },
              { icon: GitMerge, title: 'Merge', desc: '人裁决', tone: 'primary' },
            ]} />
            <CodeBlock title="Spec 模板示例（无 Spec 不生成代码）" lang="Markdown" code={specTemplate} />
          </CardContent>
        </Card>
      </Section>

      {/* 五大支柱 */}
      <Section icon={Layers} title="五大落地支柱" subtitle="GPT 的 5 阶段重构为 5 个可并行建设的能力，而非纯线性排队">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pillars.map(p => <InfoCard key={p.title} icon={p.icon} title={p.title} detail={p.detail} />)}
        </div>
      </Section>

      {/* 落地形态：要建几个 repo / 插件 */}
      <Section icon={Library} title="落地形态：要建几个 repo / 插件" subtitle="把上面的能力沉淀成分层资产——规则、项目知识、跨项目拓扑各自独立，互不污染">
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {repoLayers.map(l => (
            <Card key={l.tag}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-xs font-semibold text-[var(--color-primary)]">{l.tag}</span>
                  <l.icon className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                  <span className="text-sm font-semibold">{l.name}</span>
                  <Badge variant="outline" className="ml-auto shrink-0 text-[11px]">{l.count}</Badge>
                </div>
                <div className="space-y-1 text-xs">
                  <LayerRow k="放什么" v={l.has} />
                  <LayerRow k="不放" v={l.not} />
                  <LayerRow k="谁维护" v={l.who} />
                  <LayerRow k="落地" v={l.real} tone="real" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          一句话：<b className="text-[var(--color-foreground)]">① 放「怎么做」、② 放「是什么」、③ 放「项目间怎么连」、④ 放「可复用的提问与编排」</b>。
          新项目落地 = 装上①（规范不重搭）→ 在②知识库项目集里加一个「项目名」子目录 → 有跨项目调用才登记③。知识集中托管、专人维护，业务同事改不乱；AI 按需检索，各取所需。
        </p>

        {/* 边界示例：项目特定约束怎么分 */}
        <Card className="border-dashed">
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileCode2 className="h-4 w-4 text-[var(--color-primary)]" /> 边界示例：项目特定约束（如文件编码 GBK / UTF-8）放哪？
            </div>
            <div className="space-y-1 text-xs">
              <LayerRow k="规则①" v="通用铁律：AI 改代码前，① plugin 的通用 hook 向 ② MCP 查回该项目编码并据此生成，禁止擅自换；MCP 未登记则探测兜底、再不行退默认 UTF-8 —— 进 team-standards" />
              <LayerRow k="来源·强制" v="来源＝② MCP 知识库（按项目登记、查回即用，不碰业务项目）；强制＝① plugin 通用 hook（全局装一次）：生成前查回 + 生成/提交后校验编码、违反即拦或转码；MCP 缺/挂则探测兜底" tone="real" />
              <LayerRow k="知识库②" v="正是规则单一源：按项目登记编码等约束，运行时查回 —— 不必在每个项目放文件" />
              <LayerRow k="为什么" v="强制点在通用 hook（全局一次）不在每个项目 → 既集中管理、查回即用，又有确定性拦截力，不靠自觉" />
            </div>
            <p className="text-[11px] leading-snug text-[var(--color-muted-foreground)]">
              软知识与硬约束都登记在 <b className="text-[var(--color-foreground)]">② MCP 知识库</b>（单一源、查回即用，不碰每个项目）；区别在执行：
              <b className="text-[var(--color-foreground)]">软知识</b>（业务/术语/ER）AI 查询即遵守，<b className="text-[var(--color-foreground)]">硬约束</b>（编码/格式）由 <b className="text-[var(--color-foreground)]">① 通用 hook 查回后校验·拦截</b> + MCP 缺时探测兜底。
              规则集中、强制力在通用 hook 不靠自觉——确定性优先。
            </p>
          </CardContent>
        </Card>
      </Section>

      {/* 分发与导入 */}
      <Section icon={Plug} title="分发与导入：规则导出 + 知识载入" subtitle="规范一份源导出各工具；知识库（②③）经 MCP / 多根工作区按需载入，不塞进业务项目仓库">
        <div>
          <div className="mb-2 text-sm font-medium">① 规范 → 规则形态（自动触发，一份源多导出）</div>
          <div className="grid gap-3 sm:grid-cols-3">
            {toolTargets.map(t => <InfoCard key={t.name} icon={t.icon} title={t.name} detail={t.how} />)}
          </div>
        </div>
        <div>
          <div className="mb-2 text-sm font-medium">②③ 知识 → 数据形态（按需检索，不进业务仓库、改不乱）</div>
          <div className="grid gap-3 sm:grid-cols-3">
            {kbLoad.map(t => <InfoCard key={t.name} icon={t.icon} title={t.name} detail={t.how} />)}
          </div>
        </div>

        {/* 明确：要单独新建几个 repo */}
        <Card className="border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5">
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <PackageCheck className="h-4 w-4 text-[var(--color-primary)]" /> 要单独新建几个 repo？3 个独立库
            </div>
            <div className="space-y-1 text-xs">
              <LayerRow k="① 规范" v="规则插件，一份源多工具导出 —— 单独建 1 个 repo（team-standards）" />
              <LayerRow k="② 知识库" v="集中式项目集，按项目名分目录、专人维护防误改 —— 单独建 1 个 repo" />
              <LayerRow k="③ 拓扑" v="跨项目公共支撑，独立 —— 单独建 1 个 repo（kpay-pos-topology）" />
              <LayerRow k="载入" v="① 装成 plugin / rules；②③ 经 MCP 服务或多根工作区按需读，都不塞进业务项目仓库" tone="real" />
              <LayerRow k="第一步" v="先把①装好，向团队讲清「这插件管什么、何时自动触发」，再建②③" tone="real" />
            </div>
          </CardContent>
        </Card>
      </Section>

      {/* 规范分层与扩展 */}
      <Section icon={Blocks} title="规范分层与扩展：通用稳、个性化就近覆盖" subtitle="像 ESLint extends+overrides / .editorconfig cascade——通用层给默认，项目层给覆盖，越靠近项目越优先">
        <Card>
          <CardContent className="space-y-3 p-4">
            <VFlow steps={[
              { icon: ScrollText, title: '① 通用 plugin（基线）', desc: 'team-standards：跨项目铁律 + 机制 + 默认值；改这里全局生效', tone: 'primary' },
              { icon: Wrench, title: '② 领域 plugin（可选）', desc: 'java / 后端等专属；仅当是「规则逻辑」才建（已有 java-coding-standards…）', tone: 'muted' },
              { icon: FileCode2, title: '③ 项目内覆盖（一般不用）', desc: '默认全查 ② MCP；仅个别项目想本地覆盖时才放 .editorconfig 等，非必备', tone: 'accent' },
            ]} />
            <p className="text-xs text-[var(--color-muted-foreground)]">
              合并裁决：<b className="text-[var(--color-foreground)]">项目 &gt; 领域 &gt; 通用</b>，就近覆盖，<b className="text-[var(--color-foreground)]">缺哪层下一层兜底</b>——多数项目零配置（靠探测 + 通用默认），仅个别需个性化时才按需放配置，<b className="text-[var(--color-foreground)]">配置文件非必备</b>。
              约束的是「按真实值生成 + 校验」这个<b className="text-[var(--color-foreground)]">行为</b>，不绑定某个文件存在；约定位置就近发现、零中心注册、不动 plugin。机制在通用层、值在项目层——通用好改、个性化隔离。
            </p>
          </CardContent>
        </Card>
        <DecisionCard d={pluginShape} />

        {/* 个性化规则放 MCP 知识库：登记 vs 执行 */}
        <Card className="border-dashed">
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Database className="h-4 w-4 text-[var(--color-primary)]" /> 项目个性化规则放 ② MCP 知识库？统一登记可以，软硬分流执行
            </div>
            <div className="space-y-1 text-xs">
              <LayerRow k="登记源" v="集中在 ② MCP 知识库、按项目登记 —— 一处可改可查，满足统一管理" />
              <LayerRow k="软规则" v="命名 / 架构约定 / 业务倾向：AI 运行时查 MCP 即用，建议性、查到即遵守" />
              <LayerRow k="硬约束" v="编码 / 格式 / lint：MCP 登记值查回即用；强制由 ① plugin 通用 hook（全局装一次、不碰每个项目）校验·拦截 + MCP 缺时探测兜底" tone="real" />
              <LayerRow k="原则" v="强制点在通用 hook（全局一次）、规则集中在 MCP 查回 —— 不在每个项目放文件，仍有确定性拦截力。LLM 提议、代码裁决" />
            </div>
          </CardContent>
        </Card>
      </Section>

      {/* 多 Agent 流水线 */}
      <Section icon={Bot} title="多 Agent 流水线" subtitle="拆成各司其职的 Agent；每个的输出是下一个的「不可信入参」，交接处校验而非链式盲信">
        <Card>
          <CardContent className="space-y-3 p-4">
            <VFlow steps={[
              { icon: Boxes, title: '架构 Agent', desc: '需求分析 / 技术选型 / 设计方案 → design.md', tone: 'primary' },
              { icon: Cpu, title: '开发 Agent', desc: '编码 / 重构 / 单测 → xxx.java + 测试' },
              { icon: ShieldCheck, title: 'Review Agent', desc: '代码审查 / 安全 / 性能 → review.md' },
              { icon: ClipboardCheck, title: 'QA Agent', desc: '测试用例 / 接口 / 边界 → test_case.md' },
              { icon: GitMerge, title: '人验收 → 上线', desc: '最终裁决在人', tone: 'accent' },
            ]} />
            <p className="text-xs text-[var(--color-muted-foreground)]">
              流水线用<b className="text-[var(--color-foreground)]">确定性脚本编排</b>（步骤、交接、校验点固定），而非让模型自由决定下一步——这样才可复现、可测试、可纳入 CI。
            </p>
          </CardContent>
        </Card>
      </Section>

      {/* 代码审核分层：跨模型审核放哪 */}
      <Section icon={ShieldCheck} title="代码审核的正确分层（跨模型审核该放哪阶段）" subtitle="先纠正概念：「用 Codex 审 Claude」是多模型交叉审，不是多 Agent（角色分工同一最强模型即可）">
        <Card>
          <CardContent className="space-y-3 p-4">
            <VFlow steps={[
              { icon: ShieldCheck, title: '确定性工具（主力）', desc: 'CI / 测试 / 静态分析 / 规范 hook —— P1 就该有，能固定的全固定', tone: 'primary' },
              { icon: Bot, title: '最强模型自审（基线）', desc: '同一最强模型冷审语义 / 意图 —— P1~P2，性价比最高' },
              { icon: Users, title: '人裁决（始终）', desc: '最终把关，握验收权', tone: 'accent' },
              { icon: GitFork, title: '跨模型交叉审（可选增强）', desc: '换 Codex 等审 Claude —— P3+，仅高风险 + 确定性覆盖不到的语义', tone: 'muted' },
            ]} />
            <p className="text-xs text-[var(--color-muted-foreground)]">
              跨模型交叉审有价值但<b className="text-[var(--color-foreground)]">不前置</b>：第一阶段先落地「有产出」，审核靠<b className="text-[var(--color-foreground)]">确定性工具 + 最强模型自审 + 人裁决</b>三层基线已足够。
              现代最强模型能力<b className="text-[var(--color-foreground)]">高度重叠</b>，交叉审的增量 &lt; 引入第二套模型（账号 / 配额 / 集成 / Prompt 维护）的成本，故定位为 <b className="text-[var(--color-foreground)]">P3+、仅高风险变更</b>才启用的可选项。
              能用程序固定的审核（空指针 / 并发 / 注入 / 分层违规 / 回归）一律交确定性工具，别再加一个模型——这就是「确定性优先」。
            </p>
          </CardContent>
        </Card>
      </Section>

      {/* 选型决策 */}
      <Section icon={Boxes} title="关键选型与取舍" subtitle="每个决策列出 ✓ 选用 · 降级备选 · ✗ 被筛除（置灰 + 原因）">
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {decisions.map(d => <DecisionCard key={d.topic} d={d} />)}
        </div>
      </Section>

      {/* 落地路线图 */}
      <Section icon={Route} title="落地路线图（带可度量退出门槛）" subtitle="覆盖率是结果不是目标；每阶段用「能否复现」作门槛，避免虚高自评">
        <div className="grid gap-3 sm:grid-cols-2">
          {roadmap.map(r => <GuardCard key={r.tag} {...r} />)}
        </div>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          终态：传统开发 = 人写代码 / AI 辅助；Vibe Coding = AI 写代码 / 人审核——但人始终握着<b className="text-[var(--color-foreground)]">需求定义权与验收裁决权</b>。
        </p>
      </Section>

      {/* 反模式 → 护栏 */}
      <Section icon={ShieldCheck} title="反模式 → 确定性护栏" subtitle="这些坑光看 demo 发现不了，落地半年才暴露">
        <div className="grid gap-3 sm:grid-cols-2">
          {antiPatterns.map(a => <GuardCard key={a.tag} {...a} />)}
        </div>
      </Section>
    </div>
  )
}
