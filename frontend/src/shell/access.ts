import type { FeatureManifest } from './types'

/**
 * 前端模块门禁：feature id → 所需角色（任一命中即可）。镜像后端软鉴权规则。
 * 不在表内 = 公开模块（对所有人可见）。ADMIN 万能（放行一切）。
 * 后端仍是数据安全底线，这里只是 UX 层（隐藏菜单 + 拦路由）。
 */
const REQUIRED_ROLES: Record<string, string[]> = {
  // ADMIN-only（与 application.yml 的 admin-only-patterns + 简历/账号管理对齐）
  'config-center': ['ADMIN'],
  flatten: ['ADMIN'],
  'vscode-tunnel': ['ADMIN'],
  'browser-request': ['ADMIN'],
  'ffmpeg-lab': ['ADMIN'],
  'video-condense': ['ADMIN'],
  hosts: ['ADMIN'],
  docker: ['ADMIN'],
  webterm: ['ADMIN'],
  resume: ['ADMIN'],
  'account-admin': ['ADMIN'],
  'claude-chat': ['ADMIN'], // Vibe Coding（WS 走 AdminHandshakeInterceptor，菜单/路由一并门禁）
  'claude-chat-stable': ['ADMIN'], // Vibe Coding 稳定版（同上，共用 /api/claude-chat/ws）
  // 视频库 / 磁盘空间分析（与后端 TreeSizeController @SoftGuard 一致）
  'video-library': ['VIDEO_LIBRARY', 'DISK_ADMIN'],
  treesize: ['VIDEO_LIBRARY', 'DISK_ADMIN'],
}

export function requiredRolesFor(featureId: string): string[] {
  return REQUIRED_ROLES[featureId] ?? []
}

/** 当前角色是否可访问该模块。公开模块恒 true；含 ADMIN 恒 true；否则需命中所需角色之一。 */
export function hasFeatureAccess(feature: FeatureManifest, roles: string[]): boolean {
  const required = REQUIRED_ROLES[feature.id]
  if (!required || required.length === 0) return true
  if (roles.includes('ADMIN')) return true
  return required.some(r => roles.includes(r))
}
