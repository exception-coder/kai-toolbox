import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Database, Eye, EyeOff, Loader2, Rocket, Warehouse } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listWorkspaces } from '@/features/claude-chat/api'
import { CHAT_ROUTE } from '@/features/claude-chat/runtime/ChatRuntimeContext'
import { DevServiceSection } from '@/features/_devkit/DevServiceSection'
import { useDevWorkbenchPreference } from '@/features/_devkit/useDevWorkbenchPreference'
import { getScmDbConfig, saveScmDbConfig, testScmDb } from '../api'

// 复用 Vibe Coding 的 handoff 通道（ChatPage 挂载时消费：开会话 + 投喂触发语）
const LAUNCH_KEY = 'kai-toolbox:claude-chat:erp-dev-launch'
/** 记住上次选择的工作区目录，避免每次进来都要重选。 */
const CWD_KEY = 'kai-toolbox:scm-dev:cwd'
/** 记住上次填的模块与需求描述，避免每次重输。 */
const MODULE_KEY = 'kai-toolbox:scm-dev:module'
const REQUIREMENT_KEY = 'kai-toolbox:scm-dev:requirement'

/**
 * 拼装投喂给 yoooni-erp-auto-dev skill 的 SCM 版触发语。
 * 大脑复用 ERP 自动开发流水线的骨架（定位→查知识图谱/库→方案→改码→自闭环验证→diff），
 * 按 SCM 技术栈改口径：Mall4j(yami-shop) Spring Boot 2.3.6 + Java8 + MyBatis-Plus 分层 + Vue2 前端；
 * 双数据源（master=MySQL yoooni_scm、erp=Oracle，经 @DS 切换）。
 * 知识图谱目前尚无 scm-system 专属知识条目——触发语里如实注明，第②步查不到就跳过/事后再补登，不卡流程。
 * SCM 暂无像 ERP/SRM 那样的网关登录态可供实发，验证口径改为「提示重启后用 mcp__scm_db__query 只读回读」。
 */
function buildSeed(moduleName: string, requirement: string): string {
  return [
    '用 yoooni-erp-auto-dev 的门控流水线开发一个 SCM 小需求（技术栈=Mall4j(yami-shop) Spring Boot 2.3.6 + Java8 + MyBatis-Plus + Vue2 前端；双数据源 master=MySQL(yoooni_scm) + erp=Oracle，经 @DS 切换）。',
    `模块/页面：${moduleName}`,
    '需求：',
    requirement.trim(),
    '',
    '请按门控流程走，每步过关卡等我拍板：',
    '① 定位代码：前端 src/api/<域>/ ↔ 后端 controller/admin/<域>/<E>Controller 的映射定位改动点，念给我确认命中；',
    '② 查业务知识图谱(domain-knowledge project=scm-system，目前尚无专属条目，查不到就跳过、提示我事后补登)+库',
    '   （状态机/状态字典/表结构，以 MySQL DDL 为准；涉及 Oracle erp 数据源的部分另说明，不主动改）；',
    '③ 出轻量方案(design-doc)让我确认，并给出「验收清单」：每条=触发动作(接口+参数)→期望结果(可机检，含回读 SQL)；',
    '④ 按 MyBatis-Plus 分层(controller→service→dal→vo)改码（禁止 SELECT *、Swagger 注解齐全、debug/error 日志分清；',
    '   DB/迁移/状态字典改动单独确认）；',
    '⑤ 静态自检：对应模块(如 yami-shop-admin)编译通过；',
    '⑥ 自闭环验证：提示我让改动生效(重启对应服务)后，按验收清单用 mcp__scm_db__query 只读回读 MySQL 逐条判 PASS/FAIL，',
    '   输出「查库验证区块」(SQL + 结果)；SCM 暂无网关登录态实发工具，接口层面的效果需要我手动核对；不符就修正再验(上限3次)；',
    '⑦ 汇总 diff、只改不提交。',
  ].join('\n')
}

/**
 * SCM 需求开发前门：填「SCM 工作区目录 + 模块 + 需求」→ 一键。
 * 把 {cwd, seed} 交给 Vibe Coding（写 sessionStorage 后跳转），由其在该工作区开一个 Claude 会话、
 * 投喂触发语拉起 yoooni-erp-auto-dev skill；真正的对话/关卡/权限确认在成熟的 Vibe Coding 界面里进行。
 * 服务启停/日志复用通用 DevServiceSection；调试必备配置（MySQL 只读库）走后端 KV 持久化。
 */
