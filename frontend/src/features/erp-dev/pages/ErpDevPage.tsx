import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Database, DownloadCloud, Loader2, ServerCog, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listWorkspaces } from '@/features/claude-chat/api'
import { DevServiceSection } from '@/features/_devkit/DevServiceSection'
import { useDevWorkbenchPreference } from '@/features/_devkit/useDevWorkbenchPreference'
import { useVisibleWorkspaceProjects } from '@/features/_devkit/public-api'
import {
  getErpDbConfig, saveErpDbConfig, testErpDb, getErpAppConfig, saveErpAppConfig, testErpApp,
  listOpsSystems, listOpsDatasources, importErpDbFromOps,
} from '../api'

/** 记住上次选择的工作区目录，避免每次进来都要重选。 */
const CWD_KEY = 'kai-toolbox:erp-dev:cwd'
/** 记住上次填的模块/页面与需求描述，避免每次重输。 */
const MODULE_KEY = 'kai-toolbox:erp-dev:module'
const REQUIREMENT_KEY = 'kai-toolbox:erp-dev:requirement'

export function ErpDevPage() {
  const { data: workspaces } = useQuery({ queryKey: ['claude-chat-workspaces'], queryFn: listWorkspaces, staleTime: 5000 })

  const { projects: dirs, ready: dirsReady } = useVisibleWorkspaceProjects(workspaces)

  const devPreference = useDevWorkbenchPreference('erp-dev', {
    cwd: CWD_KEY, module: MODULE_KEY, requirement: REQUIREMENT_KEY,
  })
  const { cwd } = devPreference.preference

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Workflow className="size-5 text-[var(--color-primary)]" />
        <h1 className="text-lg font-semibold">ERP 需求开发</h1>
      </div>
      <DevServiceSection
        serviceId="erp"
        dirs={dirs}
        dirsReady={dirsReady}
        defaultCwd={cwd}
        preference={devPreference.preference.services.erp}
        onPreferenceChange={(value, immediate) => devPreference.setService('erp', value, immediate)}
        defaultCommand=".\\start-yoooni.ps1"
        title="ERP 服务启停 + 启动日志"
        readinessPorts={[{ label: 'Resin', port: 80 }]}
      />
      <ErpDbConfigSection />
      <ErpAppConfigSection />

      <p className="mt-4 text-[11px] text-[var(--color-muted-foreground)]">
        本页保留 ERP 服务控制、测试库连接和本地实例配置。
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
