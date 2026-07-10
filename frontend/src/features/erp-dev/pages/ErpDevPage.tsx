import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Database, DownloadCloud, ExternalLink, FolderPlus, Loader2, Rocket, ServerCog, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listWorkspaces } from '@/features/claude-chat/api'
import { CHAT_ROUTE } from '@/features/claude-chat/runtime/ChatRuntimeContext'
import { DevServiceSection } from '@/features/_devkit/DevServiceSection'
import {
  getErpDbConfig, saveErpDbConfig, testErpDb, getErpAppConfig, saveErpAppConfig, testErpApp,
  listOpsSystems, listOpsDatasources, importErpDbFromOps,
} from '../api'

const LAUNCH_KEY = 'kai-toolbox:claude-chat:erp-dev-launch'
/** 记住上次选择的工作区目录，避免每次进来都要重选。 */
const CWD_KEY = 'kai-toolbox:erp-dev:cwd'
/** 记住上次填的模块/页面与需求描述，避免每次重输。 */
const MODULE_KEY = 'kai-toolbox:erp-dev:module'
const REQUIREMENT_KEY = 'kai-toolbox:erp-dev:requirement'

/** 拼装投喂给 yoooni-erp-auto-dev skill 的触发语。 */
function buildSeed(moduleOrUrl: string, requirement: string): string {
  return [
    '用 yoooni-erp-auto-dev 开发一个 ERP 小需求。',
    `模块/页面：${moduleOrUrl}`,
    '需求：',
    requirement.trim(),
    '',
    '请按门控流程走，每步过关卡等我拍板：',
    '① 先定位页面代码（给的是 URL/*.action 用 url-locate，中文模块名用知识图谱定位），念给我确认命中；',
    '② 查业务知识图谱(domain-knowledge)+库(状态字典/表结构，以 DDL 为准)；',
    '③ 出轻量方案(design-doc)让我确认，并给出「验收清单」：每条=触发动作(接口+参数)→期望结果(可机检，含回读 SQL)；',
    '④ 按编码规范改码(encoding-guard 防乱码；DB/迁移/状态字典改动单独确认)；',
    '⑤ 静态自检：编译/构建通过；',
    '⑥ 自闭环验证：提示我让改动生效(重编译/重启本地实例)后，按验收清单用 mcp__erp_app__http_call 实发接口、',
    '   mcp__erp_db__query 只读回读，逐条判 PASS/FAIL，输出「接口验证区块」(请求参数/响应/对应SQL)；不符就修正再验(上限3次)；',
    '⑦ 汇总 diff、只改不提交。',
  ].join('\n')
}

/**
 * ERP 需求开发前门：填「ERP 项目目录 + 模块(中文名/粘 URL) + 需求」→ 一键。
 * 把 {cwd, seed} 交给 Vibe Coding（写 sessionStorage 后跳转），由其在该工作区开一个 Claude 会话、
 * 投喂触发语拉起 yoooni-erp-auto-dev skill；真正的对话/关卡/权限确认在成熟的 Vibe Coding 界面里进行。
 */
