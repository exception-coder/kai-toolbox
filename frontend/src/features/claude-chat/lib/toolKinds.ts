import type { ComponentType } from 'react'
import { Bot, FilePen, FileSearch, Globe, ListTodo, Server, Sparkles, Terminal, Wrench } from 'lucide-react'

/** 工具大类（用于着色 / 图标）。 */
export type ToolKind = 'bash' | 'read' | 'edit' | 'agent' | 'skill' | 'mcp' | 'web' | 'todo' | 'other'

export interface ToolMeta {
  kind: ToolKind
  label: string
  icon: ComponentType<{ className?: string }>
  /** 着色用 tailwind 类：边框 + 浅底 + 文字（含暗色）。 */
  tone: string
  /** 图标/强调色（仅图标与状态字用，避免整块过艳）。 */
  accent: string
}

const META: Record<ToolKind, Omit<ToolMeta, 'kind' | 'label'>> = {
  bash:  { icon: Terminal,   tone: 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/40',     accent: 'text-amber-600 dark:text-amber-400' },
  read:  { icon: FileSearch, tone: 'border-sky-200 bg-sky-50/60 dark:border-sky-900 dark:bg-sky-950/40',           accent: 'text-sky-600 dark:text-sky-400' },
  edit:  { icon: FilePen,    tone: 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/40', accent: 'text-emerald-600 dark:text-emerald-400' },
  agent: { icon: Bot,        tone: 'border-violet-200 bg-violet-50/60 dark:border-violet-900 dark:bg-violet-950/40', accent: 'text-violet-600 dark:text-violet-400' },
  skill: { icon: Sparkles,   tone: 'border-fuchsia-200 bg-fuchsia-50/60 dark:border-fuchsia-900 dark:bg-fuchsia-950/40', accent: 'text-fuchsia-600 dark:text-fuchsia-400' },
  mcp:   { icon: Server,     tone: 'border-teal-200 bg-teal-50/60 dark:border-teal-900 dark:bg-teal-950/40',         accent: 'text-teal-600 dark:text-teal-400' },
  web:   { icon: Globe,      tone: 'border-cyan-200 bg-cyan-50/60 dark:border-cyan-900 dark:bg-cyan-950/40',         accent: 'text-cyan-600 dark:text-cyan-400' },
  todo:  { icon: ListTodo,   tone: 'border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40',     accent: 'text-slate-500 dark:text-slate-400' },
  other: { icon: Wrench,     tone: 'border-[var(--color-border)] bg-[var(--color-muted)]/40',                        accent: 'text-[var(--color-muted-foreground)]' },
}

const KIND_LABEL: Record<ToolKind, string> = {
  bash: '命令', read: '读取', edit: '编辑', agent: '子代理', skill: '技能', mcp: 'MCP', web: '联网', todo: '待办', other: '工具',
}

/** 按工具名归类（兼容 Claude / Codex / Gemini 常见工具名）。 */
export function classifyTool(toolName: string): ToolMeta {
  const n = (toolName || '').toLowerCase()
  let kind: ToolKind = 'other'
  if (n.startsWith('mcp__') || n.includes('mcp')) kind = 'mcp'
  else if (n === 'task' || n.includes('agent') || n.includes('subagent')) kind = 'agent'
  else if (n === 'skill' || n.startsWith('skill')) kind = 'skill'
  else if (n === 'bash' || n.includes('shell') || n.includes('exec') || n.includes('command') || n.includes('terminal')) kind = 'bash'
  else if (n.includes('webfetch') || n.includes('websearch') || n.includes('fetch') || n.includes('search') && n.includes('web')) kind = 'web'
  else if (n.includes('todo')) kind = 'todo'
  else if (n.includes('write') || n.includes('edit') || n.includes('patch') || n.includes('apply') || n.includes('notebook')) kind = 'edit'
  else if (n.includes('read') || n.includes('glob') || n.includes('grep') || n.includes('ls') || n.includes('view') || n.includes('cat')) kind = 'read'
  return { kind, label: KIND_LABEL[kind], ...META[kind] }
}
