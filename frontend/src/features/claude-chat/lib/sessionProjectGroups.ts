import type { ClaudeChatSessionView } from '../types'

type SessionProjectSource = Pick<ClaudeChatSessionView, 'group' | 'cwd'>

export interface SessionProject {
  key: string
  label: string
  kind: 'manual' | 'directory' | 'ungrouped'
  cwd: string
}

export interface SessionProjectSummary extends SessionProject {
  count: number
  running: number
  lastSeenAt: number
}

function normalizedDirectory(cwd: string): string {
  const path = cwd.trim().replaceAll('\\', '/')
  const collapsed = path.replace(/\/+/g, '/')
  const normalized = (path.startsWith('//') ? '/' + collapsed : collapsed).replace(/\/+$/, '')
  if (/^[a-z]:$/i.test(normalized)) return normalized + '/'
  return normalized || (path.startsWith('/') ? '/' : '')
}

/** 用完整主目录标识工作区；Windows 盘符及 UNC 路径忽略大小写。 */
export function sessionWorkspaceIdentity(cwd: string): string {
  const directory = normalizedDirectory(cwd)
  return /^[a-z]:\//i.test(directory) || directory.startsWith('//')
    ? directory.toLowerCase()
    : directory
}

export function sessionWorkspaceLabel(cwd: string, fallback = '未识别工作区'): string {
  const directory = normalizedDirectory(cwd)
  return directory.split('/').filter(Boolean).at(-1) || directory || fallback
}

export function manualSessionProjectKey(name: string): string {
  return JSON.stringify(['manual', name.trim()])
}

/** 手动分组优先；自动分组仅投影主目录，不改写会话或项目注册信息。 */
export function resolveSessionProject(session: SessionProjectSource): SessionProject {
  const name = session.group?.trim()
  if (name) return { key: manualSessionProjectKey(name), label: name, kind: 'manual', cwd: '' }
  const cwd = session.cwd?.trim() || ''
  const directory = sessionWorkspaceIdentity(cwd)
  if (directory) {
    return { key: JSON.stringify(['directory', directory]), label: sessionWorkspaceLabel(cwd), kind: 'directory', cwd }
  }
  return { key: JSON.stringify(['ungrouped']), label: '未分组', kind: 'ungrouped', cwd: '' }
}

export function groupSessionsByProject(sessions: ClaudeChatSessionView[], activityAt = (session: ClaudeChatSessionView) => session.lastActivityAt ?? session.lastSeenAt): SessionProjectSummary[] {
  const projects = new Map<string, SessionProjectSummary>()
  for (const session of sessions) {
    const project = resolveSessionProject(session)
    const summary = projects.get(project.key) ?? { ...project, count: 0, running: 0, lastSeenAt: 0 }
    summary.count += 1
    if (session.status === 'RUNNING' && session.live) summary.running += 1
    summary.lastSeenAt = Math.max(summary.lastSeenAt, activityAt(session))
    projects.set(project.key, summary)
  }
  return [...projects.values()].sort((a, b) =>
    Number(a.kind === 'ungrouped') - Number(b.kind === 'ungrouped')
    || b.lastSeenAt - a.lastSeenAt
    || a.label.localeCompare(b.label, 'zh-CN'))
}
