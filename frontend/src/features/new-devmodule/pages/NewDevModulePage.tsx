import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PackagePlus, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listWorkspaces } from '@/features/claude-chat/api'
import { CHAT_ROUTE } from '@/features/claude-chat/runtime/ChatRuntimeContext'

// 复用 Vibe Coding 的 handoff 通道（ChatPage 挂载消费：开会话 + 投喂触发语）
const LAUNCH_KEY = 'kai-toolbox:claude-chat:erp-dev-launch'
const K = (s: string) => `kai-toolbox:new-devmodule:${s}`

/** localStorage 记住的输入。 */
function useLocalState(key: string, initial = '') {
  const [v, setV] = useState(() => {
    try { return localStorage.getItem(key) ?? initial } catch { return initial }
  })
  const set = (nv: string) => { setV(nv); try { localStorage.setItem(key, nv) } catch { /* ignore */ } }
  return [v, set] as const
}

const BRAIN_OPTIONS = [
  { value: 'reuse-erp', label: '复用 yoooni-erp-auto-dev（ERP 类项目）' },
  { value: 'new-brain', label: '新建该项目专属大脑 skill（另行编写）' },
  { value: 'generic', label: '通用门控，暂不接专属大脑' },
]
const brainText = (v: string) => BRAIN_OPTIONS.find(o => o.value === v)?.label ?? v

/** 拼装投喂给 yoooni-devmodule-scaffold 的触发语。 */
function buildSeed(p: {
  cwd: string; id: string; name: string; icon: string; startCmd: string; stopCmd: string; config: string; brain: string
}): string {
  return [
    '用 yoooni-devmodule-scaffold 给一个项目生成「需求开发」工作台模块。',
    `生成到（kai-toolbox 仓目录）：${p.cwd}`,
    `- 新模块 id：${p.id.trim()}`,
    `- 新模块中文名：${p.name.trim()}`,
    `- 侧边栏图标(Lucide 组件名)：${p.icon.trim() || '（留空，由你建议一个合适的）'}`,
    `- 目标项目服务启动命令：${p.startCmd.trim() || '（未填——请到项目根目录探索启停脚本：常见 start-*.ps1 / stop-*.ps1、package.json 的 scripts、pom.xml；识别后作为生成模块的默认启动/停服命令，并在关卡念给我确认）'}`,
    `- 停服命令：${p.stopCmd.trim() || '（未填——随启动一并探索；探索不到则结束进程树）'}`,
    `- 调试必备配置项：${p.config.trim() || '无'}`,
    `- 大脑：${brainText(p.brain)}`,
    '',
    '请按脚手架门控走，每步过关卡等我拍板：',
    '① 复述确认以上差异项；',
    '② 读范本(features/erp-dev、features/_devkit、CLAUDE.md)并列出要新增/修改的文件清单让我确认；',
    '③ 复用公共 devkit(DevServiceSection + dev-service 多实例底座)生成模块，配置落 claude_chat_setting KV、路由用 React.lazy；',
    '④ typecheck / 该模块编译自检，出 diff，只改不提交。',
  ].join('\n')
}

/**
 * 「新增系统需求开发模块」前门：可视化填新项目参数 → 一键触发脚手架 skill(yoooni-devmodule-scaffold)，
 * 在选定的 kai-toolbox 仓目录里拉起 Vibe Coding 会话生成一个「XX 需求开发」工作台模块（门控·只改不提交）。
 */
