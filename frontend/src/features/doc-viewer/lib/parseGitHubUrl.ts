/**
 * 前端 URL 即时校验，仅用于"添加文档源"对话框给用户即时反馈。
 * 服务端解析为最终权威——不要依赖此处的解析做业务决策。
 */
export function isGitHubUrlPlausible(url: string): boolean {
  if (!url || !url.trim()) return false
  try {
    const u = new URL(url.trim())
    if (u.hostname.toLowerCase() !== 'github.com') return false
    const segs = u.pathname.replace(/^\/+|\/+$/g, '').split('/')
    if (segs.length < 2) return false
    if (segs.length > 2 && segs[2] !== 'tree' && segs[2] !== 'blob') return false
    return true
  } catch {
    return false
  }
}
