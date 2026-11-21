import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer, request } from 'node:http'
import { chromium } from 'playwright-core'
import { hostScope, publicAddress, publicHttps, startNavigationProxy, trustedUpstream } from './forge-browser-network.mjs'
import { checkNavigationRequest, oncePerGrant, visitPage } from './forge-browser-navigation.mjs'

const start = 'https://start.example/'
const grant = { urls: [start], linkName: 'Follow link' }
test('only the granted URL and exact click are accepted', () => {
  assert.equal(checkNavigationRequest({ url: start, linkName: 'Follow link' }, grant), start)
  for (const input of [
    { url: start }, { url: start, linkName: 'Other' },
    { url: start + 'other', linkName: 'Follow link' },
    { url: 'https://start.example.evil.test/', linkName: 'Follow link' },
  ]) assert.throws(() => checkNavigationRequest(input, grant))
})

test('only public TLS domains and public IPv4 answers enter the egress proxy', async () => {
  for (const url of ['https://alice@start.example/', 'http://start.example/', 'https://localhost/',
    'https://0x7f000001/', 'https://[::1]/', 'https://start.example:8080/']) assert.throws(() => publicHttps(url))
  for (const address of ['127.0.0.1', '169.254.169.254', '100.64.0.1', '198.18.0.242', '10.1.2.3', '::ffff:10.1.2.3']) {
    await assert.rejects(publicAddress('start.example', async () => [{ address: '93.184.216.34' }, { address }]))
  }
  assert.equal(await publicAddress('start.example', async () => [{ address: '93.184.216.34' }]), '93.184.216.34')
  const scope = hostScope()
  scope.allow(start)
  assert.equal(scope.has('www.start.example'), true)
  assert.equal(scope.has('other.start.example'), false)
})

test('invalid arguments preserve the grant and concurrent/repeated calls reuse even a failed receipt', async () => {
  for (const fail of [false, true]) {
    let calls = 0
    const navigate = oncePerGrant(grant, async () => {
      calls++
      if (fail) throw new Error('navigation failed after click')
      return 'receipt'
    })
    assert.throws(() => navigate({ url: start }))
    assert.equal(calls, 0)
    const input = { url: start, linkName: 'Follow link' }
    const first = navigate(input)
    assert.equal(navigate(input), first)
    if (fail) await assert.rejects(first, /after click/)
    else assert.equal(await first, 'receipt')
    assert.equal(navigate(input), first)
    assert.equal(calls, 1)
  }
})

test('upstream relay requires an operator-listed origin and a current navigation grant', async () => {
  for (const [endpoint, origins] of [
    ['http://start.example', start], ['http://u:p@127.0.0.1', start],
    ['http://127.0.0.1', 'https://*.example'], ['http://127.0.0.1', start + 'path'], [null, start],
  ]) assert.throws(() => trustedUpstream(endpoint, origins))
  const scope = hostScope()
  scope.allow(start)
  const requests = []
  const relay = createServer()
  relay.on('connect', (req, socket) => {
    requests.push(req.url)
    socket.end('HTTP/1.1 200 OK\r\n\r\nfixture')
  })
  await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve))
  const config = trustedUpstream('http://127.0.0.1:' + relay.address().port, start + ',https://other.example')
  assert.equal(config.hosts.has('www.start.example'), false)
  const proxy = await startNavigationProxy(scope, config)
  const open = (host, authenticated = true) => new Promise((resolve, reject) => {
    const headers = authenticated ? { 'Proxy-Authorization': 'Basic ' + Buffer.from('forge:' + proxy.password).toString('base64') } : {}
    const req = request(proxy.url, { method: 'CONNECT', path: host + ':443', agent: false, headers })
    req.on('error', reject)
    req.on('connect', (response, socket) => { socket.destroy(); resolve(response.statusCode) })
    req.end()
  })
  try {
    assert.equal(await open('start.example', false), 407)
    assert.equal(await open('start.example'), 200)
    assert.equal(await open('other.example'), 403)
    assert.deepEqual(requests, ['start.example:443'])
  } finally {
    await proxy.close()
    await new Promise(resolve => relay.close(resolve))
  }
})

// Route the synthetic fixture pages in memory. This never contacts either fixture hostname.
test('a rendered anchor is clicked and the actual final HTTP document is verified', async () => {
  const browser = await chromium.launch({ chromiumSandbox: true })
  try {
    for (const [target, path, status] of [['_self', 'final', 200], ['_blank', 'final', 200], ['_self', 'missing', 404]]) {
      const context = await browser.newContext({ javaScriptEnabled: false })
      try {
        await context.route('**/*', route => {
          const initial = route.request().url() === start
          return route.fulfill({
            status: initial ? 200 : status, contentType: 'text/html',
            body: initial ? '<a target="' + target + '" href="https://next.example/' + path + '">Follow link</a>' : '<title>Arrived</title>',
          })
        })
        const scope = hostScope()
        scope.allow(start)
        const action = visitPage(context, scope, start, 'Follow link')
        if (status === 404) await assert.rejects(action, /404/)
        else assert.deepEqual(await action, {
          beforeUrl: start, linkName: 'Follow link', afterUrl: 'https://next.example/final',
          url: 'https://next.example/final', title: 'Arrived', status: 200, links: [],
        })
      } finally { await context.close() }
    }
  } finally { await browser.close() }
})

test('a generic or named menu click uses the verified site header and reports its actual link', async () => {
  const browser = await chromium.launch({ chromiumSandbox: true })
  try {
    for (const requested of [undefined, 'Domains', 'Unknown']) {
      const context = await browser.newContext()
      try {
        const requests = []
        await context.route('**/*', route => {
          requests.push(route.request().url())
          return route.fulfill({ status: 200, contentType: 'text/html', body: route.request().url() === start
            ? '<a href="/body">Domains</a><header><ul><li><a href="https://outside.example/path">External</a></li>' +
              '<li><a download href="/export">Export</a></li><li><a href="/domains">Domains</a></li></ul></header>'
            : '<title>Domain Name Services</title>' })
        })
        const scope = hostScope()
        scope.allow(start)
        const result = visitPage(context, scope, start, requested, true)
        if (requested === 'Unknown') {
          await assert.rejects(result, /没有唯一匹配/)
          assert.deepEqual(requests, [start])
        } else {
          const receipt = await result
          assert.equal(receipt.linkName, 'Domains')
          assert.equal(receipt.afterUrl, new URL('/domains', start).href)
          assert.deepEqual(requests, [start, receipt.afterUrl])
        }
      } finally { await context.close() }
    }
  } finally { await browser.close() }
})
