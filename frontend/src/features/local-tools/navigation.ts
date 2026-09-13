export const LOCAL_TOOLS_PATH = '/tools/local-tools'

export function localToolLocation(search: string, tool: string) {
  const query = new URLSearchParams(search)
  query.set('tool', tool)
  return { pathname: LOCAL_TOOLS_PATH, search: `?${query}` }
}
