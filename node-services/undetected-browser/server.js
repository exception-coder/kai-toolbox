'use strict';
// kai-toolbox 免检测浏览器 sidecar（Phase 1：开会话 / 保活 / 页签URL / 存登录态 / 清除 / 关闭）
// 用 patchright（打补丁的 Playwright，规避 Runtime.enable→CDP 检测）。仅本机 loopback。
// Java(browser-request) 通过 HTTP 桥接控制；浏览器控制全在本进程，Java 不进控制链路（否则 CDP 暴露）。
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('patchright');

const PORT = parseInt(process.env.BROWSER_SIDECAR_PORT || '18092', 10);
const TOKEN = process.env.BROWSER_SIDECAR_TOKEN || '';
const CHANNEL = process.env.BROWSER_SIDECAR_CHANNEL || 'chrome'; // 'chrome' 最隐蔽；失败回退内置 chromium
const HEADLESS = process.env.BROWSER_SIDECAR_HEADLESS === 'true'; // 默认有头（扫码登录需可见窗口）
const DATA_DIR = process.env.BROWSER_SIDECAR_DATA_DIR
  || path.join(os.homedir(), '.kai-toolbox', 'browser-request');

/** sessionId -> { context } 。patchright 持久化上下文，登录态随 profile 目录天然持久。 */
const sessions = new Map();
const opening = new Set(); // 防同一 session 并发 open

function profileDir(id) { return path.join(DATA_DIR, id, 'patchright-profile'); }
function log(...a) { console.log('[undetected-browser]', ...a); }
function activePage(id) {
  const s = sessions.get(id);
  if (!s) throw httpErr(409, 'session not open');
  const page = s.context.pages()[0];
  if (!page) throw httpErr(409, 'no page');
  return page;
}

async function launchPersistent(id, url) {
  const dir = profileDir(id);
  fs.mkdirSync(dir, { recursive: true });
  const base = { headless: HEADLESS, viewport: null }; // patchright 建议：不手动加 stealth 参数
  let context;
  if (CHANNEL) {
    try {
      context = await chromium.launchPersistentContext(dir, { ...base, channel: CHANNEL });
      log(`launched session=${id} channel=${CHANNEL} headless=${HEADLESS}`);
    } catch (e) {
      log(`channel=${CHANNEL} 启动失败(${e.message})，回退内置 chromium`);
    }
  }
  if (!context) {
    context = await chromium.launchPersistentContext(dir, base);
    log(`launched session=${id} channel=bundled headless=${HEADLESS}`);
  }
  const page = context.pages()[0] || await context.newPage();
  page.on('crash', () => log(`page CRASHED session=${id}`));
  context.on('close', () => { sessions.delete(id); log(`context closed session=${id}`); });
  sessions.set(id, { context });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    log(`navigate ok session=${id} landed=${page.url()} title=${JSON.stringify(await page.title().catch(() => '?'))}`);
  } catch (e) {
    log(`navigate 失败 session=${id} url=${url} err=${e.message} landed=${page.url()}`);
  }
}

