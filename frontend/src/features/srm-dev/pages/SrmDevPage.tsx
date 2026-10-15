import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, Eye, EyeOff, Handshake, Loader2, ServerCog } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listWorkspaces } from '@/features/claude-chat/public-api'
import {
  DevServiceSection,
  DatabaseResourceNotice,
  useDevWorkbenchPreference,
  useVisibleWorkspaceProjects,
} from '@/features/_devkit/public-api'
import {
  getSrmAppConfig, saveSrmAppConfig, testSrmApp,
} from '../api'
import { SrmMenuCacheResetSection } from '../components/SrmMenuCacheResetSection'

/** 记住上次选择的工作区目录，避免每次进来都要重选。 */
const CWD_KEY = 'kai-toolbox:srm-dev:cwd'
/** 记住上次填的模块与需求描述，避免每次重输。 */
const MODULE_KEY = 'kai-toolbox:srm-dev:module'
const REQUIREMENT_KEY = 'kai-toolbox:srm-dev:requirement'

export function SrmDevPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { data: workspaces } = useQuery({ queryKey: ['claude-chat-workspaces'], queryFn: listWorkspaces, staleTime: 5000 })

  const { projects: dirs, ready: dirsReady } = useVisibleWorkspaceProjects(workspaces)

  const devPreference = useDevWorkbenchPreference('srm-dev', {
    cwd: CWD_KEY, module: MODULE_KEY, requirement: REQUIREMENT_KEY,
  })
  const { cwd } = devPreference.preference

  return (
    <div className={embedded ? "min-w-0" : "mx-auto max-w-2xl p-4 sm:p-6"}>
      <div className="mb-4 flex items-center gap-2">
        {!embedded && <><Handshake className="size-5 text-[var(--color-primary)]" />
        <h1 className="text-lg font-semibold">SRM需求开发</h1></>}
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
      <DatabaseResourceNotice />
      <SrmAppConfigSection />

      <p className="mt-4 text-[11px] text-[var(--color-muted-foreground)]">
        启停用 start-srm.ps1 -Foreground（前台合并模式）：各服务日志按 [服务名] 前缀合并到本区，停服对进程树整体清理。
      </p>
    </div>
  )
}


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
