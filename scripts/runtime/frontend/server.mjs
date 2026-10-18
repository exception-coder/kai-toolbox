import http from 'node:http';
import https from 'node:https';
import { createReadStream } from 'node:fs';
import { stat, readFile, realpath } from 'node:fs/promises';
import { join, resolve, sep, extname } from 'node:path';
import { homedir } from 'node:os';
import { PREFIX, validVersion } from './releases.mjs';
import { proxyHttp, proxyUpgrade } from './proxy.mjs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4' };

async function safeFile(directory, path) {
  if (path.includes('\\') || path.includes('\0') || path.split('/').some(part => part === '..' || part.startsWith('.'))) return null;
  const root = await realpath(directory), file = await realpath(resolve(directory, path));
  if (!file.startsWith(root + sep)) return null;
  return (await stat(file)).isFile() ? file : null;
}

async function sendFile(request, response, file, immutable) {
  const original = await stat(file);
  response.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
  response.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Vary', 'Accept-Encoding');
  let selected = file;
  if (!request.headers.range && /(?:^|,)\s*br\s*(?:,|$)/.test(request.headers['accept-encoding'] || '')) {
    try { await stat(file + '.br'); selected += '.br'; response.setHeader('Content-Encoding', 'br'); } catch { /* Uncompressed asset. */ }
  }
  const size = (await stat(selected)).size;
  const etag = `"${size.toString(16)}-${original.mtimeMs.toString(16)}-${selected === file ? 'raw' : 'br'}"`;
  response.setHeader('ETag', etag);
  if (request.headers['if-none-match'] === etag) { response.writeHead(304); response.end(); return; }
  let start = 0, end = size - 1;
  if (request.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
    if (match && (match[1] || match[2])) {
      start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
      end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    }
    if (!match || (!match[1] && !match[2]) || start > end || start >= size) { response.writeHead(416, { 'Content-Range': `bytes */${size}` }); response.end(); return; }
    response.statusCode = 206; response.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  }
  response.setHeader('Accept-Ranges', 'bytes'); response.setHeader('Content-Length', Math.max(0, end - start + 1));
  if (request.method === 'HEAD' || !size) { response.end(); return; }
  const stream = createReadStream(selected, { start, end });
  stream.on('error', () => response.destroy()); response.on('close', () => stream.destroy()); stream.pipe(response);
}

export function createFrontendServer({ home, state, backendPort = 18080, controlPort = 18081, tls }) {
  const handler = async (request, response) => {
    try {
      if (proxyHttp(request, response, { backendPort, controlPort })) return;
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
      const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const current = state();
      if (path === `${PREFIX}/status`) {
        response.writeHead(current.ready ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(request.method === 'HEAD' ? '' : JSON.stringify(current)); return;
      }
      const match = new RegExp(`^${PREFIX}/releases/([^/]+)/(.*)$`).exec(path);
      if (path.startsWith(PREFIX) && !match) { response.writeHead(404); response.end(); return; }
      const version = match ? match[1] : current.version;
      if (!validVersion(version)) { response.writeHead(current.ready ? 404 : 503); response.end('Frontend release unavailable'); return; }
      const directory = join(home, 'releases', version);
      const relative = match ? match[2] : path.slice(1);
      let file;
      try { file = await safeFile(directory, relative || 'index.html'); } catch { /* Missing asset or SPA route. */ }
      if (!file && !match && !extname(relative) && !relative.split('/').some(part => part.startsWith('.') || part === '..')) {
        file = await safeFile(directory, 'index.html');
      }
      if (!file) { response.writeHead(404); response.end(); return; }
      // Stable SDK loader/channel URLs retain their cache contract; immutable release paths never change.
      const immutable = Boolean(match) || relative.startsWith('assistant-sdk/releases/');
      if (relative.startsWith('assistant-sdk/')) response.setHeader('Access-Control-Allow-Origin', '*');
      await sendFile(request, response, file, immutable);
    } catch {
      if (!response.headersSent) response.writeHead(400, { 'Cache-Control': 'no-store' });
      response.end();
    }
  };
  const server = tls ? https.createServer(tls, handler) : http.createServer(handler);
  server.on('upgrade', (request, socket, head) => proxyUpgrade(request, socket, head, { backendPort, controlPort }));
  return server;
}

export async function frontendTls(env) {
  if (env.FORGE_FRONTEND_HTTPS === 'false') return undefined;
  const base = join(homedir(), '.vite-plugin-mkcert');
  try {
    return { cert: await readFile(env.FORGE_FRONTEND_TLS_CERT || join(base, 'cert.pem')),
      key: await readFile(env.FORGE_FRONTEND_TLS_KEY || join(base, 'dev.pem')) };
  } catch { throw new Error('Frontend TLS certificate unavailable; configure FORGE_FRONTEND_TLS_CERT and FORGE_FRONTEND_TLS_KEY. No CA is installed automatically.'); }
}
