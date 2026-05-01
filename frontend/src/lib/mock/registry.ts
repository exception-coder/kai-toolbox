export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

export class MockHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export interface HttpCtx {
  method: Method
  path: string
  params: Record<string, string>
  query: URLSearchParams
  body: unknown
}

export type HttpHandler = (ctx: HttpCtx) => unknown | Promise<unknown>

export interface SseCtx {
  path: string
  params: Record<string, string>
  query: URLSearchParams
}

export type SseEmit = (eventName: string, data: unknown) => void
export type SseHandler = (ctx: SseCtx, emit: SseEmit) => () => void

interface CompiledRoute {
  re: RegExp
  names: string[]
}

interface HttpRoute extends CompiledRoute {
  method: Method
  handler: HttpHandler
}

interface SseRoute extends CompiledRoute {
  handler: SseHandler
}

const httpRoutes: HttpRoute[] = []
const sseRoutes: SseRoute[] = []

function compile(pattern: string): CompiledRoute {
  const names: string[] = []
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:(\w+)/g, (_, name: string) => {
      names.push(name)
      return '([^/]+)'
    })
  return { re: new RegExp(`^${escaped}$`), names }
}

export function registerHttp(method: Method, pattern: string, handler: HttpHandler): void {
  const { re, names } = compile(pattern)
  httpRoutes.push({ method, re, names, handler })
}

export function registerSse(pattern: string, handler: SseHandler): void {
  const { re, names } = compile(pattern)
  sseRoutes.push({ re, names, handler })
}

export interface HttpMatch {
  handler: HttpHandler
  params: Record<string, string>
  query: URLSearchParams
  path: string
}

export interface SseMatch {
  handler: SseHandler
  params: Record<string, string>
  query: URLSearchParams
  path: string
}

function splitPath(fullPath: string): { path: string; query: URLSearchParams } {
  const i = fullPath.indexOf('?')
  if (i < 0) return { path: fullPath, query: new URLSearchParams() }
  return { path: fullPath.slice(0, i), query: new URLSearchParams(fullPath.slice(i + 1)) }
}

function extractParams(names: string[], match: RegExpExecArray): Record<string, string> {
  const params: Record<string, string> = {}
  names.forEach((name, i) => {
    params[name] = decodeURIComponent(match[i + 1])
  })
  return params
}

export function matchHttp(method: Method, fullPath: string): HttpMatch | null {
  const { path, query } = splitPath(fullPath)
  for (const r of httpRoutes) {
    if (r.method !== method) continue
    const m = r.re.exec(path)
    if (m) {
      return { handler: r.handler, params: extractParams(r.names, m), query, path }
    }
  }
  return null
}

export function matchSse(fullPath: string): SseMatch | null {
  const { path, query } = splitPath(fullPath)
  for (const r of sseRoutes) {
    const m = r.re.exec(path)
    if (m) {
      return { handler: r.handler, params: extractParams(r.names, m), query, path }
    }
  }
  return null
}