export function NewDevModulePage() {
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

  const [cwd, setCwd] = useState(() => { try { return localStorage.getItem(K('cwd')) ?? '' } catch { return '' } })
  const pickCwd = (p: string) => { setCwd(p); try { localStorage.setItem(K('cwd'), p) } catch { /* ignore */ } }
  useEffect(() => {
    if (dirs.length === 0) return
    if (!dirs.some(d => d.path === cwd)) pickCwd(dirs[0].path)
  }, [dirs, cwd])

  const [id, setId] = useLocalState(K('id'))
  const [name, setName] = useLocalState(K('name'))
  const [icon, setIcon] = useLocalState(K('icon'))
  const [startCmd, setStartCmd] = useLocalState(K('startCmd'))
  const [stopCmd, setStopCmd] = useLocalState(K('stopCmd'))
  const [config, setConfig] = useLocalState(K('config'))
  const [brain, setBrain] = useLocalState(K('brain'), 'generic')

  const canStart = cwd.length > 0 && id.trim().length > 0 && name.trim().length > 0

  const start = () => {
    if (!canStart) return
    const seed = buildSeed({ cwd, id, name, icon, startCmd, stopCmd, config, brain })
    try { sessionStorage.setItem(LAUNCH_KEY, JSON.stringify({ cwd, seed })) } catch { /* 隐私模式忽略 */ }
    navigate(CHAT_ROUTE)
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <PackagePlus className="size-5 text-[var(--color-primary)]" />
        <h1 className="text-lg font-semibold">新增系统需求开发模块</h1>
      </div>
      <p className="mb-5 text-sm text-[var(--color-muted-foreground)]">
        填新项目参数，一键触发脚手架 <code className="rounded bg-[var(--color-muted)] px-1">yoooni-devmodule-scaffold</code>：
        在选定的 kai-toolbox 仓目录里生成一个「XX 需求开发」工作台模块（选目录 + 模块/需求 + 服务启停 + 前台日志 + 调试配置），
        通用骨架复用公共 devkit，差异按下面填。生成过程走门控、<b>只改不提交</b>。
      </p>

      <div className="space-y-4 rounded-xl border bg-[var(--color-card)] p-4">
        <div>
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">生成到（kai-toolbox 仓所在工作区目录）</label>
          <select
            value={cwd}
            onChange={e => pickCwd(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border bg-[var(--color-background)] px-2 text-sm text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            {dirs.length === 0 && <option value="">（无可用目录，请把 kai-toolbox 仓所在目录加入 application.yml 的 workspace.roots）</option>}
            {dirs.map(d => <option key={d.path} value={d.path}>{d.label}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">脚手架会往这个目录（应为 kai-toolbox 仓）里生成前端 feature/后端配置代码。</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-[var(--color-muted-foreground)]">新模块 id（英文短横线）
            <Input value={id} onChange={e => setId(e.target.value)} placeholder="如 srm-dev" className="mt-1" />
          </label>
          <label className="text-xs text-[var(--color-muted-foreground)]">新模块中文名
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="如 SRM 需求开发" className="mt-1" />
          </label>
        </div>

        <label className="block text-xs text-[var(--color-muted-foreground)]">侧边栏图标（Lucide 组件名，可留空）
          <Input value={icon} onChange={e => setIcon(e.target.value)} placeholder="如 Workflow / Boxes（留空由 agent 建议）" className="mt-1" />
        </label>

        <label className="block text-xs text-[var(--color-muted-foreground)]">服务启动命令（可选，留空让 agent 到项目根探索 start/stop 脚本）
          <Input value={startCmd} onChange={e => setStartCmd(e.target.value)} placeholder="留空即探索；或填 npm run dev / mvn ... spring-boot:run / .\start-xxx.ps1" className="mt-1 font-mono text-xs" />
        </label>

        <label className="block text-xs text-[var(--color-muted-foreground)]">停服命令（可选，留空=结束进程树）
          <Input value={stopCmd} onChange={e => setStopCmd(e.target.value)} placeholder="有专用停服命令再填" className="mt-1 font-mono text-xs" />
        </label>

        <label className="block text-xs text-[var(--color-muted-foreground)]">调试必备配置项（可选，一行一项；没有就留空）
          <textarea
            value={config}
            onChange={e => setConfig(e.target.value)}
            rows={3}
            placeholder="如：测试库(Oracle 只读: host/port/service/账号)、本地实例地址+登录账号……没有就留空"
            className="mt-1 w-full resize-y rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          />
        </label>

        <label className="block text-xs text-[var(--color-muted-foreground)]">大脑（自动开发流水线）
          <select
            value={brain}
            onChange={e => setBrain(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border bg-[var(--color-background)] px-2 text-sm text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            {BRAIN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        <div className="flex items-center gap-3 pt-1">
          <Button disabled={!canStart} onClick={start} className="gap-1">
            <Rocket className="size-4" />生成模块
          </Button>
          <span className="text-xs text-[var(--color-muted-foreground)]">进入 Vibe Coding 实时看脚手架过程，在关卡处确认。</span>
        </div>
      </div>

      <p className="mt-4 text-[11px] text-[var(--color-muted-foreground)]">
        依赖团队插件 yoooni-daily-plugin ≥0.25.0 已安装（含 yoooni-devmodule-scaffold）；生成出的模块里"服务启停+前台日志"零新增代码、直接复用公共 devkit。
      </p>
    </div>
  )
}
