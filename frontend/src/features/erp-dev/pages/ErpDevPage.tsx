import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Database, Loader2, Rocket, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listWorkspaces } from '@/features/claude-chat/api'
import { CHAT_ROUTE } from '@/features/claude-chat/runtime/ChatRuntimeContext'
import { getErpDbConfig, saveErpDbConfig, testErpDb } from '../api'

const LAUNCH_KEY = 'kai-toolbox:claude-chat:erp-dev-launch'

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
    '③ 出轻量方案(design-doc)让我确认；',
    '④ 按编码规范改码(encoding-guard 防乱码；DB/迁移/状态字典改动单独确认)；',
    '⑤ 自检出 diff、只改不提交。',
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

  const [cwd, setCwd] = useState('')
  const [moduleOrUrl, setModuleOrUrl] = useState('')
  const [requirement, setRequirement] = useState('')

  useEffect(() => { if (!cwd && dirs.length > 0) setCwd(dirs[0].path) }, [dirs, cwd])

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
        出方案 → 按编码规范改码 → 自检出 diff。关键处（命中页面 / 方案 / DB 改动）会停下让你确认，<b>只改不提交</b>。
      </p>

      <div className="space-y-4 rounded-xl border bg-[var(--color-card)] p-4">
        <div>
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">ERP 项目目录（工作区）</label>
          {dirs.length === 0 ? (
            <p className="mt-1 text-xs text-[var(--color-destructive)]">未发现可用工作区目录（toolbox.claude-chat.workspace.roots）。请先在 Vibe Coding 里拉取/配置 ERP 项目。</p>
          ) : (
            <select
              value={cwd}
              onChange={e => setCwd(e.target.value)}
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
            onChange={e => setModuleOrUrl(e.target.value)}
            placeholder="如：报价审核  或  https://.../quoteAudit_list.action"
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">需求描述</label>
          <textarea
            value={requirement}
            onChange={e => setRequirement(e.target.value)}
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

      <ErpDbConfigSection />

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
