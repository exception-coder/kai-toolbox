import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ExternalLink, FlaskConical, RotateCcw, ShieldCheck, Smartphone, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DevServiceSection } from '@/features/_devkit/DevServiceSection'
import { useDevWorkbenchPreference } from '@/features/_devkit/useDevWorkbenchPreference'
import { normalizeWorkspaceProjectPath, useVisibleWorkspaceProjects } from '@/features/_devkit/public-api'
import { listWorkspaces } from '@/features/claude-chat/api'
import {
  applyMiniProgramEnvironment,
  getMiniProgramEnvironment,
  restoreMiniProgramEnvironment,
  type MiniProgramEnvironmentMode,
} from '../api'

const WORKBENCH_ID = 'erp-mini-program'
const SERVICE_ID = 'erp-mini-program'
const CWD_KEY = 'kai-toolbox:erp-mini-program:cwd'
const MODULE_KEY = 'kai-toolbox:erp-mini-program:module'
const REQUIREMENT_KEY = 'kai-toolbox:erp-mini-program:requirement'

/** ERP 小程序需求工作台，负责开发者工具启停与日志查看。 */
export function ErpMiniProgramPage() {
  const queryClient = useQueryClient()
  const { data: workspaces } = useQuery({
    queryKey: ['claude-chat-workspaces'],
    queryFn: listWorkspaces,
    staleTime: 5000,
  })
  const { projects: dirs, ready: dirsReady } = useVisibleWorkspaceProjects(workspaces)
  const devPreference = useDevWorkbenchPreference(WORKBENCH_ID, {
    cwd: CWD_KEY,
    module: MODULE_KEY,
    requirement: REQUIREMENT_KEY,
  })
  const { cwd } = devPreference.preference
  const environmentQuery = useQuery({
    queryKey: ['erp-mini-program-environment', cwd],
    queryFn: () => getMiniProgramEnvironment(cwd),
    enabled: !!cwd,
  })
  const [mode, setMode] = useState<Exclude<MiniProgramEnvironmentMode, 'CUSTOM'>>('FORMAL')
  const [testApiBaseUrl, setTestApiBaseUrl] = useState('http://127.0.0.1:8080')

  useEffect(() => {
    if (!environmentQuery.data) return
    if (environmentQuery.data.mode !== 'CUSTOM') setMode(environmentQuery.data.mode)
    if (environmentQuery.data.mode === 'TEST' && environmentQuery.data.apiBaseUrl) {
      setTestApiBaseUrl(environmentQuery.data.apiBaseUrl)
    }
  }, [environmentQuery.data])

  const applyEnvironment = useMutation({
    mutationFn: (targetMode: Exclude<MiniProgramEnvironmentMode, 'CUSTOM'>) =>
      applyMiniProgramEnvironment(cwd, targetMode, targetMode === 'TEST' ? testApiBaseUrl : ''),
    onSuccess: (data) => {
      if (data.mode !== 'CUSTOM') setMode(data.mode)
      queryClient.setQueryData(['erp-mini-program-environment', cwd], data)
    },
  })

  const restoreEnvironment = useMutation({
    mutationFn: () => restoreMiniProgramEnvironment(cwd),
    onSuccess: (data) => {
      queryClient.setQueryData(['erp-mini-program-environment', cwd], data)
    },
  })

  useEffect(() => {
    if (!devPreference.hydrated || !dirsReady) return
    const cwdKey = normalizeWorkspaceProjectPath(cwd)
    const currentDir = dirs.find((dir) => normalizeWorkspaceProjectPath(dir.path) === cwdKey)
    if (currentDir) {
      if (currentDir.path !== cwd) devPreference.setField('cwd', currentDir.path)
      return
    }
    const frontendDir = dirs.find((dir) => /[\\/]frontend$/i.test(dir.path))
    devPreference.setField('cwd', frontendDir?.path ?? dirs[0]?.path ?? '')
  }, [cwd, devPreference, dirs, dirsReady])

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Smartphone className="size-5 text-[var(--color-primary)]" />
        <h1 className="text-lg font-semibold">ERP小程序需求开发</h1>
      </div>

      <section className="mb-4 rounded-xl border bg-[var(--color-card)] p-4 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <ShieldCheck className="size-4 text-[var(--color-primary)]" />
          启动前准备：成为正式小程序开发者
        </div>
        <p className="mt-2 text-xs leading-5 text-[var(--color-muted-foreground)]">
          正式项目 AppID：<code className="rounded bg-[var(--color-muted)] px-1">wxfb0d50888e966b01</code>。
          当前登录微信开发者工具的微信号，必须由小程序管理员在“管理 → 成员管理 → 项目成员”中添加，并授予“开发者”权限。
        </p>
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>未授权会报“code 10：登录用户不是该小程序的开发者”，此时与项目路径或启动脚本无关。授权后请退出并重新登录微信开发者工具，再从本页启动。</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <a
            href="https://mp.weixin.qq.com/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline"
          >
            前往微信公众平台申请/配置开发者权限 <ExternalLink className="size-3.5" />
          </a>
          <span className="text-[var(--color-muted-foreground)]">
            测试 AppID：<code className="rounded bg-[var(--color-muted)] px-1">wxe46ae72760c1b8e9</code>，仅用于独立、受限的本地调试，不能替代正式项目授权。
          </span>
        </div>
      </section>

      <section className="mb-4 rounded-xl border bg-[var(--color-card)] p-4">
        <div className="text-sm font-medium">项目运行模式</div>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          环境直接写入小程序项目配置：AppID、ERP 接口地址和 WechatSI 插件会成组切换。首次切换会在项目仓外备份原始文件。
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant={mode === 'FORMAL' ? 'default' : 'outline'}
            onClick={() => setMode('FORMAL')}
            className="h-auto justify-start gap-2 px-3 py-3 text-left"
          >
            <ShieldCheck className="size-4 shrink-0" />
            <span><span className="block">正式模式</span><span className="block text-xs font-normal opacity-75">正式 AppID + 线上 ERP + WechatSI</span></span>
            {mode === 'FORMAL' && <Check className="ml-auto size-4" />}
          </Button>
          <Button
            type="button"
            variant={mode === 'TEST' ? 'default' : 'outline'}
            onClick={() => setMode('TEST')}
            className="h-auto justify-start gap-2 px-3 py-3 text-left"
          >
            <FlaskConical className="size-4 shrink-0" />
            <span><span className="block">测试模式</span><span className="block text-xs font-normal opacity-75">测试 AppID + 指定 ERP + 跳过 WechatSI</span></span>
            {mode === 'TEST' && <Check className="ml-auto size-4" />}
          </Button>
        </div>
        {mode === 'TEST' && (
          <div className="mt-3">
            <label htmlFor="erp-mini-program-api-base" className="text-xs font-medium">测试 ERP 接口地址</label>
            <Input
              id="erp-mini-program-api-base"
              value={testApiBaseUrl}
              onChange={(event) => setTestApiBaseUrl(event.target.value.trim())}
              placeholder="例如 http://192.168.1.20:8080"
              className="mt-1 font-mono"
            />
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">请填写本地 Resin 或测试 ERP 实例地址，不要在测试模式误连线上数据。</p>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={applyEnvironment.isPending || !cwd}
            onClick={() => applyEnvironment.mutate(mode)}
          >
            应用{mode === 'FORMAL' ? '正式' : '测试'}模式
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!environmentQuery.data?.backupAvailable || restoreEnvironment.isPending}
            onClick={() => restoreEnvironment.mutate()}
            className="gap-1"
          >
            <RotateCcw className="size-4" />一键恢复原配置
          </Button>
        </div>
        {environmentQuery.data && (
          <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
            当前：<code>{environmentQuery.data.currentAppId || '未配置 AppID'}</code>
            {' · '}<code>{environmentQuery.data.apiBaseUrl || '未识别 ERP 地址'}</code>
            {' · '}WechatSI {environmentQuery.data.wechatSiEnabled ? '已启用' : '已跳过'}
          </p>
        )}
        {applyEnvironment.isError && <p className="mt-2 text-xs text-[var(--color-destructive)]">应用失败：{applyEnvironment.error.message}</p>}
        {restoreEnvironment.isError && <p className="mt-2 text-xs text-[var(--color-destructive)]">恢复失败：{restoreEnvironment.error.message}</p>}
      </section>

      <DevServiceSection
        serviceId={SERVICE_ID}
        dirs={dirs}
        dirsReady={dirsReady}
        defaultCwd={cwd}
        preference={devPreference.preference.services[SERVICE_ID]}
        onPreferenceChange={(value, immediate) => devPreference.setService(SERVICE_ID, value, immediate)}
        defaultCommand=".\start-erp-mini-program.ps1"
        stopCommand=".\stop-erp-mini-program.ps1"
        title="ERP小程序启停 + 启动日志"
        beforeStart={async (projectCwd) => {
          const data = await applyMiniProgramEnvironment(
            projectCwd,
            mode,
            mode === 'TEST' ? testApiBaseUrl : '',
          )
          queryClient.setQueryData(['erp-mini-program-environment', projectCwd], data)
        }}
      />
    </div>
  )
}