export function ErpDevPage() {
  const navigate = useNavigate()
  const { data: workspaces } = useQuery({ queryKey: ['claude-chat-workspaces'], queryFn: listWorkspaces, staleTime: 5000 })

  // 拍平所有工作区根下的一级目录，供选 ERP 项目；path 唯一，label 带根名便于区分同名
  const dirs = useMemo(() => {
    const out: { path: string; label: string }[] = []
    for (const r of workspaces?.roots ?? []) {
      if (!r.exists) continue
      const rootName = r.root.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || r.root
      for (const d of r.dirs) out.push({ path: d.path, label: `${d.name}（${rootName}）` })
    }
    return out
  }, [workspaces])

  const roots = workspaces?.roots ?? []
  const hasRoots = roots.some(r => r.exists)

  const [cwd, setCwd] = useState(() => {
    try { return localStorage.getItem(CWD_KEY) ?? '' } catch { return '' }
  })
  const [moduleOrUrl, setModuleOrUrl] = useState(() => {
    try { return localStorage.getItem(MODULE_KEY) ?? '' } catch { return '' }
  })
  const [requirement, setRequirement] = useState(() => {
    try { return localStorage.getItem(REQUIREMENT_KEY) ?? '' } catch { return '' }
  })

  // 选目录并记住（下次进来自动回填）
  const pickCwd = (path: string) => {
    setCwd(path)
    try { localStorage.setItem(CWD_KEY, path) } catch { /* 隐私模式忽略 */ }
  }
  // 填模块/需求并记住（下次进来自动回填）
  const editModule = (v: string) => {
    setModuleOrUrl(v)
    try { localStorage.setItem(MODULE_KEY, v) } catch { /* 隐私模式忽略 */ }
  }
  const editRequirement = (v: string) => {
    setRequirement(v)
    try { localStorage.setItem(REQUIREMENT_KEY, v) } catch { /* 隐私模式忽略 */ }
  }

  // 引导：空工作区时跳到 Vibe Coding 并直接打开「拉取项目到工作区」面板
  const goConfigureWorkspace = () => {
    try { sessionStorage.setItem('kai-toolbox:claude-chat:open-panel', 'clone') } catch { /* ignore */ }
    navigate(CHAT_ROUTE)
  }

  // 目录列表就绪后：保留上次记住的选择（仍存在时），否则回退到第一个
  useEffect(() => {
    if (dirs.length === 0) return
    if (!dirs.some(d => d.path === cwd)) pickCwd(dirs[0].path)
  }, [dirs, cwd])

  const canStart = cwd.length > 0 && moduleOrUrl.trim().length > 0 && requirement.trim().length > 0

  const start = () => {
    if (!canStart) return
    const seed = buildSeed(moduleOrUrl.trim(), requirement)
    try { sessionStorage.setItem(LAUNCH_KEY, JSON.stringify({ cwd, seed })) } catch { /* 隐私模式忽略 */ }
    navigate(CHAT_ROUTE)
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Workflow className="size-5 text-[var(--color-primary)]" />
        <h1 className="text-lg font-semibold">ERP 需求开发</h1>
      </div>
      <p className="mb-5 text-sm text-[var(--color-muted-foreground)]">
        填「模块 + 需求」，交给 ERP 自动开发 agent（yoooni-erp-auto-dev）：定位页面代码 → 查业务知识图谱 + 库 →
        出方案 → 按编码规范改码 → <b>自闭环验证</b>（实发接口 + 回读数据，出接口验证区块）→ 出 diff。关键处（命中页面 /
        方案 / DB 改动 / 生效重启）会停下让你确认，<b>只改不提交</b>。
      </p>

      <div className="space-y-4 rounded-xl border bg-[var(--color-card)] p-4">
        <div>
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">ERP 项目目录（工作区）</label>
          {dirs.length === 0 ? (
            <div className="mt-1 rounded-lg border border-dashed border-[var(--color-border)] p-3">
              <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                <FolderPlus className="size-4 text-[var(--color-primary)]" />还没有可用的工作区目录
              </div>
              {hasRoots ? (
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  工作区根已配置，但根目录下还没有项目。去 Vibe Coding「拉取项目到工作区」拉一个 ERP 项目（或用「合并工作区」聚合已有目录），回来即可在这里选到。
                </p>
              ) : (
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  尚未配置工作区根。请在后端 <code className="rounded bg-[var(--color-muted)] px-1">application.yml</code> 的 <code className="rounded bg-[var(--color-muted)] px-1">toolbox.claude-chat.workspace.roots</code> 配置一个或多个目录后重启后端；也可先去 Vibe Coding 拉取项目。
                </p>
              )}
              <Button size="sm" className="mt-2 gap-1" onClick={goConfigureWorkspace}>
                <ExternalLink className="size-4" />去 Vibe Coding 配置 / 拉取项目
              </Button>
            </div>
          ) : (
            <select
              value={cwd}
              onChange={e => pickCwd(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border bg-[var(--color-background)] px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
            >
              {dirs.map(d => <option key={d.path} value={d.path}>{d.label}</option>)}
            </select>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">模块 / 页面（中文模块名，或直接粘页面 URL / *.action）</label>
          <Input
            value={moduleOrUrl}
            onChange={e => editModule(e.target.value)}
            placeholder="如：报价审核  或  https://.../quoteAudit_list.action"
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">需求描述</label>
          <textarea
            value={requirement}
            onChange={e => editRequirement(e.target.value)}
            rows={5}
            placeholder="用中文把要做的改动说清楚，例如：列表页增加「按供应商筛选」，并在导出里带上该列。"
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
        serviceId="erp"
        dirs={dirs}
        defaultCwd={cwd}
        defaultCommand=".\\start-yoooni.ps1"
        title="ERP 服务启停 + 启动日志"
      />
      <ErpDbConfigSection />
      <ErpAppConfigSection />

      <p className="mt-4 text-[11px] text-[var(--color-muted-foreground)]">
        依赖团队套件已安装（domain-knowledge / cross-topology MCP、project-coding-profiles、team-standards）；
        「大脑」是团队插件里的 yoooni-erp-auto-dev skill，可随 claude plugin update 升级。
      </p>
    </div>
  )
}

/**
 * 测试库连接（只读）：配置 Oracle 连接信息，agent 通过后端只读 erp_db MCP 查库核对逻辑。
 * 建议只读账号；后端另有 SELECT-only 双闸。密码存服务端、脱敏展示（留空=不改）。
 */
function ErpDbConfigSection() {
  const qc = useQueryClient()
  const { data: cfg } = useQuery({ queryKey: ['erp-db-config'], queryFn: getErpDbConfig, staleTime: 5000 })
  const [host, setHost] = useState('')
  const [port, setPort] = useState('1521')
  const [service, setService] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [testMsg, setTestMsg] = useState<string | null>(null)

  // 首次载入配置后回填（密码不回填，占位提示已设置）
  useEffect(() => {
    if (!cfg) return
    setHost(cfg.host ?? '')
    setPort(cfg.port ? String(cfg.port) : '1521')
    setService(cfg.service ?? '')
    setUser(cfg.user ?? '')
  }, [cfg])

  const save = useMutation({
    mutationFn: () => saveErpDbConfig({ type: 'oracle', host: host.trim(), port: Number(port) || null, service: service.trim(), user: user.trim(), password: password || undefined }),
    onSuccess: () => { setPassword(''); setTestMsg(null); qc.invalidateQueries({ queryKey: ['erp-db-config'] }) },
  })
  const test = useMutation({
    mutationFn: testErpDb,
    onSuccess: r => setTestMsg(r.ok ? '✓ 连接成功' : `连接失败：${r.error ?? '未知'}`),
    onError: e => setTestMsg(`连接失败：${e instanceof Error ? e.message : '未知'}`),
  })

  return (
    <details className="mt-4 rounded-xl border bg-[var(--color-card)] p-4">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <Database className="size-4 text-[var(--color-primary)]" />
        测试库连接（只读，供 agent 查库核对）
        {cfg?.configured && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">已配置</span>}
      </summary>
      <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
        填测试环境 Oracle 连接，agent 只读查表结构/状态字典/样本数据核对逻辑——<b>只读、绝改不了库</b>（建议用只读账号，后端另有 SELECT-only 拦截）。
      </p>
      <ErpDbImportFromOps />
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="col-span-2 sm:col-span-1 text-xs text-[var(--color-muted-foreground)]">主机
          <Input value={host} onChange={e => setHost(e.target.value)} placeholder="如 10.0.0.12" className="mt-1" />
        </label>
        <label className="col-span-2 sm:col-span-1 text-xs text-[var(--color-muted-foreground)]">端口
          <Input value={port} onChange={e => setPort(e.target.value.replace(/\D/g, ''))} placeholder="1521" className="mt-1" />
        </label>
        <label className="col-span-2 text-xs text-[var(--color-muted-foreground)]">Service Name
          <Input value={service} onChange={e => setService(e.target.value)} placeholder="如 ORCLPDB1" className="mt-1" />
        </label>
        <label className="col-span-2 sm:col-span-1 text-xs text-[var(--color-muted-foreground)]">只读账号
          <Input value={user} onChange={e => setUser(e.target.value)} placeholder="只读账号" className="mt-1" />
        </label>
        <label className="col-span-2 sm:col-span-1 text-xs text-[var(--color-muted-foreground)]">密码
          <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={cfg?.hasPassword ? '已设置（留空不改）' : '密码'} className="mt-1" />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !host.trim() || !service.trim() || !user.trim()}>
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
 * 从「系统中间件台」(tool-ops) 带入测试库：选系统 → 选该系统下的 ORACLE 数据源 → 一键带入。
 * 密码经后端本机回环流转、不进浏览器；带入成功后上方连接字段自动回填。
 */
function ErpDbImportFromOps() {
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
  // ERP 测试库为 Oracle，只带入 ORACLE 数据源
  const oracleDs = useMemo(() => (datasources ?? []).filter(d => d.type === 'ORACLE'), [datasources])

  useEffect(() => { setDsId('') }, [systemId])

  const doImport = useMutation({
    mutationFn: () => importErpDbFromOps(dsId),
    onSuccess: r => {
      if (r && typeof r === 'object' && 'ok' in r && r.ok === false) {
        setMsg(`带入失败：${r.error}`)
        return
      }
      setMsg('✓ 已带入并保存')
      qc.invalidateQueries({ queryKey: ['erp-db-config'] })
    },
    onError: e => setMsg(`带入失败：${e instanceof Error ? e.message : '未知'}`),
  })

  const hasSystems = (systems ?? []).length > 0

  return (
    <div className="mt-3 rounded-lg border border-dashed border-[var(--color-border)] p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium">
        <DownloadCloud className="size-4 text-[var(--color-primary)]" />
        从系统中间件台带入（选系统 + Oracle 数据源，免手输）
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
              <option value="">{systemId ? '选择 Oracle 数据源…' : '先选系统'}</option>
              {oracleDs.map(d => <option key={d.id} value={d.id}>{`${d.env}｜${d.name}（${d.endpoint}）`}</option>)}
            </select>
          </div>
          {systemId && oracleDs.length === 0 && (
            <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">该系统下没有 ORACLE 数据源。</p>
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
 * 本地 ERP 实例（验证用）：配置本地/测试实例地址 + 登录账号，agent 在自闭环验证阶段经后端 erp_app MCP
 * 登录态实发 *.action 校验改动效果。<b>只连本地/测试实例</b>——后端另有同源白名单 + 拒生产域硬拦截。
 * 密码存服务端、脱敏展示（留空=不改）。
 */
function ErpAppConfigSection() {
  const qc = useQueryClient()
  const { data: cfg } = useQuery({ queryKey: ['erp-app-config'], queryFn: getErpAppConfig, staleTime: 5000 })
  const [baseUrl, setBaseUrl] = useState('')
  const [loginPath, setLoginPath] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [userField, setUserField] = useState('')
  const [passField, setPassField] = useState('')
  const [testMsg, setTestMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!cfg) return
    setBaseUrl(cfg.baseUrl ?? '')
    setLoginPath(cfg.loginPath ?? '')
    setUsername(cfg.username ?? '')
    setUserField(cfg.userField ?? '')
    setPassField(cfg.passField ?? '')
  }, [cfg])

  const save = useMutation({
    mutationFn: () => saveErpAppConfig({
      baseUrl: baseUrl.trim(), loginPath: loginPath.trim(), userField: userField.trim(), passField: passField.trim(),
      username: username.trim(), password: password || undefined,
    }),
    onSuccess: () => { setPassword(''); setTestMsg(null); qc.invalidateQueries({ queryKey: ['erp-app-config'] }) },
  })
  const test = useMutation({
    mutationFn: testErpApp,
    onSuccess: r => setTestMsg(r.ok ? '✓ 连接/登录成功' : `失败：${r.error ?? '未知'}`),
    onError: e => setTestMsg(`失败：${e instanceof Error ? e.message : '未知'}`),
  })

  return (
    <details className="mt-4 rounded-xl border bg-[var(--color-card)] p-4">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <ServerCog className="size-4 text-[var(--color-primary)]" />
        本地 ERP 实例（验证用，供自闭环验证实发接口）
        {cfg?.configured && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">已配置</span>}
      </summary>
      <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
        填<b>本地/测试</b> ERP 实例地址与登录账号，agent 改完代码后按验收清单登录态实发 <code className="rounded bg-[var(--color-muted)] px-1">*.action</code> 校验效果——
        <b>只打本地/测试实例</b>（后端强制同源白名单 + 拒生产域名 wyoooni.net）。登录路径留空=该实例无需登录。
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="col-span-2 text-xs text-[var(--color-muted-foreground)]">实例地址（baseUrl）
          <Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="如 http://127.0.0.1:8080/yoooni" className="mt-1" />
        </label>
        <label className="col-span-2 text-xs text-[var(--color-muted-foreground)]">登录路径（留空=无需登录）
          <Input value={loginPath} onChange={e => setLoginPath(e.target.value)} placeholder="如 /login.action" className="mt-1" />
        </label>
        <label className="col-span-2 sm:col-span-1 text-xs text-[var(--color-muted-foreground)]">登录账号
          <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="测试账号" className="mt-1" />
        </label>
        <label className="col-span-2 sm:col-span-1 text-xs text-[var(--color-muted-foreground)]">密码
          <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={cfg?.hasPassword ? '已设置（留空不改）' : '密码'} className="mt-1" />
        </label>
        <label className="col-span-2 sm:col-span-1 text-xs text-[var(--color-muted-foreground)]">用户名字段（默认 username）
          <Input value={userField} onChange={e => setUserField(e.target.value)} placeholder="username" className="mt-1" />
        </label>
        <label className="col-span-2 sm:col-span-1 text-xs text-[var(--color-muted-foreground)]">密码字段（默认 password）
          <Input value={passField} onChange={e => setPassField(e.target.value)} placeholder="password" className="mt-1" />
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
