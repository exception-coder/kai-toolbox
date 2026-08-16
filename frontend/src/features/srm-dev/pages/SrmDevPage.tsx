import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, Database, DownloadCloud, Eye, EyeOff, Handshake, Loader2, ServerCog } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listWorkspaces } from '@/features/claude-chat/public-api'
import {
  DevServiceSection,
  useDevWorkbenchPreference,
  useVisibleWorkspaceProjects,
} from '@/features/_devkit/public-api'
import {
  getSrmDbConfig, saveSrmDbConfig, testSrmDb,
  getSrmAppConfig, saveSrmAppConfig, testSrmApp,
  listOpsSystems, listOpsDatasources, importSrmDbFromOps,
} from '../api'
import { SrmMenuCacheResetSection } from '../components/SrmMenuCacheResetSection'

/** 记住上次选择的工作区目录，避免每次进来都要重选。 */
const CWD_KEY = 'kai-toolbox:srm-dev:cwd'
/** 记住上次填的模块与需求描述，避免每次重输。 */
const MODULE_KEY = 'kai-toolbox:srm-dev:module'
const REQUIREMENT_KEY = 'kai-toolbox:srm-dev:requirement'

export function SrmDevPage() {
  const { data: workspaces } = useQuery({ queryKey: ['claude-chat-workspaces'], queryFn: listWorkspaces, staleTime: 5000 })

  const { projects: dirs, ready: dirsReady } = useVisibleWorkspaceProjects(workspaces)

  const devPreference = useDevWorkbenchPreference('srm-dev', {
    cwd: CWD_KEY, module: MODULE_KEY, requirement: REQUIREMENT_KEY,
  })
  const { cwd } = devPreference.preference

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
      <DevServiceSection
        serviceId="srm"
        dirs={dirs}
        dirsReady={dirsReady}
        defaultCwd={cwd}
        preference={devPreference.preference.services.srm}
        onPreferenceChange={(value, immediate) => devPreference.setService('srm', value, immediate)}
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
      <SrmMenuCacheResetSection />
      <SrmDbConfigSection />
      <SrmAppConfigSection />

      <p className="mt-4 text-[11px] text-[var(--color-muted-foreground)]">
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
