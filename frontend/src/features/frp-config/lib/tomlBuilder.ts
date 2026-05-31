import type { FrpcConfig, FrpsConfig, ProxyEntry } from './types'

/** TOML 字符串字面量：用双引号包裹并转义控制字符 */
function tstr(v: string): string {
  return '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"'
}

/** 自动判断写裸数字还是字符串。frp 的 port/timeout 是 int，非数字写不进去。 */
function numLine(key: string, raw: string): string | null {
  const v = raw.trim()
  if (v === '') return null
  if (!/^\d+$/.test(v)) return null
  return `${key} = ${v}`
}

function strLine(key: string, raw: string): string | null {
  const v = raw.trim()
  if (v === '') return null
  return `${key} = ${tstr(v)}`
}

function boolLine(key: string, v: boolean): string {
  return `${key} = ${v ? 'true' : 'false'}`
}

/** 生成 frps.toml */
export function buildFrpsToml(c: FrpsConfig): string {
  const lines: string[] = []

  lines.push('# ===== 服务端基础 =====')
  pushIfTruthy(lines, strLine('bindAddr', c.bindAddr))
  pushIfTruthy(lines, numLine('bindPort', c.bindPort))
  if (c.authToken.trim()) {
    lines.push('')
    lines.push('# token 鉴权：客户端必须用同一个 token 才能连进来')
    lines.push(`auth.method = "token"`)
    lines.push(`auth.token = ${tstr(c.authToken)}`)
  }

  if (c.vhostHttpPort.trim() || c.vhostHttpsPort.trim() || c.subdomainHost.trim()) {
    lines.push('')
    lines.push('# ===== HTTP/HTTPS 多域名分流（type = "http" 的代理使用） =====')
    pushIfTruthy(lines, numLine('vhostHTTPPort', c.vhostHttpPort))
    pushIfTruthy(lines, numLine('vhostHTTPSPort', c.vhostHttpsPort))
    pushIfTruthy(lines, strLine('subdomainHost', c.subdomainHost))
  }

  if (c.dashboardEnabled) {
    lines.push('')
    lines.push('# ===== Dashboard：浏览器查看连接数 / 代理状态 =====')
    pushIfTruthy(lines, strLine('webServer.addr', c.dashboardAddr))
    pushIfTruthy(lines, numLine('webServer.port', c.dashboardPort))
    pushIfTruthy(lines, strLine('webServer.user', c.dashboardUser))
    pushIfTruthy(lines, strLine('webServer.password', c.dashboardPwd))
  }

  lines.push('')
  lines.push('# ===== 日志 =====')
  pushIfTruthy(lines, strLine('log.to', c.logFile))
  pushIfTruthy(lines, strLine('log.level', c.logLevel))
  pushIfTruthy(lines, numLine('log.maxDays', c.maxLogDays))

  const ports = parseAllowPorts(c.allowPortsText)
  if (ports.length > 0) {
    lines.push('')
    lines.push('# ===== 端口白名单：限制客户端能申请的 remotePort 范围（防滥用） =====')
    ports.forEach(p => lines.push(p))
  }

  return lines.filter(notNull).join('\n') + '\n'
}

/** 生成 frpc.toml */
export function buildFrpcToml(c: FrpcConfig): string {
  const lines: string[] = []
  lines.push('# ===== 客户端：连到哪台 frps =====')
  pushIfTruthy(lines, strLine('serverAddr', c.serverAddr))
  pushIfTruthy(lines, numLine('serverPort', c.serverPort))
  pushIfTruthy(lines, strLine('user', c.user))
  if (c.authToken.trim()) {
    lines.push('')
    lines.push('# token 必须与服务端 auth.token 完全一致，否则握手会被 reject')
    lines.push(`auth.method = "token"`)
    lines.push(`auth.token = ${tstr(c.authToken)}`)
  }

  lines.push('')
  lines.push('# ===== 日志 =====')
  pushIfTruthy(lines, strLine('log.to', c.logFile))
  pushIfTruthy(lines, strLine('log.level', c.logLevel))
  pushIfTruthy(lines, numLine('log.maxDays', c.maxLogDays))

  if (c.webEnabled) {
    lines.push('')
    lines.push('# ===== Admin UI：本机浏览器看 proxy 状态 / 热重载配置 =====')
    pushIfTruthy(lines, strLine('webServer.addr', c.webAddr))
    pushIfTruthy(lines, numLine('webServer.port', c.webPort))
    pushIfTruthy(lines, strLine('webServer.user', c.webUser))
    pushIfTruthy(lines, strLine('webServer.password', c.webPwd))
  }

  if (c.proxies.length === 0) {
    lines.push('')
    lines.push('# 还没有添加任何 proxy。在 UI 里点「新增代理」开始建第一条。')
  } else {
    lines.push('')
    lines.push('# ===== 代理列表：一条 [[proxies]] = 一个端口/服务穿透 =====')
    c.proxies.forEach(p => lines.push(...renderProxy(p)))
  }

  return lines.filter(notNull).join('\n') + '\n'
}

function renderProxy(p: ProxyEntry): string[] {
  const out: string[] = ['']
  out.push('[[proxies]]')
  out.push(`name = ${tstr(p.name || 'proxy-' + p.uid.slice(0, 6))}`)
  out.push(`type = ${tstr(p.type)}`)

  if (p.type === 'tcp' || p.type === 'udp' || p.type === 'stcp' || p.type === 'xtcp') {
    pushIfTruthy(out, strLine('localIP', p.localIp))
    if (p.rangeMode) {
      pushIfTruthy(out, strLine('localPortsRange', p.localPortsRange))
      pushIfTruthy(out, strLine('remotePortsRange', p.remotePortsRange))
    } else {
      pushIfTruthy(out, numLine('localPort', p.localPort))
      pushIfTruthy(out, numLine('remotePort', p.remotePort))
    }
  } else if (p.type === 'http' || p.type === 'https') {
    pushIfTruthy(out, strLine('localIP', p.localIp))
    pushIfTruthy(out, numLine('localPort', p.localPort))
    const domains = p.customDomains
      .split(/[,\s]+/)
      .map(s => s.trim())
      .filter(Boolean)
    if (domains.length > 0) {
      out.push(`customDomains = [${domains.map(tstr).join(', ')}]`)
    }
    pushIfTruthy(out, strLine('subdomain', p.subdomain))
  }
  return out
}

function parseAllowPorts(text: string): string[] {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  if (lines.length === 0) return []
  const items: string[] = []
  for (const line of lines) {
    const m = line.match(/^(\d+)\s*-\s*(\d+)$/)
    if (m) {
      items.push(`{ start = ${m[1]}, end = ${m[2]} }`)
      continue
    }
    if (/^\d+$/.test(line)) {
      items.push(`{ single = ${line} }`)
    }
  }
  if (items.length === 0) return []
  return ['allowPorts = [', ...items.map(s => '  ' + s + ','), ']']
}

function pushIfTruthy(arr: (string | null)[], v: string | null) {
  if (v != null) arr.push(v)
}

function notNull<T>(v: T | null): v is T {
  return v !== null
}
