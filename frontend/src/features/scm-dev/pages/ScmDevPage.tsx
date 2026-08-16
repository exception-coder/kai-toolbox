import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Database, Eye, EyeOff, Loader2, Warehouse } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listWorkspaces } from '@/features/claude-chat/public-api'
import {
  DevServiceSection,
  useDevWorkbenchPreference,
  useVisibleWorkspaceProjects,
} from '@/features/_devkit/public-api'
import { getScmDbConfig, saveScmDbConfig, testScmDb } from '../api'

/** 记住上次选择的工作区目录，避免每次进来都要重选。 */
const CWD_KEY = 'kai-toolbox:scm-dev:cwd'
/** 记住上次填的模块与需求描述，避免每次重输。 */
const MODULE_KEY = 'kai-toolbox:scm-dev:module'
const REQUIREMENT_KEY = 'kai-toolbox:scm-dev:requirement'

export function ScmDevPage() {
  const { data: workspaces } = useQuery({ queryKey: ['claude-chat-workspaces'], queryFn: listWorkspaces, staleTime: 5000 })

  const { projects: dirs, ready: dirsReady } = useVisibleWorkspaceProjects(workspaces)

  const devPreference = useDevWorkbenchPreference('scm-dev', {
    cwd: CWD_KEY, module: MODULE_KEY, requirement: REQUIREMENT_KEY,
  })
  const { cwd } = devPreference.preference

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Warehouse className="size-5 text-[var(--color-primary)]" />
        <h1 className="text-lg font-semibold">SCM需求开发</h1>
      </div>
      <DevServiceSection
        serviceId="scm"
        dirs={dirs}
        dirsReady={dirsReady}
        defaultCwd={cwd}
        preference={devPreference.preference.services.scm}
        onPreferenceChange={(value, immediate) => devPreference.setService('scm', value, immediate)}
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
        启停用 start-scm.ps1 -Foreground（前台合并模式）：后端/前端日志按 [backend]/[frontend] 前缀合并到本区，停服对进程树整体清理。
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
