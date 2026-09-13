export const DEVELOPMENT_PATH = '/tools/project-development'

export function developmentLocation(search: string, system: string, adding = false) {
  const query = new URLSearchParams(search)
  query.set('system', system)
  if (adding) query.set('action', 'new')
  else query.delete('action')
  return { pathname: DEVELOPMENT_PATH, search: `?${query}` }
}