async function handle(method, parts, body) {
  // parts: ['sessions', id, action?]
  if (method === 'GET' && parts.length === 1 && parts[0] === 'health') {
    return { ok: true, engine: 'patchright', version: require('patchright/package.json').version,
             channel: CHANNEL, headless: HEADLESS, open: [...sessions.keys()] };
  }
  if (parts[0] !== 'sessions' || !parts[1]) throw httpErr(404, 'not found');
  const id = parts[1];
  const action = parts[2];

  if (method === 'POST' && action === 'open') {
    const url = (body && body.url) || '';
    if (!url) throw httpErr(400, 'missing url');
    if (sessions.has(id)) {                       // 已开 → 复用，导航到 url
      const page = sessions.get(id).context.pages()[0];
      if (page) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => log('renav err', e.message));
      return { ok: true, reused: true };
    }
    if (opening.has(id)) throw httpErr(409, 'opening in progress');
    opening.add(id);
    try { await launchPersistent(id, url); } finally { opening.delete(id); }
    return { ok: true };
  }

  if (method === 'GET' && action === 'pages') {
    const s = sessions.get(id);
    if (!s) return { tracked: false, pages: [], note: '会话未在 sidecar 打开' };
    try {
      const ps = s.context.pages();
      if (!ps.length) return { tracked: true, pages: [], note: '上下文在但无打开页签（可能已崩溃/关闭）' };
      return { tracked: true, pages: ps.map(p => { try { return p.url(); } catch { return '?'; } }) };
    } catch (e) { return { tracked: true, pages: [], note: '读取失败: ' + e.message }; }
  }

  // 远程交互：前端传归一化坐标 fx,fy(0..1)，乘以 CSS 视口尺寸点击（兼容 viewport:null）
  if (method === 'POST' && action === 'click') {
    const page = activePage(id);
    const dim = await page.evaluate('({w:window.innerWidth,h:window.innerHeight})');
    const x = Math.max(0, Math.min(dim.w - 1, (body && body.fx || 0) * dim.w));
    const y = Math.max(0, Math.min(dim.h - 1, (body && body.fy || 0) * dim.h));
    await page.mouse.click(x, y);
    return { ok: true, x, y };
  }
  if (method === 'POST' && action === 'scroll') {
    const page = activePage(id);
    await page.mouse.wheel(0, (body && body.dy) || 0);
    return { ok: true };
  }
  if (method === 'POST' && action === 'type') {
    const page = activePage(id);
    if (body && body.text) await page.keyboard.type(String(body.text), { delay: 30 });
    if (body && body.key) await page.keyboard.press(String(body.key));
    return { ok: true };
  }

  if (method === 'POST' && action === 'save') {
    const s = sessions.get(id);
    if (!s) throw httpErr(409, 'session not open');
    const out = (body && body.path) || path.join(DATA_DIR, id, 'storage-state.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await s.context.storageState({ path: out });
    let bytes = 0; try { bytes = fs.statSync(out).size; } catch {}
    return { ok: true, path: out, bytes };
  }

  if (method === 'POST' && action === 'close') {
    const s = sessions.get(id);
    if (s) { try { await s.context.close(); } catch (e) { log('close err', e.message); } sessions.delete(id); }
    return { ok: true };
  }

  if (method === 'POST' && action === 'clear') {
    const s = sessions.get(id);
    if (s) { try { await s.context.close(); } catch {} sessions.delete(id); }
    try { fs.rmSync(profileDir(id), { recursive: true, force: true }); } catch (e) { log('clear err', e.message); }
    return { ok: true };
  }
  throw httpErr(404, 'unknown action');
}

function httpErr(status, msg) { const e = new Error(msg); e.status = status; return e; }

const server = http.createServer((req, res) => {
  if (TOKEN && req.headers['x-sidecar-token'] !== TOKEN) {
    res.writeHead(401, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: 'unauthorized' }));
  }
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', async () => {
    let body = null;
    if (chunks.length) { try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {} }
    const parts = req.url.split('?')[0].split('/').filter(Boolean);
    // 截图走二进制响应（实时画面），不进 JSON handle
    if (req.method === 'GET' && parts[0] === 'sessions' && parts[2] === 'screenshot') {
      try {
        const page = activePage(parts[1]);
        const buf = await page.screenshot({ type: 'jpeg', quality: 55 });
        res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' });
        return res.end(buf);
      } catch (e) {
        res.writeHead(e.status || 500, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: e.message }));
      }
    }
    try {
      const result = await handle(req.method, parts, body);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (e) {
      const status = e.status || 500;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
      if (status >= 500) log('handler error', e.stack || e.message);
    }
  });
});

server.listen(PORT, '127.0.0.1', () => log(`listening on 127.0.0.1:${PORT}  dataDir=${DATA_DIR}`));

async function shutdown() {
  log('shutting down, closing contexts...');
  for (const [, s] of sessions) { try { await s.context.close(); } catch {} }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