export function ScmDevPage() {
  const navigate = useNavigate()
  const { data: workspaces } = useQuery({ queryKey: ['claude-chat-workspaces'], queryFn: listWorkspaces, staleTime: 5000 })

  // 拍平所有工作区根下的一级目录，供选 SCM 项目；path 唯一，label 带根名便于区分同名
  const dirs = useMemo(() => {
    const out: { path: string; label: string }[] = []
    for (const r of workspaces?.roots ?? []) {
      if (!r.exists) continue
      const rootName = r.root.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || r.root
      for (const d of r.dirs) out.push({ path: d.path, label: `${d.name}（${rootName}）` })
    }
    return out
  }, [workspaces])

  const devPreference = useDevWorkbenchPreference('scm-dev', {
    cwd: CWD_KEY, module: MODULE_KEY, requirement: REQUIREMENT_KEY,
  })
  const { cwd, module: moduleName, requirement } = devPreference.preference

  const pickCwd = (p: string) => devPreference.setField('cwd', p)
  const editModule = (v: string) => devPreference.setField('module', v)
  const editRequirement = (v: string) => devPreference.setField('requirement', v)

  // 目录列表就绪后：保留上次记住的选择（仍存在时），否则回退到第一个
  useEffect(() => {
    if (!devPreference.hydrated || dirs.length === 0) return
    if (!dirs.some(d => d.path === cwd)) pickCwd(dirs[0].path)
  }, [devPreference.hydrated, dirs, cwd])

  const canStart = cwd.length > 0 && moduleName.trim().length > 0 && requirement.trim().length > 0
  const start = () => {
    if (!canStart) return
    const seed = buildSeed(moduleName.trim(), requirement)
    try { sessionStorage.setItem(LAUNCH_KEY, JSON.stringify({ cwd, seed })) } catch { /* 隐私模式忽略 */ }
    navigate(CHAT_ROUTE)
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Warehouse className="size-5 text-[var(--color-primary)]" />
        <h1 className="text-lg font-semibold">SCM需求开发</h1>
      </div>
      <p className="mb-5 text-sm text-[var(--color-muted-foreground)]">
        填「模块 + 需求」，交给自动开发 agent（yoooni-erp-auto-dev 门控流水线）：定位代码 → 查库 →
        出方案 → 按 MyBatis-Plus 分层改码 → <b>自闭环验证</b>（MySQL 只读回读）→ 出 diff。关键处（命中代码 /
        方案 / DB 改动 / 生效重启）会停下让你确认，<b>只改不提交</b>。
      </p>

      <div className="space-y-4 rounded-xl border bg-[var(--color-card)] p-4">
        <div>
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">SCM 项目目录（工作区）</label>
          <select
            value={cwd}
            onChange={e => pickCwd(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border bg-[var(--color-background)] px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            {dirs.length === 0 && <option value="">（无可用项目目录，请在 application.yml 配 workspace.roots）</option>}
            {dirs.map(d => <option key={d.path} value={d.path}>{d.label}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">模块 / 页面（中文业务域名或模块名）</label>
          <Input
            value={moduleName}
            onChange={e => editModule(e.target.value)}
            placeholder="如：织造工单  或  入库单  或  调拨单"
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">需求描述</label>
          <textarea
            value={requirement}
            onChange={e => editRequirement(e.target.value)}
            rows={5}
            placeholder="用中文把要做的改动说清楚，例如：入库单列表增加「按仓库筛选」，并在导出里带上该列。"
            className="mt-1 w-full resize-y rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button disabled={!canStart} onClick={start} className="gap-1">
            <Rocket className="size-4" />开始开发
          </Button>
          <span className="text-xs text-[var(--color-muted-foreground)]">开始后进入 Vibe Coding 实时查看过程、在关卡处确认。</span>
        </div>
      </div>

      <DevServiceSection
        serviceId="scm"
        dirs={dirs}
        defaultCwd={cwd}
        preference={devPreference.preference.services.scm}
        onPreferenceChange={value => devPreference.setService('scm', value)}
        defaultCommand="powershell -NoProfile -ExecutionPolicy Bypass -File .\\SCM\\start-scm.ps1 -Foreground -FrontendPath 'D:\\Users\\zhang\\myWork\\scm-system\\scm-front-end'"
        stopCommand="powershell -NoProfile -ExecutionPolicy Bypass -File .\\SCM\\stop-scm.ps1"
        commandPlaceholder="首次或改过公共模块加 -Build：… start-scm.ps1 -Foreground -Build"
        title="SCM 服务启停 + 启动日志"
        readinessPorts={[
          { label: 'backend', port: 8085 },
          { label: 'frontend', port: 9528 },
        ]}
      />
      <ScmDbConfigSection />

      <p className="mt-4 text-[11px] text-[var(--color-muted-foreground)]">
        「大脑」复用团队插件里的 yoooni-erp-auto-dev skill（SCM 版触发语已按 Mall4j + MyBatis-Plus 改口径）。
        启停用 start-scm.ps1 -Foreground（前台合并模式）：后端/前端日志按 [backend]/[frontend] 前缀合并到本区，停服对进程树整体清理。
        SCM 暂无网关登录态实发工具，自闭环验证只做只读查库回读，接口层效果需人工核对。
      </p>
    </div>
  )
}

/**
 * SCM 测试库（MySQL 只读）：配置连接信息，agent 通过后端只读 scm_db MCP 查库核对逻辑。
 * 建议只读账号；后端另有 SELECT-only 双闸。内部单用户系统，密码直接回显供核对/纠正。
 */
function ScmDbConfigSection() {
  const qc = useQueryClient()
  const { data: cfg } = useQuery({ queryKey: ['scm-db-config'], queryFn: getScmDbConfig, staleTime: 5000 })
  const [host, setHost] = useState('')
  const [port, setPort] = useState('3306')
  const [database, setDatabase] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!cfg) return
    setHost(cfg.host ?? '')
    setPort(cfg.port ? String(cfg.port) : '3306')
    setDatabase(cfg.database ?? '')
    setUser(cfg.user ?? '')
    setPassword(cfg.password ?? '') // 内部系统：回显已存密码，便于核对/纠正
  }, [cfg])

  const save = useMutation({
    mutationFn: () => saveScmDbConfig({ host: host.trim(), port: Number(port) || null, database: database.trim(), user: user.trim(), password: password || undefined }),
    onSuccess: () => { setTestMsg(null); qc.invalidateQueries({ queryKey: ['scm-db-config'] }) },
  })
  const test = useMutation({
    mutationFn: testScmDb,
    onSuccess: r => setTestMsg(r.ok ? '✓ 连接成功' : `连接失败：${r.error ?? '未知'}`),
    onError: e => setTestMsg(`连接失败：${e instanceof Error ? e.message : '未知'}`),
  })

  return (
    <details className="mt-4 rounded-xl border bg-[var(--color-card)] p-4">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <Database className="size-4 text-[var(--color-primary)]" />
        SCM 测试库（MySQL 只读，供 agent 查库核对）
        {cfg?.configured && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">已配置</span>}
      </summary>
      <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
        填测试环境 MySQL 连接（如 yoooni_scm），agent 只读查表结构/状态字典/样本数据核对逻辑——<b>只读、绝改不了库</b>
        （建议用只读账号，后端另有 SELECT-only 拦截）。
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="col-span-2 sm:col-span-1 text-xs text-[var(--color-muted-foreground)]">主机
          <Input value={host} onChange={e => setHost(e.target.value)} placeholder="如 170.106.186.65" className="mt-1" />
        </label>
        <label className="col-span-2 sm:col-span-1 text-xs text-[var(--color-muted-foreground)]">端口
          <Input value={port} onChange={e => setPort(e.target.value.replace(/\D/g, ''))} placeholder="3306" className="mt-1" />
        </label>
        <label className="col-span-2 text-xs text-[var(--color-muted-foreground)]">数据库名
          <Input value={database} onChange={e => setDatabase(e.target.value)} placeholder="如 yoooni_scm" className="mt-1" />
        </label>
        <label className="col-span-2 sm:col-span-1 text-xs text-[var(--color-muted-foreground)]">只读账号
          <Input value={user} onChange={e => setUser(e.target.value)} placeholder="只读账号" className="mt-1" />
        </label>
        <label className="col-span-2 sm:col-span-1 text-xs text-[var(--color-muted-foreground)]">密码
          <div className="relative mt-1">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="密码"
              className="pr-9"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              title={showPassword ? '隐藏密码' : '显示密码'}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </label>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !host.trim() || !database.trim() || !user.trim()}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />}保存
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setTestMsg(null); test.mutate() }} disabled={test.isPending || !cfg?.configured}>
          {test.isPending && <Loader2 className="size-4 animate-spin" />}测试连接
        </Button>
        {save.isSuccess && !save.isPending && <span className="text-xs text-emerald-600 dark:text-emerald-400">已保存</span>}
        {testMsg && <span className={`text-xs ${testMsg.startsWith('✓') ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--color-destructive)]'}`}>{testMsg}</span>}
      </div>
    </details>
  )
}
