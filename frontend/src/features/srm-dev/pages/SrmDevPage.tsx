import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, Database, DownloadCloud, Eye, EyeOff, Handshake, Loader2, Rocket, ServerCog } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listWorkspaces } from '@/features/claude-chat/api'
import { CHAT_ROUTE } from '@/features/claude-chat/runtime/ChatRuntimeContext'
import { DevServiceSection } from '@/features/_devkit/DevServiceSection'
import {
  getSrmDbConfig, saveSrmDbConfig, testSrmDb,
  getSrmAppConfig, saveSrmAppConfig, testSrmApp,
  listOpsSystems, listOpsDatasources, importSrmDbFromOps,
} from '../api'

// 复用 Vibe Coding 的 handoff 通道（ChatPage 挂载时消费：开会话 + 投喂触发语）
const LAUNCH_KEY = 'kai-toolbox:claude-chat:erp-dev-launch'
/** 记住上次选择的工作区目录，避免每次进来都要重选。 */
const CWD_KEY = 'kai-toolbox:srm-dev:cwd'
/** 记住上次填的模块与需求描述，避免每次重输。 */
const MODULE_KEY = 'kai-toolbox:srm-dev:module'
const REQUIREMENT_KEY = 'kai-toolbox:srm-dev:requirement'

/**
 * 拼装投喂给 yoooni-erp-auto-dev skill 的 SRM 版触发语。
 * 大脑复用 ERP 自动开发流水线的骨架（定位→查知识图谱/库→方案→改码→自闭环验证→diff），
 * 但按 SRM 技术栈改口径：芋道 Spring Cloud 分层 + MySQL(以 DDL 为准) + REST；
 * 验证工具显式点名 SRM 专用的 mcp__srm_db__query（MySQL 只读回读）/ mcp__srm_app__http_call（网关登录态实发）。
 */
function buildSeed(moduleName: string, requirement: string): string {
  return [
    '用 yoooni-erp-auto-dev 的门控流水线开发一个 SRM 小需求（技术栈=芋道 Spring Cloud 微服务 + Vue2 前端 + MySQL）。',
    `模块/页面：${moduleName}`,
    '需求：',
    requirement.trim(),
    '',
    '请按门控流程走，每步过关卡等我拍板：',
    '① 定位代码：用 domain-knowledge(project=srm) + 前端 src/api/<域>/ ↔ 后端 controller/admin/srm/<E>Controller 的映射定位改动点，念给我确认命中；',
    '② 查业务知识图谱(domain-knowledge project=srm)+库（状态机/状态字典/表结构，以 MySQL DDL 为准）；',
    '③ 出轻量方案(design-doc)让我确认，并给出「验收清单」：每条=触发动作(接口+参数)→期望结果(可机检，含回读 SQL)；',
    '④ 按 srm 编码 profile + 芋道分层(controller→service→dal→convert→vo)改码（encoding-guard 防乱码；DB/迁移/状态字典改动单独确认）；',
    '⑤ 静态自检：对应服务模块编译/构建通过；',
    '⑥ 自闭环验证：提示我让改动生效(重启对应微服务)后，按验收清单用 mcp__srm_app__http_call 走网关登录态实发接口、',
    '   mcp__srm_db__query 只读回读 MySQL，逐条判 PASS/FAIL，输出「接口验证区块」(请求参数/响应/对应SQL)；不符就修正再验(上限3次)；',
    '⑦ 汇总 diff、只改不提交。',
  ].join('\n')
}

/**
 * SRM 需求开发前门：填「SRM 工作区目录 + 模块 + 需求」→ 一键。
 * 把 {cwd, seed} 交给 Vibe Coding（写 sessionStorage 后跳转），由其在该工作区开一个 Claude 会话、
 * 投喂触发语拉起 yoooni-erp-auto-dev skill；真正的对话/关卡/权限确认在成熟的 Vibe Coding 界面里进行。
 * 服务启停/日志复用通用 DevServiceSection；调试必备配置（MySQL 只读库 + 网关实例）走后端 KV 持久化。
 */
