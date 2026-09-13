export function contentToolLocation(search: string, tool: string) {
  const query = new URLSearchParams(search)
  query.set('tool', tool)
  return { pathname: '/tools/content-tools', search: `?${query}` }
}
