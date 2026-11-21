import { lookup } from 'node:dns/promises'
import { randomBytes } from 'node:crypto'
import { createServer, request as httpRequest } from 'node:http'
import { BlockList, connect, isIP } from 'node:net'

// The browser only uses IPv4 egress. Resolve a permitted host once, validate the
// whole answer, then connect to a numeric address without a second DNS lookup.
const special = new BlockList()
for (const [base, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) special.addSubnet(base, bits)

export function publicHttps(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.port || url.username || url.password ||
      isIP(url.hostname) || !/^(?:[a-z0-9-]+\.)+[a-z][a-z0-9-]*$/i.test(url.hostname)) {
    throw new Error('仅支持使用域名、标准端口的公开 HTTPS 网页')
  }
  return url
}

export async function publicAddress(host, resolve = lookup) {
  const entries = await resolve(host, { family: 4, all: true })
  if (!entries.length || entries.some(({ address }) => isIP(address) !== 4 || special.check(address))) {
    throw new Error('浏览器无法访问本机、私网或保留地址')
  }
  return entries[0].address
}

// Accept only the supplied host and its conventional www redirect. Never grant
// subdomains/wildcards or trust a redirect to grant access to another site.
export function hostScope() {
  const hosts = new Set()
  const pages = new Set()
  return {
    allow(url) {
      const href = publicHttps(url)
      const host = href.hostname
      href.hash = ''
      pages.add(href.href)
      hosts.add(host)
      hosts.add(host.startsWith('www.') ? host.slice(4) : 'www.' + host)
    },
    has: host => hosts.has(host),
    allowsDocument: url => pages.has(url.split('#')[0]),
  }
}

export function trustedUpstream(proxyValue, originValue) {
  if (!proxyValue && !originValue) return undefined
  if (!proxyValue || !originValue) throw new Error('上游代理与精确来源清单需同时配置')
  const proxy = new URL(proxyValue)
  if (proxy.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(proxy.hostname) ||
      proxy.username || proxy.password || proxy.pathname !== '/' || proxy.search || proxy.hash) {
    throw new Error('上游必须是无凭据的本机 HTTP 代理')
  }
  const hosts = new Set(originValue.split(',').map(value => {
    const origin = publicHttps(value.trim())
    if (origin.pathname !== '/' || origin.search || origin.hash) throw new Error('仅允许配置精确 HTTPS 来源')
    return origin.hostname
  }))
  return { proxy, hosts }
}

// An explicitly trusted operator proxy resolves only its listed destinations.
// Chromium verifies the target certificate inside the tunnel in both modes.
async function connectDestination(host, upstream, signal) {
  if (upstream?.hosts.has(host)) {
    return new Promise((resolve, reject) => {
      const request = httpRequest(upstream.proxy, {
        method: 'CONNECT', path: host + ':443', headers: { Host: host + ':443' }, agent: false, signal,
      })
      request.on('error', reject)
      request.once('connect', (response, socket, head) => {
        if (response.statusCode !== 200) {
          socket.destroy()
          reject(new Error('已配置的上游代理拒绝连接，HTTP ' + response.statusCode))
        } else {
          if (head.length) socket.unshift(head)
          resolve(socket)
        }
      })
      request.end()
    })
  }
  const address = await publicAddress(host)
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const socket = connect({ port: 443, host: address, signal })
    socket.once('connect', () => resolve(socket))
    socket.once('error', reject)
  })
}

// A loopback CONNECT proxy enforces the destination even on redirect hops
// that Playwright routing does not intercept. TLS remains end-to-end.
export async function startNavigationProxy(scope, upstreamConfig) {
  const sockets = new Set()
  const password = randomBytes(24).toString('base64url')
  const authorization = 'Basic ' + Buffer.from('forge:' + password).toString('base64')
  let failure
  let remainingBytes = 12 * 1024 * 1024
  const watch = socket => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    socket.setTimeout(18000, () => socket.destroy())
  }
  const server = createServer((_req, res) => res.writeHead(403).end())
  server.maxConnections = 16
  server.on('connection', watch)
  server.on('connect', async (request, client, head) => {
    client.on('error', () => client.destroy())
    if (request.headers['proxy-authorization'] !== authorization) {
      client.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Forge"\r\nConnection: close\r\n\r\n')
      return
    }
    const target = /^([a-z0-9.-]+):443$/i.exec(request.url ?? '')
    if (!target || !scope.has(target[1].toLowerCase())) {
      client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }
    try {
      const upstream = await connectDestination(target[1].toLowerCase(), upstreamConfig, AbortSignal.timeout(14000))
      if (client.destroyed) { upstream.destroy(); return }
      watch(upstream)
      client.on('close', () => upstream.destroy())
      upstream.on('error', () => client.destroy())
      upstream.on('close', () => client.destroy())
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length) upstream.write(head)
      upstream.on('data', bytes => {
        remainingBytes -= bytes.length
        if (remainingBytes <= 0) for (const socket of sockets) socket.destroy()
      })
      client.pipe(upstream)
      upstream.pipe(client)
    } catch (error) {
      failure = error.message.startsWith('浏览器无法访问') || error.message.startsWith('已配置的上游代理')
        ? error.message : '浏览器出口连接失败（' + (error.code || error.name) + '）'
      client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return {
    url: 'http://127.0.0.1:' + server.address().port,
    password,
    failure: () => failure,
    close() {
      for (const socket of sockets) socket.destroy()
      return new Promise(resolve => server.close(resolve))
    },
  }
}
