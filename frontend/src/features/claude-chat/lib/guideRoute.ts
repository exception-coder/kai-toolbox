const WORKSPACE_PATH = '/tools/claude-chat'

/** 从工作区重看时保留会话及视图参数，从其他模块进入时使用现有工作区。 */
export function buildVibeGuideRoute(location: { pathname: string; search: string; hash: string }) {
  const inWorkspace = location.pathname === WORKSPACE_PATH
  const params = new URLSearchParams(inWorkspace ? location.search : '')
  params.delete('control')
  params.set('guide', '1')
  return { pathname: WORKSPACE_PATH, search: params.toString(), hash: inWorkspace ? location.hash : '' }
}