export function SrmDevPage() {
  const navigate = useNavigate()
  const { data: workspaces } = useQuery({ queryKey: ['claude-chat-workspaces'], queryFn: listWorkspaces, staleTime: 5000 })

  // 拍平所有工作区根下的一级目录，供选 SRM 项目；path 唯一，label 带根名便于区分同名
  const dirs = useMemo(() => {
    const out: { path: string; label: string }[] = []
    for (const r of workspaces?.roots ?? []) {
      if (!r.exists) continue
      const rootName = r.root.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || r.root
      for (const d of r.dirs) out.push({ path: d.path, label: `${d.name}（${rootName}）` })
    }
    return out
  }, [workspaces])

  const [cwd, setCwd] = useState(() => { try { return localStorage.getItem(CWD_KEY) ?? '' } catch { return '' } })
  const [moduleName, setModuleName] = useState(() => { try { return localStorage.getItem(MODULE_KEY) ?? '' } catch { return '' } })
  const [requirement, setRequirement] = useState(() => { try { return localStorage.getItem(REQUIREMENT_KEY) ?? '' } catch { return '' } })

  const pickCwd = (p: string) => { setCwd(p); try { localStorage.setItem(CWD_KEY, p) } catch { /* 隐私模式忽略 */ } }
  const editModule = (v: string) => { setModuleName(v); try { localStorage.setItem(MODULE_KEY, v) } catch { /* 隐私模式忽略 */ } }
  const editRequirement = (v: string) => { setRequirement(v); try { localStorage.setItem(REQUIREMENT_KEY, v) } catch { /* 隐私模式忽略 */ } }

  // 目录列表就绪后：保留上次记住的选择（仍存在时），否则回退到第一个
  useEffect(() => {
    if (dirs.length === 0) return
    if (!dirs.some(d => d.path === cwd)) pickCwd(dirs[0].path)
  }, [dirs, cwd])

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
        <Handshake className="size-5 text-[var(--color-primary)]" />
        <h1 className="text-lg font-semibold">SRM需求开发</h1>
        <Link to="/tools/srm-dev/tasks" className="ml-auto">
          <Button variant="outline" size="sm" className="gap-1">
            <ClipboardList className="size-4" />开发任务
          </Button>
        </Link>
      </div>
      <p className="mb-5 text-sm text-[var(--color-muted-foreground)]">
        填「模块 + 需求」，交给自动开发 agent（yoooni-erp-auto-dev 门控流水线）：定位代码 → 查业务知识图谱(project=srm) + 库 →
        出方案 → 按 srm 编码规范 + 芋道分层改码 → <b>自闭环验证</b>（网关登录态实发 + MySQL 只读回读）→ 出 diff。关键处（命中代码 /
        方案 / DB 改动 / 生效重启）会停下让你确认，<b>只改不提交</b>。
      </p>

      <div className="space-y-4 rounded-xl border bg-[var(--color-card)] p-4">
        <div>
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">SRM 项目目录（工作区）</label>
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
            placeholder="如：供应商准入  或  采购下单  或  批价"
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">需求描述</label>
          <textarea
            value={requirement}
            onChange={e => editRequirement(e.target.value)}
            rows={5}
            placeholder="用中文把要做的改动说清楚，例如：供应商列表增加「按准入状态筛选」，并在导出里带上该列。"
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
        serviceId="srm"
        dirs={dirs}
        defaultCwd={cwd}
        defaultCommand="powershell -NoProfile -ExecutionPolicy Bypass -File .\\start-srm.ps1 -Foreground"
        stopCommand="powershell -NoProfile -ExecutionPolicy Bypass -File .\\stop-srm.ps1"
        commandPlaceholder="首次或改过公共模块加 -Build：… start-srm.ps1 -Foreground -Build"
        title="SRM 服务启停 + 启动日志"
        readinessPorts={[
          { label: 'gateway', port: 8887 },
          { label: 'infra', port: 8888 },
          { label: 'system', port: 8889 },
          { label: 'frontend', port: 81 },
        ]}
      />
      <SrmDbConfigSection />
      <SrmAppConfigSection />

      <p className="mt-4 text-[11px] text-[var(--color-muted-foreground)]">
        依赖团队套件已安装（domain-knowledge / cross-topology MCP、project-coding-profiles、team-standards）；
        「大脑」复用团队插件里的 yoooni-erp-auto-dev skill（SRM 版触发语已按芋道 + MySQL 改口径）。
        启停用 start-srm.ps1 -Foreground（前台合并模式）：各服务日志按 [服务名] 前缀合并到本区，停服对进程树整体清理。
      </p>
    </div>
  )
}

/**
 * SRM 测试库（MySQL 只读）：配置连接信息，agent 通过后端只读 srm_db MCP 查库核对逻辑。
 * 建议只读账号；后端另有 SELECT-only 双闸。内部单用户系统，密码直接回显供核对/纠正
 * （带入来的连接若密码过期，一眼就能看出与真实库不一致）。
 */
