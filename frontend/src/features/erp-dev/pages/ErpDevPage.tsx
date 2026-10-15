import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, ServerCog, Workflow } from 'lucide-react'
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
  getErpAppConfig, saveErpAppConfig, testErpApp,
} from '../api'

/** 记住上次选择的工作区目录，避免每次进来都要重选。 */
const CWD_KEY = 'kai-toolbox:erp-dev:cwd'
/** 记住上次填的模块/页面与需求描述，避免每次重输。 */
const MODULE_KEY = 'kai-toolbox:erp-dev:module'
const REQUIREMENT_KEY = 'kai-toolbox:erp-dev:requirement'

export function ErpDevPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { data: workspaces } = useQuery({ queryKey: ['claude-chat-workspaces'], queryFn: listWorkspaces, staleTime: 5000 })

  const { projects: dirs, ready: dirsReady } = useVisibleWorkspaceProjects(workspaces)

  const devPreference = useDevWorkbenchPreference('erp-dev', {
    cwd: CWD_KEY, module: MODULE_KEY, requirement: REQUIREMENT_KEY,
  })
  const { cwd } = devPreference.preference

  return (
    <div className={embedded ? "min-w-0" : "mx-auto max-w-2xl p-4 sm:p-6"}>
      <div className="mb-4 flex items-center gap-2">
        {!embedded && <><Workflow className="size-5 text-[var(--color-primary)]" />
        <h1 className="text-lg font-semibold">ERP 需求开发</h1></>}
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
      <DatabaseResourceNotice />
      <ErpAppConfigSection />

      <p className="mt-4 text-[11px] text-[var(--color-muted-foreground)]">
        本页保留 ERP 服务控制和本地实例配置；数据库统一在系统资源管理。
      </p>
    </div>
  )
}


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
