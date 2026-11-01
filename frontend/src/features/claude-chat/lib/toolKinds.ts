import type { ComponentType } from 'react'
import { Bot, FilePen, FileSearch, Globe, ListTodo, Server, Sparkles, Terminal, Wrench } from 'lucide-react'

/** 工具大类（用于中性图标 / 类型标签）。 */
export type ToolKind = 'bash' | 'read' | 'edit' | 'agent' | 'skill' | 'mcp' | 'web' | 'todo' | 'other'

export interface ToolMeta {
  kind: ToolKind
  label: string
  icon: ComponentType<{ className?: string }>

}

const META: Record<ToolKind, { icon: ToolMeta['icon'] }> = {
  bash: { icon: Terminal }, read: { icon: FileSearch }, edit: { icon: FilePen },
  agent: { icon: Bot }, skill: { icon: Sparkles }, mcp: { icon: Server },
  web: { icon: Globe }, todo: { icon: ListTodo }, other: { icon: Wrench },
}

const KIND_LABEL: Record<ToolKind, string> = {
  bash: '命令', read: '读取', edit: '编辑', agent: '子代理', skill: '技能', mcp: 'MCP', web: '联网', todo: '待办', other: '工具',
}

/** 按工具名归类（兼容各 Coding Agent 常见工具名）。 */
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
