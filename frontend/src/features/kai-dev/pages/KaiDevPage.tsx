import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Hammer, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listWorkspaces } from '@/features/claude-chat/api'
import { CHAT_ROUTE } from '@/features/claude-chat/runtime/ChatRuntimeContext'
import { DevServiceSection } from '@/features/_devkit/DevServiceSection'

// 复用 Vibe Coding 的 handoff 通道（ChatPage 挂载时消费：开会话 + 投喂触发语）
const LAUNCH_KEY = 'kai-toolbox:claude-chat:erp-dev-launch'
const CWD_KEY = 'kai-toolbox:kai-dev:cwd'
const MODULE_KEY = 'kai-toolbox:kai-dev:module'
const REQ_KEY = 'kai-toolbox:kai-dev:requirement'

/** 拼装投喂给 Vibe Coding 的通用开发触发语（kai-toolbox 自身，非 ERP 专属大脑）。 */
function buildSeed(moduleOrPath: string, requirement: string): string {
  return [
    '在 kai-toolbox 仓开发一个小需求。',
    `模块/路径：${moduleOrPath}`,
    '需求：',
    requirement.trim(),
    '',
    '请按门控走，每步过关卡等我拍板：',
    '① 先读 CLAUDE.md 与相关 feature/模块代码，定位改动点，念给我确认；',
    '② 出轻量方案（改哪些文件、影响面、回归点）让我确认；',
    '③ 按仓库约定改码（前端 React.lazy/FeatureManifest 约定、后端 per-tool 结构）；',
    '④ 自检（typecheck / 该模块编译）出 diff，只改不提交。',
  ].join('\n')
}

/**
 * kai-toolbox 自身的「开发」模块（脚手架 yoooni-devmodule-scaffold 的 dogfood 落地）。
 * 选目录 + 模块/需求（记住上次）+ 一键起停前后端服务并看前台日志。服务能力全部复用 DevServiceSection。
 */
export function KaiDevPage() {
  const navigate = useNavigate()
  const { data: workspaces } = useQuery({ queryKey: ['claude-chat-workspaces'], queryFn: listWorkspaces, staleTime: 5000 })

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
  const [moduleOrPath, setModuleOrPath] = useState(() => { try { return localStorage.getItem(MODULE_KEY) ?? '' } catch { return '' } })
  const [requirement, setRequirement] = useState(() => { try { return localStorage.getItem(REQ_KEY) ?? '' } catch { return '' } })

  const pickCwd = (p: string) => { setCwd(p); try { localStorage.setItem(CWD_KEY, p) } catch { /* ignore */ } }
  const editModule = (v: string) => { setModuleOrPath(v); try { localStorage.setItem(MODULE_KEY, v) } catch { /* ignore */ } }
  const editReq = (v: string) => { setRequirement(v); try { localStorage.setItem(REQ_KEY, v) } catch { /* ignore */ } }

  useEffect(() => {
    if (dirs.length === 0) return
    if (!dirs.some(d => d.path === cwd)) pickCwd(dirs[0].path)
  }, [dirs, cwd])

  const canStart = cwd.length > 0 && moduleOrPath.trim().length > 0 && requirement.trim().length > 0
  const start = () => {
    if (!canStart) return
    const seed = buildSeed(moduleOrPath.trim(), requirement)
    try { sessionStorage.setItem(LAUNCH_KEY, JSON.stringify({ cwd, seed })) } catch { /* 隐私模式忽略 */ }
    navigate(CHAT_ROUTE)
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Hammer className="size-5 text-[var(--color-primary)]" />
        <h1 className="text-lg font-semibold">kai-toolbox 开发</h1>
      </div>
      <p className="mb-5 text-sm text-[var(--color-muted-foreground)]">
        本工作台自身的开发模块（脚手架 dogfood）：选目录 + 模块/需求交给 Vibe Coding 门控开发，并可一键起停前后端服务、看前台启动日志。
      </p>

      <div className="space-y-4 rounded-xl border bg-[var(--color-card)] p-4">
        <div>
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">项目目录（工作区）</label>
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
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">模块 / 路径</label>
          <Input value={moduleOrPath} onChange={e => editModule(e.target.value)} placeholder="如：features/treesize 或 tool-claude-chat" className="mt-1" />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">需求描述</label>
          <textarea
            value={requirement}
            onChange={e => editReq(e.target.value)}
            rows={4}
            placeholder="用中文把要做的改动说清楚。"
            className="mt-1 w-full resize-y rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          />
        </div>
        <div className="flex items-center gap-3 pt-1">
          <Button disabled={!canStart} onClick={start} className="gap-1">
            <Rocket className="size-4" />开始开发
          </Button>
          <span className="text-xs text-[var(--color-muted-foreground)]">开始后进入 Vibe Coding，关卡处确认。</span>
        </div>
      </div>

      <DevServiceSection
        serviceId="kai-backend"
        dirs={dirs}
        defaultCwd={cwd}
        defaultCommand="mvn -pl toolbox-starter -am spring-boot:run"
        title="后端服务启停 + 启动日志"
      />
      <DevServiceSection
        serviceId="kai-frontend"
        dirs={dirs}
        defaultCwd={cwd}
        defaultCommand="cd frontend; npm run dev"
        title="前端 Dev 服务启停 + 日志"
      />
    </div>
  )
}
