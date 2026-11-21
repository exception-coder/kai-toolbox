import { chromium } from 'playwright-core'
import { hostScope, publicHttps, startNavigationProxy, trustedUpstream } from './forge-browser-network.mjs'

export function checkNavigationRequest({ url, linkName }, grant) {
  const start = publicHttps(url).href
  if (!grant.urls.includes(start)) throw new Error('起始网址未获得本轮授权')
  if (linkName !== grant.linkName || (linkName !== undefined && !linkName.trim())) {
    throw new Error('链接名称未获得本轮授权')
  }
  return start
}

// One grant describes one user action. A transport retry gets the first receipt,
// including a failure after a possible click, without sending another click.
export function oncePerGrant(grant, execute = runBrowserNavigation) {
  let attempt
  return input => {
    const url = checkNavigationRequest(input, grant)
    if (attempt && attempt.url !== url) throw new Error('本轮浏览器操作已经执行')
    attempt ??= { url, result: Promise.resolve().then(() => execute({ ...input, url }, grant)) }
    return attempt.result
  }
}

async function pageInfo(page) {
  const title = await page.title()
  const links = await page.locator('a[href]:visible').evaluateAll(anchors =>
    anchors.filter(a => a instanceof HTMLAnchorElement).slice(0, 30).map(a => ({
      name: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 100),
      href: a.href.slice(0, 1024),
    })).filter(link => link.name))
  return { url: page.url(), title: title.slice(0, 200), links }
}

export async function visitPage(context, scope, start, linkName) {
  const page = await context.newPage()
  const response = await page.goto(start, { waitUntil: 'domcontentloaded' })
  if (!response?.ok()) throw new Error('起始网页未成功加载')
  const beforeUrl = publicHttps(page.url()).href
  if (!scope.has(new URL(beforeUrl).hostname)) throw new Error('起始网页跳出了允许的站点')
  if (linkName === undefined) return { beforeUrl, ...await pageInfo(page) }

  const link = page.getByRole('link', { name: linkName, exact: true }).filter({ visible: true })
  await link.first().waitFor({ state: 'visible', timeout: 5000 })
  if (await link.count() !== 1) throw new Error('页面上没有唯一匹配的可见链接：' + linkName)
  const destination = await link.evaluate(a => ({
    href: a instanceof HTMLAnchorElement ? a.href : null,
    target: a.getAttribute('target') || document.querySelector('base[target]')?.getAttribute('target'),
    download: a.hasAttribute('download'),
  }))
  if (!destination.href || destination.download) throw new Error('该链接不支持网页导航')
  const href = publicHttps(destination.href)
  scope.allow(href.href)
  const documentResponses = new Map()
  context.on('response', response => {
    if (response.request().isNavigationRequest()) documentResponses.set(response.url(), response.status())
  })

  // An anchor may open a separate browsing context through its target attribute.
  const newTab = destination.target && !['_self', '_parent', '_top'].includes(destination.target.toLowerCase())
  let next = page
  if (newTab) {
    const [newPage] = await Promise.all([context.waitForEvent('page'), link.click()])
    next = newPage
  } else {
    await Promise.all([page.waitForURL(url => url.href !== beforeUrl, { waitUntil: 'commit' }), link.click()])
  }
  await next.waitForLoadState('domcontentloaded')
  const afterUrl = publicHttps(next.url()).href
  if (!scope.has(new URL(afterUrl).hostname)) throw new Error('跳转超出了允许的站点')
  const sameDocument = !newTab && beforeUrl.split('#')[0] === afterUrl.split('#')[0]
  const finalStatus = sameDocument ? response.status() : documentResponses.get(afterUrl.split('#')[0])
  if (!finalStatus || finalStatus < 200 || finalStatus >= 300) {
    throw new Error('目标网页没有成功的 HTTP 导航响应' + (finalStatus ? '：' + finalStatus : ''))
  }
  return { beforeUrl, linkName, afterUrl, status: finalStatus, ...await pageInfo(next) }
}

export async function runBrowserNavigation(input, grant) {
  const start = checkNavigationRequest(input, grant)
  const scope = hostScope()
  scope.allow(start)
  const upstream = trustedUpstream(process.env.FORGE_VIBE_BROWSER_UPSTREAM_PROXY, process.env.FORGE_VIBE_BROWSER_PROXY_ORIGINS)
  const proxy = await startNavigationProxy(scope, upstream)
  let browser
  try {
    const env = Object.fromEntries(Object.entries(process.env)
      .filter(([key]) => /^(SystemRoot|WINDIR|TEMP|TMP|TMPDIR|LANG|PATH)$/i.test(key)))
    browser = await chromium.launch({
      headless: true, chromiumSandbox: true, env, timeout: 15000,
      proxy: { server: proxy.url, bypass: '<-loopback>', username: 'forge', password: proxy.password },
      args: ['--disable-quic', '--disable-background-networking', '--dns-prefetch-disable',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'],
    })
    const context = await browser.newContext({
      serviceWorkers: 'block', acceptDownloads: false, permissions: [],
    })
    context.setDefaultTimeout(15000)
    let remainingRequests = 75
    await context.routeWebSocket('**/*', ws => ws.close())
    await context.route('**/*', async route => {
      const req = route.request()
      try {
        const doc = req.resourceType() === 'document' && scope.allowsDocument(req.url())
        const rendering = ['stylesheet', 'script'].includes(req.resourceType())
        const allowed = --remainingRequests >= 0 && scope.has(publicHttps(req.url()).hostname) &&
          req.method() === 'GET' && (doc || rendering)
        if (allowed) return await route.continue()
      } catch { /* malformed, local or non-HTTPS URL */ }
      await route.abort().catch(() => {})
    })
    return await visitPage(context, scope, start, input.linkName)
  } catch (error) {
    if (proxy.failure()) throw new Error(proxy.failure())
    throw error
  } finally {
    try { await browser?.close() } finally { await proxy.close() }
  }
}