function SrmDbConfigSection() {
  const qc = useQueryClient()
  const { data: cfg } = useQuery({ queryKey: ['srm-db-config'], queryFn: getSrmDbConfig, staleTime: 5000 })
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
    mutationFn: () => saveSrmDbConfig({ host: host.trim(), port: Number(port) || null, database: database.trim(), user: user.trim(), password: password || undefined }),
    onSuccess: () => { setTestMsg(null); qc.invalidateQueries({ queryKey: ['srm-db-config'] }) },
  })
  const test = useMutation({
    mutationFn: testSrmDb,
    onSuccess: r => setTestMsg(r.ok ? '✓ 连接成功' : `连接失败：${r.error ?? '未知'}`),
    onError: e => setTestMsg(`连接失败：${e instanceof Error ? e.message : '未知'}`),
  })

  return (
    <details className="mt-4 rounded-xl border bg-[var(--color-card)] p-4">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <Database className="size-4 text-[var(--color-primary)]" />
        SRM 测试库（MySQL 只读，供 agent 查库核对）
        {cfg?.configured && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">已配置</span>}
      </summary>
      <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
        填测试环境 MySQL 连接，agent 只读查表结构/状态字典/样本数据核对逻辑——<b>只读、绝改不了库</b>（建议用只读账号，后端另有 SELECT-only 拦截）。
      </p>
      <SrmDbImportFromOps />
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="col-span-2 sm:col-span-1 text-xs text-[var(--color-muted-foreground)]">主机
          <Input value={host} onChange={e => setHost(e.target.value)} placeholder="如 10.0.0.12" className="mt-1" />
        </label>
        <label className="col-span-2 sm:col-span-1 text-xs text-[var(--color-muted-foreground)]">端口
          <Input value={port} onChange={e => setPort(e.target.value.replace(/\D/g, ''))} placeholder="3306" className="mt-1" />
        </label>
        <label className="col-span-2 text-xs text-[var(--color-muted-foreground)]">数据库名
          <Input value={database} onChange={e => setDatabase(e.target.value)} placeholder="如 ruicheng_scm_srm" className="mt-1" />
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

/**
 * 从「系统中间件台」(tool-ops) 带入测试库：选系统 → 选该系统下的 MySQL 数据源 → 一键带入。
 * 密码经后端本机回环流转、不进浏览器；带入成功后上方连接字段自动回填。
 */
function SrmDbImportFromOps() {
  const qc = useQueryClient()
  const { data: systems } = useQuery({ queryKey: ['ops-systems'], queryFn: listOpsSystems, staleTime: 10000 })
  const [systemId, setSystemId] = useState('')
  const [dsId, setDsId] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const { data: datasources } = useQuery({
    queryKey: ['ops-datasources', systemId],
    queryFn: () => listOpsDatasources(systemId),
    enabled: !!systemId,
    staleTime: 5000,
  })
  // SRM 测试库为 MySQL，只带入 MYSQL 数据源
  const mysqlDs = useMemo(() => (datasources ?? []).filter(d => d.type === 'MYSQL'), [datasources])

  useEffect(() => { setDsId('') }, [systemId])

  const doImport = useMutation({
    mutationFn: () => importSrmDbFromOps(dsId),
    onSuccess: r => {
      if (r && typeof r === 'object' && 'ok' in r && r.ok === false) {
        setMsg(`带入失败：${r.error}`)
        return
      }
      setMsg('✓ 已带入并保存')
      qc.invalidateQueries({ queryKey: ['srm-db-config'] })
    },
    onError: e => setMsg(`带入失败：${e instanceof Error ? e.message : '未知'}`),
  })

  const hasSystems = (systems ?? []).length > 0

  return (
    <div className="mt-3 rounded-lg border border-dashed border-[var(--color-border)] p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium">
        <DownloadCloud className="size-4 text-[var(--color-primary)]" />
        从系统中间件台带入（选系统 + MySQL 数据源，免手输）
      </div>
      {!hasSystems ? (
        <p className="text-xs text-[var(--color-muted-foreground)]">
          中间件台还没有登记系统。去「运维查询」模块登记系统与数据源后，这里即可选到并一键带入。
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={systemId}
              onChange={e => { setSystemId(e.target.value); setMsg(null) }}
              className="h-9 w-full rounded-md border bg-[var(--color-background)] px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
            >
              <option value="">选择系统…</option>
              {(systems ?? []).map(s => <option key={s.id} value={s.id}>{s.name}{s.code ? `（${s.code}）` : ''}</option>)}
            </select>
            <select
              value={dsId}
              onChange={e => { setDsId(e.target.value); setMsg(null) }}
              disabled={!systemId}
              className="h-9 w-full rounded-md border bg-[var(--color-background)] px-2 text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
            >
              <option value="">{systemId ? '选择 MySQL 数据源…' : '先选系统'}</option>
              {mysqlDs.map(d => <option key={d.id} value={d.id}>{`${d.env}｜${d.name}（${d.endpoint}）`}</option>)}
            </select>
          </div>
          {systemId && mysqlDs.length === 0 && (
            <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">该系统下没有 MySQL 数据源。</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => { setMsg(null); doImport.mutate() }} disabled={!dsId || doImport.isPending}>
              {doImport.isPending && <Loader2 className="size-4 animate-spin" />}带入
            </Button>
            <span className="text-[11px] text-[var(--color-muted-foreground)]">密码经后端回环带入、不经浏览器；带入后上方字段自动回填。</span>
            {msg && <span className={`text-xs ${msg.startsWith('✓') ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--color-destructive)]'}`}>{msg}</span>}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * SRM 本地实例（yudao 网关，验证用）：配置本地/测试网关地址 + 登录账号，agent 在自闭环验证阶段经后端 srm_app MCP
 * 以 OAuth2 登录态实发 REST 接口校验改动效果。<b>只连本地/测试实例</b>——后端另有同源白名单 + 拒生产域硬拦截。
 * 密码存服务端、脱敏展示（留空=不改）。
 */
function SrmAppConfigSection() {
  const qc = useQueryClient()
  const { data: cfg } = useQuery({ queryKey: ['srm-app-config'], queryFn: getSrmAppConfig, staleTime: 5000 })
  const [baseUrl, setBaseUrl] = useState('')
  const [loginPath, setLoginPath] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [tokenJsonPath, setTokenJsonPath] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [testMsg, setTestMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!cfg) return
    setBaseUrl(cfg.baseUrl ?? '')
    setLoginPath(cfg.loginPath ?? '')
    setTenantId(cfg.tenantId ?? '')
    setTokenJsonPath(cfg.tokenJsonPath ?? '')
    setUsername(cfg.username ?? '')
  }, [cfg])

  const save = useMutation({
    mutationFn: () => saveSrmAppConfig({
      baseUrl: baseUrl.trim(), loginPath: loginPath.trim(), tenantId: tenantId.trim(),
      tokenJsonPath: tokenJsonPath.trim(), username: username.trim(), password: password || undefined,
    }),
    onSuccess: () => { setPassword(''); setTestMsg(null); qc.invalidateQueries({ queryKey: ['srm-app-config'] }) },
  })
  const test = useMutation({
    mutationFn: testSrmApp,
    onSuccess: r => setTestMsg(r.ok ? '✓ 连接/登录成功' : `失败：${r.error ?? '未知'}`),
    onError: e => setTestMsg(`失败：${e instanceof Error ? e.message : '未知'}`),
  })

  return (
    <details className="mt-4 rounded-xl border bg-[var(--color-card)] p-4">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <ServerCog className="size-4 text-[var(--color-primary)]" />
        SRM 本地实例（yudao 网关，验证用，供自闭环验证实发接口）
        {cfg?.configured && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">已配置</span>}
      </summary>
      <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
        填<b>本地/测试</b>网关地址与登录账号，agent 改完代码后按验收清单以 OAuth2 登录态实发 REST 接口校验效果——
        <b>只打本地/测试实例</b>（后端强制同源白名单 + 拒生产域名）。登录路径留空=该实例无需登录。
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="col-span-2 text-xs text-[var(--color-muted-foreground)]">网关地址（baseUrl）
          <Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="如 http://127.0.0.1:8887" className="mt-1" />
        </label>
        <label className="col-span-2 sm:col-span-1 text-xs text-[var(--color-muted-foreground)]">登录路径（留空=无需登录）
          <Input value={loginPath} onChange={e => setLoginPath(e.target.value)} placeholder="如 /admin-api/system/auth/login" className="mt-1" />
        </label>
        <label className="col-span-2 sm:col-span-1 text-xs text-[var(--color-muted-foreground)]">租户号 tenant-id（留空不带）
          <Input value={tenantId} onChange={e => setTenantId(e.target.value.replace(/\D/g, ''))} placeholder="如 1" className="mt-1" />
        </label>
        <label className="col-span-2 text-xs text-[var(--color-muted-foreground)]">token 取值路径（留空=data.accessToken）
          <Input value={tokenJsonPath} onChange={e => setTokenJsonPath(e.target.value)} placeholder="data.accessToken" className="mt-1" />
        </label>
        <label className="col-span-2 sm:col-span-1 text-xs text-[var(--color-muted-foreground)]">登录账号
          <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="测试账号" className="mt-1" />
        </label>
        <label className="col-span-2 sm:col-span-1 text-xs text-[var(--color-muted-foreground)]">密码
          <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={cfg?.hasPassword ? '已设置（留空不改）' : '密码'} className="mt-1" />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !baseUrl.trim()}>
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
