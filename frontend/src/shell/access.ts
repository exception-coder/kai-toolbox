import type { FeatureManifest } from './types'

/**
 * 前端模块门禁：feature id → 所需角色（任一命中即可）。镜像后端软鉴权规则。
 * 不在表内 = 公开模块（对所有人可见）。ADMIN 万能（放行一切）。
 * 后端仍是数据安全底线，这里只是 UX 层（隐藏菜单 + 拦路由）。
 */
const REQUIRED_ROLES: Record<string, string[]> = {
  // ADMIN-only（与 application.yml 的 admin-only-patterns + 简历/账号管理对齐）
  'config-center': ['ADMIN'],
  'menu-settings': ['ADMIN'],
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
  // 视频库 / 磁盘空间分析（与后端 TreeSizeController @SoftGuard 一致）
  'video-library': ['VIDEO_LIBRARY', 'DISK_ADMIN'],
  treesize: ['VIDEO_LIBRARY', 'DISK_ADMIN'],
}

export function requiredRolesFor(featureId: string): string[] {
  return REQUIRED_ROLES[featureId] ?? []
}

/** 访问上下文：角色（存量门禁） + 权限码 + 超管（Forge 权限体系）。 */
export interface AccessContext {
  roles: string[]
  permissionCodes: string[]
  superAdmin: boolean
}

function toContext(ctx: AccessContext | string[]): AccessContext {
  if (Array.isArray(ctx)) {
    return { roles: ctx, permissionCodes: [], superAdmin: ctx.includes('ADMIN') }
  }
  return ctx
}

/**
 * 当前用户是否可访问该模块。判定顺序：
 * 超管恒 true → manifest.requiredPermission（Forge 权限码，命中或 ADMIN 放行）→ 存量角色表门禁。
 * 兼容旧调用（第二参传 roles 数组）。
 */
export function hasFeatureAccess(feature: FeatureManifest, ctx: AccessContext | string[]): boolean {
  const c = toContext(ctx)
  if (c.superAdmin) return true
  if (feature.requiredPermission) {
    return c.roles.includes('ADMIN') || c.permissionCodes.includes(feature.requiredPermission)
  }
  const required = REQUIRED_ROLES[feature.id]
  if (!required || required.length === 0) return true
  if (c.roles.includes('ADMIN')) return true
  return required.some(r => c.roles.includes(r))
}
